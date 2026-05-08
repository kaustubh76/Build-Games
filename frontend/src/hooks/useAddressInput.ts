'use client';

/**
 * useAddressInput — controlled input hook with EIP-55 validation for
 * Ethereum addresses. Trims whitespace (paste hygiene), validates via
 * viem's isAddress, and surfaces a normalized lowercase value for
 * downstream comparisons.
 */

import { useCallback, useMemo, useState } from 'react';
import { isAddress } from 'viem';

export interface UseAddressInputOptions {
  initialValue?: string;
  /** Reject if the address matches this one (e.g. forbid self-transfer). */
  forbidEqualTo?: string;
}

export interface UseAddressInputReturn {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
  isValid: boolean;
  /** Lowercase form of the validated address, or null. */
  normalized: `0x${string}` | null;
  reset: () => void;
  setValue: (v: string) => void;
}

export function useAddressInput(opts: UseAddressInputOptions = {}): UseAddressInputReturn {
  const { initialValue = '', forbidEqualTo } = opts;
  const [value, setValueState] = useState<string>(initialValue);

  const validation = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed === '') {
      return { error: null, isValid: false, normalized: null };
    }
    if (!isAddress(trimmed)) {
      return { error: 'Invalid Ethereum address', isValid: false, normalized: null };
    }
    if (forbidEqualTo && trimmed.toLowerCase() === forbidEqualTo.toLowerCase()) {
      return {
        error: 'Cannot use your own address here',
        isValid: false,
        normalized: null,
      };
    }
    return {
      error: null,
      isValid: true,
      normalized: trimmed.toLowerCase() as `0x${string}`,
    };
  }, [value, forbidEqualTo]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Trim whitespace as the user types — paste-from-elsewhere hygiene.
    setValueState(e.target.value.trim());
  }, []);

  const reset = useCallback(() => setValueState(''), []);

  return {
    value,
    onChange,
    error: validation.error,
    isValid: validation.isValid,
    normalized: validation.normalized,
    reset,
    setValue: setValueState,
  };
}
