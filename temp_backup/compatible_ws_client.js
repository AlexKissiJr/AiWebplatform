const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

console.log('Starting WebSocket client compatible with Unreal Engine...');

// Create a custom WebSocket connection using HTTP upgrade
function createCustomWebSocketConnection() {
  return new Promise((resolve, reject) => {
    console.log('Creating custom WebSocket connection to Unreal Engine...');
    
    // Generate a random key
    const key = crypto.randomBytes(16).toString('base64');
    
    // Create a direct HTTP connection for handshake
    const options = {
      host: '127.0.0.1',
      port: 9877,
      path: '/',
      method: 'GET',
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Host': '127.0.0.1:9877',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
        'User-Agent': 'UnrealEngine/4.27'
      }
    };
    
    const req = http.request(options);
    
    req.on('upgrade', (res, socket, upgradeHead) => {
      console.log('Upgrade successful!');
      console.log('Server responded with:');
      console.log(`  Status: ${res.statusCode}`);
      console.log(`  Headers:`, res.headers);
      
      // We have a direct socket connection now
      console.log('Successfully obtained raw socket connection');
      
      // Set up basic handlers for the socket
      socket.on('data', (data) => {
        console.log('Received data from socket:', data.toString('hex'));
      });
      
      socket.on('close', () => {
        console.log('Socket closed');
      });
      
      socket.on('error', (err) => {
        console.error('Socket error:', err.message);
      });
      
      // We'll send a simple message to Unreal Engine
      const testMessage = {
        id: Date.now().toString(),
        type: "command",
        function: "log_to_console",
        args: {
          message: "Hello from custom WebSocket client",
          verbosity: "Display",
          category: "CustomWebSocket"
        }
      };
      
      const messageStr = JSON.stringify(testMessage);
      console.log('Sending message:', messageStr);
      
      // WebSocket framing - we need to construct a proper WebSocket frame
      // This is a simplified implementation for text frames
      function createTextFrame(data) {
        const dataBuffer = Buffer.from(data);
        const length = dataBuffer.length;
        
        let frameBuffer;
        
        if (length <= 125) {
          // Small frame
          frameBuffer = Buffer.alloc(2 + length);
          frameBuffer[0] = 0x81; // FIN + text frame
          frameBuffer[1] = length;
          dataBuffer.copy(frameBuffer, 2);
        } else if (length <= 65535) {
          // Medium frame
          frameBuffer = Buffer.alloc(4 + length);
          frameBuffer[0] = 0x81; // FIN + text frame
          frameBuffer[1] = 126;
          frameBuffer.writeUInt16BE(length, 2);
          dataBuffer.copy(frameBuffer, 4);
        } else {
          // Large frame
          frameBuffer = Buffer.alloc(10 + length);
          frameBuffer[0] = 0x81; // FIN + text frame
          frameBuffer[1] = 127;
          // Clear the first 4 bytes of length since we only support 32-bit length
          frameBuffer.writeUInt32BE(0, 2);
          // Write actual length in second 4 bytes
          frameBuffer.writeUInt32BE(length, 6);
          dataBuffer.copy(frameBuffer, 10);
        }
        
        return frameBuffer;
      }
      
      // Send the framed message
      const frame = createTextFrame(messageStr);
      console.log('Sending WebSocket frame:', frame.toString('hex'));
      socket.write(frame);
      
      // We've sent our message, now we can resolve
      resolve({ socket, res });
    });
    
    req.on('response', (res) => {
      console.error('Received HTTP response instead of upgrade');
      console.error(`Status: ${res.statusCode}`);
      console.error('Headers:', res.headers);
      
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        console.error('Response body:', body);
        reject(new Error('Server did not upgrade the connection'));
      });
    });
    
    req.on('error', (err) => {
      console.error('HTTP request error:', err.message);
      reject(err);
    });
    
    console.log('Sending HTTP upgrade request...');
    req.end();
  });
}

// Also try with the standard WebSocket library
function tryStandardWebSocket() {
  return new Promise((resolve, reject) => {
    console.log('\nAlso trying with standard WebSocket library...');
    
    const ws = new WebSocket('ws://127.0.0.1:9877');
    
    ws.on('open', () => {
      console.log('Standard WebSocket connection opened successfully!');
      
      // Send a test message
      const testMessage = {
        id: Date.now().toString(),
        type: "command",
        function: "log_to_console",
        args: {
          message: "Hello from standard WebSocket client",
          verbosity: "Display", 
          category: "StandardWebSocket"
        }
      };
      
      ws.send(JSON.stringify(testMessage));
      console.log('Test message sent via standard WebSocket');
      
      setTimeout(() => {
        ws.close();
        resolve(true);
      }, 2000);
    });
    
    ws.on('message', (data) => {
      console.log('Received message via standard WebSocket:', data.toString());
    });
    
    ws.on('error', (err) => {
      console.error('Standard WebSocket error:', err.message);
      reject(err);
    });
    
    ws.on('unexpected-response', (req, res) => {
      console.error('Unexpected response from server:');
      console.error(`Status: ${res.statusCode}`);
      console.error('Headers:', res.headers);
      reject(new Error('Unexpected response'));
    });
  });
}

// Run both methods
async function runTests() {
  try {
    // First try custom implementation
    console.log('=== Testing custom WebSocket implementation ===');
    await createCustomWebSocketConnection();
    
    // Then try standard library
    console.log('\n=== Testing standard WebSocket library ===');
    await tryStandardWebSocket();
    
    console.log('\n✅ Tests completed successfully!');
  } catch (err) {
    console.error('\n❌ Tests failed:', err.message);
    console.log('\nTroubleshooting tips:');
    console.log('1. Make sure Unreal Engine is running with the WebSocket server enabled');
    console.log('2. Check Unreal Engine logs for any WebSocket server errors');
    console.log('3. Make sure the WebSocket server is configured to listen on 127.0.0.1:9877');
    console.log('4. Check if there are any firewalls blocking the connection');
    console.log('5. Try different WebSocket client libraries if necessary');
  }
}

runTests(); 