import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { setupPwa, useInstallApp } from '@/lib/pwa';

function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => { window.dispatchEvent(event); });
  return event;
}

beforeAll(() => setupPwa());
afterEach(() => {
  vi.restoreAllMocks();
  mocks.toast.mockReset();
  mocks.toast.success.mockReset();
});

describe('Install app', () => {
  it('stays hidden until the browser offers to install', () => {
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.available).toBe(false);
  });

  it('shows the browser’s install prompt once, then hides', async () => {
    const { result } = renderHook(() => useInstallApp());
    const event = offerInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.available).toBe(true);

    await act(() => result.current.install());
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(mocks.toast.success).toHaveBeenCalledWith('Lumina is on your home screen');
    expect(result.current.available).toBe(false);
  });

  it('explains Add to Home Screen on an iPhone', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.available).toBe(true);
    await act(() => result.current.install());
    expect(mocks.toast).toHaveBeenCalledWith('Add Lumina to your home screen', expect.objectContaining({
      description: expect.stringContaining('Add to Home Screen'),
    }));
  });

  it('hides once Lumina is already installed', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    offerInstall();
    const { result } = renderHook(() => useInstallApp());
    expect(result.current.available).toBe(false);
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));

  it('has what Chrome needs to offer an install', () => {
    expect(manifest).toMatchObject({ name: 'Lumina Insights', start_url: '/', display: 'standalone' });
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  });
});
