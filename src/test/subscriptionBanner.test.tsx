import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const sub = vi.hoisted(() => ({ value: { subscription: null as unknown, error: false, refresh: vi.fn() } }));
vi.mock('@/context/SubscriptionContext', () => ({ useSubscription: () => sub.value }));

import SubscriptionBanner from '@/components/SubscriptionBanner';

const renderBanner = () => render(<MemoryRouter><SubscriptionBanner /></MemoryRouter>);

describe('SubscriptionBanner', () => {
  it('says so when the plan could not be checked, and retries on request', () => {
    sub.value = { subscription: null, error: true, refresh: vi.fn() };
    renderBanner();
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't check your plan right now");
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(sub.value.refresh).toHaveBeenCalled();
  });

  it('shows nothing while there is simply no plan yet', () => {
    sub.value = { subscription: null, error: false, refresh: vi.fn() };
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });
});
