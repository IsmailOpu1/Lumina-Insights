import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/** Matches otp_length in supabase/config.toml. */
export const CODE_LENGTH = 8;

/**
 * The code from the confirmation email, as an alternative to its link.
 * Phones offer the code from the email (one-time-code autofill), a pasted
 * code is cleaned up, and a complete code is checked straight away.
 */
export default function ConfirmCode({ email }: { email: string }) {
  const navigate = useNavigate();
  const { refreshSettings } = useAuth();
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(token: string) {
    setChecking(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    setChecking(false);
    if (err) {
      setError(/expired|invalid/i.test(err.message)
        ? 'That code is wrong or has expired. Check the latest email, or send a new one below.'
        : err.message);
      return;
    }
    toast.success('Email confirmed. Welcome to Lumina!');
    // ProtectedRoute sends new accounts on to onboarding.
    await refreshSettings();
    navigate('/', { replace: true });
  }

  function onChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    if (digits.length === CODE_LENGTH && !checking) verify(digits);
  }

  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(e) => { e.preventDefault(); if (code.length === CODE_LENGTH) verify(code); }}
    >
      <label htmlFor="confirm-code" className="text-sm font-medium text-foreground">
        Enter the {CODE_LENGTH}-digit code from the email
      </label>
      <Input
        id="confirm-code"
        value={code}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH + 4}
        placeholder={'•'.repeat(CODE_LENGTH)}
        aria-invalid={!!error}
        className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
        disabled={checking}
      />
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
      <Button type="submit" disabled={checking || code.length !== CODE_LENGTH} className="h-12 w-full font-bold">
        {checking ? <Loader2 className="animate-spin" size={18} /> : 'Confirm email'}
      </Button>
    </form>
  );
}
