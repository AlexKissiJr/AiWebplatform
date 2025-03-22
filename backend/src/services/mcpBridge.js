const WebSocket = require('ws');

class McpBridge {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.messageQueue = [];
    this.responseCallbacks = new Map();
    this.messageIdCounter = 0;
    
    // MCP server connection details (configurable via env vars)
    this.mcpServerUrl = process.env.MCP_SERVER_URL || 'ws://localhost:8765';
  }

  connect() {
    if (this.ws && this.isConnected) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.mcpServerUrl);

      this.ws.on('open', () => {
        console.log('Connected to MCP server');
        this.isConnected = true;
        this.processQueue();
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          console.log('Received from MCP:', response);
          
          // Handle response based on message ID
          if (response.id && this.responseCallbacks.has(response.id)) {
            const callback = this.responseCallbacks.get(response.id);
            callback(response);
            this.responseCallbacks.delete(response.id);
          }
        } catch (error) {
          console.error('Error parsing MCP response:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.isConnected = false;
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('Disconnected from MCP server');
        this.isConnected = false;
        // Try to reconnect after a delay
        setTimeout(() => this.connect(), 5000);
      });
    });
  }

  async sendCommand(message) {
    // Generate a unique message ID
    const messageId = this.messageIdCounter++;
    
    // Parse the user input to determine the appropriate command
    const command = this.parseUserInput(message);
    
    return new Promise(async (resolve, reject) => {
      // Ensure we're connected to the MCP server
      if (!this.isConnected) {
        try {
          await this.connect();
        } catch (error) {
          return reject(error);
        }
      }

      // Set up the response callback
      this.responseCallbacks.set(messageId, (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.result);
        }
      });

      // Send the command
      this.ws.send(JSON.stringify(command));
    });
  }

  parseUserInput(message) {
    // Simple rule-based parsing for demonstration
    const lowerMessage = message.toLowerCase();
    const messageId = this.messageIdCounter;
    
    // Create a blueprint or asset
    if (lowerMessage.includes('create') || lowerMessage.includes('make') || lowerMessage.includes('add')) {
      if (lowerMessage.includes('cube') || lowerMessage.includes('box')) {
        return {
          id: messageId,
          type: 'mcp_command',
          command: 'create_object',
          params: {
            type: 'CUBE',
            name: 'Cube_' + Date.now()
          }
        };
      } else if (lowerMessage.includes('sphere')) {
        return {
          id: messageId,
          type: 'mcp_command',
          command: 'create_object',
          params: {
            type: 'SPHERE',
            name: 'Sphere_' + Date.now()
          }
        };
      } else if (lowerMessage.includes('blueprint')) {
        // In a real implementation, we would parse the blueprint details
        return {
          id: messageId,
          type: 'mcp_command',
          command: 'execute_blender_code',
          params: {
            code: `Create a blueprint for: ${message}`
          }
        };
      }
    }
    
    // Get information about the scene
    if (lowerMessage.includes('get') || lowerMessage.includes('show') || lowerMessage.includes('list')) {
      if (lowerMessage.includes('scene') || lowerMessage.includes('objects')) {
        return {
          id: messageId,
          type: 'mcp_command',
          command: 'get_scene_info',
          params: {}
        };
      }
    }
    
    // Fallback to generic code execution
    return {
      id: messageId,
      type: 'mcp_command',
      command: 'execute_blender_code',
      params: {
        code: message
      }
    };
  }

  processQueue() {
    if (this.messageQueue.length > 0 && this.isConnected) {
      const { message, resolve, reject } = this.messageQueue.shift();
      
      this.sendCommand(message)
        .then(resolve)
        .catch(reject)
        .finally(() => this.processQueue());
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.isConnected = false;
    }
  }
}

// Create a singleton instance
const setupMcpBridge = new McpBridge();

module.exports = { setupMcpBridge }; 