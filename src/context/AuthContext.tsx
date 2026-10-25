import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { acceptInvite } from '@/lib/invites';

export type UserRole = 'owner' | 'manager' | 'viewer';

export interface UserSettings {
  id: string;
  user_id: string | null;
  owner_id: string | null;
  business_name: string | null;
  business_type: string | null;
  business_description: string | null;
  currency: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  onboarding_complete: boolean | null;
  dark_mode: boolean | null;
  font_style: string | null;
  theme: string | null;
  dashboard_filter: string | null;
  roas_threshold: number | null;
  dead_product_days: number | null;
  notification_preferences: Record<string, boolean> | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userSettings: UserSettings | null;
  isOwner: boolean;
  isManager: boolean;
  isViewer: boolean;
  role: UserRole;
  ownerIdForQueries: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [ownerIdForQueries, setOwnerIdForQueries] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const role: UserRole = (userSettings?.role as UserRole) || 'viewer';
  const isOwner = role === 'owner';
  const isManager = role === 'manager';
  const isViewer = role === 'viewer';

  const fetchSettings = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();

    const settings = data as unknown as UserSettings | null;
    setUserSettings(settings);
    // The database keeps owner_id correct for members (set by
    // accept_team_invite); owners and new users query their own workspace.
    setOwnerIdForQueries(settings && settings.role !== 'owner' && settings.owner_id ? settings.owner_id : uid);
  }, []);

  // An invitee who signed up has the invite token in their metadata; accept it
  // on their first confirmed sign-in, then clear it.
  const acceptPendingInvite = useCallback(async (u: User) => {
    const token = u.user_metadata?.invite_token as string | undefined;
    if (!token) return;
    const message = await acceptInvite(token);
    await supabase.auth.updateUser({ data: { invite_token: null } });
    if (message) toast.error('Could not join the workspace', { description: message });
    else toast.success('You have joined the workspace');
  }, []);

  const loadUser = useCallback(async (u: User) => {
    await acceptPendingInvite(u);
    await fetchSettings(u.id);
  }, [acceptPendingInvite, fetchSettings]);

  // Reads the session directly: right after sign-in the `user` state may not
  // be set yet.
  const refreshSettings = useCallback(async () => {
    const { data: { session: current } } = await supabase.auth.getSession();
    if (current) await fetchSettings(current.user.id);
  }, [fetchSettings]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserSettings(null);
    setOwnerIdForQueries(null);
  }, []);

  useEffect(() => {
    // Set up auth listener FIRST (Supabase recommended pattern)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          // Check if email is confirmed, sign out if not
          if (event === 'SIGNED_IN' && !newSession.user.email_confirmed_at) {
            supabase.auth.signOut();
            setUser(null);
            setSession(null);
            setUserSettings(null);
            setOwnerIdForQueries(null);
            setLoading(false);
            return;
          }
          // Token refreshes don't change settings; skip the refetch.
          if (event === 'TOKEN_REFRESHED') return;
          // Hold protected routes on the loader until settings arrive, so a
          // fresh sign-in is not mistaken for "no settings → onboarding".
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setLoading(true);
          // Supabase calls made inside this callback can deadlock the auth
          // client, so defer them to the next tick.
          const u = newSession.user;
          setTimeout(() => {
            loadUser(u).finally(() => setLoading(false));
          }, 0);
        } else {
          setUserSettings(null);
          setOwnerIdForQueries(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadUser]);

  return (
    <AuthContext.Provider
      value={{
        user, session, userSettings,
        isOwner, isManager, isViewer, role,
        ownerIdForQueries, loading,
        signOut, refreshSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
