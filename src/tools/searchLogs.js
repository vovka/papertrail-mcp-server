/**
 * Search logs MCP tool implementation
 */

import PapertrailClient from '../papertrailClient.js';
import { createRateLimitMiddleware } from '../middleware/rateLimiter.js';
import { ErrorHandler, ERROR_CODES } from '../middleware/errorHandler.js';

/**
 * MCP tool definition for searching Papertrail logs
 */
const searchLogsTool = {
  name: 'search_logs',
  description: 'Search Papertrail logs for specific terms and patterns',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'REQUIRED: Search query to find in logs. Extract keywords from user message (e.g., "payment error", "login timeout", "order failed"). Use quotes for exact terms like "order-12345".'
      },
      minTime: {
        type: 'string',
        description: 'Minimum time for search (ISO 8601 format, defaults to 1 hour ago)'
      },
      maxTime: {
        type: 'string',
        description: 'Maximum time for search (ISO 8601 format, defaults to now)'
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of log events to return (default: 100, max: 1000)',
        minimum: 1,
        maximum: 1000
      },
      systemId: {
        type: 'integer',
        description: 'Filter logs to specific system ID'
      },
      groupId: {
        type: 'integer',
        description: 'Filter logs to specific group ID'
      }
    },
    required: ['query']
  }
};

// Initialize rate limiter
const rateLimitMiddleware = createRateLimitMiddleware();

/**
 * Execute search logs tool with rate limiting and error handling
 */
async function executeSearchLogs(args, clientId = 'default') {
  try {
    // Apply rate limiting
    rateLimitMiddleware(clientId);
    
    // Check for empty or missing query specifically
    if (!args.query || args.query.trim() === '') {
      throw ErrorHandler.createError(
        ERROR_CODES.INVALID_ARGUMENTS,
        'Query parameter is required and cannot be empty. Please provide search terms extracted from the user message.',
        { providedArgs: args, requiredFields: ['query'] }
      );
    }
    
    // Validate arguments using error handler
    ErrorHandler.validateArgs(args, searchLogsTool.inputSchema);

    // Initialize Papertrail client
    const client = new PapertrailClient();

    // Parse time parameters
    const options = {
      limit: Math.min(parseInt(args.limit) || 100, 1000),
      ...(args.systemId && { system_id: parseInt(args.systemId) }),
      ...(args.groupId && { group_id: parseInt(args.groupId) })
    };

    // Parse time parameters if provided
    if (args.minTime) {
      const minTime = new Date(args.minTime);
      if (isNaN(minTime.getTime())) {
        throw ErrorHandler.createError(
          ERROR_CODES.INVALID_ARGUMENTS,
          'Invalid minTime format. Use ISO 8601 format (e.g., 2023-12-01T10:00:00Z)'
        );
      }
      options.minTime = client.formatTime(minTime);
    }

    if (args.maxTime) {
      const maxTime = new Date(args.maxTime);
      if (isNaN(maxTime.getTime())) {
        throw ErrorHandler.createError(
          ERROR_CODES.INVALID_ARGUMENTS,
          'Invalid maxTime format. Use ISO 8601 format (e.g., 2023-12-01T11:00:00Z)'
        );
      }
      options.maxTime = client.formatTime(maxTime);
    }

    console.log(`Searching Papertrail logs for: "${args.query}"`);
    
    // Capture request details
    const requestDetails = {
      query: args.query,
      options: options,
      timestamp: new Date().toISOString(),
      apiUrl: `${client.baseUrl}/events/search.json`
    };
    
    // Execute search
    const result = await client.searchLogs(args.query, options);
    console.log('Search result metadata:', result._metadata);

    if (!result.success) {
      throw ErrorHandler.createError(
        ERROR_CODES.API_CONNECTION_ERROR,
        `Papertrail API request failed: ${result.error}`,
        { 
          apiEndpoint: 'events/search.json',
          requestDetails: requestDetails,
          apiResponse: result
        }
      );
    }

    // Include debug information in the response
    const debugInfo = {
      request: requestDetails,
      response: {
        success: result.success,
        total: result.total,
        eventsReturned: result.events?.length || 0,
        timeRange: result.timeRange,
        apiResponseTime: result._metadata?.responseTime || 'N/A',
        searchTime: result._metadata?.searchTime || new Date().toISOString(),
        apiStatus: result._metadata?.status || 'N/A',
        apiUrl: result._metadata?.url || requestDetails.apiUrl,
        responseBody: result._metadata?.responseBody || null
      }
    };
    
    // Format results with debug info included in the text
    const formattedResult = formatSearchResults(result, args.query, debugInfo);
    
    console.log(`Found ${result.total} log events matching "${args.query}"`);
    
    return {
      success: true,
      content: [{
        type: 'text',
        text: formattedResult
      }],
      debug: debugInfo
    };

  } catch (error) {
    // Return formatted error response
    return ErrorHandler.formatMcpError(error, {
      tool: 'search_logs',
      query: args.query,
      clientId
    });
  }
}

/**
 * Format search results for presentation
 */
function formatSearchResults(result, query, debugInfo = null) {
  const { events, total, timeRange, metadata } = result;
  
  let output = `🔍 Papertrail Log Search Results [DEBUG_ENABLED_v2]\n`;
  output += `Query: "${query}"\n`;
  output += `Found: ${total} events\n`;
  output += `Time Range: ${formatTimeRange(timeRange)}\n`;
  output += `Search Time: ${new Date(metadata.searchTime).toLocaleString()}\n\n`;
  
  // Always add request/response details
  output += `🔧 Request/Response Details:\n`;
  output += `• Query: "${query}"\n`;
  output += `• Timestamp: ${new Date().toISOString()}\n`;
  
  if (debugInfo) {
    output += `• API URL: ${debugInfo.response.apiUrl}\n`;
    output += `• HTTP Status: ${debugInfo.response.apiStatus}\n`;
    output += `• Response Time: ${debugInfo.response.apiResponseTime}ms\n`;
    output += `• Request Options: ${JSON.stringify(debugInfo.request.options)}\n`;
    output += `• Events Found: ${debugInfo.response.total} (returned: ${debugInfo.response.eventsReturned})\n`;
    
    // Add response JSON if available (truncated for readability)
    if (debugInfo.response.responseBody) {
      const responseBody = debugInfo.response.responseBody;
      const truncatedResponse = {
        events: responseBody.events ? `${responseBody.events.length} events` : 'no events',
        ...(responseBody.events && responseBody.events.length > 0 && {
          firstEvent: {
            id: responseBody.events[0].id,
            received_at: responseBody.events[0].received_at,
            hostname: responseBody.events[0].hostname,
            program: responseBody.events[0].program,
            message: responseBody.events[0].message?.substring(0, 100) + '...'
          }
        }),
        ...(responseBody.total_hits !== undefined && { total_hits: responseBody.total_hits }),
        ...(responseBody.min_time !== undefined && { min_time: responseBody.min_time }),
        ...(responseBody.max_time !== undefined && { max_time: responseBody.max_time })
      };
      output += `• Response JSON (summary): ${JSON.stringify(truncatedResponse, null, 2)}\n`;
    }
  } else {
    output += `• Debug info: Not available\n`;
  }

  if (events.length === 0) {
    output += '📭 No log events found matching the search criteria.\n\n';
    output += 'Suggestions:\n';
    output += '• Try a broader search query\n';
    output += '• Expand the time range\n';
    output += '• Check if the systems are actively logging\n';
    return output;
  }

  output += `📋 Log Events (showing ${events.length} of ${total}):\n\n`;
  
  events.forEach((event, index) => {
    const parsedEvent = {
      timestamp: event.received_at,
      hostname: event.hostname || 'unknown',
      program: event.program || 'unknown',
      message: event.message || ''
    };
    
    const timeStr = formatEventTime(parsedEvent.timestamp);
    const severity = getSeverityIndicator(event.severity);
    
    output += `${index + 1}. ${severity} [${timeStr}] ${parsedEvent.hostname}:${parsedEvent.program}\n`;
    output += `   ${parsedEvent.message}\n\n`;
  });

  // Add summary statistics
  const stats = generateEventStats(events);
  output += `📊 Summary:\n`;
  output += `• Unique hosts: ${stats.uniqueHosts}\n`;
  output += `• Unique programs: ${stats.uniquePrograms}\n`;
  output += `• Time span: ${stats.timeSpan}\n`;
  
  if (stats.errorCount > 0) {
    output += `• ⚠️  Error-level events: ${stats.errorCount}\n`;
  }

  // Debug section already added above

  return output;
}

/**
 * Format time range for display
 */
function formatTimeRange(timeRange) {
  const minTime = new Date(timeRange.minTime * 1000);
  const maxTime = new Date(timeRange.maxTime * 1000);
  return `${minTime.toLocaleString()} - ${maxTime.toLocaleString()}`;
}

/**
 * Format event timestamp
 */
function formatEventTime(timestamp) {
  return new Date(timestamp).toLocaleString();
}

/**
 * Get severity indicator emoji
 */
function getSeverityIndicator(severity) {
  const severityMap = {
    0: '🚨', // Emergency
    1: '🔥', // Alert
    2: '❌', // Critical
    3: '🔴', // Error
    4: '⚠️',  // Warning
    5: '🔵', // Notice
    6: 'ℹ️',  // Info
    7: '🔍'  // Debug
  };
  return severityMap[severity] || '📄';
}

/**
 * Generate statistics from events
 */
function generateEventStats(events) {
  const hosts = new Set();
  const programs = new Set();
  let errorCount = 0;
  let minTime = null;
  let maxTime = null;

  events.forEach(event => {
    if (event.hostname) hosts.add(event.hostname);
    if (event.program) programs.add(event.program);
    if (event.severity <= 3) errorCount++; // Emergency, Alert, Critical, Error
    
    const eventTime = new Date(event.received_at);
    if (!minTime || eventTime < minTime) minTime = eventTime;
    if (!maxTime || eventTime > maxTime) maxTime = eventTime;
  });

  let timeSpan = 'N/A';
  if (minTime && maxTime) {
    const spanMs = maxTime - minTime;
    const spanMinutes = Math.round(spanMs / 60000);
    timeSpan = spanMinutes < 60 ? `${spanMinutes}m` : `${Math.round(spanMinutes / 60)}h`;
  }

  return {
    uniqueHosts: hosts.size,
    uniquePrograms: programs.size,
    errorCount,
    timeSpan
  };
}

export {
  searchLogsTool,
  executeSearchLogs
};
