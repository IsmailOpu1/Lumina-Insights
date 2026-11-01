import { supabase } from '@/integrations/supabase/client';

/**
 * Remembers which account opened a password-reset link. Supabase signs the
 * link's account in and fires PASSWORD_RECOVERY while the app starts, before
 * the lazily loaded reset page mounts, so the listener is set up at startup.
 * The reset page only offers a new password for this account; without it, it
 * would change the password of whoever is signed in on the browser.
 */
let recoveryEmail: string | null = null;

export function watchPasswordRecovery() {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') recoveryEmail = session?.user.email ?? null;
    else if (event === 'SIGNED_OUT') recoveryEmail = null;
  });
}

export function passwordRecoveryEmail() {
  return recoveryEmail;
}

export function clearPasswordRecovery() {
  recoveryEmail = null;
}
