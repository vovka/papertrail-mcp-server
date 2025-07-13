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
        description: 'Search query to find in logs (supports Papertrail search syntax)'
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
    
    // Validate arguments using error handler
    ErrorHandler.validateArgs(args, searchLogsTool.inputSchema);

    // Initialize Papertrail client
    const client = new PapertrailClient();

    // Parse time parameters
    const options = {
      limit: Math.min(args.limit || 100, 1000),
      ...(args.systemId && { system_id: args.systemId }),
      ...(args.groupId && { group_id: args.groupId })
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
    
    // Execute search
    const result = await client.searchLogs(args.query, options);

    if (!result.success) {
      throw ErrorHandler.createError(
        ERROR_CODES.API_CONNECTION_ERROR,
        `Papertrail API request failed: ${result.error}`,
        { apiEndpoint: 'events/search.json' }
      );
    }

    // Format results
    const formattedResult = formatSearchResults(result, args.query);
    
    console.log(`Found ${result.total} log events matching "${args.query}"`);
    
    return {
      success: true,
      content: [{
        type: 'text',
        text: formattedResult
      }]
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
function formatSearchResults(result, query) {
  const { events, total, timeRange, metadata } = result;
  
  let output = `🔍 Papertrail Log Search Results\n`;
  output += `Query: "${query}"\n`;
  output += `Found: ${total} events\n`;
  output += `Time Range: ${formatTimeRange(timeRange)}\n`;
  output += `Search Time: ${new Date(metadata.searchTime).toLocaleString()}\n\n`;

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
