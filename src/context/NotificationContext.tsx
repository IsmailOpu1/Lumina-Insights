import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refreshCount = useCallback(async () => {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);
    setUnreadCount(count ?? 0);
  }, []);

  const fetchRecent = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setNotifications(data as Notification[]);
  }, []);

  const markAllRead = useCallback(async () => {
    await supabase.from('notifications').update({ is_read: true } as never).eq('is_read', false);
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, []);

  const markOneRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_read: true } as never).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  useEffect(() => {
    refreshCount();
    fetchRecent();

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const newNotif = payload.new as Notification;
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
  }, [refreshCount, fetchRecent]);

  return (
    <NotificationContext.Provider value={{ unreadCount, notifications, markAllRead, refreshCount, markOneRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
