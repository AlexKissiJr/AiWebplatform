require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const WebSocket = require('ws');

// MCP socket bridge
const { setupMcpBridge } = require('./services/mcpBridge');

// App Setup
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000'
}));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.send('AI Webplatform API is running');
});

// WebSocket for frontend communication
io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.on('sendMessage', async (data) => {
    try {
      // Forward message to MCP bridge and wait for response
      const response = await setupMcpBridge.sendCommand(data.message);
      
      // Send response back to client
      socket.emit('messageResponse', { message: response });
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: 'Error processing your request' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start the server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 