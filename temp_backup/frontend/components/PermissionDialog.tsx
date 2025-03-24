'use client';

import { useState, useEffect } from 'react';

interface PermissionDialogProps {
  toolName: string;
  commandPreview: string;
  onAllow: () => void;
  onAllowOnce: () => void;
  onDeny: () => void;
  isOpen: boolean;
}

export default function PermissionDialog({
  toolName,
  commandPreview,
  onAllow,
  onAllowOnce,
  onDeny,
  isOpen
}: PermissionDialogProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
    } else {
      // Add a delay before hiding to allow for animation
      const timer = setTimeout(() => {
        setVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!visible) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={onDeny}
      />
      <div 
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 rounded-lg shadow-xl text-white w-[90%] max-w-md z-50 transition-all duration-300"
        style={{ 
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translate(-50%, -50%)' : 'translate(-50%, -60%)' 
        }}
      >
        <div className="p-5">
          <h3 className="text-lg font-semibold mb-2">
            Allow tool from "{toolName}" (local)?
          </h3>
          
          <div className="flex items-start gap-2 bg-yellow-900/20 p-3 rounded-md mb-4">
            <svg 
              className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" 
              fill="currentColor" 
              viewBox="0 0 24 24"
            >
              <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
            </svg>
            <p className="text-sm text-gray-300">
              Malicious MCP servers or conversation content could potentially trick the system into 
              attempting harmful actions through your installed tools. Review each action 
              carefully before approving.
            </p>
          </div>
          
          <div className="bg-gray-700 p-3 rounded-md mb-5 text-sm font-mono">
            {commandPreview}
          </div>
          
          <div className="flex justify-end gap-2">
            <button 
              onClick={onAllow} 
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-sm"
            >
              Allow for This Chat
            </button>
            <button 
              onClick={onAllowOnce} 
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-sm"
            >
              Allow Once
            </button>
            <button 
              onClick={onDeny} 
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm"
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </>
  );
} 