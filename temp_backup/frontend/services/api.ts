/**
 * API service for interacting with the backend and Unreal Engine
 */

interface CommandRequest {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
}

interface CommandResponse {
  id: string;
  status: string;
  message: string;
  result?: any;
}

// Permission-protected API wrapper
export class PermissionProtectedAPI {
  private requestPermission: (toolName: string, commandPreview: string) => Promise<void>;
  
  constructor(requestPermission: (toolName: string, commandPreview: string) => Promise<void>) {
    this.requestPermission = requestPermission;
  }
  
  /**
   * Execute a command in Unreal Engine with permission check
   */
  async executeCommand(message: string): Promise<CommandResponse> {
    try {
      // Create the request object
      const request: CommandRequest = {
        id: Date.now().toString(),
        text: message,
        sender: 'user',
        timestamp: Date.now()
      };
      
      // Format command preview
      const commandPreview = `Run: ${message}`;
      
      // Request permission
      await this.requestPermission('unreal-handshake', commandPreview);
      
      // Permission granted, make the API call
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error executing command:', error);
      
      // If it's a permission error, rethrow
      if (error instanceof Error && error.message.includes('Permission denied')) {
        throw error;
      }
      
      // Otherwise return a formatted error
      return {
        id: Date.now().toString(),
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Get available models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch('/api/models');
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
  }
  
  /**
   * Set current model
   */
  async setCurrentModel(model: string): Promise<boolean> {
    try {
      const response = await fetch('/api/models/current', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model })
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      return true;
    } catch (error) {
      console.error('Error setting model:', error);
      return false;
    }
  }
} 