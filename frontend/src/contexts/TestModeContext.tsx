'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface TestModeContextValue {
  isTestMode: boolean;
  lastInferenceVerified: boolean;
  lastCheckTime: number | null;
  isChecking: boolean;
  checkTestMode: () => Promise<void>;
  setTestModeFromResponse: (isVerified: boolean, fallbackMode: boolean) => void;
}

const TestModeContext = createContext<TestModeContextValue | undefined>(undefined);

interface TestModeProviderProps {
  children: ReactNode;
}

export function TestModeProvider({ children }: TestModeProviderProps) {
  // In production mode, we default to non-test mode
  // The system now runs on Avalanche only
  const [isTestMode, setIsTestMode] = useState(false);
  const [lastInferenceVerified, setLastInferenceVerified] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  /**
   * Check test mode status
   * In production mode, this is now a no-op that always returns production mode
   */
  const checkTestMode = useCallback(async () => {
    if (isChecking) return;

    setIsChecking(true);
    try {
      // With Avalanche-only architecture, we're always in production mode
      // No external inference service to check
      setIsTestMode(false);
      setLastCheckTime(Date.now());
    } finally {
      setIsChecking(false);
    }
  }, [isChecking]);

  /**
   * Update test mode state from an inference response
   * Kept for API compatibility but simplified
   */
  const setTestModeFromResponse = useCallback((isVerified: boolean, fallbackMode: boolean) => {
    setLastInferenceVerified(isVerified);
    // If response is not verified or is in fallback mode, we're in test mode
    if (!isVerified || fallbackMode) {
      setIsTestMode(true);
    }
    setLastCheckTime(Date.now());
  }, []);

  return (
    <TestModeContext.Provider
      value={{
        isTestMode,
        lastInferenceVerified,
        lastCheckTime,
        isChecking,
        checkTestMode,
        setTestModeFromResponse
      }}
    >
      {children}
    </TestModeContext.Provider>
  );
}

export function useTestMode() {
  const context = useContext(TestModeContext);
  if (context === undefined) {
    throw new Error('useTestMode must be used within a TestModeProvider');
  }
  return context;
}

export default TestModeContext;
