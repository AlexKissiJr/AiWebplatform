const express = require('express');
const path = require('path');
const app = express();
const port = 3001;

// Serve static files
app.use(express.static('public'));

// Parse JSON request bodies
app.use(express.json());

// Create public directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}

// Create HTML file for the permission dialog demo
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unreal Command Permission Demo</title>
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
    
    .dialog-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }
    
    .dialog-buttons button {
      padding: 8px 16px;
    }
    
    .allow-button {
      background-color: #4a4a4a;
    }
    
    .allow-once-button {
      background-color: #4a4a4a;
    }
    
    .deny-button {
      background-color: #e04f5f;
    }
    
    .preset-commands {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 20px;
    }
    
    .preset-button {
      background-color: #f0f0f0;
      color: #333;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid #ddd;
    }
    
    .preset-button:hover {
      background-color: #e0e0e0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Unreal Engine Command Test</h1>
    
    <div class="command-panel">
      <h2>Preset Commands</h2>
      <div class="preset-commands">
        <button class="preset-button" data-command="create a red cube at position 0,0,100">Create Red Cube</button>
        <button class="preset-button" data-command="create a blue sphere at position 100,0,100">Create Blue Sphere</button>
        <button class="preset-button" data-command="create a green cylinder at position -100,0,100">Create Green Cylinder</button>
        <button class="preset-button" data-command="delete all objects in the scene">Delete All Objects</button>
      </div>
      
      <h2>Custom Command</h2>
      <div class="input-area">
        <input type="text" id="messageInput" placeholder="Enter your command...">
        <button id="sendButton">Send</button>
      </div>
    </div>
    
    <div class="chat-container" id="chatMessages">
      <div class="message system-message">System: Welcome to the Unreal Engine Command Test!</div>
    </div>
  </div>
  
  <!-- Permission Dialog -->
  <div class="dialog-overlay" id="dialogOverlay"></div>
  <div class="permission-dialog" id="permissionDialog">
    <div class="dialog-header">
      <h3>Allow tool from "unreal-handshake" (local)?</h3>
    </div>
    <div class="dialog-content">
      <div class="warning">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
        </svg>
        <p>Malicious MCP servers or conversation content could potentially trick Claude into 
        attempting harmful actions through your installed tools. Review each action 
        carefully before approving.</p>
      </div>
      <div id="commandPreview" style="background: #3a3a3a; padding: 10px; border-radius: 4px; margin-top: 10px;">
        Run spawn object from unreal-handshake
      </div>
    </div>
    <div class="dialog-buttons">
      <button id="allowButton" class="allow-button">Allow for This Chat</button>
      <button id="allowOnceButton" class="allow-once-button">Allow Once</button>
      <button id="denyButton" class="deny-button">Deny</button>
    </div>
  </div>

  <script>
    const chatMessages = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const dialogOverlay = document.getElementById('dialogOverlay');
    const permissionDialog = document.getElementById('permissionDialog');
    const allowButton = document.getElementById('allowButton');
    const allowOnceButton = document.getElementById('allowOnceButton');
    const denyButton = document.getElementById('denyButton');
    const commandPreview = document.getElementById('commandPreview');
    const presetButtons = document.querySelectorAll('.preset-button');
    
    // Tool permissions
    const toolPermissions = {
      // toolName: 'always' | 'once' | 'never'
    };
    
    // Current command being processed
    let currentCommand = null;
    
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
    
    // Handle sending a message
    function handleSendMessage() {
      const message = messageInput.value.trim();
      if (message === '') return;
      
      // Add user message to chat
      addMessageToChat(message, 'user');
      
      // Check permissions before processing command
      checkToolPermission('unreal-handshake', message)
        .then(() => {
          // Permission granted, process command
          processCommand(message);
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
        commandPreview.textContent = \`Run: \${command}\`;
        
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
      // Create a command object for the Unreal Engine
      const commandObj = {
        id: Date.now().toString(),
        type: 'command',
        function: 'spawn_object',
        args: {
          actor_class: 'Cube',
          location: { x: 0, y: 0, z: 100 },
          rotation: { pitch: 0, yaw: 0, roll: 0 },
          scale: { x: 1, y: 1, z: 1 },
          properties: {
            color: { r: 1, g: 0, b: 0, a: 1 }
          }
        }
      };
      
      // Parse the command to determine what to spawn
      if (command.includes('cube')) {
        commandObj.args.actor_class = 'Cube';
      } else if (command.includes('sphere')) {
        commandObj.args.actor_class = 'Sphere';
      } else if (command.includes('cylinder')) {
        commandObj.args.actor_class = 'Cylinder';
      }
      
      // Parse color
      if (command.includes('red')) {
        commandObj.args.properties.color = { r: 1, g: 0, b: 0, a: 1 };
      } else if (command.includes('blue')) {
        commandObj.args.properties.color = { r: 0, g: 0, b: 1, a: 1 };
      } else if (command.includes('green')) {
        commandObj.args.properties.color = { r: 0, g: 1, b: 0, a: 1 };
      }
      
      // Special case for delete all
      if (command.includes('delete all')) {
        commandObj.function = 'delete_all_objects';
        delete commandObj.args;
      }
      
      // Log the command being sent
      console.log('Sending command:', JSON.stringify(commandObj));
      
      // ACTUALLY connect to the TCP proxy and send the command
      const socket = new WebSocket('ws://localhost:9878');
      
      // Add connection status to chat
      addMessageToChat('Connecting to Unreal Engine...', 'system');
      
      socket.onopen = () => {
        addMessageToChat('Connected! Sending command...', 'system');
        socket.send(JSON.stringify(commandObj));
      };
      
      socket.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          addMessageToChat('Unreal Engine: ' + (response.message || JSON.stringify(response)), 'system');
        } catch (e) {
          // In case it's not valid JSON
          addMessageToChat('Unreal Engine: ' + event.data, 'system');
        }
      };
      
      socket.onerror = (error) => {
        addMessageToChat(`