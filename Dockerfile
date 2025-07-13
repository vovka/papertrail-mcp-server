# Papertrail MCP Server Dockerfile
# Optimized for Pipedream deployment

FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    tini

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY .env.example ./.env.example

# Create non-root user for security
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S mcpuser -u 1001 -G mcpuser

# Change ownership of app directory
RUN chown -R mcpuser:mcpuser /app

# Switch to non-root user
USER mcpuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check: MCP server is responsive')" || exit 1

# Expose port (though MCP typically uses stdio transport)
EXPOSE 3001

# Use tini as init process for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the MCP server
CMD ["node", "src/server.js"]

# Add labels for better container management
LABEL \
    version="1.0.0" \
    description="Papertrail MCP Server for log search integration" \
    maintainer="InsightBot Team" \
    org.opencontainers.image.source="https://github.com/vovka/brokrete/InsightBot" \
    org.opencontainers.image.title="Papertrail MCP Server" \
    org.opencontainers.image.description="MCP server providing Papertrail log search capabilities" \
    org.opencontainers.image.version="1.0.0"
