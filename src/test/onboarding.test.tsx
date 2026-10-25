import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Onboarding from '@/pages/Onboarding';

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  refreshSettings: vi.fn(),
  auth: { userSettings: null as unknown, loading: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      upsert: (row: unknown, opts: unknown) => {
        mocks.upsert(row, opts);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'new-owner', user_metadata: { full_name: 'Rahim Uddin' } },
    refreshSettings: mocks.refreshSettings,
    ...mocks.auth,
  }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

function renderOnboarding() {
  render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/" element={<p>Dashboard page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.upsert.mockReset();
  mocks.refreshSettings.mockReset().mockResolvedValue(undefined);
  mocks.auth = { userSettings: null, loading: false };
});

describe('Onboarding', () => {
  it('sends already-onboarded users to the dashboard', () => {
    mocks.auth = { userSettings: { onboarding_complete: true }, loading: false };
    renderOnboarding();
    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
  });

  it('does not flash the form while auth is still loading', () => {
    mocks.auth = { userSettings: null, loading: true };
    renderOnboarding();
    expect(screen.queryByText('Welcome to Lumina Insights!')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
  });

  it('walks a new owner through setup and saves the profile', async () => {
    renderOnboarding();
    fireEvent.click(screen.getByRole('button', { name: /Let's Get Started/ }));

    // Step 2: business profile (name is pre-filled from signup)
    expect(screen.getByPlaceholderText('Your name')).toHaveValue('Rahim Uddin');
    fireEvent.change(screen.getByPlaceholderText('e.g. Rahman Electronics'), { target: { value: 'Rahman Fashion' } });
    fireEvent.change(screen.getByPlaceholderText(/handmade jewelry/), { target: { value: 'Panjabi and sarees on Facebook' } });
    const continueBtn = screen.getByRole('button', { name: /Continue/ });
    expect(continueBtn).toBeDisabled(); // business type still missing
    // Open the business-type dropdown with the keyboard (also checks it's keyboard-accessible).
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Fashion/Clothing' }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

    // Step 3: currency — choosing USD saves the profile before moving on
    fireEvent.click(screen.getByText('US Dollar'));
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    const [draft, opts] = mocks.upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: 'user_id' });
    expect(draft).toEqual({
      user_id: 'new-owner',
      business_name: 'Rahman Fashion',
      business_type: 'Fashion/Clothing',
      business_description: 'Panjabi and sarees on Facebook',
      currency: 'USD',
      full_name: 'Rahim Uddin',
      onboarding_complete: false,
    });
    // Role and workspace are decided by the database, never sent by the client.
    expect(draft).not.toHaveProperty('role');
    expect(draft).not.toHaveProperty('owner_id');

    // Step 4: skip invites, step 5: finish
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    fireEvent.click(screen.getByRole('button', { name: /Go to Dashboard/ }));
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(mocks.upsert.mock.calls[1][0]).toMatchObject({ onboarding_complete: true, currency: 'USD' });
    expect(mocks.refreshSettings).toHaveBeenCalled();
  });
});
