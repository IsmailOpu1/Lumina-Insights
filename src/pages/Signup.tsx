import { useState, useEffect, type CSSProperties } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Loader2, Sparkles, Mail, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import AuthLeftPanel from '@/components/auth/AuthLeftPanel';
import { siteUrl } from '@/lib/siteUrl';
import { authEmailErrorMessage } from '@/lib/authEmail';
import ResendConfirmation from '@/components/auth/ResendConfirmation';
import ConfirmCode from '@/components/auth/ConfirmCode';
import LanguageToggle from '@/components/LanguageToggle';
import { useT, msg, rich } from '@/i18n';

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 25, label: msg('Weak'), color: '#F43F5E' };
  if (score === 2) return { score: 50, label: msg('Medium'), color: '#F5A524' };
  if (score === 3) return { score: 75, label: msg('Good'), color: '#5EEAD4' };
  return { score: 100, label: msg('Strong'), color: '#10B981' };
}

export default function Signup() {
  const { t } = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);

  const strength = getPasswordStrength(password);

  // Pre-fill the invited email so the invite can be accepted on sign-in.
  useEffect(() => {
    if (!token) return;
    supabase.rpc('get_invite_preview', { p_token: token }).then(({ data }) => {
      const invite = data?.[0];
      if (invite?.status === 'valid') setEmail(invite.email);
    });
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      toast.error(t('Please fill all fields'));
      return;
    }
    if (password.length < 8) {
      toast.error(t('Password must be at least 8 characters'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('Passwords do not match'));
      return;
    }
    if (!agreed) {
      toast.error(t('Please agree to the Terms of Service'));
      return;
    }

    setLoading(true);
    setSignupError(null);

    // With an invite, the token rides along in user metadata; AuthContext
    // accepts it on the first confirmed sign-in.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim(), ...(token ? { invite_token: token } : {}) },
        emailRedirectTo: `${siteUrl()}/login`,
      },
    });

    if (error) {
      setSignupError(authEmailErrorMessage(error));
      setLoading(false);
      return;
    }

    // Supabase answers "success" for an address that already has a confirmed
    // account but sends no email (so the form can't reveal who has one). Such
    // a reply comes back with no identities.
    if (data.user && data.user.identities?.length === 0) {
      setSignupError(t('An account with this email already exists. Please sign in, or use "Forgot password?" if you don\'t remember it.'));
      setLoading(false);
      return;
    }

    setEmailSent(true);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:block lg:w-1/2 h-screen sticky top-0">
        <AuthLeftPanel />
      </div>

      <div className="flex flex-1 items-center justify-center p-6" style={{ backgroundColor: 'hsl(var(--background))' }}>
        <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl">
          <LanguageToggle className="-mt-4 mb-2 ml-auto" />
          {emailSent ? (
            <div className="text-center flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 mx-auto">
                <Mail size={40} className="text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                {t('Check your email')}
              </h1>
              <p className="text-muted-foreground text-sm">
                {rich(t('We sent a code to {email}. Type it below, or tap the button in the email.'), { email: <strong>{email}</strong> })}
              </p>
              <ConfirmCode email={email} />
              <p className="text-muted-foreground text-xs">
                {t('Not there after a minute? Check your spam or promotions folder. If you already had an account with this email, just sign in.')}
              </p>
              <ResendConfirmation email={email} />
              <Button variant="ghost" onClick={() => navigate('/login')} className="h-10 w-full text-sm text-muted-foreground">
                {t('Back to sign in')}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-6 lg:hidden">
                <Sparkles size={28} className="text-primary" />
                <span className="text-xl font-bold text-foreground">Lumina Insights</span>
              </div>

              <h1 className="text-[28px] font-bold text-foreground">{t('Create your account')}</h1>
              <p className="mt-1 mb-8 text-sm text-muted-foreground">{t('Start your free trial')}</p>

              <form onSubmit={handleSignup} className="flex flex-col gap-4">
                <Input placeholder={t('Full Name')} value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12 text-base" required />
                <Input type="email" placeholder={t('Email address')} value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" required />

                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('Password (min 8 characters)')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 text-base pr-12"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t('Hide password') : t('Show password')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {password && (
                  <div className="flex items-center gap-2">
                    <Progress value={strength.score} className="h-2 flex-1" style={{ '--progress-color': strength.color } as CSSProperties} />
                    <span className="text-xs font-bold" style={{ color: strength.color }}>{t(strength.label)}</span>
                  </div>
                )}

                <Input
                  type="password"
                  placeholder={t('Confirm Password')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-12 text-base"
                  required
                />

                <div className="flex items-center gap-2">
                  <Checkbox id="terms" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
                  <label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer">
                    {rich(t('I agree to the {terms} and {privacy}'), {
                      terms: <Link to="/terms" target="_blank" className="font-bold text-primary hover:underline">{t('Terms of Service')}</Link>,
                      privacy: <Link to="/privacy" target="_blank" className="font-bold text-primary hover:underline">{t('Privacy Policy')}</Link>,
                    })}
                  </label>
                </div>

                {signupError && (
                  <div role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                    <AlertCircle size={18} className="mt-0.5 shrink-0 text-destructive" />
                    <span>{signupError}</span>
                  </div>
                )}

                <Button type="submit" disabled={loading} className="h-12 w-full bg-primary font-bold text-white hover:bg-primary/90">
                  {loading ? <Loader2 className="animate-spin" size={20} /> : t('Create Account')}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {t('Already have an account?')}{' '}
                <Link to="/login" className="font-bold text-primary hover:underline">{t('Sign in')}</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
