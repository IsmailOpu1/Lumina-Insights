import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'owner' | 'manager' | 'viewer';

export interface UserSettings {
  id: string;
  user_id: string | null;
  owner_id: string | null;
  business_name: string | null;
  business_type: string | null;
  business_description: string | null;
  currency: string | null;
  user_full_name: string | null;
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

  const role: UserRole = (userSettings?.role as UserRole) || 'owner';
  const isOwner = role === 'owner';
  const isManager = role === 'manager';
  const isViewer = role === 'viewer';

  const fetchSettings = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();

    if (data) {
      setUserSettings(data as unknown as UserSettings);
      // Determine ownerIdForQueries
      if ((data as any).role === 'owner') {
        setOwnerIdForQueries(uid);
      } else {
        // Team member - fetch owner_id from team_members
        const { data: teamRow } = await supabase
          .from('team_members')
          .select('owner_id')
          .eq('member_id', uid)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        setOwnerIdForQueries(teamRow?.owner_id || uid);
      }
    } else {
      setUserSettings(null);
      setOwnerIdForQueries(uid);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    if (user) await fetchSettings(user.id);
  }, [user, fetchSettings]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserSettings(null);
    setOwnerIdForQueries(null);
  }, []);

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(() => fetchSettings(newSession.user.id), 0);
        } else {
          setUserSettings(null);
          setOwnerIdForQueries(null);
        }
        setLoading(false);
      }
    );

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchSettings(s.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchSettings]);

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
