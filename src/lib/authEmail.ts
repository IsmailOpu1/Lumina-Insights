import { supabase } from '@/integrations/supabase/client';
import { siteUrl } from '@/lib/siteUrl';

interface AuthErrorLike {
  code?: string;
  message: string;
}

/** True when sign-in failed only because the email isn't confirmed yet. */
export function isUnconfirmed(error: AuthErrorLike) {
  return error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message);
}

/** Supabase's sign-up and email errors in words a shop owner understands. */
export function authEmailErrorMessage(error: AuthErrorLike) {
  const { code = '', message } = error;
  if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(message)) {
    return "We've sent a lot of emails in the last hour and hit our sending limit. Please try again in about an hour.";
  }
  if (code === 'over_request_rate_limit' || /only request this after|too many requests/i.test(message)) {
    return 'Please wait a minute before asking for another email.';
  }
  if (code === 'email_address_not_authorized' || /not authorized/i.test(message)) {
    return "We couldn't send an email to this address right now. Please try again later or contact support.";
  }
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(message)) {
    return 'That email address looks incorrect. Please check it and try again.';
  }
  if (code === 'user_already_exists' || /already registered/i.test(message)) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (code === 'weak_password' || /password/i.test(message)) {
    return 'Please choose a stronger password: at least 8 characters, ideally with a number and a symbol.';
  }
  return message;
}

/** Sends the sign-up confirmation email again. Returns an error message, or null. */
export async function resendConfirmation(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: `${siteUrl()}/login` },
  });
  return error ? authEmailErrorMessage(error) : null;
}
