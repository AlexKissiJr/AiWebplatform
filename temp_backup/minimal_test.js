const WebSocket = require('ws');

// Based on the logs, I think Unreal expects an object with the command directly as the key
// Let's build a minimal test that just tries this format

// Connect to our proxy
console.log('Connecting to proxy...');
const socket = new WebSocket('ws://127.0.0.1:9879');

// When connected, send a command
socket.on('open', () => {
  console.log('Connected to proxy');
  
  // Send a command in the simplest possible format
  const command = {
    "spawn": {  // Command name as the key
      "actor_class": "Cube",
      "location": { "x": 0, "y": 0, "z": 100 },
      "rotation": { "pitch": 0, "yaw": 0, "roll": 0 },
      "scale": { "x": 1, "y": 1, "z": 1 },
      "properties": {
        "color": { "r": 1, "g": 0, "b": 0, "a": 1 }
      }
    }
  };
  
  console.log('Sending command:', JSON.stringify(command));
  socket.send(JSON.stringify(command));
  
  // Wait 2 seconds and try a handshake
  setTimeout(() => {
    const handshake = { "handshake": "Hello from the web" };
    console.log('Sending handshake:', JSON.stringify(handshake));
    socket.send(JSON.stringify(handshake));
  }, 2000);
});

// Handle messages from the server
socket.on('message', (data) => {
  console.log('Received response:', data.toString());
  try {
    const response = JSON.parse(data.toString());
    console.log('Parsed response:', response);
  } catch (e) {
    console.log('Could not parse response as JSON');
  }
});

socket.on('error', (error) => {
  console.error('Socket error:', error.message);
});

socket.on('close', () => {
  console.log('Connection closed');
}); 