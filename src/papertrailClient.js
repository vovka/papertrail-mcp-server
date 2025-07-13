/**
 * Papertrail API client for log searching
 */

const fetch = require('node-fetch');
const { config } = require('./config');

class PapertrailClient {
  constructor(apiToken = config.papertrail.apiToken) {
    this.apiToken = apiToken;
    this.baseUrl = config.papertrail.baseUrl;
    this.timeout = config.papertrail.timeout;
    this.maxRetries = config.papertrail.maxRetries;
  }

  /**
   * Make authenticated request to Papertrail API
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const requestOptions = {
      method: 'GET',
      headers: {
        'X-Papertrail-Token': this.apiToken,
        'Accept': 'application/json',
        'User-Agent': `${config.mcp.name}/${config.mcp.version}`,
        ...options.headers
      },
      timeout: this.timeout,
      ...options
    };

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Papertrail API error (${response.status}): ${errorText}`
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        console.warn(`Request attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Search logs using Papertrail API
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async searchLogs(query, options = {}) {
    try {
      const params = new URLSearchParams({
        q: query,
        min_time: options.minTime || this.getDefaultMinTime(),
        max_time: options.maxTime || this.getDefaultMaxTime(),
        limit: options.limit || 100,
        ...(options.system_id && { system_id: options.system_id }),
        ...(options.group_id && { group_id: options.group_id })
      });

      const endpoint = `/events/search.json?${params}`;
      const result = await this.makeRequest(endpoint);

      return {
        success: true,
        events: result.events || [],
        total: result.total_events || result.events?.length || 0,
        query,
        timeRange: {
          minTime: options.minTime || this.getDefaultMinTime(),
          maxTime: options.maxTime || this.getDefaultMaxTime()
        },
        metadata: {
          searchTime: new Date().toISOString(),
          limit: options.limit || 100
        }
      };
    } catch (error) {
      console.error('Error searching Papertrail logs:', error);
      return {
        success: false,
        error: error.message,
        events: [],
        total: 0,
        query
      };
    }
  }

  /**
   * Get systems (log sources) from Papertrail
   */
  async getSystems() {
    try {
      const result = await this.makeRequest('/systems.json');
      return {
        success: true,
        systems: result || []
      };
    } catch (error) {
      console.error('Error fetching Papertrail systems:', error);
      return {
        success: false,
        error: error.message,
        systems: []
      };
    }
  }

  /**
   * Get groups from Papertrail
   */
  async getGroups() {
    try {
      const result = await this.makeRequest('/groups.json');
      return {
        success: true,
        groups: result || []
      };
    } catch (error) {
      console.error('Error fetching Papertrail groups:', error);
      return {
        success: false,
        error: error.message,
        groups: []
      };
    }
  }

  /**
   * Test API connectivity
   */
  async testConnection() {
    try {
      await this.makeRequest('/systems.json');
      return {
        success: true,
        message: 'Successfully connected to Papertrail API'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to Papertrail API'
      };
    }
  }

  /**
   * Get default minimum time (1 hour ago)
   */
  getDefaultMinTime() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return Math.floor(oneHourAgo.getTime() / 1000);
  }

  /**
   * Get default maximum time (now)
   */
  getDefaultMaxTime() {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Format time for Papertrail API (Unix timestamp)
   */
  formatTime(date) {
    return Math.floor(date.getTime() / 1000);
  }

  /**
   * Parse Papertrail event into structured format
   */
  parseEvent(event) {
    return {
      id: event.id,
      timestamp: event.received_at,
      message: event.message,
      hostname: event.hostname,
      program: event.program,
      facility: event.facility,
      severity: event.severity,
      source: {
        ip: event.source_ip,
        name: event.source_name,
        id: event.source_id
      }
    };
  }
}

module.exports = PapertrailClient;
