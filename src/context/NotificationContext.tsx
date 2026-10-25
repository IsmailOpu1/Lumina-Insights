import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationContextType {
  unreadCount: number;
  notifications: Notification[];
  markAllRead: () => Promise<void>;
  refreshCount: () => Promise<void>;
  markOneRead: (id: string) => Promise<void>;
  dismiss: (ids?: string[]) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const TYPE_COLORS: Record<string, string> = {
  new_order: '#10B981',
  low_stock: '#F59E0B',
  critical_stock: '#EF4444',
  cancelled_order: '#EF4444',
  profit_drop: '#F59E0B',
  roas_alert: '#3B82F6',
  weekly_summary: '#6366F1',
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, ownerIdForQueries } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // my_notifications carries this user's own read/dismissed state, so every
  // team member (viewers included) keeps their own unread count.
  const refreshCount = useCallback(async () => {
    if (!ownerIdForQueries) return;
    const { count } = await supabase
      .from('my_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('owner_id', ownerIdForQueries);
    setUnreadCount(count ?? 0);
  }, [ownerIdForQueries]);

  const fetchRecent = useCallback(async () => {
    if (!ownerIdForQueries) return;
    const { data } = await supabase
      .from('my_notifications')
      .select('*')
      .eq('owner_id', ownerIdForQueries)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setNotifications(data as Notification[]);
  }, [ownerIdForQueries]);

  const markAllRead = useCallback(async () => {
    await supabase.rpc('mark_notifications_read', {});
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, []);

  const markOneRead = useCallback(async (id: string) => {
    await supabase.rpc('mark_notifications_read', { p_ids: [id] });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  // Hides notifications for this user only; omit ids to hide all of them.
  const dismiss = useCallback(async (ids?: string[]) => {
    await supabase.rpc('dismiss_notifications', ids ? { p_ids: ids } : {});
    setNotifications((prev) => (ids ? prev.filter((n) => !ids.includes(n.id)) : []));
    await refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!ownerIdForQueries) return;
    refreshCount();
    fetchRecent();

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `owner_id=eq.${ownerIdForQueries}`
        },
        (payload) => {
          // New rows have no per-user state yet, so they start unread.
          const newNotif = { ...(payload.new as Notification), is_read: false };
          setNotifications((prev) => [newNotif, ...prev].slice(0, 10));
          setUnreadCount((c) => c + 1);

          const borderColor = TYPE_COLORS[newNotif.type] || '#6366F1';
          toast(newNotif.title, {
            description: newNotif.message,
            duration: 4000,
            style: {
              borderLeft: `4px solid ${borderColor}`,
            },
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [refreshCount, fetchRecent, ownerIdForQueries]);

  return (
    <NotificationContext.Provider value={{ unreadCount, notifications, markAllRead, refreshCount, markOneRead, dismiss }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
