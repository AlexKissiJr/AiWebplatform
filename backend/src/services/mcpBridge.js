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
    this.connect();
  }

  connect() {
    try {
      const url = process.env.MCP_SERVER_URL || 'ws://mcp_server:8765';
      console.log(`[McpBridge] Connecting to MCP at ${url}`);
      
      this.ws = new WebSocket(url);
      
      this.ws.on('open', () => {
        console.log('[McpBridge] Connected to MCP');
        this.isConnected = true;
        
        // Process any queued commands
        while (this.commandQueue.length > 0) {
          const { command, callback } = this.commandQueue.shift();
          this.sendCommand(command, callback);
        }
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log(`[McpBridge] Received message from MCP: ${JSON.stringify(message)}`);
          
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
        console.log('[McpBridge] Disconnected from MCP');
        this.isConnected = false;
        
        // Attempt to reconnect after a delay
        setTimeout(() => this.connect(), 5000);
      });
      
      this.ws.on('error', (error) => {
        console.error('[McpBridge] WebSocket error:', error.message);
      });
      
    } catch (error) {
      console.error('[McpBridge] Error connecting to MCP:', error.message);
      setTimeout(() => this.connect(), 5000);
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
        
        // Execute the command
        if (commandToExecute) {
          console.log('[McpBridge] Executing command:', commandToExecute);
          this.sendCommand(commandToExecute, (err, response) => {
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

  // Send a command to the MCP server
  sendCommand(command, callback) {
    if (!this.isConnected) {
      console.log('[McpBridge] Not connected, queueing command:', command);
      this.commandQueue.push({ command, callback });
      return;
    }
    
    try {
      // Generate a unique ID for this command
      const id = Date.now().toString();
      
      // Prepare the message
      const message = {
        id,
        ...command
      };
      
      // Store the callback for when we get a response
      if (callback) {
        this.pendingCallbacks[id] = callback;
      }
      
      // Send the message
      this.ws.send(JSON.stringify(message));
      console.log(`[McpBridge] Sent command to MCP: ${JSON.stringify(message)}`);
      
    } catch (error) {
      console.error('[McpBridge] Error sending command:', error.message);
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