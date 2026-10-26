import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AccountMenu from '@/components/AccountMenu';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => {}),
  auth: {} as Record<string, unknown>,
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/context/SubscriptionContext', () => ({
  useSubscription: () => ({ subscription: { plan: 'pro', state: 'active' } }),
}));

function openMenu() {
  // jsdom has no PointerEvent, so open it the way a keyboard user would.
  const trigger = screen.getByRole('button', { name: 'Open account menu' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

describe('Account menu', () => {
  beforeEach(() => {
    mocks.signOut.mockClear();
    mocks.auth = {
      user: { email: 'owner@shop.com' },
      userSettings: { full_name: 'Rahim Uddin', business_name: 'Lumina', avatar_url: null },
      isOwner: true, isManager: false, isViewer: false,
      signOut: mocks.signOut,
    };
  });

  it('opens with the account details and links when the avatar is clicked', () => {
    render(<MemoryRouter><AccountMenu /></MemoryRouter>);
    openMenu();
    expect(screen.getByText('Rahim Uddin')).toBeInTheDocument();
    expect(screen.getByText('owner@shop.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /My account/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Billing/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Sign out/ })).toBeInTheDocument();
  });

  it('takes you to your profile from My account', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AccountMenu />} />
          <Route path="/settings" element={<p>Settings page</p>} />
        </Routes>
      </MemoryRouter>
    );
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /My account/ }));
    expect(screen.getByText('Settings page')).toBeInTheDocument();
  });

  it('hides Settings and Billing from viewers', () => {
    mocks.auth = { ...mocks.auth, isOwner: false, isViewer: true };
    render(<MemoryRouter><AccountMenu /></MemoryRouter>);
    openMenu();
    expect(screen.queryByRole('menuitem', { name: /Billing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Settings/ })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Sign out/ })).toBeInTheDocument();
  });
});
