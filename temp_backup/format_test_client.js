const WebSocket = require('ws');

// Connect to our proxy
const socket = new WebSocket('ws://127.0.0.1:9879');

// Track which format works
let workingFormat = null;
let currentFormat = 0;

// Different format attempts
const commandFormats = [
  // Format 1: Direct command with params
  {
    command: "spawn",
    params: {
      actor_class: "Cube",
      location: { x: 0, y: 0, z: 100 },
      color: { r: 1, g: 0, b: 0, a: 1 }
    }
  },
  
  // Format 2: Command with parameters
  {
    command: "spawn",
    parameters: {
      actor_class: "Cube",
      location: { x: 0, y: 0, z: 100 },
      color: { r: 1, g: 0, b: 0, a: 1 }
    }
  },
  
  // Format 3: Function with args
  {
    function: "spawn",
    args: {
      actor_class: "Cube",
      location: { x: 0, y: 0, z: 100 },
      color: { r: 1, g: 0, b: 0, a: 1 }
    }
  },
  
  // Format 4: Type with data
  {
    type: "spawn",
    data: {
      actor_class: "Cube",
      location: { x: 0, y: 0, z: 100 },
      color: { r: 1, g: 0, b: 0, a: 1 }
    }
  },
  
  // Format 5: Just a handshake
  {
    command: "handshake",
    message: "Hello from Web"
  },
  
  // Format 6: Just a direct command name with parameters
  "handshake"
];

// Process responses
socket.on('message', (data) => {
  console.log(`Response for format ${currentFormat+1}:`, data.toString());
  
  try {
    const response = JSON.parse(data.toString());
    
    // Check if this format worked
    if (!response.error && response.success !== false) {
      console.log(`✅ FORMAT ${currentFormat+1} WORKED!`);
      workingFormat = currentFormat;
    } else {
      console.log(`❌ Format ${currentFormat+1} failed:`, response.error || "Unknown error");
      
      // Try next format
      currentFormat++;
      if (currentFormat < commandFormats.length) {
        sendNextFormat();
      } else {
        if (workingFormat !== null) {
          console.log(`\n✨ SUCCESS: Format ${workingFormat+1} worked!`);
          console.log(JSON.stringify(commandFormats[workingFormat], null, 2));
        } else {
          console.log("\n❌ None of the formats worked!");
        }
        socket.close();
      }
    }
  } catch (e) {
    console.log('Could not parse response as JSON');
    currentFormat++;
    if (currentFormat < commandFormats.length) {
      sendNextFormat();
    } else {
      socket.close();
    }
  }
});

// Send the next format to try
function sendNextFormat() {
  console.log(`\nTrying format ${currentFormat+1}:`, JSON.stringify(commandFormats[currentFormat]));
  socket.send(JSON.stringify(commandFormats[currentFormat]));
}

// When connected, start testing formats
socket.on('open', () => {
  console.log('Connected to proxy, beginning format tests...\n');
  sendNextFormat();
});

socket.on('error', (error) => {
  console.error('Socket error:', error.message);
});

socket.on('close', () => {
  console.log('Connection closed');
}); 