// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIntegerInput } from '@/hooks/useIntegerInput';

function change(value: string) {
  return { target: { value } } as React.ChangeEvent<HTMLInputElement>;
}

describe('useIntegerInput', () => {
  it('starts empty + invalid + null parsed', () => {
    const { result } = renderHook(() => useIntegerInput());
    expect(result.current.value).toBe('');
    expect(result.current.isValid).toBe(false);
    expect(result.current.parsed).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('accepts a valid positive integer', () => {
    const { result } = renderHook(() => useIntegerInput({ max: 100 }));
    act(() => result.current.onChange(change('42')));
    expect(result.current.isValid).toBe(true);
    expect(result.current.parsed).toBe(42);
    expect(result.current.error).toBeNull();
  });

  it('rejects decimal values', () => {
    const { result } = renderHook(() => useIntegerInput());
    act(() => result.current.onChange(change('1.5')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/Whole number/);
  });

  it('rejects negative when allowNegative=false (default)', () => {
    const { result } = renderHook(() => useIntegerInput());
    act(() => result.current.onChange(change('-5')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/positive/);
  });

  it('accepts negative when allowNegative=true', () => {
    const { result } = renderHook(() => useIntegerInput({ min: -100, allowNegative: true }));
    act(() => result.current.onChange(change('-5')));
    expect(result.current.isValid).toBe(true);
    expect(result.current.parsed).toBe(-5);
  });

  it('rejects scientific notation', () => {
    const { result } = renderHook(() => useIntegerInput());
    act(() => result.current.onChange(change('1e10')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/Scientific/);
  });

  it('enforces min', () => {
    const { result } = renderHook(() => useIntegerInput({ min: 10 }));
    act(() => result.current.onChange(change('5')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/at least 10/);
  });

  it('enforces max with unit label', () => {
    const { result } = renderHook(() => useIntegerInput({ max: 100, unit: '%' }));
    act(() => result.current.onChange(change('150')));
    expect(result.current.isValid).toBe(false);
    expect(result.current.error).toMatch(/Exceeds max of 100 %/);
  });

  it('rejects non-numeric junk', () => {
    const { result } = renderHook(() => useIntegerInput());
    act(() => result.current.onChange(change('abc')));
    expect(result.current.error).toMatch(/Invalid/);
  });

  it('trims whitespace', () => {
    const { result } = renderHook(() => useIntegerInput());
    act(() => result.current.onChange(change('  42  ')));
    expect(result.current.value).toBe('42');
    expect(result.current.parsed).toBe(42);
  });

  it('reset() clears the input', () => {
    const { result } = renderHook(() => useIntegerInput());
    act(() => result.current.onChange(change('10')));
    expect(result.current.isValid).toBe(true);
    act(() => result.current.reset());
    expect(result.current.value).toBe('');
    expect(result.current.isValid).toBe(false);
  });

  it('setValue() programmatically sets a value', () => {
    const { result } = renderHook(() => useIntegerInput({ max: 100 }));
    act(() => result.current.setValue('50'));
    expect(result.current.parsed).toBe(50);
    expect(result.current.isValid).toBe(true);
  });

  it('initialValue is honoured + immediately validated', () => {
    const { result } = renderHook(() => useIntegerInput({ initialValue: '7', max: 20 }));
    expect(result.current.value).toBe('7');
    expect(result.current.isValid).toBe(true);
    expect(result.current.parsed).toBe(7);
  });

  it('boundary: equal to min is valid (inclusive)', () => {
    const { result } = renderHook(() => useIntegerInput({ min: 1 }));
    act(() => result.current.onChange(change('1')));
    expect(result.current.isValid).toBe(true);
  });

  it('boundary: equal to max is valid (inclusive)', () => {
    const { result } = renderHook(() => useIntegerInput({ max: 100 }));
    act(() => result.current.onChange(change('100')));
    expect(result.current.isValid).toBe(true);
  });
});
