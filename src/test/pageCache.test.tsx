import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { clearPageCache, setPageCacheUser, useCachedState } from '@/lib/pageCache';

describe('useCachedState', () => {
  it('starts empty, then shows the last loaded value on the next visit', () => {
    const first = renderHook(() => useCachedState<string[]>('orders', []));
    expect(first.result.current[0]).toEqual([]);
    expect(first.result.current[2]).toBe(false);
    act(() => first.result.current[1](['a', 'b']));
    first.unmount();

    const again = renderHook(() => useCachedState<string[]>('orders', []));
    expect(again.result.current[0]).toEqual(['a', 'b']);
    expect(again.result.current[2]).toBe(true);
  });

  it('keeps each key apart and switches when the key changes', () => {
    const { result, rerender } = renderHook(({ k }) => useCachedState<number | null>(k, null), {
      initialProps: { k: 'dash:7days' },
    });
    act(() => result.current[1](7));
    rerender({ k: 'dash:30days' });
    expect(result.current[0]).toBeNull();
    act(() => result.current[1](30));
    rerender({ k: 'dash:7days' });
    expect(result.current[0]).toBe(7);
  });

  it('files a late result under the key it was loaded for', () => {
    const { result, rerender } = renderHook(({ k }) => useCachedState<number | null>(k, null), {
      initialProps: { k: 'a' },
    });
    const setForA = result.current[1];
    rerender({ k: 'b' });
    act(() => setForA(1));
    expect(result.current[0]).toBeNull();
    rerender({ k: 'a' });
    expect(result.current[0]).toBe(1);
  });

  it('never shows one user what another loaded, and forgets on sign-out', () => {
    setPageCacheUser('u1');
    const one = renderHook(() => useCachedState<string>('notes', ''));
    act(() => one.result.current[1]('mine'));
    one.unmount();

    setPageCacheUser('u1'); // same user again, e.g. a token refresh: kept
    expect(renderHook(() => useCachedState<string>('notes', '')).result.current[0]).toBe('mine');

    setPageCacheUser('u2');
    expect(renderHook(() => useCachedState<string>('notes', '')).result.current[0]).toBe('');

    const two = renderHook(() => useCachedState<string>('notes', ''));
    act(() => two.result.current[1]('theirs'));
    two.unmount();
    clearPageCache();
    expect(renderHook(() => useCachedState<string>('notes', '')).result.current[0]).toBe('');
  });
});
