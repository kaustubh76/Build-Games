'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { WarriorMessage } from '../utils/warriorMessages';

interface WarriorMessageContextType {
  currentMessage: WarriorMessage | null;
  showMessage: (message: WarriorMessage) => void;
  clearMessage: () => void;
  isVisible: boolean;
}

const WarriorMessageContext = createContext<WarriorMessageContextType | undefined>(undefined);

export const useWarriorMessage = () => {
  const context = useContext(WarriorMessageContext);
  if (!context) {
    throw new Error('useWarriorMessage must be used within a WarriorMessageProvider');
  }
  return context;
};

interface WarriorMessageProviderProps {
  children: React.ReactNode;
}

export const WarriorMessageProvider: React.FC<WarriorMessageProviderProps> = ({ children }) => {
  const [currentMessage, setCurrentMessage] = useState<WarriorMessage | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const showMessage = useCallback((message: WarriorMessage) => {
    setCurrentMessage(message);
    setIsVisible(true);

    // Auto-hide after duration
    if (message.duration) {
      setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => setCurrentMessage(null), 300); // Wait for animation to complete
      }, message.duration);
    }
  }, []);

  const clearMessage = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => setCurrentMessage(null), 300);
  }, []);

  return (
    <WarriorMessageContext.Provider value={{
      currentMessage,
      showMessage,
      clearMessage,
      isVisible
    }}>
      {children}
    </WarriorMessageContext.Provider>
  );
};
