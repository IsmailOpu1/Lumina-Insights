import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ reportError: vi.fn(), whatsApp: '' }));
vi.mock('@/lib/monitoring', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/legal', () => ({ LEGAL: { get supportWhatsApp() { return mocks.whatsApp; } } }));

import ErrorBoundary from '@/components/ErrorBoundary';
import { whatsAppSupportLink } from '@/lib/support';
import { loadFont } from '@/context/ThemeContext';

function Crash({ message }: { message: string }): never {
  throw new Error(message);
}

beforeEach(() => {
  mocks.reportError.mockReset();
  mocks.whatsApp = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('crash screen', () => {
  it('replaces a blank page with a way out and reports the error', () => {
    render(<ErrorBoundary><Crash message="boom" /></ErrorBoundary>);
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload the page/ })).toBeInTheDocument();
    expect(mocks.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), expect.anything());
  });

  it('offers WhatsApp help once a number is set', () => {
    mocks.whatsApp = '8801712345678';
    render(<ErrorBoundary><Crash message="boom" /></ErrorBoundary>);
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/wa\.me\/8801712345678\?text=/));
  });
});

describe('WhatsApp support link', () => {
  it('stays hidden until a number is set', () => {
    expect(whatsAppSupportLink()).toBeNull();
  });

  it('keeps only digits and pre-fills the message', () => {
    mocks.whatsApp = '+880 1712-345678';
    expect(whatsAppSupportLink('Hi there')).toBe('https://wa.me/8801712345678?text=Hi%20there');
  });
});

describe('fonts', () => {
  it('downloads a font once, and never Inter (already in the page)', () => {
    loadFont('poppins');
    loadFont('poppins');
    loadFont('inter');
    const links = document.head.querySelectorAll('link[id^="font-"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toContain('family=Poppins');
  });
});
