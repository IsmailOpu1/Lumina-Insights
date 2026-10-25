import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Bell, ChevronRight } from 'lucide-react';
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
  '/settings': 'Settings',
  '/billing': 'Billing',
};

const TYPE_COLORS: Record<string, string> = {
  new_order: '#10B981',
  low_stock: '#F5A524',
  critical_stock: '#F43F5E',
  cancelled_order: '#F43F5E',
  profit_drop: '#F5A524',
  roas_alert: '#60A5FA',
  weekly_summary: '#5EEAD4'
};

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount, notifications, markAllRead, markOneRead } = useNotifications();
  const { isOwner, isManager, isViewer, userSettings } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const avatarInitials = (userSettings?.full_name || userSettings?.business_name || 'U')
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
      notif.type === 'roas_alert' ||
      notif.type === 'weekly_summary'
    ) {
      navigate('/');
    } else {
      navigate('/notifications');
    }
  };

  const role = isOwner ? 'Owner' : isManager ? 'Manager' : isViewer ? 'Viewer' : null;

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
        >
          <Menu size={20} />
        </button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{userSettings?.business_name || 'Lumina'}</span>
          <ChevronRight size={14} className="hidden text-muted-foreground/60 sm:inline" />
          <span className="truncate font-medium text-foreground">{pageTitle}</span>
        </nav>
      </div>

      <div className="relative flex items-center gap-1.5" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((p) => !p)}
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-background">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={() => navigate('/settings')}
          title="Profile and settings"
          className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-secondary"
        >
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-highlight text-[11px] font-semibold text-primary-foreground">
            {userSettings?.avatar_url
              ? <img src={userSettings.avatar_url} alt="" className="h-full w-full object-cover" />
              : avatarInitials}
          </span>
          {role && <span className="hidden text-xs text-muted-foreground sm:inline">{role}</span>}
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full z-[100] mt-2 w-[360px] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/50 max-md:fixed max-md:inset-x-2 max-md:top-14 max-md:w-auto">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs font-medium text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">You're all caught up</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-secondary ${n.is_read ? '' : 'bg-primary/[0.04]'}`}
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: n.is_read ? 'transparent' : TYPE_COLORS[n.type] || '#10B981' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${n.is_read ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground/80">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => { setDropdownOpen(false); navigate('/notifications'); }}
              className="w-full border-t border-border px-4 py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              View all notifications
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
