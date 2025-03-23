'use client';

import { useState, useEffect } from 'react';
import ChatInput from '../components/ChatInput';
import ChatMessages from '../components/ChatMessages';
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
      addMessage({
        id: Date.now().toString(),
        text: data.message,
        sender: 'ai',
        timestamp: Date.now(),
      });
    });

    newSocket.on('error', (data: { message: string }) => {
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
  }, []);

  const addMessage = (message: Message) => {
    setMessages((prevMessages) => [...prevMessages, message]);
  };

  const sendMessage = (text: string) => {
    if (!text.trim()) return;

    // Create a new message
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: Date.now(),
    };

    // Add to messages
    addMessage(newMessage);

    // Send to server
    if (socket && isConnected) {
      socket.emit('sendMessage', { message: text });
    } else {
      addMessage({
        id: Date.now().toString(),
        text: 'Error: Not connected to server. Please try again later.',
        sender: 'ai',
        timestamp: Date.now(),
      });
    }
  };

  return (
    <main className="chat-container">
      <h1 className="text-3xl font-bold mb-6">AI Unreal Engine Assistant</h1>
      
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