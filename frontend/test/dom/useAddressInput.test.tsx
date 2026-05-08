// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAddressInput } from '@/hooks/useAddressInput';

// All-lowercase 40-hex addresses — bypasses EIP-55 checksum (viem treats
// lowercase as "no checksum claim"). Mixed-case requires a real EIP-55 sum.
const VALID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ANOTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function change(value: string) {
  return { target: { value } } as React.ChangeEvent<HTMLInputElement>;
}

describe('useAddressInput', () => {
  it('starts empty + invalid + null normalized', () => {
    const { result } = renderHook(() => useAddressInput());
    expect(result.current.value).toBe('');
    expect(result.current.isValid).toBe(false);
    expect(result.current.normalized).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('accepts a valid lowercase 40-hex address', () => {
    const { result } = renderHook(() => useAddressInput());
    act(() => result.current.onChange(change(VALID)));
    expect(result.current.isValid).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.normalized).toBe(VALID);
  });

  it('rejects junk input', () => {
    const { result } = renderHook(() => useAddressInput());
    act(() => result.current.onChange(change('not-an-address')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/Invalid/);
  });

  it('rejects too-short hex', () => {
    const { result } = renderHook(() => useAddressInput());
    act(() => result.current.onChange(change('0xabc')));
    expect(result.current.isValid).toBe(false);
  });

  it('trims whitespace on paste', () => {
    const { result } = renderHook(() => useAddressInput());
    act(() => result.current.onChange(change(`   ${VALID}   `)));
    expect(result.current.value).toBe(VALID);
    expect(result.current.isValid).toBe(true);
  });

  it('forbidEqualTo blocks self-references', () => {
    const { result } = renderHook(() => useAddressInput({ forbidEqualTo: VALID }));
    act(() => result.current.onChange(change(VALID)));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/own address/);
    // A different address should pass.
    act(() => result.current.onChange(change(ANOTHER)));
    expect(result.current.isValid).toBe(true);
  });

  it('reset() clears the input', () => {
    const { result } = renderHook(() => useAddressInput());
    act(() => result.current.onChange(change(VALID)));
    expect(result.current.isValid).toBe(true);
    act(() => result.current.reset());
    expect(result.current.value).toBe('');
    expect(result.current.isValid).toBe(false);
  });

  it('setValue() programmatically sets a value', () => {
    const { result } = renderHook(() => useAddressInput());
    act(() => result.current.setValue(ANOTHER));
    expect(result.current.value).toBe(ANOTHER);
    expect(result.current.isValid).toBe(true);
    expect(result.current.normalized).toBe(ANOTHER.toLowerCase());
  });
});
