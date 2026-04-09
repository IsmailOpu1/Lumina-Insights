import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error('Failed to reset password', { description: error.message });
      setLoading(false);
      return;
    }
    toast.success('Password updated!');
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: 'var(--page-bg, #1a1a2e)' }}>
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Sparkles size={28} className="text-[#F0B429]" />
          <span className="text-xl font-bold text-foreground">Lumina Insights</span>
        </div>
        <h1 className="text-[28px] font-bold text-foreground text-center">Set new password</h1>
        <p className="mt-1 mb-8 text-sm text-muted-foreground text-center">Enter your new password below</p>

        <form onSubmit={handleReset} className="flex flex-col gap-4">
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 text-base pr-12"
              required
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <Input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12 text-base" required />
          <Button type="submit" disabled={loading} className="h-12 w-full bg-[#4A7C59] font-bold text-white hover:bg-[#3d6a4b]">
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
