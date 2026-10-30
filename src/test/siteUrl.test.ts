import { describe, it, expect, afterEach, vi } from 'vitest';
import { siteUrl } from '@/lib/siteUrl';

function at(url: string) {
  vi.stubGlobal('location', new URL(url));
}

describe('siteUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends email links from a Vercel preview to the live site', () => {
    at('https://lumina-insights-abc123-ismailopu1s-projects.vercel.app/signup');
    expect(siteUrl()).toBe('https://lumina-insights-ashen.vercel.app');
  });

  it('keeps the local address during development', () => {
    at('http://localhost:8081/signup');
    expect(siteUrl()).toBe('http://localhost:8081');
  });

  it('uses VITE_SITE_URL when it is set', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://lumina.example.com/');
    at('https://anything.vercel.app/');
    expect(siteUrl()).toBe('https://lumina.example.com');
  });
});
