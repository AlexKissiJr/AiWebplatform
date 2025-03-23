'use client';

import { useState, useEffect } from 'react';

interface Model {
  id: string;
  name: string;
  description: string;
  requiresConfig: boolean;
}

interface ModelSelectorProps {
  onModelChange: (modelId: string) => void;
}

const ModelSelector = ({ onModelChange }: ModelSelectorProps) => {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('rule-based');
  const [loading, setLoading] = useState<boolean>(true);
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  
  // Default endpoints that will be used
  const defaultEndpoints = {
    'deepseek-r1': 'https://api.together.xyz/v1/completions',
    'gemini-flash': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    'llama3': 'https://api.together.xyz/v1/chat/completions',
    'local-ollama': 'http://localhost:11434/api/chat'
  };

  useEffect(() => {
    // Fetch available models
    const fetchModels = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/models`);
        if (response.ok) {
          const data = await response.json();
          setModels(data.models);
          setSelectedModel(data.currentModel);
          setLoading(false);
        } else {
          console.error('Failed to fetch models');
          // Fallback for development
          setModels([
            { id: 'rule-based', name: 'Rule-based (Default)', description: 'Simple command parsing without AI', requiresConfig: false },
            { id: 'deepseek-r1', name: 'DeepSeek-R1', description: 'Powerful AI model for Unreal Engine tasks', requiresConfig: true },
            { id: 'llama3', name: 'Llama 3', description: 'Open source AI assistant', requiresConfig: true },
            { id: 'local-ollama', name: 'Local Ollama', description: 'Use locally hosted models', requiresConfig: true }
          ]);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching models:', error);
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    setSelectedModel(modelId);
    onModelChange(modelId);
    
    // Show config panel only if the model requires configuration
    const model = models.find(m => m.id === modelId);
    if (model?.requiresConfig && modelId !== 'rule-based') {
      setShowConfig(true);
      // Fetch existing config if available
      fetchModelConfig(modelId);
    } else {
      setShowConfig(false);
    }
  };

  const fetchModelConfig = async (modelId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/models/${modelId}/config`);
      if (response.ok) {
        const data = await response.json();
        setApiKey(data.apiKey || '');
      }
    } catch (error) {
      console.error('Error fetching model config:', error);
    }
  };

  const saveModelConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/models/${selectedModel}/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          endpoint: defaultEndpoints[selectedModel as keyof typeof defaultEndpoints] || ''
        }),
      });
      
      if (response.ok) {
        setShowConfig(false);
      } else {
        console.error('Failed to save config');
      }
    } catch (error) {
      console.error('Error saving config:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="model-selector mb-4 p-3 border border-gray-200 rounded">
      <div className="flex items-center space-x-2">
        <label htmlFor="model-select" className="font-medium">AI Model:</label>
        <select
          id="model-select"
          value={selectedModel}
          onChange={handleModelChange}
          className="p-2 border border-gray-300 rounded"
          disabled={loading}
        >
          {loading ? (
            <option value="">Loading models...</option>
          ) : (
            models.map(model => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))
          )}
        </select>
        
        {selectedModel !== 'rule-based' && (
          <button 
            onClick={() => setShowConfig(!showConfig)} 
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            {showConfig ? 'Hide Settings' : 'Settings'}
          </button>
        )}
      </div>
      
      {showConfig && (
        <div className="mt-3 p-3 bg-gray-50 rounded">
          <div className="mb-3">
            <p className="text-sm text-gray-600 mb-2">Using default endpoint: {defaultEndpoints[selectedModel as keyof typeof defaultEndpoints]}</p>
            
            <label htmlFor="api-key" className="block text-sm font-medium mb-1">
              API Key {selectedModel === 'local-ollama' ? '(Optional)' : '(Required)'}:
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder={selectedModel === 'local-ollama' ? 'Optional for local models' : 'Enter API key'}
            />
          </div>
          
          <button
            onClick={saveModelConfig}
            disabled={saving || (selectedModel !== 'local-ollama' && !apiKey)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
      
      <div className="mt-2 text-xs text-gray-500">
        {selectedModel === 'rule-based' ? (
          'Using simple rule-based commands, no AI model required.'
        ) : (
          models.find(m => m.id === selectedModel)?.description || ''
        )}
      </div>
    </div>
  );
};

export default ModelSelector; 