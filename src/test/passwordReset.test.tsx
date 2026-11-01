import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  recoveryEmail: null as string | null,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      verifyOtp: mocks.verifyOtp,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
      getSession: mocks.getSession,
    },
  },
}));
vi.mock('@/lib/recovery', () => ({
  passwordRecoveryEmail: () => mocks.recoveryEmail,
  clearPasswordRecovery: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls = [];
  const track = (name: string, result: unknown) => async () => { mocks.calls.push(name); return result; };
  mocks.resetPasswordForEmail.mockImplementation(track('reset', { error: null }));
  mocks.verifyOtp.mockImplementation(track('verify', { data: {}, error: null }));
  mocks.updateUser.mockImplementation(track('update', { error: null }));
  mocks.signOut.mockImplementation(track('signOut', { error: null }));
  mocks.getSession.mockResolvedValue({ data: { session: { user: { email: 'someone-else@example.com' } } } });
  mocks.recoveryEmail = null;
});

function renderAt(path: string, element: React.ReactNode) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ForgotPassword', () => {
  it('resets by code, for the emailed account only', async () => {
    renderAt('/forgot-password', <ForgotPassword />);
    fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: ' manager@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }));
    await screen.findByLabelText('Enter the 8-digit code from the email');
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('manager@example.com');

    fireEvent.change(screen.getByLabelText('Enter the 8-digit code from the email'), { target: { value: '1234 5678' } });
    fireEvent.change(screen.getByPlaceholderText('New password (min 8 characters)'), { target: { value: 'new-secret-1' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'new-secret-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: 'manager@example.com', token: '12345678', type: 'recovery' });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'new-secret-1' });
    // Whoever was signed in is signed out before the code signs the right account in.
    expect(mocks.calls).toEqual(['reset', 'signOut', 'verify', 'update', 'signOut']);
  });

  it('never changes a password when the code is wrong', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token has expired or is invalid' } });
    renderAt('/forgot-password', <ForgotPassword />);
    fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'manager@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }));
    fireEvent.change(await screen.findByLabelText('Enter the 8-digit code from the email'), { target: { value: '11112222' } });
    fireEvent.change(screen.getByPlaceholderText('New password (min 8 characters)'), { target: { value: 'new-secret-1' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'new-secret-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That code is wrong or has expired');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe('ResetPassword', () => {
  it('refuses to change the signed-in account when the link did not work', () => {
    renderAt('/reset-password', <ResetPassword />);
    expect(screen.getByText('This reset link has expired or was already used')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('New password (min 8 characters)')).not.toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('sets the password for the account the link opened, and names it', async () => {
    mocks.recoveryEmail = 'manager@example.com';
    mocks.getSession.mockResolvedValue({ data: { session: { user: { email: 'manager@example.com' } } } });
    renderAt('/reset-password', <ResetPassword />);
    expect(screen.getByText('manager@example.com')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('New password (min 8 characters)'), { target: { value: 'new-secret-1' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'new-secret-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'new-secret-1' }));
  });
});
