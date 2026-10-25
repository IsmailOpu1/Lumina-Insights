import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ProtectedRoute from '@/components/ProtectedRoute';
import { acceptInvite, createInvite } from '@/lib/invites';
import { dbErrorMessage } from '@/lib/dbErrors';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  insert: vi.fn(),
  refreshSettings: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  auth: { session: null as unknown, userSettings: null as unknown, loading: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp },
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    from: () => ({
      insert: (row: unknown) => {
        mocks.insert(row);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'inv-1' }, error: null }) }) };
      },
    }),
  },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ refreshSettings: mocks.refreshSettings, ...mocks.auth }),
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess, warning: vi.fn() } }));

beforeEach(() => {
  for (const m of [mocks.signIn, mocks.signUp, mocks.rpc, mocks.invoke, mocks.insert, mocks.refreshSettings, mocks.toastError, mocks.toastSuccess]) m.mockReset();
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.invoke.mockResolvedValue({ error: null });
  mocks.auth = { session: null, userSettings: null, loading: false };
});

function renderAt(path: string, element: React.ReactNode, routePath: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={element} />
        <Route path="/" element={<p>Dashboard page</p>} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/onboarding" element={<p>Onboarding page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function fillLogin() {
  fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: ' owner@example.com ' } });
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret-pass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

describe('Login', () => {
  it('signs in and goes to the dashboard', async () => {
    renderAt('/login', <Login />, '/login');
    fillLogin();
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'secret-pass' });
    expect(mocks.refreshSettings).toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('accepts an invite through the server function when the link has a token', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    renderAt('/login?token=tok-1', <Login />, '/login');
    fillLogin();
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('accept_team_invite', { p_token: 'tok-1' });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('You have joined the workspace');
  });

  it('explains a rejected invite but still signs in', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'invite_email_mismatch' } });
    renderAt('/login?token=tok-1', <Login />, '/login');
    fillLogin();
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith('Could not join the workspace', {
      description: 'This invite was sent to a different email address. Sign in with the invited email.',
    });
  });

  it('stays on the page when the password is wrong', async () => {
    mocks.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    renderAt('/login', <Login />, '/login');
    fillLogin();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Login failed', { description: 'Invalid login credentials' }));
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
  });
});

describe('Signup', () => {
  function fillSignup(password = 'Str0ng!pass', confirm = password) {
    fireEvent.change(screen.getByPlaceholderText('Full Name'), { target: { value: 'Karim Ahmed' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 characters)'), { target: { value: password } });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: confirm } });
    fireEvent.click(screen.getByRole('checkbox'));
  }

  it('pre-fills the invited email and carries the token in user metadata', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ role: 'viewer', email: 'karim@example.com', business_name: 'Rahman Fashion', status: 'valid' }],
      error: null,
    });
    renderAt('/signup?token=tok-9', <Signup />, '/signup');
    await waitFor(() => expect(screen.getByPlaceholderText('Email address')).toHaveValue('karim@example.com'));

    fillSignup();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();

    const args = mocks.signUp.mock.calls[0][0];
    expect(args.email).toBe('karim@example.com');
    expect(args.options.data).toEqual({ full_name: 'Karim Ahmed', invite_token: 'tok-9' });
    expect(args.options.emailRedirectTo).toMatch(/\/login$/);
  });

  it('does not add an invite token for a normal signup', async () => {
    renderAt('/signup', <Signup />, '/signup');
    fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'new@example.com' } });
    fillSignup();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    await screen.findByText('Check your email');
    expect(mocks.signUp.mock.calls[0][0].options.data).toEqual({ full_name: 'Karim Ahmed' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('blocks mismatched passwords before calling Supabase', async () => {
    renderAt('/signup', <Signup />, '/signup');
    fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'new@example.com' } });
    fillSignup('Str0ng!pass', 'different!1');
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Passwords do not match'));
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});

describe('invite helpers', () => {
  it('createInvite stores a normalised email and asks the server to send it', async () => {
    const result = await createInvite('owner-1', '  Karim@Example.COM ', 'manager');
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ owner_id: 'owner-1', email: 'karim@example.com', role: 'manager' });
    expect(mocks.invoke).toHaveBeenCalledWith('send-invite-email', { body: { invite_id: 'inv-1' } });
    expect(result).toMatchObject({ error: null, emailed: true });
    expect(result.link).toMatch(/\/invite\/[0-9a-f-]{36}$/);
  });

  it('createInvite still returns the link when the email fails', async () => {
    mocks.invoke.mockResolvedValue({ error: new Error('Resend down') });
    const result = await createInvite('owner-1', 'k@example.com', 'viewer');
    expect(result.emailed).toBe(false);
    expect(result.link).toBeTruthy();
  });

  it.each([
    ['invite_expired', 'This invite has expired. Ask the workspace owner for a new one.'],
    ['already_owns_workspace', 'Your account already owns a workspace, so it cannot join another one.'],
    ['something unexpected', 'something unexpected'],
  ])('acceptInvite maps %s to a readable message', async (code, message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } });
    expect(await acceptInvite('t')).toBe(message);
  });

  it('dbErrorMessage explains database trigger errors', () => {
    expect(dbErrorMessage('insufficient_stock')).toMatch(/Not enough stock/);
    expect(dbErrorMessage('other error')).toBe('other error');
  });
});

describe('ProtectedRoute', () => {
  const page = <ProtectedRoute><p>Secret page</p></ProtectedRoute>;

  it('sends visitors without a session to login', () => {
    renderAt('/orders', page, '/orders');
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('sends signed-in users without finished onboarding to onboarding', () => {
    mocks.auth = { session: {}, userSettings: { onboarding_complete: false }, loading: false };
    renderAt('/orders', page, '/orders');
    expect(screen.getByText('Onboarding page')).toBeInTheDocument();
  });

  it('waits while auth is loading instead of redirecting', () => {
    mocks.auth = { session: null, userSettings: null, loading: true };
    renderAt('/orders', page, '/orders');
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
    expect(screen.queryByText('Secret page')).not.toBeInTheDocument();
  });

  it('shows the page to onboarded users', () => {
    mocks.auth = { session: {}, userSettings: { onboarding_complete: true }, loading: false };
    renderAt('/orders', page, '/orders');
    expect(screen.getByText('Secret page')).toBeInTheDocument();
  });
});
