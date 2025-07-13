/**
 * Configuration management for Papertrail MCP Server
 */

require('dotenv').config();

/**
 * Get environment variable with optional default value
 */
function getEnv(key, defaultValue = undefined) {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value || defaultValue;
}

/**
 * Server configuration
 */
const config = {
  // Server settings
  server: {
    port: parseInt(getEnv('PORT', '3001'), 10),
    host: getEnv('HOST', '0.0.0.0')
  },

  // Papertrail API settings
  papertrail: {
    apiToken: getEnv('PAPERTRAIL_API_TOKEN'),
    baseUrl: getEnv('PAPERTRAIL_BASE_URL', 'https://papertrailapp.com/api/v1'),
    timeout: 30000, // 30 seconds
    maxRetries: 3
  },

  // MCP server settings
  mcp: {
    name: getEnv('MCP_SERVER_NAME', 'papertrail-mcp'),
    version: getEnv('MCP_SERVER_VERSION', '1.0.0'),
    transport: 'sse' // Server-sent events
  },

  // Rate limiting
  rateLimit: {
    requestsPerMinute: parseInt(getEnv('RATE_LIMIT_REQUESTS_PER_MINUTE', '60'), 10),
    burst: parseInt(getEnv('RATE_LIMIT_BURST', '10'), 10)
  },

  // Logging
  logging: {
    level: getEnv('LOG_LEVEL', 'info'),
    format: getEnv('LOG_FORMAT', 'json')
  }
};

/**
 * Validate configuration on startup
 */
function validateConfig() {
  if (!config.papertrail.apiToken) {
    throw new Error('PAPERTRAIL_API_TOKEN is required');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  if (config.rateLimit.requestsPerMinute < 1) {
    throw new Error('RATE_LIMIT_REQUESTS_PER_MINUTE must be at least 1');
  }
}

module.exports = {
  config,
  validateConfig
};
