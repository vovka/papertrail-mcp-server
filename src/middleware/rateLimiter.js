/**
 * Rate limiting middleware for MCP server
 */

const { config } = require('../config');

class RateLimiter {
  constructor(options = {}) {
    this.requestsPerMinute = options.requestsPerMinute || config.rateLimit.requestsPerMinute;
    this.burst = options.burst || config.rateLimit.burst;
    this.clients = new Map(); // clientId -> { requests: [], burstTokens: number }
    
    // Clean up old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if client is within rate limits
   * @param {string} clientId - Unique identifier for the client
   * @returns {Object} - { allowed: boolean, remaining: number, resetTime: number }
   */
  checkLimit(clientId = 'default') {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    // Get or create client record
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, {
        requests: [],
        burstTokens: this.burst
      });
    }
    
    const client = this.clients.get(clientId);
    
    // Remove old requests outside the window
    client.requests = client.requests.filter(timestamp => timestamp > windowStart);
    
    // Restore burst tokens over time (1 token per 10 seconds)
    const tokenRestoreInterval = 10000; // 10 seconds
    const tokensSinceLastRequest = client.requests.length > 0 
      ? Math.floor((now - Math.max(...client.requests)) / tokenRestoreInterval)
      : this.burst;
    
    client.burstTokens = Math.min(this.burst, client.burstTokens + tokensSinceLastRequest);
    
    // Check burst limit first
    if (client.burstTokens <= 0) {
      return {
        allowed: false,
        reason: 'burst_limit_exceeded',
        remaining: 0,
        resetTime: now + tokenRestoreInterval,
        retryAfter: tokenRestoreInterval / 1000
      };
    }
    
    // Check rate limit
    if (client.requests.length >= this.requestsPerMinute) {
      const oldestRequest = Math.min(...client.requests);
      const resetTime = oldestRequest + 60000;
      
      return {
        allowed: false,
        reason: 'rate_limit_exceeded',
        remaining: 0,
        resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000)
      };
    }
    
    // Allow the request
    client.requests.push(now);
    client.burstTokens--;
    
    return {
      allowed: true,
      remaining: Math.min(
        this.requestsPerMinute - client.requests.length,
        client.burstTokens
      ),
      resetTime: windowStart + 60000
    };
  }
  
  /**
   * Clean up old client records
   */
  cleanup() {
    const now = Date.now();
    const cutoff = now - 300000; // 5 minutes
    
    for (const [clientId, client] of this.clients.entries()) {
      const hasRecentRequests = client.requests.some(timestamp => timestamp > cutoff);
      if (!hasRecentRequests) {
        this.clients.delete(clientId);
      }
    }
  }
  
  /**
   * Get current status for a client
   */
  getStatus(clientId = 'default') {
    if (!this.clients.has(clientId)) {
      return {
        requestsInWindow: 0,
        burstTokens: this.burst,
        windowStart: Date.now() - 60000
      };
    }
    
    const client = this.clients.get(clientId);
    const now = Date.now();
    const windowStart = now - 60000;
    
    // Filter current window requests
    const requestsInWindow = client.requests.filter(timestamp => timestamp > windowStart);
    
    return {
      requestsInWindow: requestsInWindow.length,
      burstTokens: client.burstTokens,
      windowStart,
      limits: {
        requestsPerMinute: this.requestsPerMinute,
        burst: this.burst
      }
    };
  }
  
  /**
   * Reset limits for a specific client (for testing or admin purposes)
   */
  resetClient(clientId) {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      return true;
    }
    return false;
  }
  
  /**
   * Get global statistics
   */
  getGlobalStats() {
    const now = Date.now();
    const windowStart = now - 60000;
    
    let totalActiveClients = 0;
    let totalRequestsInWindow = 0;
    
    for (const [clientId, client] of this.clients.entries()) {
      const requestsInWindow = client.requests.filter(timestamp => timestamp > windowStart);
      if (requestsInWindow.length > 0) {
        totalActiveClients++;
        totalRequestsInWindow += requestsInWindow.length;
      }
    }
    
    return {
      activeClients: totalActiveClients,
      totalRequestsInWindow,
      totalTrackedClients: this.clients.size,
      windowStart,
      limits: {
        requestsPerMinute: this.requestsPerMinute,
        burst: this.burst
      }
    };
  }
}

// Global rate limiter instance
const globalRateLimiter = new RateLimiter();

/**
 * Rate limiting middleware function for MCP tools
 */
function createRateLimitMiddleware(rateLimiter = globalRateLimiter) {
  return function rateLimitMiddleware(clientId) {
    const result = rateLimiter.checkLimit(clientId);
    
    if (!result.allowed) {
      const error = new Error(`Rate limit exceeded: ${result.reason}`);
      error.code = 'RATE_LIMIT_EXCEEDED';
      error.retryAfter = result.retryAfter;
      error.resetTime = result.resetTime;
      error.remaining = result.remaining;
      throw error;
    }
    
    return result;
  };
}

module.exports = {
  RateLimiter,
  globalRateLimiter,
  createRateLimitMiddleware
};
