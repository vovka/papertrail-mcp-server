# Papertrail MCP Server

A Model Context Protocol (MCP) server that provides Papertrail log search capabilities. This server enables AI assistants and automation tools to search and analyze logs stored in Papertrail.

## Features

- **Search Logs**: Search Papertrail logs with flexible query parameters
- **Rate Limiting**: Built-in rate limiting to protect API quotas
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Docker Support**: Container-ready for easy deployment
- **MCP Standard**: Implements MCP protocol for seamless integration

## Quick Start

### Prerequisites

- Node.js 18+ 
- Papertrail API token
- Docker (optional, for containerized deployment)

### Installation

1. **Clone and setup**:
   ```bash
   cd papertrail-mcp-server
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your Papertrail API token
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

### Configuration

Key environment variables:

```bash
# Required
PAPERTRAIL_API_TOKEN=your_api_token_here

# Optional
PORT=3001
RATE_LIMIT_REQUESTS_PER_MINUTE=60
LOG_LEVEL=info
```

## MCP Tools

### search_logs

Search Papertrail logs with various filters.

**Parameters**:
- `query` (required): Search query string
- `minTime` (optional): Start time (ISO 8601 format)
- `maxTime` (optional): End time (ISO 8601 format)
- `limit` (optional): Maximum results (1-1000, default: 100)
- `systemId` (optional): Filter by system ID
- `groupId` (optional): Filter by group ID

**Example**:
```json
{
  "query": "error OR exception",
  "minTime": "2023-12-01T10:00:00Z",
  "limit": 50
}
```

## Docker Deployment

### Build and run locally:
```bash
docker build -t papertrail-mcp .
docker run -e PAPERTRAIL_API_TOKEN=your_token papertrail-mcp
```

### Using Docker Compose:
```bash
docker-compose up -d
```

### Pipedream Deployment

This server is designed to be deployed on Pipedream infrastructure:

1. Build the Docker image
2. Push to a container registry
3. Deploy using Pipedream's container deployment features
4. Configure environment variables in Pipedream dashboard

## Development

### Project Structure
```
src/
├── server.js              # Main MCP server
├── config.js              # Configuration management
├── papertrailClient.js    # Papertrail API client
├── tools/
│   └── searchLogs.js      # Search logs tool implementation
└── middleware/
    ├── errorHandler.js    # Error handling middleware
    └── rateLimiter.js     # Rate limiting middleware
```

### Running in development mode:
```bash
npm run dev
```

### Testing the connection:
```bash
# Test Papertrail API connectivity
node -e "
const client = require('./src/papertrailClient');
const c = new client();
c.testConnection().then(console.log);
"
```

## Integration with InsightBot

To use this MCP server with InsightBot:

1. **Deploy the server** (locally or on Pipedream)
2. **Update InsightBot configuration** to point to your custom MCP server:
   ```javascript
   // In InsightBot's pipedreamService.js
   const customServerConfig = {
     transport: 'sse',
     url: 'your-deployed-server-url',
     headers: {
       'authorization': 'Bearer your-token'
     }
   };
   ```
3. **Test the integration** by triggering an investigation in InsightBot

## Rate Limiting

Built-in rate limiting protects your Papertrail API quota:

- **Default**: 60 requests per minute
- **Burst**: 10 requests in quick succession
- **Configurable**: via environment variables

Rate limit errors include retry-after headers for proper backoff.

## Error Handling

Comprehensive error handling with specific error codes:

- `RATE_LIMIT_EXCEEDED`: Rate limit hit
- `INVALID_ARGUMENTS`: Invalid tool parameters
- `API_CONNECTION_ERROR`: Papertrail API issues
- `AUTHENTICATION_ERROR`: Invalid API token
- `TOOL_EXECUTION_ERROR`: Tool execution failure

## Security

- Non-root container user
- Read-only filesystem
- Input validation and sanitization
- Rate limiting protection
- No sensitive data in logs

## Monitoring

- Health check endpoints
- Structured JSON logging
- Error tracking and metrics
- Rate limit monitoring

## License

ISC License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- Check the logs for error details
- Verify Papertrail API token permissions
- Ensure network connectivity to Papertrail
- Review rate limiting settings
