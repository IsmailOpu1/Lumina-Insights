import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { CODE_LENGTH } from '@/components/auth/ConfirmCode';
import LanguageToggle from '@/components/LanguageToggle';
import { useT, rich } from '@/i18n';
import { passwordProblem, PASSWORD_RULE } from '@/lib/password';

/**
 * Password reset by code. The email carries a code rather than a link, because
 * mail scanners open links before people do and use them up; and the new
 * password can only ever land on the account the code was sent to, never on
 * whoever happens to be signed in on this browser.
 */
export default function ForgotPassword() {
  const { t } = useT();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (err) {
      toast.error(t('Failed to send reset code'), { description: err.message });
      return;
    }
    if (sent) toast.success(t('A new code is on its way'));
    setSent(true);
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.length !== CODE_LENGTH) { setError(t('Enter the {n}-digit code from the email', { n: CODE_LENGTH })); return; }
    // Before the code is used: a used code cannot be tried again.
    const weak = passwordProblem(password);
    if (weak) { setError(t(weak)); return; }
    if (password !== confirmPassword) { setError(t('Passwords do not match')); return; }

    setLoading(true);
    // Leave any other account signed in on this browser out of it.
    await supabase.auth.signOut({ scope: 'local' });
    const { error: codeError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
    if (codeError) {
      setLoading(false);
      setError(/expired|invalid/i.test(codeError.message)
        ? t('That code is wrong or has expired. Check the latest email, or send a new one below.')
        : codeError.message);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError(/different from the old/i.test(updateError.message)
        ? t('The new password must be different from the old one.')
        : updateError.message);
      return;
    }
    // Sign in again with the new password, so it's proven to work.
    await supabase.auth.signOut({ scope: 'local' });
    setLoading(false);
    toast.success(t('Password updated! Sign in with your new password.'));
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl text-center max-sm:px-6">
        <LanguageToggle className="-mt-4 mb-2 ml-auto" />
        <div className="flex items-center justify-center gap-2 mb-6">
          <Sparkles size={28} className="text-primary" />
          <span className="text-xl font-bold text-foreground">Lumina Insights</span>
        </div>

        {sent ? (
          <>
            <h1 className="text-[28px] font-bold text-foreground">{t('Set new password')}</h1>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">
              {rich(t('We sent a {n}-digit code to {email}'), { n: CODE_LENGTH, email: <strong className="text-foreground">{email.trim()}</strong> })}
            </p>

            <form onSubmit={resetPassword} className="flex flex-col gap-4 text-left">
              <label htmlFor="reset-code" className="text-sm font-medium text-foreground">
                {t('Enter the {n}-digit code from the email', { n: CODE_LENGTH })}
              </label>
              <Input
                id="reset-code"
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)); setError(null); }}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH + 4}
                placeholder={'•'.repeat(CODE_LENGTH)}
                className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
              />
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('New password')}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  autoComplete="new-password"
                  className="h-12 text-base pr-12"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t('Hide password') : t('Show password')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">{t(PASSWORD_RULE)}</p>
              <Input
                type="password"
                placeholder={t('Confirm password')}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                autoComplete="new-password"
                className="h-12 text-base"
              />
              {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="h-12 w-full bg-primary font-bold text-white hover:bg-primary/90">
                {loading ? <Loader2 className="animate-spin" size={20} /> : t('Update Password')}
              </Button>
            </form>

            <div className="mt-6 flex flex-col items-center gap-3 text-sm">
              <button type="button" onClick={() => sendCode()} disabled={loading} className="font-bold text-primary hover:underline disabled:opacity-50">
                {t('Send a new code')}
              </button>
              <button type="button" onClick={() => { setSent(false); setCode(''); setError(null); }} className="text-muted-foreground hover:text-foreground">
                {t('Use a different email')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-[28px] font-bold text-foreground">{t('Reset password')}</h1>
            <p className="mt-1 mb-8 text-sm text-muted-foreground">{t('Enter your email and we will send you a reset code')}</p>

            <form onSubmit={sendCode} className="flex flex-col gap-4">
              <Input type="email" placeholder={t('Email address')} value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" required />
              <Button type="submit" disabled={loading} className="h-12 w-full bg-primary font-bold text-white hover:bg-primary/90">
                {loading ? <Loader2 className="animate-spin" size={20} /> : t('Send reset code')}
              </Button>
            </form>
          </>
        )}

        <Link to="/login" className="mt-6 inline-block text-sm font-bold text-primary hover:underline">
          <ArrowLeft size={14} className="inline mr-1" /> {t('Back to login')}
        </Link>
      </div>
    </div>
  );
}
