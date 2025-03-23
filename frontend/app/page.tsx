'use client';

import { useState, useEffect, useCallback } from 'react';
import ChatInput from '../components/ChatInput';
import ChatMessages from '../components/ChatMessages';
import ModelSelector from '../components/ModelSelector';
import io from 'socket.io-client';

// Define message interface
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [socket, setSocket] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('rule-based');

  const addMessage = useCallback((message: Message) => {
    console.log('Adding message:', message);
    setMessages((prevMessages) => {
      const newMessages = [...prevMessages, message];
      console.log('New messages state:', newMessages);
      return newMessages;
    });
  }, []);

  // Add test message on first load to verify rendering works
  useEffect(() => {
    console.log('Initial component mount');
    // Add a welcome message to verify message display works
    addMessage({
      id: 'welcome-' + Date.now(),
      text: 'Welcome! Type a message to interact with the AI assistant.',
      sender: 'ai',
      timestamp: Date.now(),
    });
  }, [addMessage]);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001');
    setSocket(newSocket);

    // Set up socket event listeners
    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    newSocket.on('messageResponse', (data: { message: string }) => {
      console.log('Received message response from server:', data);
      console.log('Message content:', data.message);
      
      // Add visual notification that we got a response
      console.warn('AI RESPONSE RECEIVED - check if it appears in the UI');
      
      // Force a UI update by using setTimeout
      setTimeout(() => {
        const responseId = 'ai-response-' + Date.now();
        console.log('Creating AI message with ID:', responseId);
        
        addMessage({
          id: responseId,
          text: data.message,
          sender: 'ai',
          timestamp: Date.now(),
        });
      }, 100);
    });

    newSocket.on('error', (data: { message: string }) => {
      console.log('Received error:', data);
      addMessage({
        id: Date.now().toString(),
        text: `Error: ${data.message}`,
        sender: 'ai',
        timestamp: Date.now(),
      });
    });

    // Cleanup on component unmount
    return () => {
      newSocket.disconnect();
    };
  }, [addMessage]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;

    console.log('Sending message:', text);

    // Create a new message
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: Date.now(),
    };

    // Add to messages
    addMessage(newMessage);
    console.log('Messages state after adding user message:', messages);

    // Send to server
    if (socket && isConnected) {
      console.log('Emitting sendMessage event to socket');
      socket.emit('sendMessage', { message: text, modelId: selectedModel });
    } else {
      console.log('Not connected to socket, adding error message');
      addMessage({
        id: Date.now().toString(),
        text: 'Error: Not connected to server. Please try again later.',
        sender: 'ai',
        timestamp: Date.now(),
      });
    }
  };

  const handleModelChange = async (modelId: string) => {
    setSelectedModel(modelId);
    console.log('Selected model changed to:', modelId);
    
    try {
      // Notify the backend of the model change
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/models/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ modelId }),
      });
      
      if (response.ok) {
        // Add a system message indicating the model change
        addMessage({
          id: 'model-change-' + Date.now(),
          text: `Switched to ${modelId === 'rule-based' ? 'rule-based parsing' : 'AI model: ' + modelId}`,
          sender: 'ai',
          timestamp: Date.now(),
        });
      } else {
        console.error('Failed to switch model');
      }
    } catch (error) {
      console.error('Error switching model:', error);
    }
  };

  return (
    <main className="chat-container">
      <h1 className="text-3xl font-bold mb-2">AI Unreal Engine Assistant</h1>
      
      <ModelSelector onModelChange={handleModelChange} />
      
      <div className="mb-4">
        {!isConnected && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            Not connected to server. Please check your connection.
          </div>
        )}
      </div>
      
      <ChatMessages messages={messages} />
      <ChatInput onSendMessage={sendMessage} />
    </main>
  );
} 