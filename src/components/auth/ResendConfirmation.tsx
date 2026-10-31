import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resendConfirmation } from '@/lib/authEmail';

const COOLDOWN_SECONDS = 60;

/** "Send it again" for the sign-up confirmation email, with a short cooldown. */
export default function ResendConfirmation({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const resend = async () => {
    setSending(true);
    const error = await resendConfirmation(email);
    setSending(false);
    if (error) {
      toast.error("Couldn't send the email", { description: error });
      return;
    }
    toast.success('Confirmation email sent', { description: `Check ${email.trim()}, including the spam folder.` });
    setWait(COOLDOWN_SECONDS);
  };

  return (
    <Button type="button" variant="outline" onClick={resend} disabled={sending || wait > 0 || !email.trim()} className="h-11 w-full">
      {sending ? <Loader2 className="animate-spin" size={18} /> : wait > 0 ? `Send again in ${wait}s` : 'Resend confirmation email'}
    </Button>
  );
}
