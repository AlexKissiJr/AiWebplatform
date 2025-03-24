// Load environment variables if dotenv is available
try {
  require('dotenv').config();
} catch (err) {
  console.log('dotenv not available, skipping...');
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const WebSocket = require('ws');
const mcpBridge = require('./services/mcpBridge');
const aiService = require('./services/aiService');

// App Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
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

// Add execute endpoint
app.post('/api/execute', async (req, res) => {
  try {
    const { message, model } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log(`Executing command: ${message} using model: ${model || 'rule-based'}`);
    
    // Create a Promise to handle the async mcpBridge.sendMessage call
    const result = await new Promise((resolve, reject) => {
      // Use sendMessage instead of sendCommand as it returns a Promise
      mcpBridge.sendMessage(message, model || 'rule-based')
        .then(response => resolve(response))
        .catch(error => reject(error));
    });
    
    res.json({ success: true, response: result });
  } catch (error) {
    console.error('Error executing command:', error);
    res.status(500).json({ error: `Failed to execute command: ${error.message}` });
  }
});

// API routes for model management
app.get('/api/models', (req, res) => {
  try {
    const models = aiService.getAvailableModels();
    const currentModel = aiService.getCurrentModel();
    
    res.json({
      models,
      currentModel
    });
  } catch (error) {
    console.error('Error getting models:', error);
    res.status(500).json({ error: 'Failed to get models' });
  }
});

app.post('/api/models/select', (req, res) => {
  try {
    const { modelId } = req.body;
    if (!modelId) {
      return res.status(400).json({ error: 'Model ID is required' });
    }
    
    const success = aiService.setCurrentModel(modelId);
    
    if (success) {
      res.json({ success: true, currentModel: modelId });
    } else {
      res.status(400).json({ error: 'Invalid model ID' });
    }
  } catch (error) {
    console.error('Error selecting model:', error);
    res.status(500).json({ error: 'Failed to select model' });
  }
});

app.get('/api/models/:modelId/config', (req, res) => {
  try {
    const { modelId } = req.params;
    const config = aiService.getModelConfig(modelId);
    
    if (config) {
      // Don't send the actual API key value back to the client for security
      // Just send if it's configured or not
      res.json({
        modelId,
        apiKey: config.apiKey ? '••••••••' : '',
        hasApiKey: !!config.apiKey,
        endpoint: config.endpoint
      });
    } else {
      res.status(404).json({ error: 'Model not found' });
    }
  } catch (error) {
    console.error('Error getting model config:', error);
    res.status(500).json({ error: 'Failed to get model configuration' });
  }
});

app.post('/api/models/:modelId/config', (req, res) => {
  try {
    const { modelId } = req.params;
    const { apiKey, endpoint } = req.body;
    
    // Update configuration
    const success = aiService.updateModelConfig(modelId, { apiKey, endpoint });
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Invalid model ID' });
    }
  } catch (error) {
    console.error('Error updating model config:', error);
    res.status(500).json({ error: 'Failed to update model configuration' });
  }
});

// WebSocket for frontend communication
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Handle message from client
  socket.on('sendMessage', async (data) => {
    try {
      console.log(`Received message from client: ${JSON.stringify(data)}`);
      
      const { message, modelId } = data;
      
      // Process the message using mcpBridge (which now uses AI service)
      const response = await mcpBridge.sendMessage(message, modelId || 'rule-based');
      
      console.log(`Sending response to client: ${response}`);
      socket.emit('messageResponse', { message: response });
      
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', { message: `Error: ${error.message}` });
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Create health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start the server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close();
  process.exit(0);
}); 