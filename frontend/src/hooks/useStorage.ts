'use client';

/**
 * Storage Hooks
 * Hooks for localStorage and sessionStorage with SSR safety and type safety
 */

import { useState, useEffect, useCallback, useRef } from 'react';

type SetValue<T> = T | ((prevValue: T) => T);

/**
 * Check if we're in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Serialize value for storage
 */
function serialize<T>(value: T): string {
  try {
    return JSON.stringify(value);
  } catch {
    console.warn('[useStorage] Failed to serialize value');
    return '';
  }
}

/**
 * Deserialize value from storage
 */
function deserialize<T>(value: string | null, fallback: T): T {
  if (value === null) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    // If parsing fails, try returning the raw string if T is string
    return value as unknown as T;
  }
}

/**
 * Hook for using localStorage with SSR safety
 *
 * @example
 * const [theme, setTheme] = useLocalStorage('theme', 'dark');
 *
 * // Update value
 * setTheme('light');
 *
 * // Update with function
 * setTheme(prev => prev === 'dark' ? 'light' : 'dark');
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: SetValue<T>) => void, () => void] {
  // Stabilize initialValue across renders. Without this, callers passing
  // an inline object/array literal (`useLocalStorage('x', { a: 0 })`)
  // would create a new reference each render, invalidating useCallback
  // and useEffect dependencies and causing an infinite re-render loop.
  // The ref is updated on every render so the LATEST value is read,
  // but its identity is stable so dependencies don't churn.
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;

  // Get initial value from localStorage or use fallback
  const readValue = useCallback((): T => {
    if (!isBrowser()) {
      return initialValueRef.current;
    }

    try {
      const item = window.localStorage.getItem(key);
      return deserialize(item, initialValueRef.current);
    } catch (error) {
      console.warn(`[useLocalStorage] Error reading key "${key}":`, error);
      return initialValueRef.current;
    }
  }, [key]);

  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Read from localStorage on mount
  useEffect(() => {
    setStoredValue(readValue());
  }, [readValue]);

  // Listen for changes in other tabs/windows
  useEffect(() => {
    if (!isBrowser()) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== key) return;
      // newValue is null when another tab calls localStorage.removeItem.
      // Falling through here means stale data stays visible in other tabs
      // after a logout/clear; treat null as "reset to initialValue".
      if (event.newValue === null) {
        setStoredValue(initialValueRef.current);
        return;
      }
      setStoredValue(deserialize(event.newValue, initialValueRef.current));
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  // Set value to localStorage
  const setValue = useCallback(
    (value: SetValue<T>) => {
      if (!isBrowser()) {
        console.warn('[useLocalStorage] Cannot set value in non-browser environment');
        return;
      }

      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, serialize(valueToStore));

        // Dispatch event for other components using the same key
        window.dispatchEvent(
          new StorageEvent('storage', {
            key,
            newValue: serialize(valueToStore),
          })
        );
      } catch (error) {
        console.warn(`[useLocalStorage] Error setting key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  // Remove value from localStorage
  const removeValue = useCallback(() => {
    if (!isBrowser()) return;

    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValueRef.current);
      // Mirror the setValue dispatch so other components in the same
      // tab using the same key reset to initialValue too. Real
      // cross-tab `storage` events do this automatically.
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: null }));
    } catch (error) {
      console.warn(`[useLocalStorage] Error removing key "${key}":`, error);
    }
  }, [key]);

  return [storedValue, setValue, removeValue];
}

/**
 * Hook for using sessionStorage with SSR safety
 *
 * @example
 * const [formData, setFormData] = useSessionStorage('checkout-form', {});
 */
export function useSessionStorage<T>(
  key: string,
  initialValue: T
): [T, (value: SetValue<T>) => void, () => void] {
  // Stabilize initialValue (see useLocalStorage above for rationale).
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;

  const readValue = useCallback((): T => {
    if (!isBrowser()) {
      return initialValueRef.current;
    }

    try {
      const item = window.sessionStorage.getItem(key);
      return deserialize(item, initialValueRef.current);
    } catch (error) {
      console.warn(`[useSessionStorage] Error reading key "${key}":`, error);
      return initialValueRef.current;
    }
  }, [key]);

  const [storedValue, setStoredValue] = useState<T>(initialValue);

  useEffect(() => {
    setStoredValue(readValue());
  }, [readValue]);

  const setValue = useCallback(
    (value: SetValue<T>) => {
      if (!isBrowser()) {
        console.warn('[useSessionStorage] Cannot set value in non-browser environment');
        return;
      }

      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.sessionStorage.setItem(key, serialize(valueToStore));
      } catch (error) {
        console.warn(`[useSessionStorage] Error setting key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  const removeValue = useCallback(() => {
    if (!isBrowser()) return;

    try {
      window.sessionStorage.removeItem(key);
      setStoredValue(initialValueRef.current);
    } catch (error) {
      console.warn(`[useSessionStorage] Error removing key "${key}":`, error);
    }
  }, [key]);

  return [storedValue, setValue, removeValue];
}

/**
 * Hook for checking if a localStorage key exists
 */
export function useLocalStorageExists(key: string): boolean {
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (isBrowser()) {
      setExists(window.localStorage.getItem(key) !== null);
    }
  }, [key]);

  return exists;
}

/**
 * Hook for getting all localStorage keys matching a prefix
 *
 * @example
 * const agentKeys = useLocalStorageKeys('agent-');
 * // Returns: ['agent-123', 'agent-456', ...]
 */
export function useLocalStorageKeys(prefix: string): string[] {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!isBrowser()) return;

    const matchingKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) {
        matchingKeys.push(key);
      }
    }
    setKeys(matchingKeys);
  }, [prefix]);

  return keys;
}

/**
 * Clear all localStorage items with a specific prefix
 */
export function clearLocalStoragePrefix(prefix: string): number {
  if (!isBrowser()) return 0;

  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  return keysToRemove.length;
}

export default useLocalStorage;
