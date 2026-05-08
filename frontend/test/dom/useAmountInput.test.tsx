// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { parseEther } from 'viem';
import { useAmountInput } from '@/hooks/useAmountInput';

function change(value: string) {
  return { target: { value } } as React.ChangeEvent<HTMLInputElement>;
}

describe('useAmountInput', () => {
  it('starts empty + invalid + null parsedWei', () => {
    const { result } = renderHook(() => useAmountInput());
    expect(result.current.value).toBe('');
    expect(result.current.isValid).toBe(false);
    expect(result.current.parsedWei).toBeNull();
    expect(result.current.error).toBeNull(); // empty isn't an error mid-type
  });

  it('rejects negative numbers', () => {
    const { result } = renderHook(() => useAmountInput());
    act(() => result.current.onChange(change('-5')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/Invalid number/);
    expect(result.current.parsedWei).toBeNull();
  });

  it('rejects scientific notation', () => {
    const { result } = renderHook(() => useAmountInput());
    act(() => result.current.onChange(change('1e10')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/Scientific/);
  });

  it('rejects too many decimal places', () => {
    const { result } = renderHook(() => useAmountInput({ decimals: 4 }));
    act(() => result.current.onChange(change('1.23456')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/4 decimal/);
  });

  it('rejects 0 with default min', () => {
    const { result } = renderHook(() => useAmountInput());
    act(() => result.current.onChange(change('0')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/Must be greater than 0/);
  });

  it('rejects amounts above max', () => {
    const { result } = renderHook(() => useAmountInput({ max: 1000, unit: 'CRwN' }));
    act(() => result.current.onChange(change('1001')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/Exceeds max of 1000 CRwN/);
  });

  it('accepts a valid amount and emits parsedWei', () => {
    const { result } = renderHook(() => useAmountInput({ max: 1000 }));
    act(() => result.current.onChange(change('5.25')));
    expect(result.current.isValid).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.parsedWei).toBe(parseEther('5.25'));
  });

  it('trims whitespace on input', () => {
    const { result } = renderHook(() => useAmountInput());
    act(() => result.current.onChange(change('   42.5   ')));
    expect(result.current.value).toBe('42.5');
    expect(result.current.isValid).toBe(true);
  });

  it('rejects non-numeric junk', () => {
    const { result } = renderHook(() => useAmountInput());
    act(() => result.current.onChange(change('abc')));
    expect(result.current.error).toMatch(/Invalid/);
    act(() => result.current.onChange(change('0x123')));
    expect(result.current.error).toMatch(/Invalid/);
  });

  it('reset() clears the input', () => {
    const { result } = renderHook(() => useAmountInput());
    act(() => result.current.onChange(change('10')));
    expect(result.current.isValid).toBe(true);
    act(() => result.current.reset());
    expect(result.current.value).toBe('');
    expect(result.current.isValid).toBe(false);
  });

  it('setValue() programmatically sets a value (Max button use case)', () => {
    const { result } = renderHook(() => useAmountInput());
    act(() => result.current.setValue('100'));
    expect(result.current.value).toBe('100');
    expect(result.current.isValid).toBe(true);
    expect(result.current.parsedWei).toBe(parseEther('100'));
  });

  it('honours custom decimals (e.g. 6 for USDC)', () => {
    const { result } = renderHook(() => useAmountInput({ decimals: 6 }));
    act(() => result.current.onChange(change('1.234567')));
    expect(result.current.isValid).toBe(true);
    expect(result.current.parsedWei).toBe(1234567n);
  });

  it('initialValue is honoured + immediately validated', () => {
    const { result } = renderHook(() => useAmountInput({ initialValue: '7.5' }));
    expect(result.current.value).toBe('7.5');
    expect(result.current.isValid).toBe(true);
  });
});
