'use client';

/**
 * useIntegerInput — controlled input hook for whole-number fields like
 * percentages, counts, lookback windows. Sibling to useAmountInput, which is
 * for token amounts (decimals).
 *
 * Catches: empty/whitespace, non-numeric, negative (default), decimal points,
 * scientific notation, value below `min`, value above `max`.
 *
 * Returns:
 *   - `value`: raw string (bind to <input value>)
 *   - `onChange`: pass to <input onChange>
 *   - `error`: human-readable message or null
 *   - `isValid`: true ⟹ parsed is non-null AND within bounds
 *   - `parsed`: number | null (null when invalid)
 *   - `setValue`: programmatic set
 *   - `reset`: clear
 */

import { useCallback, useMemo, useState } from 'react';

export interface UseIntegerInputOptions {
  /** Inclusive lower bound. Default 0. */
  min?: number;
  /** Inclusive upper bound. Optional. */
  max?: number;
  /** Allow negative values. Default false. */
  allowNegative?: boolean;
  /** Initial string value. */
  initialValue?: string;
  /** Optional unit name for error messages, e.g. "trades", "%", "rounds". */
  unit?: string;
}

export interface UseIntegerInputReturn {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
  isValid: boolean;
  parsed: number | null;
  reset: () => void;
  setValue: (v: string) => void;
}

const POSITIVE_INT_RE = /^\d+$/;
const SIGNED_INT_RE = /^-?\d+$/;

export function useIntegerInput(opts: UseIntegerInputOptions = {}): UseIntegerInputReturn {
  const {
    min = 0,
    max,
    allowNegative = false,
    initialValue = '',
    unit,
  } = opts;
  const [value, setValueState] = useState<string>(initialValue);

  const validation = useMemo(
    () => validate(value, { min, max, allowNegative, unit }),
    [value, min, max, allowNegative, unit]
  );

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValueState(e.target.value.trim());
  }, []);

  const reset = useCallback(() => setValueState(''), []);

  return {
    value,
    onChange,
    error: validation.error,
    isValid: validation.isValid,
    parsed: validation.parsed,
    reset,
    setValue: setValueState,
  };
}

interface ValidationResult {
  error: string | null;
  isValid: boolean;
  parsed: number | null;
}

function validate(
  raw: string,
  opts: { min: number; max?: number; allowNegative: boolean; unit?: string }
): ValidationResult {
  const value = raw.trim();
  if (value === '') {
    return { error: null, isValid: false, parsed: null };
  }
  // Reject anything that isn't a clean integer literal.
  const re = opts.allowNegative ? SIGNED_INT_RE : POSITIVE_INT_RE;
  if (!re.test(value)) {
    if (/[eE]/.test(value)) {
      return { error: 'Scientific notation not allowed', isValid: false, parsed: null };
    }
    if (value.includes('.')) {
      return { error: 'Whole number required', isValid: false, parsed: null };
    }
    if (value.startsWith('-') && !opts.allowNegative) {
      return { error: 'Must be a positive whole number', isValid: false, parsed: null };
    }
    return { error: 'Invalid number', isValid: false, parsed: null };
  }

  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return { error: 'Invalid number', isValid: false, parsed: null };
  }

  const unitLabel = opts.unit ? ` ${opts.unit}` : '';

  if (parsed < opts.min) {
    return {
      error: `Must be at least ${opts.min}${unitLabel}`,
      isValid: false,
      parsed: null,
    };
  }

  if (opts.max !== undefined && parsed > opts.max) {
    return {
      error: `Exceeds max of ${opts.max}${unitLabel}`,
      isValid: false,
      parsed: null,
    };
  }

  return { error: null, isValid: true, parsed };
}
