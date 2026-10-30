import { supabase } from '@/integrations/supabase/client';
import { dbErrorMessage } from '@/lib/dbErrors';
import { siteUrl } from '@/lib/siteUrl';

export type InviteRole = 'manager' | 'viewer';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export function inviteLink(token: string) {
  return `${siteUrl()}/invite/${token}`;
}

/**
 * Creates an invite row and asks the send-invite-email function to email it.
 * The link is returned either way so the owner can share it manually if the
 * email could not be sent.
 */
export async function createInvite(ownerId: string, email: string, role: InviteRole) {
  const token = crypto.randomUUID();
  const { data, error } = await supabase
    .from('invites')
    .insert({
      owner_id: ownerId,
      email: email.trim().toLowerCase(),
      role,
      token,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    })
    .select('id')
    .single();

  if (error) return { error: dbErrorMessage(error.message), link: null, emailed: false };

  const { error: emailError } = await supabase.functions.invoke('send-invite-email', {
    body: { invite_id: data.id },
  });

  return { error: null, link: inviteLink(token), emailed: !emailError };
}

const ACCEPT_ERRORS: Record<string, string> = {
  invite_not_found_or_used: 'This invite link is invalid or has already been used.',
  invite_expired: 'This invite has expired. Ask the workspace owner for a new one.',
  invite_email_mismatch: 'This invite was sent to a different email address. Sign in with the invited email.',
  already_owns_workspace: 'Your account already owns a workspace, so it cannot join another one.',
  cannot_join_own_workspace: 'You cannot accept an invite to your own workspace.',
  not_authenticated: 'Please sign in to accept the invite.',
};

export async function acceptInvite(token: string): Promise<string | null> {
  const { error } = await supabase.rpc('accept_team_invite', { p_token: token });
  if (!error) return null;
  const code = Object.keys(ACCEPT_ERRORS).find((k) => error.message.includes(k));
  return code ? ACCEPT_ERRORS[code] : error.message;
}
