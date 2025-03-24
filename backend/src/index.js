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

// Direct connection to MCP server for test_unreal_connection
function sendToMcpServer(command) {
  return new Promise((resolve, reject) => {
    console.log(`[Backend] Connecting to MCP server to send: ${JSON.stringify(command)}`);
    
    const ws = new WebSocket(process.env.MCP_SERVER_URL || 'ws://mcp_server:8765');
    
    ws.on('open', () => {
      console.log('[Backend] Connected to MCP server, sending command...');
      ws.send(JSON.stringify({
        id: Date.now().toString(),
        ...command
      }));
    });
    
    ws.on('message', (data) => {
      console.log(`[Backend] Received MCP response: ${data.toString()}`);
      
      try {
        const response = JSON.parse(data.toString());
        resolve(response);
      } catch (error) {
        reject(new Error(`Failed to parse MCP response: ${error.message}`));
      }
      
      ws.close();
    });
    
    ws.on('error', (error) => {
      console.error('[Backend] WebSocket error:', error);
      reject(new Error(`WebSocket error: ${error.message}`));
      ws.close();
    });
    
    // Set timeout
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
        reject(new Error('MCP server connection timeout'));
      }
    }, 10000);
  });
}

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000'
}));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.send('AI Webplatform API is running');
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
      
      // Special handling for test_unreal_connection
      if (message && message.trim().toLowerCase() === 'test_unreal_connection') {
        console.log('[Backend] DETECTED test_unreal_connection command');
        
        try {
          // Send to MCP server directly
          const response = await sendToMcpServer({
            command: 'test_unreal_connection',
            params: {}
          });
          
          console.log(`[Backend] Got MCP response: ${JSON.stringify(response)}`);
          
          // Format nice message for client
          let responseMessage = '';
          
          if (response.result && response.result.status === 'success') {
            responseMessage = `Connection test SUCCESS: ${response.result.result}`;
          } else {
            responseMessage = `Connection test FAILED: ${response.result?.error || 'Unknown error'}`;
          }
          
          console.log(`[Backend] Sending client response: ${responseMessage}`);
          socket.emit('messageResponse', { message: responseMessage });
          return;
        } catch (error) {
          console.error('[Backend] Error handling test connection:', error);
          socket.emit('messageResponse', { message: `Error testing connection: ${error.message}` });
          return;
        }
      }
      
      // Process other messages using mcpBridge (which now uses AI service)
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