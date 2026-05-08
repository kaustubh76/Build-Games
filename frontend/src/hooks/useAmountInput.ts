'use client';

/**
 * useAmountInput — controlled input hook with built-in validation for
 * positive token amounts. The whole point: the submit handler should be
 * able to do `if (!parsedWei) return` instead of `try { BigInt(...) }`,
 * because the hook has already rejected obviously-bad input.
 *
 * Catches:
 *   - empty / whitespace-only
 *   - non-numeric (`abc`, `0x`)
 *   - negative numbers (`-5`)
 *   - scientific notation (`1e10`, `1E10`) — wallets can't sign these
 *   - too many decimals (>18 by default)
 *   - exceeds optional `max` cap
 *   - below optional `min` (default 0, exclusive)
 *
 * Returns:
 *   - `value`: the raw string for binding to <input value>
 *   - `onChange`: pass to <input onChange>
 *   - `error`: human-readable message or null
 *   - `isValid`: true ⟹ parsedWei is non-null
 *   - `parsedWei`: bigint | null (null when invalid)
 *   - `reset`: clear the input
 *   - `setValue`: programmatic set (for "Max" buttons)
 */

import { useCallback, useMemo, useState } from 'react';
import { parseUnits } from 'viem';

export interface UseAmountInputOptions {
  /** Exclusive lower bound, in human units (e.g. CRwN, not wei). Default 0. */
  min?: number;
  /** Optional upper bound, in human units. */
  max?: number | string;
  /** Decimal places allowed. Default 18 (matches ERC-20). */
  decimals?: number;
  /** Optional initial value. */
  initialValue?: string;
  /** Optional unit name for error messages, e.g. "CRwN". */
  unit?: string;
}

export interface UseAmountInputReturn {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
  isValid: boolean;
  parsedWei: bigint | null;
  reset: () => void;
  setValue: (v: string) => void;
}

const NUMERIC_RE = /^\d*\.?\d*$/;

export function useAmountInput(opts: UseAmountInputOptions = {}): UseAmountInputReturn {
  const {
    min = 0,
    max,
    decimals = 18,
    initialValue = '',
    unit,
  } = opts;
  const [value, setValueState] = useState<string>(initialValue);

  const validation = useMemo(() => validate(value, { min, max, decimals, unit }), [
    value,
    min,
    max,
    decimals,
    unit,
  ]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Trim whitespace as the user types (paste-from-spreadsheet hygiene).
    setValueState(e.target.value.trim());
  }, []);

  const reset = useCallback(() => setValueState(''), []);

  return {
    value,
    onChange,
    error: validation.error,
    isValid: validation.isValid,
    parsedWei: validation.parsedWei,
    reset,
    setValue: setValueState,
  };
}

export interface AmountValidationResult {
  error: string | null;
  isValid: boolean;
  parsedWei: bigint | null;
}

/**
 * Validate an amount string against the same rules `useAmountInput` applies.
 * Useful for forms that store strings in a shared state object (rather than
 * binding each input to its own hook) — call this per-field on each render
 * to surface inline errors without restructuring the form.
 */
export function validateAmount(
  raw: string,
  opts: { min?: number; max?: number | string; decimals?: number; unit?: string } = {}
): AmountValidationResult {
  return validate(raw, {
    min: opts.min ?? 0,
    max: opts.max,
    decimals: opts.decimals ?? 18,
    unit: opts.unit,
  });
}

function validate(
  raw: string,
  opts: { min: number; max?: number | string; decimals: number; unit?: string }
): AmountValidationResult {
  const value = raw.trim();
  if (value === '') {
    // Empty isn't an "error" the user should see while typing; just not valid.
    return { error: null, isValid: false, parsedWei: null };
  }
  // Reject scientific notation and any non-numeric character.
  if (!NUMERIC_RE.test(value)) {
    if (/[eE]/.test(value)) {
      return { error: 'Scientific notation not allowed', isValid: false, parsedWei: null };
    }
    return { error: 'Invalid number', isValid: false, parsedWei: null };
  }
  // Reject lone "." or ".5" without a leading 0? Allow ".5" (browsers do).
  if (value === '.') {
    return { error: 'Invalid number', isValid: false, parsedWei: null };
  }
  // Decimal-place cap.
  const dotIdx = value.indexOf('.');
  if (dotIdx >= 0) {
    const fracLen = value.length - dotIdx - 1;
    if (fracLen > opts.decimals) {
      return {
        error: `Max ${opts.decimals} decimal places`,
        isValid: false,
        parsedWei: null,
      };
    }
  }

  let parsedWei: bigint;
  try {
    parsedWei = parseUnits(value as `${number}`, opts.decimals);
  } catch {
    return { error: 'Invalid number', isValid: false, parsedWei: null };
  }

  // min is exclusive — must be strictly greater than min.
  const minWei = parseUnits(String(opts.min) as `${number}`, opts.decimals);
  if (parsedWei <= minWei) {
    return {
      error: `Must be greater than ${opts.min}`,
      isValid: false,
      parsedWei: null,
    };
  }

  if (opts.max !== undefined) {
    const maxStr = String(opts.max);
    const maxWei = parseUnits(maxStr as `${number}`, opts.decimals);
    if (parsedWei > maxWei) {
      const unitLabel = opts.unit ? ` ${opts.unit}` : '';
      return {
        error: `Exceeds max of ${maxStr}${unitLabel}`,
        isValid: false,
        parsedWei: null,
      };
    }
  }

  return { error: null, isValid: true, parsedWei };
}
