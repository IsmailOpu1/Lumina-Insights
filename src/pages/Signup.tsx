import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Loader2, Sparkles, Mail } from 'lucide-react';
import { toast } from 'sonner';
import AuthLeftPanel from '@/components/auth/AuthLeftPanel';

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 25, label: 'Weak', color: '#EF4444' };
  if (score === 2) return { score: 50, label: 'Medium', color: '#F59E0B' };
  if (score === 3) return { score: 75, label: 'Good', color: '#3B82F6' };
  return { score: 100, label: 'Strong', color: '#10B981' };
}

export default function Signup() {
  const navigate = useNavigate();
  const { refreshSettings } = useAuth();
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
  const [checking, setChecking] = useState(false);

  const strength = getPasswordStrength(password);

  const handleGoToLogin = async () => {
    setChecking(true);
    const { data } = await supabase.auth.getSession();
    const { data: userData } = await supabase.auth.getUser();
    
    if (userData?.user?.email_confirmed_at) {
      navigate('/login');
    } else {
      toast.error('Please confirm your email first', {
        description: 'Check your inbox and click the confirmation link before signing in.'
      });
    }
    setChecking(false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED') {
        navigate('/login');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      toast.error('Please fill all fields');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (!agreed) {
      toast.error('Please agree to the Terms of Service');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast.error('Signup failed', { description: error.message });
      setLoading(false);
      return;
    }

    // If invite token, handle join
    if (token) {
      const { data: invite } = await supabase
        .from('invites')
        .select('*')
        .eq('token', token)
        .eq('used', false)
        .maybeSingle();

      if (invite && new Date(invite.expires_at) > new Date()) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('team_members').insert({
            owner_id: invite.owner_id,
            member_id: user.id,
            email: user.email || invite.email,
            role: invite.role,
            status: 'active',
          });
          await supabase.from('user_settings').upsert({
            user_id: user.id,
            owner_id: invite.owner_id,
            role: invite.role,
            onboarding_complete: true,
            full_name: fullName.trim(),
          } as any, { onConflict: 'user_id' });
          await supabase.from('invites').update({ used: true } as any).eq('id', invite.id);
          await refreshSettings();
          setEmailSent(true);
          setLoading(false);
          return;
        }
      }
    }

    setEmailSent(true);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:block lg:w-1/2 h-screen sticky top-0">
        <AuthLeftPanel />
      </div>

      <div className="flex flex-1 items-center justify-center p-6" style={{ backgroundColor: 'var(--page-bg, #1a1a2e)' }}>
        <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl">
          {emailSent ? (
            <div className="text-center flex flex-col items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#4A7C59]/20 mx-auto">
                <Mail size={40} className="text-[#4A7C59]" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Check your email
              </h1>
              <p className="text-muted-foreground text-sm">
                We sent a confirmation link to <strong>{email}</strong>. Click the link to verify your account, then come back to sign in.
              </p>
              <Button
                onClick={handleGoToLogin}
                disabled={checking}
                className="mt-4 h-12 w-full bg-[#4A7C59] font-bold text-white"
              >
                {checking ? <Loader2 className="animate-spin" size={20} /> : 'Go to Login'}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-6 lg:hidden">
                <Sparkles size={28} className="text-[#F0B429]" />
                <span className="text-xl font-bold text-foreground">Lumina Insights</span>
              </div>

              <h1 className="text-[28px] font-bold text-foreground">Create your account</h1>
              <p className="mt-1 mb-8 text-sm text-muted-foreground">Start your free trial</p>

              <form onSubmit={handleSignup} className="flex flex-col gap-4">
                <Input placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12 text-base" required />
                <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" required />

                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password (min 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 text-base pr-12"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {password && (
                  <div className="flex items-center gap-2">
                    <Progress value={strength.score} className="h-2 flex-1" style={{ '--progress-color': strength.color } as any} />
                    <span className="text-xs font-bold" style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                )}

                <Input
                  type="password"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-12 text-base"
                  required
                />

                <div className="flex items-center gap-2">
                  <Checkbox id="terms" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
                  <label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer">
                    I agree to the Terms of Service
                  </label>
                </div>

                <Button type="submit" disabled={loading} className="h-12 w-full bg-[#4A7C59] font-bold text-white hover:bg-[#3d6a4b]">
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Create Account'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="font-bold text-[#4A7C59] hover:underline">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
