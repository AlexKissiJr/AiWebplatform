'use client';

import { useEffect, useRef } from 'react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

interface ChatMessagesProps {
  messages: Message[];
}

export default function ChatMessages({ messages }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    console.log('Messages updated:', messages);
  }, [messages]);

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-messages">
      {messages.length === 0 ? (
        <div className="text-center text-gray-500 py-10">
          <p>No messages yet. Start typing to interact with the AI assistant.</p>
        </div>
      ) : (
        <>
          <div className="bg-yellow-100 text-yellow-800 p-2 mb-3 rounded">
            Debug: {messages.length} messages received
          </div>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${
                message.sender === 'user' ? 'user-message' : 'ai-message'
              }`}
            >
              <div className="flex justify-between mb-1">
                <span className="font-semibold">
                  {message.sender === 'user' ? 'You' : 'AI Assistant'}
                </span>
                <span className="text-xs text-gray-500">
                  {formatTime(message.timestamp)}
                </span>
              </div>
              <div className="whitespace-pre-wrap">
                {/* Handle JSON responses in a more readable way */}
                {typeof message.text === 'string' && message.text.startsWith('{') && message.text.endsWith('}') ? (
                  <pre className="bg-gray-100 p-2 rounded overflow-auto">
                    {message.text}
                  </pre>
                ) : (
                  message.text
                )}
              </div>
            </div>
          ))}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
} 