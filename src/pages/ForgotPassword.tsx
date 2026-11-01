import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { siteUrl } from '@/lib/siteUrl';
import LanguageToggle from '@/components/LanguageToggle';
import { useT, rich } from '@/i18n';

export default function ForgotPassword() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteUrl()}/reset-password`,
    });

    if (error) {
      toast.error(t('Failed to send reset link'), { description: error.message });
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl text-center">
        <LanguageToggle className="-mt-4 mb-2 ml-auto" />
        <div className="flex items-center justify-center gap-2 mb-6">
          <Sparkles size={28} className="text-primary" />
          <span className="text-xl font-bold text-foreground">Lumina Insights</span>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
              <CheckCircle size={36} className="text-primary" style={{ animation: 'scaleIn 400ms ease' }} />
            </div>
            <style>{`@keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }`}</style>
            <h2 className="text-xl font-bold text-foreground">{t('Check your email')}</h2>
            <p className="text-sm text-muted-foreground">{rich(t("We've sent a password reset link to {email}"), { email: <strong>{email}</strong> })}</p>
            <Link to="/login" className="mt-4 text-sm font-bold text-primary hover:underline">
              <ArrowLeft size={14} className="inline mr-1" /> {t('Back to login')}
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-[28px] font-bold text-foreground">{t('Reset password')}</h1>
            <p className="mt-1 mb-8 text-sm text-muted-foreground">{t('Enter your email to receive a reset link')}</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input type="email" placeholder={t('Email address')} value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" required />
              <Button type="submit" disabled={loading} className="h-12 w-full bg-primary font-bold text-white hover:bg-primary/90">
                {loading ? <Loader2 className="animate-spin" size={20} /> : t('Send Reset Link')}
              </Button>
            </form>

            <Link to="/login" className="mt-6 inline-block text-sm font-bold text-primary hover:underline">
              <ArrowLeft size={14} className="inline mr-1" /> {t('Back to login')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
