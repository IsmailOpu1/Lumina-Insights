import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resendConfirmation } from '@/lib/authEmail';
import { useT } from '@/i18n';

const COOLDOWN_SECONDS = 60;

/** Sends the confirmation email (new code and link) again, with a short cooldown. */
export default function ResendConfirmation({ email }: { email: string }) {
  const { t } = useT();
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const resend = async () => {
    setSending(true);
    const error = await resendConfirmation(email);
    setSending(false);
    if (error) {
      toast.error(t("Couldn't send the email"), { description: error });
      return;
    }
    toast.success(t('New code sent'), { description: t('Check {email}, including the spam folder. Only the newest code works.', { email: email.trim() }) });
    setWait(COOLDOWN_SECONDS);
  };

  return (
    <Button type="button" variant="outline" onClick={resend} disabled={sending || wait > 0 || !email.trim()} className="h-11 w-full">
      {sending ? <Loader2 className="animate-spin" size={18} /> : wait > 0 ? t('Send again in {n}s', { n: wait }) : t('Send a new code')}
    </Button>
  );
}
