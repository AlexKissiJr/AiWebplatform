'use client';

import { useState, useCallback } from 'react';

// Permission types
type PermissionStatus = 'always' | 'once' | 'never' | null;

interface PermissionRequest {
  toolName: string;
  commandPreview: string;
  resolve: (value: void) => void;
  reject: (reason: Error) => void;
}

export default function usePermissions() {
  // Store tool permissions in state
  const [permissions, setPermissions] = useState<Record<string, PermissionStatus>>({});
  
  // Current permission request
  const [currentRequest, setCurrentRequest] = useState<PermissionRequest | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Request permission for a tool
  const requestPermission = useCallback((toolName: string, commandPreview: string) => {
    return new Promise<void>((resolve, reject) => {
      // Check if we already have permission
      const permission = permissions[toolName];
      
      if (permission === 'always') {
        resolve();
        return;
      }
      
      if (permission === 'never') {
        reject(new Error('Permission denied'));
        return;
      }
      
      // Show permission dialog
      setCurrentRequest({ toolName, commandPreview, resolve, reject });
      setIsDialogOpen(true);
    });
  }, [permissions]);

  // Handle permission response
  const handlePermissionResponse = useCallback((response: PermissionStatus) => {
    if (!currentRequest) return;
    
    // Close dialog
    setIsDialogOpen(false);
    
    // Update permission
    if (response !== null) {
      setPermissions(prev => ({
        ...prev,
        [currentRequest.toolName]: response
      }));
    }
    
    // Resolve or reject
    if (response === 'always' || response === 'once') {
      currentRequest.resolve();
      
      // Reset after 'once' permission
      if (response === 'once') {
        setTimeout(() => {
          setPermissions(prev => ({
            ...prev,
            [currentRequest.toolName]: null
          }));
        }, 100);
      }
    } else {
      currentRequest.reject(new Error('Permission denied'));
    }
    
    // Clear current request
    setTimeout(() => {
      setCurrentRequest(null);
    }, 300);
  }, [currentRequest]);

  // Permission dialog props
  const permissionDialogProps = {
    toolName: currentRequest?.toolName || '',
    commandPreview: currentRequest?.commandPreview || '',
    onAllow: () => handlePermissionResponse('always'),
    onAllowOnce: () => handlePermissionResponse('once'),
    onDeny: () => handlePermissionResponse('never'),
    isOpen: isDialogOpen
  };

  return {
    requestPermission,
    permissionDialogProps
  };
} 