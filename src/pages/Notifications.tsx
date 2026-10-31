import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell, ShoppingBag, AlertTriangle,
  TrendingDown, BarChart3, Mail, X, Trash2, FileUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import SkeletonLoader from '@/components/SkeletonLoader';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/context/NotificationContext';

interface NotifRow {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const TYPE_COLORS: Record<string, string> = {
  new_order: '#10B981',
  cancelled_order: '#F43F5E',
  low_stock: '#F5A524',
  critical_stock: '#F43F5E',
  profit_drop: '#F5A524',
  roas_alert: '#F5A524',
  weekly_summary: '#5EEAD4',
  data_import: '#10B981',
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  new_order: ShoppingBag,
  cancelled_order: ShoppingBag,
  low_stock: AlertTriangle,
  critical_stock: AlertTriangle,
  profit_drop: TrendingDown,
  roas_alert: BarChart3,
  weekly_summary: Mail,
  data_import: FileUp,
};

type FilterTab = 'all' | 'unread' | 'orders' | 'stock' | 'finance';
const TABS: { label: string; value: FilterTab }[] = [
  { label: 'All', value: 'all' },
  { label: 'Unread', value: 'unread' },
  { label: 'Orders', value: 'orders' },
  { label: 'Stock', value: 'stock' },
  { label: 'Finance', value: 'finance' },
];

const PAGE_SIZE = 20;

export default function Notifications() {
  const navigate = useNavigate();
  const { markAllRead, markOneRead, dismiss } = useNotifications();
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>('all');
  const [page, setPage] = useState(1);
  const [clearOpen, setClearOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    // Read/dismissed state is per user (see my_notifications).
    const { data } = await supabase
      .from('my_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    setNotifs((data as NotifRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    let list = notifs;
    switch (tab) {
      case 'unread':
        list = list.filter(n => !n.is_read); break;
      case 'orders':
        list = list.filter(n =>
          ['new_order', 'cancelled_order'].includes(n.type)); break;
      case 'stock':
        list = list.filter(n =>
          ['low_stock', 'critical_stock'].includes(n.type)); break;
      case 'finance':
        list = list.filter(n =>
          ['profit_drop', 'roas_alert', 'weekly_summary']
            .includes(n.type)); break;
    }
    return list;
  }, [notifs, tab]);

  const totalPages = Math.max(
    1, Math.ceil(filtered.length / PAGE_SIZE)
  );
  const paged = filtered.slice(
    (page - 1) * PAGE_SIZE, page * PAGE_SIZE
  );

  async function handleMarkAllRead() {
    await markAllRead();
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success('All marked as read');
  }

  // Clearing hides notifications for this user only, not the whole team.
  async function handleClearAll() {
    await dismiss();
    setNotifs([]);
    toast.success('Cleared ✓');
    setClearOpen(false);
  }

  async function handleMarkRead(id: string) {
    await markOneRead(id);
    setNotifs(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
  }

  async function handleDelete(id: string) {
    await dismiss([id]);
    setNotifs(prev => prev.filter(n => n.id !== id));
  }

  const handleNotifClick = (n: NotifRow) => {
    if (!n.is_read) handleMarkRead(n.id);
    if (['new_order', 'cancelled_order'].includes(n.type)) {
      navigate('/orders');
    } else if (['low_stock', 'critical_stock'].includes(n.type)) {
      navigate('/inventory');
    } else if (['profit_drop', 'roas_alert', 'weekly_summary'].includes(n.type)) {
      navigate('/');
    } else {
      navigate('/notifications');
    }
  };

  return (
    <div>
      {/* FIX 1: Title uses hsl(var(--foreground)) */}
      <h1
        className="mb-5 text-[28px] font-bold"
        style={{ color: 'hsl(var(--foreground))' }}
      >
        Notifications
      </h1>

      {/* FIX 2: Filter tabs + action buttons layout */}
      <div className="mb-4 flex flex-col gap-3">

        {/* Filter tabs row */}
        <div className="flex flex-wrap gap-2">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => { setTab(t.value); setPage(1); }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm transition-colors active:scale-[0.97]',
                tab === t.value
                  ? 'font-bold text-white'
                  : 'border border-border font-extrabold hover:border-primary'
              )}
              style={
                tab === t.value
                  ? { backgroundColor: 'hsl(var(--primary))', color: '#000' }
                  : { color: 'hsl(var(--muted-foreground))' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* FIX 3: Action buttons on same row
            Clear All LEFT, Mark All Read RIGHT */}
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            className="font-bold gap-1"
            style={{
              borderColor: 'rgba(239,68,68,0.3)',
              color: '#F43F5E'
            }}
            onClick={() => setClearOpen(true)}
          >
            <Trash2 className="h-4 w-4" /> Clear All
          </Button>
          <Button
            variant="outline"
            className="font-bold"
            style={{
              borderColor: 'rgba(hsl(var(--primary)),0.3)',
              color: 'hsl(var(--primary))'
            }}
            onClick={handleMarkAllRead}
          >
            Mark All Read
          </Button>
        </div>
      </div>

      {loading ? (
        <SkeletonLoader variant="row" count={6} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell className="mb-4 h-16 w-16 text-muted-foreground/30" />
          <h2
            className="text-xl font-bold"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            You're all caught up 🎉
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            No notifications to show.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {paged.map(n => {
              const borderColor = TYPE_COLORS[n.type] || '#5EEAD4';
              const Icon = TYPE_ICONS[n.type] || Bell;
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={cn(
                    'notif-hover flex items-start gap-3 rounded-lg border border-border p-4 cursor-pointer transition-all',
                    !n.is_read && 'bg-primary/5'
                  )}
                  style={{
                    borderLeftWidth: 4,
                    borderLeftColor: borderColor,
                    backgroundColor: n.is_read
                      ? 'hsl(var(--card))'
                      : undefined,
                  }}
                >
                  {/* Icon circle */}
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: borderColor + '22',
                      color: borderColor
                    }}
                  >
                    <Icon size={18} />
                  </div>

                  {/* FIX 4: Content stacks vertically
                      text wraps properly on mobile */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'text-sm',
                          n.is_read ? 'font-bold' : 'font-extrabold'
                        )}
                        style={{ color: 'hsl(var(--foreground))' }}
                      >
                        {n.title}
                        {!n.is_read && (
                          <span
                            className="ml-2 inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: '#10B981' }}
                          />
                        )}
                      </p>
                      {/* Time + delete on same line as title */}
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className="text-xs whitespace-nowrap"
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          {formatDistanceToNow(
                            new Date(n.created_at),
                            { addSuffix: true }
                          )}
                        </span>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDelete(n.id);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-destructive/15 active:scale-95"
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    {/* Message below title */}
                    <p
                      className="mt-0.5 text-sm font-bold break-words"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      {n.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Prev
              </Button>
              <span
                className="text-sm"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={clearOpen}
        onOpenChange={o => { if (!o) setClearOpen(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear all notifications?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all notifications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
