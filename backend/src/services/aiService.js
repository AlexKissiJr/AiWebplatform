const axios = require('axios');

class AIService {
  constructor() {
    // Available models
    this.availableModels = {
      'deepseek-r1': {
        name: 'DeepSeek-R1',
        description: 'Expert in Unreal Engine and Blueprint creation',
        defaultEndpoint: 'https://api.together.xyz/v1/completions',
        requiresConfig: true
      },
      'gemini-flash': {
        name: 'Gemini Flash 2.0',
        description: 'Google Gemini model for fast and efficient assistance',
        defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        requiresConfig: true
      },
      'llama3': {
        name: 'Llama 3',
        description: 'Unreal Engine expert assistant',
        defaultEndpoint: 'https://api.together.xyz/v1/chat/completions',
        requiresConfig: true
      },
      'local-ollama': {
        name: 'Local Ollama',
        description: 'Local model for translating user instructions',
        defaultEndpoint: 'http://localhost:11434/api/chat',
        requiresConfig: false
      },
      'rule-based': {
        name: 'Rule-based (Default)',
        description: 'Simple command parsing without AI',
        defaultEndpoint: null,
        requiresConfig: false
      }
    };
    
    // Current model configuration
    this.currentModel = 'rule-based';
    this.modelConfigs = {
      'deepseek-r1': { apiKey: '', endpoint: this.availableModels['deepseek-r1'].defaultEndpoint },
      'gemini-flash': { apiKey: '', endpoint: this.availableModels['gemini-flash'].defaultEndpoint },
      'llama3': { apiKey: '', endpoint: this.availableModels['llama3'].defaultEndpoint },
      'local-ollama': { apiKey: '', endpoint: this.availableModels['local-ollama'].defaultEndpoint }
    };
    
    // System prompts for different models
    this.systemPrompts = {
      'deepseek-r1': `You are an Unreal Engine expert assistant. Your job is to help interpret user instructions into specific Unreal Engine commands.
When processing user messages, if you detect an intent to create, modify, or interact with Unreal Engine elements, provide a response in this format:
COMMAND: {command_type}
PARAMS: {JSON parameters for the command}

Valid command types include: spawn_object, create_material, set_object_material, set_object_position, set_object_rotation, set_object_scale, create_blueprint, etc.
If you don't understand the request or it's not related to Unreal Engine, respond conversationally.`,
      
      'gemini-flash': `You are an Unreal Engine expert assistant. Your job is to help interpret user instructions into specific Unreal Engine commands.
When processing user messages, if you detect an intent to create, modify, or interact with Unreal Engine elements, provide a response in this format:
COMMAND: {command_type}
PARAMS: {JSON parameters for the command}

Valid command types include: spawn_object, create_material, set_object_material, set_object_position, set_object_rotation, set_object_scale, create_blueprint, etc.
If you don't understand the request or it's not related to Unreal Engine, respond conversationally.`,
      
      'llama3': `You are an Unreal Engine expert assistant. Translate user requests into structured commands for Unreal Engine.
Format your response as:
COMMAND: {command_type}
PARAMS: {JSON parameters for the command}

Valid commands: spawn_object, create_material, set_object_material, create_blueprint, add_component_to_blueprint, etc.`,
      
      'local-ollama': `You are an assistant specialized in Unreal Engine. Your task is to convert natural language requests into specific commands.
When the user asks to create or modify something in Unreal Engine, format your response as:
COMMAND: {command_type}
PARAMS: {JSON parameters}

Example commands: spawn_object, create_material, create_blueprint, etc.`
    };

    // Initialize with provided API key if available
    this.updateModelConfig('gemini-flash', { apiKey: 'AIzaSyC_8YYVQghJwEkPUt0IAc5kd3ULDcXhbMM' });
  }
  
  // Get list of available models
  getAvailableModels() {
    return Object.keys(this.availableModels).map(id => ({
      id,
      name: this.availableModels[id].name,
      description: this.availableModels[id].description,
      requiresConfig: this.availableModels[id].requiresConfig
    }));
  }
  
  // Get current model
  getCurrentModel() {
    return this.currentModel;
  }
  
  // Set current model
  setCurrentModel(modelId) {
    if (this.availableModels[modelId]) {
      this.currentModel = modelId;
      return true;
    }
    return false;
  }
  
  // Get model configuration
  getModelConfig(modelId) {
    return this.modelConfigs[modelId] || null;
  }
  
  // Update model configuration
  updateModelConfig(modelId, config) {
    if (this.modelConfigs[modelId]) {
      // Always keep the default endpoint if not specified
      const endpoint = config.endpoint || this.availableModels[modelId].defaultEndpoint;
      
      this.modelConfigs[modelId] = {
        ...this.modelConfigs[modelId],
        apiKey: config.apiKey || this.modelConfigs[modelId].apiKey,
        endpoint
      };
      return true;
    }
    return false;
  }
  
  // Process a message using the current model
  async processMessage(message, messageHistory = []) {
    console.log(`[AIService] Processing message with model: ${this.currentModel}`);
    
    // If using rule-based model, return null to let mcpBridge handle it
    if (this.currentModel === 'rule-based') {
      console.log('[AIService] Using rule-based model, skipping AI processing');
      return null;
    }
    
    const modelConfig = this.modelConfigs[this.currentModel];
    
    // Check if we have configuration for non-local models
    if (this.currentModel !== 'local-ollama' && (!modelConfig || !modelConfig.apiKey)) {
      console.log('[AIService] Model requires API key but none is configured');
      return {
        error: true,
        message: 'API key not configured for this model. Please configure it in settings.'
      };
    }
    
    try {
      console.log(`[AIService] Calling ${this.currentModel} model`);
      const endpoint = modelConfig.endpoint || this.availableModels[this.currentModel].defaultEndpoint;
      
      // Format history for the AI model
      const formattedHistory = messageHistory.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));
      
      // Add system prompt
      const messages = [
        { role: 'system', content: this.systemPrompts[this.currentModel] || this.systemPrompts['deepseek-r1'] },
        ...formattedHistory,
        { role: 'user', content: message }
      ];
      
      let response;
      
      // Different request format based on model
      if (this.currentModel === 'deepseek-r1') {
        // Together API format for completion models
        response = await axios.post(endpoint, {
          model: 'deepseek-coder-33b-instruct',
          prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
          max_tokens: 1000,
          temperature: 0.3,
        }, {
          headers: {
            'Authorization': `Bearer ${modelConfig.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        const text = response.data.choices[0]?.text || '';
        console.log(`[AIService] DeepSeek-R1 response: ${text.substring(0, 100)}...`);
        return this.parseAIResponse(text);
        
      } else if (this.currentModel === 'gemini-flash') {
        // Gemini API format
        const geminiMessages = messages.map(m => {
          if (m.role === 'system') {
            return { role: 'user', parts: [{ text: m.content }] };
          } else {
            return { role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] };
          }
        });

        // URL with API key for Gemini
        const geminiUrl = `${endpoint}?key=${modelConfig.apiKey}`;
        
        response = await axios.post(geminiUrl, {
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1000,
          }
        });
        
        const text = response.data.candidates[0]?.content?.parts[0]?.text || '';
        console.log(`[AIService] Gemini Flash response: ${text.substring(0, 100)}...`);
        return this.parseAIResponse(text);
        
      } else if (this.currentModel === 'llama3') {
        // Standard chat completion format
        response = await axios.post(endpoint, {
          model: 'meta-llama/Llama-3-8b-chat-hf',
          messages,
          max_tokens: 1000,
          temperature: 0.7,
        }, {
          headers: {
            'Authorization': `Bearer ${modelConfig.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        const text = response.data.choices[0]?.message?.content || '';
        console.log(`[AIService] Llama3 response: ${text.substring(0, 100)}...`);
        return this.parseAIResponse(text);
        
      } else if (this.currentModel === 'local-ollama') {
        // Ollama format
        response = await axios.post(endpoint, {
          model: 'llama3',
          messages,
          options: {
            temperature: 0.7
          }
        });
        
        const text = response.data.message?.content || '';
        console.log(`[AIService] Local Ollama response: ${text.substring(0, 100)}...`);
        return this.parseAIResponse(text);
      }
      
      return { error: true, message: 'Unknown model type' };
      
    } catch (error) {
      console.error('[AIService] Error processing message with AI model:', error.message);
      return {
        error: true,
        message: `Error calling AI model: ${error.message}`
      };
    }
  }
  
  // Parse AI response to extract command
  parseAIResponse(text) {
    console.log('[AIService] Parsing AI response for commands');
    
    // Look for command pattern: COMMAND: xxx\nPARAMS: yyy
    const commandMatch = text.match(/COMMAND:\s*([^\n]+)/i);
    const paramsMatch = text.match(/PARAMS:\s*(.+?)(?=COMMAND:|$)/is);
    
    if (commandMatch && paramsMatch) {
      const command = commandMatch[1].trim();
      let params;
      
      try {
        // Try to parse JSON parameters
        const paramsText = paramsMatch[1].trim();
        params = JSON.parse(paramsText);
      } catch (e) {
        console.warn('[AIService] Failed to parse JSON parameters:', e.message);
        // If JSON parsing fails, use the raw text
        params = paramsMatch[1].trim();
      }
      
      console.log(`[AIService] Extracted command: ${command}`);
      return {
        isCommand: true,
        command,
        params
      };
    }
    
    // Look for code block with command
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{.+?\})\s*```/s);
    if (codeBlockMatch) {
      try {
        const codeBlock = JSON.parse(codeBlockMatch[1]);
        if (codeBlock.command) {
          console.log(`[AIService] Extracted command from code block: ${codeBlock.command}`);
          return {
            isCommand: true,
            command: codeBlock.command,
            params: codeBlock.params || {}
          };
        }
      } catch (e) {
        console.warn('[AIService] Failed to parse code block as JSON:', e.message);
      }
    }
    
    // If no command found, return the text as a regular response
    console.log('[AIService] No command found in AI response, treating as conversation');
    return {
      isCommand: false,
      message: text
    };
  }
}

module.exports = new AIService(); 