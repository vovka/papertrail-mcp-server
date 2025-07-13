/**
 * Error handling middleware for MCP server
 */

const { config } = require('../config');

/**
 * Standard error codes for MCP operations
 */
const ERROR_CODES = {
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  API_CONNECTION_ERROR: 'API_CONNECTION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  TOOL_EXECUTION_ERROR: 'TOOL_EXECUTION_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

/**
 * Error response formatter
 */
class ErrorHandler {
  /**
   * Format error for MCP response
   */
  static formatMcpError(error, context = {}) {
    const timestamp = new Date().toISOString();
    
    // Determine error type and appropriate response
    let errorResponse = {
      success: false,
      error: error.message || 'Unknown error occurred',
      code: error.code || ERROR_CODES.INTERNAL_ERROR,
      timestamp,
      content: [{
        type: 'text',
        text: this.getErrorMessage(error)
      }]
    };

    // Add specific fields for different error types
    switch (error.code) {
      case ERROR_CODES.RATE_LIMIT_EXCEEDED:
        errorResponse.retryAfter = error.retryAfter;
        errorResponse.resetTime = error.resetTime;
        errorResponse.remaining = error.remaining;
        break;
        
      case ERROR_CODES.INVALID_ARGUMENTS:
        errorResponse.validationErrors = error.validationErrors;
        break;
        
      case ERROR_CODES.API_CONNECTION_ERROR:
        errorResponse.apiEndpoint = error.apiEndpoint;
        errorResponse.httpStatus = error.httpStatus;
        break;
    }

    // Add context if provided
    if (Object.keys(context).length > 0) {
      errorResponse.context = context;
    }

    // Log error (but don't expose sensitive details in response)
    this.logError(error, context);
    
    return errorResponse;
  }

  /**
   * Get user-friendly error message
   */
  static getErrorMessage(error) {
    switch (error.code) {
      case ERROR_CODES.RATE_LIMIT_EXCEEDED:
        return `🚀 Rate limit exceeded. Please wait ${error.retryAfter} seconds before trying again.`;
        
      case ERROR_CODES.INVALID_ARGUMENTS:
        return `⚠️ Invalid arguments provided. Please check the tool documentation and try again.`;
        
      case ERROR_CODES.API_CONNECTION_ERROR:
        return `🔌 Unable to connect to Papertrail API. Please check your network connection and API credentials.`;
        
      case ERROR_CODES.AUTHENTICATION_ERROR:
        return `🔒 Authentication failed. Please verify your Papertrail API token is correct and has necessary permissions.`;
        
      case ERROR_CODES.TOOL_EXECUTION_ERROR:
        return `⚙️ Tool execution failed: ${error.message}`;
        
      case ERROR_CODES.CONFIGURATION_ERROR:
        return `⚙️ Server configuration error. Please contact your administrator.`;
        
      default:
        return `❌ An unexpected error occurred: ${error.message}`;
    }
  }

  /**
   * Log error details (for debugging and monitoring)
   */
  static logError(error, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: error.message,
      code: error.code,
      stack: error.stack,
      context
    };

    // In production, you might want to send this to a logging service
    if (config.logging.level === 'debug') {
      console.error('Error details:', JSON.stringify(logEntry, null, 2));
    } else {
      console.error(`[${error.code || 'UNKNOWN'}] ${error.message}`);
    }
  }

  /**
   * Create a standardized error
   */
  static createError(code, message, additionalProperties = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, additionalProperties);
    return error;
  }

  /**
   * Wrap async function with error handling
   */
  static wrapAsync(fn) {
    return async function(...args) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        // Ensure error has proper code
        if (!error.code) {
          error.code = ERROR_CODES.INTERNAL_ERROR;
        }
        throw error;
      }
    };
  }

  /**
   * Validate arguments and throw standardized error if invalid
   */
  static validateArgs(args, schema) {
    const errors = [];
    
    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (args[field] === undefined || args[field] === null) {
          errors.push(`Required field '${field}' is missing`);
        }
      }
    }

    // Check field types and constraints
    if (schema.properties) {
      for (const [field, constraints] of Object.entries(schema.properties)) {
        const value = args[field];
        if (value !== undefined) {
          // Type checking
          if (constraints.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== constraints.type) {
              errors.push(`Field '${field}' must be of type ${constraints.type}, got ${actualType}`);
            }
          }
          
          // Range checking for numbers
          if (constraints.type === 'integer' || constraints.type === 'number') {
            if (constraints.minimum !== undefined && value < constraints.minimum) {
              errors.push(`Field '${field}' must be at least ${constraints.minimum}`);
            }
            if (constraints.maximum !== undefined && value > constraints.maximum) {
              errors.push(`Field '${field}' must be at most ${constraints.maximum}`);
            }
          }
          
          // String length checking
          if (constraints.type === 'string') {
            if (constraints.minLength !== undefined && value.length < constraints.minLength) {
              errors.push(`Field '${field}' must be at least ${constraints.minLength} characters`);
            }
            if (constraints.maxLength !== undefined && value.length > constraints.maxLength) {
              errors.push(`Field '${field}' must be at most ${constraints.maxLength} characters`);
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      const error = this.createError(
        ERROR_CODES.INVALID_ARGUMENTS,
        `Validation failed: ${errors.join(', ')}`,
        { validationErrors: errors }
      );
      throw error;
    }
  }
}

/**
 * Middleware function to handle errors in MCP tool execution
 */
function createErrorMiddleware() {
  return function errorMiddleware(fn) {
    return ErrorHandler.wrapAsync(async function(...args) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        // Convert to MCP error response
        return ErrorHandler.formatMcpError(error, {
          tool: fn.name,
          args: args[0] // First argument is typically the tool args
        });
      }
    });
  };
}

module.exports = {
  ErrorHandler,
  ERROR_CODES,
  createErrorMiddleware
};
