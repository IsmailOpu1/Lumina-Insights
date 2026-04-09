import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<any>(null);
  const [expired, setExpired] = useState(false);
  const [businessName, setBusinessName] = useState('');

  useEffect(() => {
    async function fetch() {
      if (!token) { setLoading(false); setExpired(true); return; }
      const { data } = await supabase
        .from('invites')
        .select('*')
        .eq('token', token)
        .eq('used', false)
        .maybeSingle();

      if (!data || new Date(data.expires_at) < new Date()) {
        setExpired(true);
      } else {
        setInvite(data);
        // Fetch business name
        const { data: settings } = await supabase
          .from('user_settings')
          .select('business_name')
          .eq('user_id', data.owner_id)
          .maybeSingle();
        setBusinessName(settings?.business_name || 'a business');
      }
      setLoading(false);
    }
    fetch();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--page-bg, #1a1a2e)' }}>
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: 'var(--page-bg, #1a1a2e)' }}>
        <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl text-center">
          <AlertTriangle size={48} className="mx-auto text-destructive mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Invite Expired</h1>
          <p className="text-muted-foreground mb-6">This invite link has expired or already been used. Please contact the workspace owner for a new invite.</p>
          <Link to="/login" className="text-sm font-bold text-[#4A7C59] hover:underline">Go to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: 'var(--page-bg, #1a1a2e)' }}>
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-10 shadow-2xl text-center">
        <Sparkles size={40} className="mx-auto text-[#F0B429] mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">You're invited!</h1>
        <p className="text-muted-foreground mb-2">
          You've been invited to join <strong className="text-foreground">{businessName}</strong> on Lumina Insights
        </p>
        <div className="my-4 inline-block rounded-full bg-[#F0B429]/20 px-4 py-1.5 text-sm font-bold text-[#F0B429] capitalize">
          {invite?.role || 'viewer'}
        </div>

        <div className="flex flex-col gap-3 mt-6">
          <Button
            onClick={() => navigate(`/signup?token=${token}`)}
            className="h-12 w-full bg-[#4A7C59] font-bold text-white hover:bg-[#3d6a4b]"
          >
            Accept & Create Account
          </Button>
          <Link to={`/login?token=${token}`} className="text-sm font-bold text-[#4A7C59] hover:underline">
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
