const net = require('net');
const WebSocket = require('ws');

// Create WebSocket server for clients
const wss = new WebSocket.Server({ port: 9878, host: '0.0.0.0' });
console.log('TCP-WebSocket proxy server started on 0.0.0.0:9878');
console.log('Will forward connections to Unreal Engine on 127.0.0.1:9877');

// Track active connections
const clients = new Map();

// Create a TCP server to listen for responses from Unreal
let unrealTcpSocket = null;
let messageQueue = [];
let isConnectedToUnreal = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

// Connect to Unreal Engine via TCP
function connectToUnreal() {
  console.log(`Attempting to connect to Unreal Engine (Attempt: ${reconnectAttempts + 1})`);
  
  // Close existing socket if any
  if (unrealTcpSocket) {
    unrealTcpSocket.destroy();
  }
  
  unrealTcpSocket = new net.Socket();
  
  // Set timeout to prevent hanging connections
  unrealTcpSocket.setTimeout(5000);
  
  unrealTcpSocket.connect(9877, '127.0.0.1', () => {
    console.log('Connected to Unreal Engine via TCP');
    isConnectedToUnreal = true;
    reconnectAttempts = 0;
    
    // Process any queued messages
    if (messageQueue.length > 0) {
      console.log(`Processing ${messageQueue.length} queued messages`);
      messageQueue.forEach(msg => {
        sendToUnreal(msg);
      });
      messageQueue = [];
    }
    
    // Broadcast to all connected clients that Unreal is connected
    clients.forEach(({ clientSocket }) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({
          type: 'system',
          message: 'Connected to Unreal Engine',
          timestamp: Date.now()
        }));
      }
    });
  });
  
  unrealTcpSocket.on('data', (data) => {
    console.log(`Received from Unreal Engine: ${data.toString().substring(0, 100)}...`);
    
    // Try to parse as JSON
    try {
      const jsonData = JSON.parse(data.toString());
      
      // Forward to all connected clients
      clients.forEach(({ clientSocket }) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify(jsonData));
        }
      });
    } catch (e) {
      console.error('Error parsing response from Unreal:', e.message);
      console.log('Raw data:', data.toString());
      
      // Send raw data anyway
      clients.forEach(({ clientSocket }) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(data.toString());
        }
      });
    }
  });
  
  unrealTcpSocket.on('error', (error) => {
    console.error(`Error with Unreal TCP connection: ${error.message}`);
    isConnectedToUnreal = false;
  });
  
  unrealTcpSocket.on('timeout', () => {
    console.log('Connection to Unreal timed out');
    unrealTcpSocket.destroy();
  });
  
  unrealTcpSocket.on('close', () => {
    console.log('TCP connection to Unreal closed');
    isConnectedToUnreal = false;
    
    // Try to reconnect if needed
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 10000);
      
      console.log(`Will attempt to reconnect in ${delay}ms (Attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
      
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      
      reconnectTimer = setTimeout(() => {
        connectToUnreal();
      }, delay);
    } else {
      console.log(`Max reconnection attempts (${maxReconnectAttempts}) reached`);
      
      // Notify all clients
      clients.forEach(({ clientSocket }) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify({
            type: 'system',
            message: 'Failed to connect to Unreal Engine after multiple attempts',
            timestamp: Date.now()
          }));
        }
      });
    }
  });
}

// Function to send data to Unreal
function sendToUnreal(message) {
  if (!isConnectedToUnreal || !unrealTcpSocket) {
    console.log(`Queueing message: ${message.toString().substring(0, 100)}...`);
    messageQueue.push(message);
    
    // If we're not already trying to reconnect, try now
    if (!reconnectTimer && reconnectAttempts < maxReconnectAttempts) {
      connectToUnreal();
    }
    return;
  }
  
  console.log(`Sending to Unreal: ${message.toString().substring(0, 100)}...`);
  
  // Make sure message ends with a newline to help with framing
  let msgStr = message.toString();
  if (!msgStr.endsWith('\n')) {
    msgStr += '\n';
  }
  
  // Send the message
  unrealTcpSocket.write(msgStr);
}

// WebSocket server connection handling
wss.on('connection', (clientSocket) => {
  const clientId = Date.now().toString();
  console.log(`Client connected: ${clientId}`);
  
  // Store client
  clients.set(clientId, { clientSocket });
  
  // Notify client of Unreal connection status
  clientSocket.send(JSON.stringify({
    type: 'system',
    message: isConnectedToUnreal ? 'Connected to Unreal Engine' : 'Not connected to Unreal Engine',
    timestamp: Date.now()
  }));
  
  // Handle messages from client
  clientSocket.on('message', (message) => {
    sendToUnreal(message);
  });
  
  // Handle client disconnect
  clientSocket.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    clients.delete(clientId);
  });
  
  clientSocket.on('error', (error) => {
    console.error(`Client error: ${error.message}`);
    // The close event will handle cleanup
  });
});

// Connect to Unreal when the server starts
connectToUnreal();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down TCP-WebSocket proxy...');
  
  // Close all client connections
  clients.forEach(({ clientSocket }) => {
    try {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close();
      }
    } catch (err) {
      // Ignore errors during shutdown
    }
  });
  
  // Close the server
  wss.close(() => {
    console.log('WebSocket server closed');
    
    // Close Unreal connection
    if (unrealTcpSocket) {
      unrealTcpSocket.destroy();
    }
    
    process.exit(0);
  });
}); 