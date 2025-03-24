const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const url = require('url');

// Create Express app for the demo UI
const app = express();
const port = 3001;

// Config
const PORT = 9879;
const UNREAL_HOST = '127.0.0.1';
const UNREAL_PORT = 9877;

// Create TCP proxy to Unreal Engine
let unrealSocket = null;
let isConnected = false;
let connectionCheckInterval = null;

// Store client connections
const clients = new Set();

// Tool permissions
const toolPermissions = new Map();

// Create the public directory
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}

// Serve static files
app.use(express.static('public'));

// Create HTML file for the permission dialog demo
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unreal Engine Command Interface</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 20px;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    
    .command-panel {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    
    .chat-container {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      height: 300px;
      overflow-y: auto;
      margin-bottom: 20px;
    }
    
    .input-area {
      display: flex;
      margin-bottom: 20px;
    }
    
    #messageInput {
      flex-grow: 1;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-right: 10px;
    }
    
    button {
      background-color: #0066cc;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
    }
    
    button:hover {
      background-color: #0055bb;
    }
    
    .message {
      margin-bottom: 10px;
      padding: 10px;
      border-radius: 4px;
    }
    
    .user-message {
      background-color: #e6f7ff;
      text-align: right;
    }
    
    .system-message {
      background-color: #f0f0f0;
    }
    
    /* Permission Dialog Styles */
    .permission-dialog {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #292929;
      border-radius: 8px;
      padding: 20px;
      width: 90%;
      max-width: 400px;
      color: white;
      z-index: 1000;
    }
    
    .dialog-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0,0,0,0.5);
      z-index: 999;
    }
    
    .warning {
      display: flex;
      background: rgba(255, 165, 0, 0.1);
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0;
      align-items: flex-start;
    }
    
    .warning svg {
      min-width: 24px;
      width: 24px;
      height: 24px;
      margin-right: 10px;
      fill: orange;
    }
    
    .button-group {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .button-group button {
      font-size: 14px;
      padding: 8px 12px;
    }
    
    .connection-status {
      display: inline-block;
      padding: 5px 10px;
      margin-bottom: 10px;
      border-radius: 4px;
    }
    
    .status-connected {
      background-color: #d4edda;
      color: #155724;
    }
    
    .status-disconnected {
      background-color: #f8d7da;
      color: #721c24;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Unreal Engine Command Interface</h1>
    
    <div id="connectionStatus" class="connection-status status-disconnected">
      Not connected to Unreal Engine
    </div>
    
    <div class="command-panel">
      <h2>Quick Commands</h2>
      <div class="button-group">
        <button class="preset-button" data-command='{"spawn": {"actor_class": "Cube", "location": {"x": 0, "y": 0, "z": 100}, "rotation": {"pitch": 0, "yaw": 0, "roll": 0}, "scale": {"x": 1, "y": 1, "z": 1}, "properties": {"color": {"r": 1, "g": 0, "b": 0, "a": 1}}}}'>Create Red Cube</button>
        <button class="preset-button" data-command='{"spawn": {"actor_class": "Sphere", "location": {"x": 200, "y": 0, "z": 100}, "rotation": {"pitch": 0, "yaw": 0, "roll": 0}, "scale": {"x": 1, "y": 1, "z": 1}, "properties": {"color": {"r": 0, "g": 0, "b": 1, "a": 1}}}}'>Create Blue Sphere</button>
        <button class="preset-button" data-command='{"spawn": {"actor_class": "Cylinder", "location": {"x": -200, "y": 0, "z": 100}, "rotation": {"pitch": 0, "yaw": 0, "roll": 0}, "scale": {"x": 1, "y": 1, "z": 1}, "properties": {"color": {"r": 0, "g": 1, "b": 0, "a": 1}}}}'>Create Green Cylinder</button>
        <button class="preset-button" data-command='{"delete_all": {}}'>Delete All Objects</button>
      </div>
      
      <h3>Natural Language Commands</h3>
      <p>Try typing commands like: "create a red cube" or "spawn a blue sphere"</p>
    </div>
    
    <div class="chat-container" id="chatMessages">
      <div class="message system-message">Welcome to the Unreal Engine Command Interface. Type a command or use the buttons above.</div>
    </div>
    
    <div class="input-area">
      <input type="text" id="messageInput" placeholder="Enter your command...">
      <button id="sendButton">Send</button>
    </div>
  </div>
  
  <!-- Permission Dialog -->
  <div class="dialog-overlay" id="dialogOverlay"></div>
  <div class="permission-dialog" id="permissionDialog">
    <h2>Allow this action?</h2>
    <p id="commandPreview"></p>
    
    <div class="warning">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
      </svg>
      <span>This action will be executed in Unreal Engine.</span>
    </div>
    
    <button id="allowButton">Allow for This Chat</button>
    <button id="allowOnceButton">Allow Once</button>
    <button id="denyButton">Deny</button>
  </div>
  
  <script>
    // Initialize variables
    const sendButton = document.getElementById('sendButton');
    const messageInput = document.getElementById('messageInput');
    const chatMessages = document.getElementById('chatMessages');
    const permissionDialog = document.getElementById('permissionDialog');
    const dialogOverlay = document.getElementById('dialogOverlay');
    const commandPreview = document.getElementById('commandPreview');
    const allowButton = document.getElementById('allowButton');
    const allowOnceButton = document.getElementById('allowOnceButton');
    const denyButton = document.getElementById('denyButton');
    const connectionStatus = document.getElementById('connectionStatus');
    const presetButtons = document.querySelectorAll('.preset-button');
    
    // Store permissions
    const toolPermissions = {};
    let currentCommand = '';
    
    // Connect to WebSocket server
    let socket;
    let isConnected = false;
    
    function connectToServer() {
      socket = new WebSocket('ws://localhost:9879');
      
      socket.onopen = () => {
        console.log('Connected to server');
        addMessageToChat('Connected to server', 'system');
      };
      
      socket.onmessage = (event) => {
        console.log('Received message from server:', event.data);
        
        try {
          const data = JSON.parse(event.data);
          
          // Update connection status
          if (data.type === 'status' || (data.hasOwnProperty('success') && data.hasOwnProperty('message'))) {
            updateConnectionStatus(data.success);
          }
          
          // Add message to chat
          addMessageToChat(data.message || JSON.stringify(data), 'system');
        } catch (error) {
          console.error('Error parsing message:', error);
          addMessageToChat(event.data, 'system');
        }
      };
      
      socket.onclose = () => {
        console.log('Disconnected from server');
        addMessageToChat('Disconnected from server. Trying to reconnect...', 'system');
        updateConnectionStatus(false);
        
        // Try to reconnect after 3 seconds
        setTimeout(connectToServer, 3000);
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        addMessageToChat('Connection error', 'system');
      };
    }
    
    // Connect on page load
    connectToServer();
    
    // Update connection status UI
    function updateConnectionStatus(connected) {
      if (connected) {
        connectionStatus.className = 'connection-status status-connected';
        connectionStatus.textContent = 'Connected to Unreal Engine';
      } else {
        connectionStatus.className = 'connection-status status-disconnected';
        connectionStatus.textContent = 'Not connected to Unreal Engine';
      }
    }
    
    // Add event listeners
    sendButton.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSendMessage();
      }
    });
    
    allowButton.addEventListener('click', () => handlePermissionResponse('always'));
    allowOnceButton.addEventListener('click', () => handlePermissionResponse('once'));
    denyButton.addEventListener('click', () => handlePermissionResponse('never'));
    
    // Add preset button event listeners
    presetButtons.forEach(button => {
      button.addEventListener('click', () => {
        messageInput.value = button.getAttribute('data-command');
        handleSendMessage();
      });
    });
    
    // Process natural language (basic)
    function processNaturalLanguage(text) {
      text = text.toLowerCase();
      
      // Simple rule-based parsing
      if (text.includes('create') || text.includes('add') || text.includes('make') || text.includes('spawn')) {
        // Detect shape type
        let actorClass = "Cube"; // Default
        if (text.includes('sphere')) actorClass = "Sphere";
        if (text.includes('cylinder')) actorClass = "Cylinder";
        
        // Detect color
        let color = {"r": 1, "g": 0, "b": 0, "a": 1}; // Default red
        if (text.includes('blue')) color = {"r": 0, "g": 0, "b": 1, "a": 1};
        if (text.includes('green')) color = {"r": 0, "g": 1, "b": 0, "a": 1};
        
        // Create the command
        return JSON.stringify({
          "spawn": {
            "actor_class": actorClass,
            "location": {"x": 0, "y": 0, "z": 100},
            "rotation": {"pitch": 0, "yaw": 0, "roll": 0},
            "scale": {"x": 1, "y": 1, "z": 1},
            "properties": {"color": color}
          }
        });
      }
      
      if (text.includes('delete all') || text.includes('remove all')) {
        return JSON.stringify({
          "delete_all": {}
        });
      }
      
      // Default to handshake if we don't understand
      return JSON.stringify({
        "handshake": {
          "message": text
        }
      });
    }
    
    // Handle sending a message
    function handleSendMessage() {
      const message = messageInput.value.trim();
      if (message === '') return;
      
      // Process natural language if the input doesn't look like JSON
      let processedMessage = message;
      if (!message.startsWith('{') || !message.endsWith('}')) {
        processedMessage = processNaturalLanguage(message);
      }
      
      // Add user message to chat
      addMessageToChat(message, 'user');
      
      // Check permissions before processing command
      checkToolPermission('unreal-handshake', processedMessage)
        .then(() => {
          // Permission granted, process command
          processCommand(processedMessage);
        })
        .catch((error) => {
          // Permission denied
          addMessageToChat('Command execution denied: ' + error.message, 'system');
        });
      
      // Clear input
      messageInput.value = '';
    }
    
    // Add a message to the chat
    function addMessageToChat(message, sender) {
      const messageElement = document.createElement('div');
      messageElement.classList.add('message');
      
      if (sender === 'user') {
        messageElement.classList.add('user-message');
        messageElement.textContent = 'You: ' + message;
      } else {
        messageElement.classList.add('system-message');
        messageElement.textContent = message;
      }
      
      chatMessages.appendChild(messageElement);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Check tool permission
    function checkToolPermission(toolName, command) {
      return new Promise((resolve, reject) => {
        if (toolPermissions[toolName] === 'always') {
          resolve();
          return;
        }
        
        if (toolPermissions[toolName] === 'never') {
          reject(new Error('Permission denied'));
          return;
        }
        
        // Show permission dialog
        currentCommand = command;
        commandPreview.textContent = 'Run: ' + command;
        
        dialogOverlay.style.display = 'block';
        permissionDialog.style.display = 'block';
        
        // Store resolve/reject functions for later use
        checkToolPermission.currentResolve = resolve;
        checkToolPermission.currentReject = reject;
      });
    }
    
    // Handle permission response
    function handlePermissionResponse(response) {
      dialogOverlay.style.display = 'none';
      permissionDialog.style.display = 'none';
      
      if (response === 'always' || response === 'once') {
        // Store permission
        if (response === 'always') {
          toolPermissions['unreal-handshake'] = 'always';
        } else {
          toolPermissions['unreal-handshake'] = 'once';
        }
        
        // Resolve the promise
        if (checkToolPermission.currentResolve) {
          checkToolPermission.currentResolve();
          checkToolPermission.currentResolve = null;
          checkToolPermission.currentReject = null;
        }
      } else {
        // Deny permission
        toolPermissions['unreal-handshake'] = 'never';
        
        // Reject the promise
        if (checkToolPermission.currentReject) {
          checkToolPermission.currentReject(new Error('User denied permission'));
          checkToolPermission.currentResolve = null;
          checkToolPermission.currentReject = null;
        }
      }
      
      // Reset after 'once' permission
      if (response === 'once') {
        setTimeout(() => {
          toolPermissions['unreal-handshake'] = null;
        }, 100);
      }
    }
    
    // Process a command
    function processCommand(command) {
      // Make sure we're connected
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        addMessageToChat('Not connected to server. Trying to reconnect...', 'system');
        connectToServer();
        
        // Queue the command to be sent when connected
        setTimeout(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            processCommand(command);
          } else {
            addMessageToChat('Failed to connect to server', 'system');
          }
        }, 2000);
        
        return;
      }
      
      console.log('Sending command:', command);
      addMessageToChat('Sending command to Unreal Engine...', 'system');
      
      // Send the command
      socket.send(command);
    }
  </script>
</body>
</html>
`;

// Write HTML file
fs.writeFileSync('public/index.html', htmlContent);

// Create HTTP server to serve the permission dialog demo
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlContent);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store client connections
const clients = new Set();
let unrealSocket = null;
let connectionAttempts = 0;
let reconnectTimer = null;
let pingInterval = null;

// Format commands for Unreal Engine
function formatCommandForUnreal(message) {
  try {
    // If message is already a string, parse it to an object
    const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
    
    // Check if it's already in the right format
    if (parsedMessage.command && parsedMessage.params) {
      return parsedMessage;
    }
    
    // Otherwise, transform to the correct format
    const commandName = Object.keys(parsedMessage)[0];
    return {
      command: commandName,
      params: parsedMessage[commandName]
    };
  } catch (err) {
    console.error('Error formatting command:', err.message);
    // If we can't parse it, return a default handshake
    return {
      command: "handshake",
      params: {
        message: "Error processing command: " + message
      }
    };
  }
}

// Connect to Unreal Engine
function connectToUnreal() {
  if (unrealSocket && !unrealSocket.destroyed) {
    console.log('Already connected to Unreal Engine');
    return;
  }

  console.log(`Connecting to Unreal Engine at ${UNREAL_HOST}:${UNREAL_PORT}...`);

  // Create TCP socket connection to Unreal Engine
  unrealSocket = net.createConnection({
    host: UNREAL_HOST,
    port: UNREAL_PORT
  });

  // Connection established
  unrealSocket.on('connect', () => {
    console.log('Connected to Unreal Engine!');
    connectionAttempts = 0;
    
    // Send a handshake message
    const handshake = {
      "command": "handshake",
      "params": {
        "message": "Hello from Web Interface"
      }
    };
    
    unrealSocket.write(JSON.stringify(handshake) + '\n');
    console.log('Sent handshake message to Unreal Engine');
    
    // Broadcast to all clients
    const statusMsg = JSON.stringify({
      type: 'status',
      success: true,
      message: 'Connected to Unreal Engine'
    });
    broadcastToClients(statusMsg);
    
    // Set up a ping interval to keep the connection alive
    clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (unrealSocket && !unrealSocket.destroyed) {
        const pingCommand = {
          "command": "ping",
          "params": {
            "timestamp": Date.now()
          }
        };
        unrealSocket.write(JSON.stringify(pingCommand) + '\n');
      }
    }, 30000); // Send ping every 30 seconds
  });

  // Data received from Unreal Engine
  unrealSocket.on('data', (data) => {
    const message = data.toString().trim();
    console.log('Received from Unreal Engine:', message);

    // Broadcast to all clients
    broadcastToClients(message);
  });

  // Connection closed
  unrealSocket.on('close', () => {
    console.log('Connection to Unreal Engine closed');
    clearInterval(pingInterval);
    
    // Broadcast to all clients
    const statusMsg = JSON.stringify({
      type: 'status',
      success: false,
      message: 'Disconnected from Unreal Engine'
    });
    broadcastToClients(statusMsg);
    
    // Try to reconnect
    scheduleReconnect();
  });

  // Error handler
  unrealSocket.on('error', (err) => {
    console.error('Unreal Engine connection error:', err.message);
    
    // Broadcast to all clients
    const errorMsg = JSON.stringify({
      type: 'status',
      success: false,
      message: `Connection error: ${err.message}`
    });
    broadcastToClients(errorMsg);
  });
}

// Schedule reconnection with exponential backoff
function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  connectionAttempts++;
  
  const delay = Math.min(30000, Math.pow(2, connectionAttempts) * 1000);
  console.log(`Scheduling reconnection attempt in ${delay}ms...`);
  
  reconnectTimer = setTimeout(connectToUnreal, delay);
}

// Broadcast a message to all connected WebSocket clients
function broadcastToClients(message) {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  // Connect to Unreal Engine if not already connected
  if (!unrealSocket || unrealSocket.destroyed) {
    connectToUnreal();
  } else {
    // Send connection status to the new client
    const statusMsg = JSON.stringify({
      type: 'status',
      success: unrealSocket && !unrealSocket.destroyed,
      message: unrealSocket && !unrealSocket.destroyed ? 'Connected to Unreal Engine' : 'Not connected to Unreal Engine'
    });
    ws.send(statusMsg);
  }

  // Handle messages from client
  ws.on('message', (message) => {
    console.log('Received from client:', message.toString());

    // Make sure we have a connection to Unreal Engine
    if (!unrealSocket || unrealSocket.destroyed) {
      console.log('Not connected to Unreal Engine, attempting to connect...');
      connectToUnreal();
      
      // Queue the message to be sent when connected
      setTimeout(() => {
        if (unrealSocket && !unrealSocket.destroyed) {
          sendMessageToUnreal(message);
        } else {
          ws.send(JSON.stringify({
            success: false,
            message: 'Failed to connect to Unreal Engine'
          }));
        }
      }, 2000);
      
      return;
    }

    sendMessageToUnreal(message);
  });

  // Handle client disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });

  // Handle errors
  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    clients.delete(ws);
  });
});

// Send a message to Unreal Engine with proper formatting
function sendMessageToUnreal(message) {
  try {
    // Format the command correctly
    const formattedCommand = formatCommandForUnreal(message);
    
    // Convert to JSON string with newline
    const messageString = JSON.stringify(formattedCommand) + '\n';
    console.log(`Sending to Unreal: ${messageString}`);
    
    // Send to Unreal Engine
    unrealSocket.write(messageString);
  } catch (err) {
    console.error('Error sending message to Unreal Engine:', err.message);
    broadcastToClients(JSON.stringify({
      success: false,
      message: `Error sending message: ${err.message}`
    }));
  }
}

// Start server
server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
  connectToUnreal();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  
  // Close WebSocket server
  wss.close();
  
  // Close Unreal Engine connection
  if (unrealSocket) {
    unrealSocket.destroy();
  }
  
  // Close Express server
  process.exit(0);
}); 
