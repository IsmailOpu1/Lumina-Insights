import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import LanguageToggle from '@/components/LanguageToggle';
import { useT, rich } from '@/i18n';

interface InvitePreview {
  role: string;
  email: string;
  business_name: string;
  status: 'valid' | 'used' | 'expired';
}

export default function InvitePage() {
  const { t } = useT();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InvitePreview | null>(null);

  useEffect(() => {
    async function load() {
      if (!token) { setLoading(false); return; }
      // Invites are not readable directly; this RPC returns only what the
      // landing page needs, and only for the exact token.
      const { data } = await supabase.rpc('get_invite_preview', { p_token: token });
      const row = (data as InvitePreview[] | null)?.[0];
      setInvite(row && row.status === 'valid' ? row : null);
      setLoading(false);
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'hsl(var(--background))' }}>
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: 'hsl(var(--background))' }}>
        <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl text-center">
          <AlertTriangle size={48} className="mx-auto text-destructive mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">{t('Invite Expired')}</h1>
          <p className="text-muted-foreground mb-6">{t('This invite link has expired or already been used. Please contact the workspace owner for a new invite.')}</p>
          <Link to="/login" className="text-sm font-bold text-primary hover:underline">{t('Go to login')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl text-center">
        <LanguageToggle className="-mt-4 mb-2 ml-auto" />
        <Sparkles size={40} className="mx-auto text-primary mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">{t("You're invited!")}</h1>
        <p className="text-muted-foreground mb-2">
          {rich(t("You've been invited to join {business} on Lumina Insights"), { business: <strong className="text-foreground">{invite.business_name}</strong> })}
        </p>
        <div className="my-4 inline-block rounded-full bg-primary/20 px-4 py-1.5 text-sm font-bold text-primary capitalize">
          {t(invite.role.charAt(0).toUpperCase() + invite.role.slice(1))}
        </div>
        <p className="text-xs text-muted-foreground">{rich(t('Sign up or sign in with {email}'), { email: <strong>{invite.email}</strong> })}</p>

        <div className="flex flex-col gap-3 mt-6">
          <Button
            onClick={() => navigate(`/signup?token=${token}`)}
            className="h-12 w-full bg-primary font-bold text-white hover:bg-primary/90"
          >
            {t('Accept & Create Account')}
          </Button>
          <Link to={`/login?token=${token}`} className="text-sm font-bold text-primary hover:underline">
            {t('Already have an account? Sign in')}
          </Link>
        </div>
      </div>
    </div>
  );
}
