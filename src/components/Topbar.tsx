import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Bell } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';
import { useAuth } from '@/context/AuthContext';
import { formatDistanceToNow } from 'date-fns';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/orders': 'Orders',
  '/inventory': 'Inventory',
  '/expenses': 'Expenses',
  '/marketing-ai': 'Marketing AI',
  '/ai-assistant': 'AI Assistant',
  '/notes': 'Notes',
  '/notifications': 'Notifications',
  '/settings': 'Settings'
};

const TYPE_COLORS: Record<string, string> = {
  new_order: '#10B981',
  low_stock: '#F59E0B',
  critical_stock: '#EF4444',
  cancelled_order: '#EF4444',
  profit_drop: '#F59E0B',
  roas_alert: '#3B82F6',
  weekly_summary: '#6366F1'
};

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount, notifications, markAllRead, markOneRead } = useNotifications();
  const { userSettings } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const avatarInitials = (userSettings?.user_full_name || userSettings?.business_name || 'U')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const pageTitle =
    ROUTE_TITLES[location.pathname] || 'Lumina Insights';

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen)
      document.addEventListener('mousedown', handleClick);
    return () =>
      document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const handleNotifClick = async (
    notif: (typeof notifications)[0]
  ) => {
    await markOneRead(notif.id);
    setDropdownOpen(false);
    if (notif.type === 'new_order') {
      navigate('/orders');
    } else if (
      notif.type === 'low_stock' ||
      notif.type === 'critical_stock'
    ) {
      navigate('/inventory');
    } else if (
      notif.type === 'profit_drop' ||
      notif.type === 'roas_alert'
    ) {
      navigate('/');
    } else {
      navigate('/notifications');
    }
  };

  return (
    <header
      className="sticky top-0 z-40 flex h-[60px] items-center justify-between border-b px-4 shadow-xl rounded-none"
      style={{
        backgroundColor: 'var(--topbar-bg)',
        borderColor: 'var(--topbar-bg)',
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        {/* FIX 1: Menu icon uses var(--text-primary) */}
        <button
          onClick={onMenuClick}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-white/10 md:hidden active:scale-95"
          style={{ color: 'var(--text-primary)' }}
        >
          <Menu size={22} />
        </button>

        {/* FIX 2: Page titles use var(--text-primary) */}
        <h1
          className="hidden text-xl font-bold md:block"
          style={{ color: 'var(--text-primary)' }}
        >
          {pageTitle}
        </h1>
        <h1
          className="text-lg font-bold md:hidden"
          style={{ color: 'var(--text-primary)' }}
        >
          {pageTitle}
        </h1>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2" ref={dropdownRef}>
        {/* User avatar */}
        <button
          onClick={() => navigate('/settings')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white transition-transform hover:scale-105"
          style={{ backgroundColor: 'var(--accent-color)' }}
          title="Profile & Settings"
        >
          {userSettings?.avatar_url ? (
            <img src={userSettings.avatar_url} alt="Avatar" className="h-full w-full rounded-full object-cover" />
          ) : (
            avatarInitials
          )}
        </button>

        {/* Bell — FIX 3: uses var(--text-primary) */}
        <button
          onClick={() => setDropdownOpen((p) => !p)}
          className="relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-white/10 active:scale-95"
          style={{ color: 'var(--text-primary)' }}
        >
          <Bell size={22} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Notification dropdown */}
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-[360px] max-md:w-screen rounded-xl border border-border bg-card shadow-xl overflow-hidden z-[100]">
            <div
              className="flex items-center justify-between border-b border-border px-4 py-3"
              style={{ backgroundColor: 'var(--card-bg)' }}
            >
              <span
                className="text-[15px] font-bold"
                style={{ color: 'var(--accent-color)' }}
              >
                Notifications
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-sm font-bold hover:underline"
                  style={{ color: 'var(--accent-color)' }}
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                  style={{ backgroundColor: 'var(--chart-card-bg)' }}
                >
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => {
                  const borderColor =
                    TYPE_COLORS[n.type] || '#6366F1';
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={`flex w-full items-start gap-3 border-l-[3px] px-4 py-3 text-left transition-colors hover:bg-white/5 ${
                        n.is_read ? '' : 'bg-primary/5'
                      }`}
                      style={{ borderLeftColor: borderColor }}
                    >
                      <div
                        className="mt-1 h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: borderColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${
                            n.is_read ? 'font-medium' : 'font-bold'
                          } truncate`}
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {n.title}
                        </p>
                        <p
                          className="line-clamp-2 text-sm font-extrabold"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {n.message}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {formatDistanceToNow(
                          new Date(n.created_at),
                          { addSuffix: true }
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div
              className="border-t border-border px-4 py-2.5"
              style={{ backgroundColor: 'var(--card-bg)' }}
            >
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  navigate('/notifications');
                }}
                className="w-full text-center text-sm font-extrabold hover:underline"
                style={{ color: 'var(--accent-color)' }}
              >
                View all notifications →
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
