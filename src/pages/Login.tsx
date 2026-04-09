import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import AuthLeftPanel from '@/components/auth/AuthLeftPanel';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      toast.error('Login failed', { description: error.message });
      setLoading(false);
      return;
    }

    // If came from invite link, handle token
    if (token) {
      await handleInviteToken(token);
    }

    navigate('/', { replace: true });
  };

  const handleInviteToken = async (t: string) => {
    const { data: invite } = await supabase
      .from('invites')
      .select('*')
      .eq('token', t)
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
          user_full_name: user.user_metadata?.full_name || '',
        } as any, { onConflict: 'user_id' });
        await supabase.from('invites').update({ used: true } as any).eq('id', invite.id);
      }
    }
  };

  return (
    <div className="flex min-h-screen">
      <AuthLeftPanel />

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center p-6" style={{ backgroundColor: 'var(--page-bg, #1a1a2e)' }}>
        <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <Sparkles size={28} className="text-[#F0B429]" />
            <span className="text-xl font-bold text-foreground">Lumina Insights</span>
          </div>

          <h1 className="text-[28px] font-bold text-foreground">Welcome back</h1>
          <p className="mt-1 mb-8 text-sm text-muted-foreground">Sign in to your account</p>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base"
              required
            />
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-base pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <Link to="/forgot-password" className="self-end text-sm font-medium text-[#4A7C59] hover:underline">
              Forgot password?
            </Link>

            <Button type="submit" disabled={loading} className="h-12 w-full bg-[#4A7C59] font-bold text-white hover:bg-[#3d6a4b]">
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to={token ? `/signup?token=${token}` : '/signup'} className="font-bold text-[#4A7C59] hover:underline">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
