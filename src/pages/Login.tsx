import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { setPendingInviteToken } from '@/context/AuthContext';
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
  const [showLogin, setShowLogin] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);

    // Stash the invite token (if any) before signing in — AuthContext's onAuthStateChange
    // listener redeems it via the server-side accept_team_invite() function and resolves
    // userSettings before `loading` flips false, so ProtectedRoute makes the right call
    // on its own. No manual polling, no duplicated invite logic here.
    if (token) {
      setPendingInviteToken(token);
    }

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      toast.error('Login failed', { description: error.message });
      setLoading(false);
      return;
    }

    // AuthContext handles invite redemption + settings fetch + the onboarding-vs-dashboard
    // decision; ProtectedRoute reads that state once loading clears. We just need to leave
    // /login — '/' is enough, ProtectedRoute redirects to /onboarding itself if needed.
    navigate('/', { replace: true });
  };

  return (
    <>
      {/* MOBILE ONLY */}
      <div className="lg:hidden">
        {!showLogin ? (
          // Features screen
          <div 
            className="flex flex-col min-h-screen px-6 py-10"
            style={{ 
              background: 'linear-gradient(135deg, #1A3A2A 0%, #2D5A3C 50%, #1B3A4B 100%)',
              minHeight: '100dvh'
            }}
          >
            <div className="flex items-center gap-2 mb-10">
              <Sparkles size={28} className="text-[#F0B429]" />
              <span className="text-xl font-bold text-white">
                Lumina Insights
              </span>
            </div>

            <div className="flex-1 flex flex-col justify-center gap-3">
              {[
                { emoji: '📊', title: 'AI Business Insights', desc: 'Smart analysis of your real business data' },
                { emoji: '📣', title: 'Marketing AI', desc: 'Content for Instagram, Facebook, TikTok' },
                { emoji: '🤖', title: 'Business AI Assistant', desc: 'Personal advisor that knows your business' },
                { emoji: '🎤', title: 'Voice Notes', desc: 'Record and transcribe business notes instantly' },
                { emoji: '🔔', title: 'Smart Notifications', desc: 'Real-time alerts for orders, stock, performance' },
              ].map((f, i) => (
                <div key={i} 
                  className="flex items-center gap-3 rounded-xl p-4"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <span className="text-2xl shrink-0">{f.emoji}</span>
                  <div>
                    <p className="font-bold text-white text-sm">
                      {f.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowLogin(true)}
              className="mt-8 h-14 w-full rounded-xl font-bold text-white text-base"
              style={{ backgroundColor: '#4A7C59' }}
            >
              Get Started →
            </button>
          </div>
        ) : (
          // Login form for mobile
          <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: 'var(--page-bg, #1a1a2e)' }}>
            <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl">
              <div className="flex items-center gap-2 mb-6">
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
        )}
      </div>

      {/* DESKTOP ONLY - unchanged */}
      <div className="hidden lg:flex min-h-screen">
        <div className="hidden lg:block lg:w-1/2 h-screen sticky top-0">
          <AuthLeftPanel />
        </div>
        <div className="flex flex-1 items-center justify-center p-6" style={{ backgroundColor: 'var(--page-bg, #1a1a2e)' }}>
          <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl">
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
    </>
  );
}
