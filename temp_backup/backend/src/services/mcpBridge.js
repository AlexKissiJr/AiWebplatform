const WebSocket = require('ws');
const aiService = require('./aiService');

class McpBridge {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.commandQueue = [];
    this.messageCallbacks = {};
    this.pendingCallbacks = {};
    this.messageHistory = [];
    this.connectionAttempts = 0;
    this.maxReconnectDelay = 30000; // Max 30 seconds between reconnect attempts
    this.pingInterval = null;
    this.connect();
    
    // Set up reconnection timer
    setInterval(() => {
      if (!this.isConnected && this.commandQueue.length > 0) {
        console.log('[McpBridge] Reconnection timer triggered with queued commands');
        this.connect();
      }
    }, 5000);
  }

  connect() {
    try {
      // Already attempting to connect
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        console.log('[McpBridge] Connection attempt already in progress');
        return;
      }
      
      // Already connected
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('[McpBridge] Already connected');
        this.isConnected = true;
        return;
      }
      
      // Clear existing ping interval if any
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      
      // Connect to the Unreal socket server running in the plugin
      // Use our websocket proxy running on port 9878
      console.log('[McpBridge] UNREAL_SOCKET_URL:', process.env.UNREAL_SOCKET_URL);
      const url = 'ws://host.docker.internal:9878';
      console.log(`[McpBridge] Connecting to Unreal socket server at ${url} (Attempt: ${++this.connectionAttempts})`);
      
      // Close existing socket if any
      if (this.ws) {
        try {
          this.ws.terminate();
        } catch (err) {
          // Ignore errors when closing
        }
      }
      
      this.ws = new WebSocket(url);
      
      // Add connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          console.log('[McpBridge] Connection attempt timed out');
          this.ws.terminate();
        }
      }, 10000); // 10 second timeout
      
      this.ws.on('open', () => {
        clearTimeout(connectionTimeout);
        console.log('[McpBridge] Connected to Unreal socket server');
        this.isConnected = true;
        this.connectionAttempts = 0;
        
        // Send handshake message to identify as a client
        this.sendRawMessage({
          id: Date.now().toString(),
          type: 'command',
          function: 'handshake_test',
          args: {
            message: 'Hello from WebPlatform AI Assistant'
          }
        });
        
        // Set up ping interval to keep connection alive
        this.pingInterval = setInterval(() => {
          if (this.isConnected) {
            try {
              // Send a ping message
              this.sendRawMessage({
                type: 'ping',
                timestamp: Date.now()
              });
            } catch (err) {
              console.error('[McpBridge] Error sending ping:', err.message);
            }
          }
        }, 30000); // Send ping every 30 seconds
        
        // Process any queued commands after a short delay to ensure handshake completes
        setTimeout(() => {
          console.log(`[McpBridge] Processing ${this.commandQueue.length} queued commands`);
          while (this.commandQueue.length > 0) {
            const { command, callback, isRaw } = this.commandQueue.shift();
            if (isRaw) {
              this.sendRawMessage(command);
            } else {
              this.sendCommand(command, callback);
            }
          }
        }, 1000);
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log(`[McpBridge] Received message from Unreal: ${JSON.stringify(message)}`);
          
          // Handle pong response
          if (message.type === 'pong') {
            console.log('[McpBridge] Received pong from server');
            return;
          }
          
          // Handle response for a specific message ID
          if (message.id && this.pendingCallbacks[message.id]) {
            const callback = this.pendingCallbacks[message.id];
            delete this.pendingCallbacks[message.id];
            callback(null, message);
            return;
          }
          
          // Handle broadcast messages based on type
          if (message.type && this.messageCallbacks[message.type]) {
            this.messageCallbacks[message.type](message);
          }
        } catch (err) {
          console.error('[McpBridge] Error processing message:', err.message);
        }
      });
      
      this.ws.on('close', () => {
        clearTimeout(connectionTimeout);
        
        // Clear ping interval
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        
        console.log('[McpBridge] Disconnected from Unreal socket server');
        this.isConnected = false;
        
        // Calculate reconnect delay with exponential backoff
        const delay = Math.min(1000 * Math.pow(1.5, this.connectionAttempts), this.maxReconnectDelay);
        console.log(`[McpBridge] Will attempt to reconnect in ${delay}ms`);
        
        // Attempt to reconnect after a delay
        setTimeout(() => this.connect(), delay);
      });
      
      this.ws.on('error', (error) => {
        console.error('[McpBridge] WebSocket error:', error.message);
        // Don't set isConnected to false here, wait for close event
      });
      
    } catch (error) {
      console.error('[McpBridge] Error connecting to Unreal socket server:', error.message);
      this.isConnected = false;
      
      // Calculate reconnect delay with exponential backoff
      const delay = Math.min(1000 * Math.pow(1.5, this.connectionAttempts), this.maxReconnectDelay);
      console.log(`[McpBridge] Will attempt to reconnect in ${delay}ms`);
      
      setTimeout(() => this.connect(), delay);
    }
  }

  // Helper method to send raw messages without command formatting
  sendRawMessage(message) {
    if (!this.isConnected) {
      console.log('[McpBridge] Not connected, queueing raw message');
      this.commandQueue.push({ 
        command: message, 
        callback: null,
        isRaw: true 
      });
      this.connect(); // Try to connect immediately
      return;
    }
    
    try {
      // Ensure the message is valid JSON by stringifying it
      const jsonString = JSON.stringify(message);
      // Send as text frame, not binary
      this.ws.send(jsonString);
      console.log(`[McpBridge] Sent raw message: ${jsonString}`);
    } catch (error) {
      console.error('[McpBridge] Error sending raw message:', error.message);
      this.isConnected = false;
      this.connect();
    }
  }

  // Send a user message and get response
  async sendMessage(message, modelId = 'rule-based') {
    console.log(`[McpBridge] Processing user message with model ${modelId}: ${message}`);
    
    // Generate a unique message ID
    const messageId = Date.now().toString();
    
    // Add user message to conversation history
    this.messageHistory.push({
      id: messageId,
      text: message,
      sender: 'user',
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.messageHistory.length > 20) {
      this.messageHistory = this.messageHistory.slice(this.messageHistory.length - 20);
    }
    
    // Set current AI model if specified
    if (modelId && modelId !== aiService.getCurrentModel()) {
      console.log(`[McpBridge] Changing AI model to: ${modelId}`);
      aiService.setCurrentModel(modelId);
    }
    
    return new Promise(async (resolve, reject) => {
      try {
        let aiResponse = null;
        let commandToExecute = null;
        
        // Try to process with AI service first
        if (modelId !== 'rule-based') {
          console.log('[McpBridge] Processing message with AI service');
          aiResponse = await aiService.processMessage(message, this.messageHistory);
        }
        
        // If AI processing resulted in an error, return the error message
        if (aiResponse && aiResponse.error) {
          console.log('[McpBridge] AI processing error:', aiResponse.message);
          resolve(aiResponse.message);
          return;
        }
        
        // If AI service returned a command, use it
        if (aiResponse && aiResponse.isCommand) {
          console.log('[McpBridge] AI returned a command:', aiResponse.command);
          commandToExecute = {
            command: aiResponse.command,
            params: aiResponse.params
          };
        }
        // If AI service returned a conversation message, return it
        else if (aiResponse && !aiResponse.isCommand) {
          console.log('[McpBridge] AI returned a conversation message');
          
          // Save AI response in history
          this.messageHistory.push({
            id: 'ai-' + Date.now(),
            text: aiResponse.message,
            sender: 'ai',
            timestamp: Date.now()
          });
          
          resolve(aiResponse.message);
          return;
        }
        // Otherwise fall back to rule-based parsing
        else {
          console.log('[McpBridge] Using rule-based parsing');
          const parsedCommand = this.parseUserInput(message);
          
          if (parsedCommand) {
            commandToExecute = parsedCommand;
          } else {
            resolve("I'm sorry, I don't understand that command. Try asking me to create objects or materials in Unreal Engine.");
            return;
          }
        }
        
        // Execute the command in the Unreal socket server format
        if (commandToExecute) {
          console.log('[McpBridge] Executing command:', commandToExecute);
          
          // Format for Unreal Engine plugin socket server
          const formattedCommand = this.formatCommandForUnreal(commandToExecute);
          
          this.sendCommand(formattedCommand, (err, response) => {
            if (err) {
              console.error('[McpBridge] Error executing command:', err);
              reject(err);
            } else {
              console.log('[McpBridge] Command executed successfully');
              
              // Format a nice response
              let responseMessage = '';
              if (commandToExecute.command === 'spawn_object') {
                responseMessage = `Created a ${commandToExecute.params.actor_class} at location [${commandToExecute.params.location.join(', ')}].`;
              } else if (commandToExecute.command === 'create_material') {
                responseMessage = `Created a material named "${commandToExecute.params.material_name}" with the specified color.`;
              } else if (commandToExecute.command === 'set_object_material') {
                responseMessage = `Applied material to "${commandToExecute.params.actor_name}".`;
              } else if (commandToExecute.command === 'create_blueprint') {
                responseMessage = `Created a Blueprint named "${commandToExecute.params.blueprint_name}".`;
              } else {
                responseMessage = `Successfully executed "${commandToExecute.command}" command.`;
              }
              
              // Save AI response in history
              this.messageHistory.push({
                id: 'ai-' + Date.now(),
                text: responseMessage,
                sender: 'ai',
                timestamp: Date.now()
              });
              
              resolve(responseMessage);
            }
          });
        } else {
          resolve("I couldn't determine what you want to do in Unreal Engine. Please try again with a clearer instruction.");
        }
      } catch (error) {
        console.error('[McpBridge] Error processing message:', error);
        reject(error);
      }
    });
  }

  // Format commands to match the Unreal Engine plugin's expected format
  formatCommandForUnreal(command) {
    const id = Date.now().toString();

    if (command.command === 'sequence') {
      // For now just execute the first command in the sequence
      // We'll implement proper sequence handling later if needed
      const firstStep = command.steps[0];
      
      // Create an object where the command is the key
      const formattedCommand = {};
      formattedCommand[firstStep.command] = firstStep.params;
      return formattedCommand;
    } else {
      // Format as { "command_name": { params } }
      const formattedCommand = {};
      formattedCommand[command.command] = command.params;
      return formattedCommand;
    }
  }

  // Map our internal commands to Unreal Engine plugin commands
  mapToUnrealCommand(command, params) {
    // Return parameters directly without converting function names
    // This keeps the command names aligned with what Unreal expects
    return params;
  }

  // Send a command to the Unreal socket server
  sendCommand(command, callback) {
    if (!this.isConnected) {
      console.log('[McpBridge] Not connected, queueing command:', command);
      this.commandQueue.push({ command, callback });
      this.connect(); // Try to connect immediately
      return;
    }
    
    try {
      // Format the command for Unreal if it's not already formatted
      let formattedCommand = command;
      if (command.command && command.params) {
        formattedCommand = this.formatCommandForUnreal(command);
      }
      
      // Send the message as text frame, not binary
      const jsonString = JSON.stringify(formattedCommand);
      this.ws.send(jsonString);
      console.log(`[McpBridge] Sent command to Unreal: ${jsonString}`);
      
      // Store the callback if provided
      if (callback) {
        // Use a timeout ID as a fallback if there's no command ID
        const callbackId = Date.now().toString();
        this.pendingCallbacks[callbackId] = callback;
        
        // Set a timeout to clean up the callback if no response is received
        setTimeout(() => {
          if (this.pendingCallbacks[callbackId]) {
            delete this.pendingCallbacks[callbackId];
          }
        }, 10000); // 10 second timeout
      }
      
    } catch (error) {
      console.error('[McpBridge] Error sending command:', error.message);
      this.isConnected = false;
      this.connect(); // Try to reconnect
      if (callback) {
        callback(error);
      }
    }
  }

  // Register a callback for specific message types
  onMessage(type, callback) {
    this.messageCallbacks[type] = callback;
  }

  // Basic rule-based parsing of user input
  parseUserInput(input) {
    console.log('[McpBridge] Rule-based parsing of:', input);
    input = input.toLowerCase();
    
    // Create basic shapes
    if (input.includes('create') || input.includes('add') || input.includes('make')) {
      // Detect shape type
      let actorClass = '';
      if (input.includes('cube') || input.includes('box')) {
        actorClass = 'Cube';
      } else if (input.includes('sphere') || input.includes('ball')) {
        actorClass = 'Sphere';
      } else if (input.includes('cylinder')) {
        actorClass = 'Cylinder';
      } else if (input.includes('cone')) {
        actorClass = 'Cone';
      } else if (input.includes('light')) {
        actorClass = 'PointLight';
      }
      
      if (actorClass) {
        // Extract position if provided
        let location = [0, 0, 100];
        const positionMatch = input.match(/at\s+\(?\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)?/);
        
        if (positionMatch) {
          location = [
            parseInt(positionMatch[1], 10),
            parseInt(positionMatch[2], 10),
            parseInt(positionMatch[3], 10)
          ];
        }
        
        // Extract color if provided
        let color = null;
        const colorKeywords = {
          'red': [1, 0, 0],
          'green': [0, 1, 0],
          'blue': [0, 0, 1],
          'yellow': [1, 1, 0],
          'cyan': [0, 1, 1],
          'magenta': [1, 0, 1],
          'white': [1, 1, 1],
          'black': [0, 0, 0]
        };
        
        for (const [colorName, colorValue] of Object.entries(colorKeywords)) {
          if (input.includes(colorName)) {
            color = colorValue;
            break;
          }
        }
        
        // Determine if we should create a material
        if (color) {
          const materialName = `${actorClass}_Material_${Date.now()}`;
          const actorLabel = `${actorClass}_${Date.now()}`;
          
          // Return a sequence of commands
          return {
            command: 'sequence',
            steps: [
              {
                command: 'create_material',
                params: {
                  material_name: materialName,
                  color: color
                }
              },
              {
                command: 'spawn_object',
                params: {
                  actor_class: actorClass,
                  location: location,
                  rotation: [0, 0, 0],
                  scale: [1, 1, 1],
                  actor_label: actorLabel
                }
              },
              {
                command: 'set_object_material',
                params: {
                  actor_name: actorLabel,
                  material_path: `/Game/Materials/${materialName}`
                }
              }
            ]
          };
        } else {
          // Just create the object without a material
          return {
            command: 'spawn_object',
            params: {
              actor_class: actorClass,
              location: location,
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
              actor_label: `${actorClass}_${Date.now()}`
            }
          };
        }
      }
    }
    
    // Create a material
    if ((input.includes('create') || input.includes('make')) && 
        input.includes('material')) {
      
      let color = [1, 0, 0]; // Default to red
      const colorKeywords = {
        'red': [1, 0, 0],
        'green': [0, 1, 0],
        'blue': [0, 0, 1],
        'yellow': [1, 1, 0],
        'cyan': [0, 1, 1],
        'magenta': [1, 0, 1],
        'white': [1, 1, 1],
        'black': [0, 0, 0]
      };
      
      for (const [colorName, colorValue] of Object.entries(colorKeywords)) {
        if (input.includes(colorName)) {
          color = colorValue;
          break;
        }
      }
      
      return {
        command: 'create_material',
        params: {
          material_name: `Material_${Date.now()}`,
          color: color
        }
      };
    }
    
    // If no match, return null and let the caller handle it
    return null;
  }
}

module.exports = new McpBridge(); 