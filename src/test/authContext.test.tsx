import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';

type AuthCallback = (event: string, session: unknown) => void;

const mocks = vi.hoisted(() => ({
  listener: null as null | AuthCallback,
  rpc: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  settingsByUser: {} as Record<string, unknown>,
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        mocks.listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () => Promise.resolve({ data: { session: null } }),
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: (_col: string, userId: string) => ({
          maybeSingle: () => Promise.resolve({ data: mocks.settingsByUser[userId] ?? null }),
        }),
      }),
    }),
  },
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

function Probe() {
  const a = useAuth();
  return (
    <p>
      loading:{String(a.loading)} role:{a.role} owner:{a.ownerIdForQueries ?? '-'} business:{a.workspace?.business_name ?? '-'} currency:{a.workspace?.currency ?? '-'}
    </p>
  );
}

function session(id: string, metadata: Record<string, unknown> = {}, confirmed = true) {
  return { user: { id, email: `${id}@example.com`, email_confirmed_at: confirmed ? '2026-10-01' : null, user_metadata: metadata } };
}

async function signIn(event: string, s: unknown) {
  render(<AuthProvider><Probe /></AuthProvider>);
  await act(async () => { mocks.listener!(event, s); });
}

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.updateUser.mockReset().mockResolvedValue({ error: null });
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  mocks.toastError.mockReset();
  mocks.settingsByUser = {
    owner: { user_id: 'owner', role: 'owner', owner_id: 'owner', onboarding_complete: true, business_name: 'Rahman Fashion', currency: 'USD' },
    member: { user_id: 'member', role: 'viewer', owner_id: 'owner', onboarding_complete: true, business_name: null, currency: 'BDT' },
  };
});

describe('AuthContext', () => {
  it('owners query their own workspace', async () => {
    await signIn('SIGNED_IN', session('owner'));
    await screen.findByText(/loading:false role:owner owner:owner business:Rahman Fashion currency:USD/);
  });

  it('members query the owner’s workspace and use the owner’s profile', async () => {
    await signIn('SIGNED_IN', session('member'));
    // The member's own row says BDT and has no business name; the owner's wins.
    await screen.findByText(/loading:false role:viewer owner:owner business:Rahman Fashion currency:USD/);
  });

  it('accepts a pending invite from signup, then clears the token', async () => {
    await signIn('SIGNED_IN', session('member', { invite_token: 'tok-7' }));
    await screen.findByText(/loading:false/);
    expect(mocks.rpc).toHaveBeenCalledWith('accept_team_invite', { p_token: 'tok-7' });
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { invite_token: null } });
  });

  it('reports a failed invite and still clears the token', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'invite_expired' } });
    await signIn('SIGNED_IN', session('member', { invite_token: 'tok-7' }));
    await screen.findByText(/loading:false/);
    expect(mocks.toastError).toHaveBeenCalledWith('Could not join the workspace', {
      description: 'This invite has expired. Ask the workspace owner for a new one.',
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { invite_token: null } });
  });

  it('signs out accounts whose email is not confirmed', async () => {
    await signIn('SIGNED_IN', session('owner', {}, false));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
    expect(screen.getByText(/loading:false role:viewer owner:-/)).toBeInTheDocument();
  });

  it('a brand-new user with no settings row queries their own id', async () => {
    await signIn('INITIAL_SESSION', session('newbie'));
    await screen.findByText(/loading:false role:viewer owner:newbie business:-/);
  });
});
