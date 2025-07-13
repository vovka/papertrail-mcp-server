/**
 * Papertrail MCP Server
 * 
 * A Model Context Protocol server for Papertrail log search integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { config, validateConfig } from './config.js';
import { searchLogsTool, executeSearchLogs } from './tools/searchLogs.js';
import PapertrailClient from './papertrailClient.js';

/**
 * Create and configure the MCP server
 */
function createMcpServer() {
  const server = new Server(
    {
      name: config.mcp.name,
      version: config.mcp.version
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  return server;
}

/**
 * Register MCP tools with the server
 */
function registerTools(server) {
  // Register search_logs tool
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [searchLogsTool]
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    console.log(`Executing tool: ${name}`, args);
    
    switch (name) {
      case 'search_logs':
        return await executeSearchLogs(args);
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });
}

/**
 * Register server information handlers
 */
function registerServerInfo(server) {
  // Note: initialization and ping are handled automatically by the MCP SDK
  console.log('Server info handlers registered (handled by SDK)');
}

/**
 * Register error handlers
 */
function registerErrorHandlers(server) {
  server.onerror = (error) => {
    console.error('MCP Server error:', error);
  };

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in MCP server:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection in MCP server:', reason);
    process.exit(1);
  });
}

/**
 * Test Papertrail connectivity on startup
 */
async function testPapertrailConnection() {
  try {
    console.log('Testing Papertrail API connection...');
    const client = new PapertrailClient();
    const result = await client.testConnection();
    
    if (result.success) {
      console.log('✓ Successfully connected to Papertrail API');
    } else {
      console.error('✗ Failed to connect to Papertrail API:', result.error);
      console.warn('Warning: Server will start but log searches may fail');
    }
  } catch (error) {
    console.error('✗ Error testing Papertrail connection:', error.message);
    console.warn('Warning: Server will start but log searches may fail');
  }
}

/**
 * Start the MCP server
 */
async function startServer() {
  try {
    console.log(`Starting ${config.mcp.name} v${config.mcp.version}...`);
    
    // Validate configuration
    validateConfig();
    console.log('✓ Configuration validated');
    
    // Test Papertrail connection
    await testPapertrailConnection();
    
    // Create and configure server
    const server = createMcpServer();
    
    // Register handlers
    registerServerInfo(server);
    registerTools(server);
    registerErrorHandlers(server);
    
    console.log('✓ MCP server configured');
    console.log('Available tools: search_logs');
    
    // Use stdio transport for MCP communication
    const transport = new StdioServerTransport();
    
    console.log('✓ Starting MCP server on stdio transport...');
    
    // Start the server
    await server.connect(transport);
    
    console.log(`✓ ${config.mcp.name} MCP server is running and ready for connections`);
    console.log('Server info:');
    console.log(`  - Name: ${config.mcp.name}`);
    console.log(`  - Version: ${config.mcp.version}`);
    console.log(`  - Transport: stdio`);
    console.log(`  - Tools: search_logs`);
    console.log(`  - Papertrail API: ${config.papertrail.baseUrl}`);
    
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown() {
  const signals = ['SIGINT', 'SIGTERM'];
  
  signals.forEach(signal => {
    process.on(signal, () => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);
      process.exit(0);
    });
  });
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  setupGracefulShutdown();
  startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export {
  createMcpServer,
  registerTools,
  registerServerInfo,
  startServer
};
