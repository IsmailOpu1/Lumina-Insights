import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingBag, Package, Receipt, Sparkles,
  Bot, StickyNote, Bell, Settings, CreditCard, ChevronLeft, ChevronRight, FileUp
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import UserAvatar from './UserAvatar';

const NAV_GROUPS = [
  {
    label: 'Business',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Orders', path: '/orders', icon: ShoppingBag },
      { label: 'Inventory', path: '/inventory', icon: Package },
      { label: 'Expenses', path: '/expenses', icon: Receipt },
    ],
  },
  {
    label: 'AI tools',
    items: [
      { label: 'Marketing AI', path: '/marketing-ai', icon: Sparkles },
      { label: 'AI Assistant', path: '/ai-assistant', icon: Bot },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Import data', path: '/import', icon: FileUp },
      { label: 'Notes', path: '/notes', icon: StickyNote },
      { label: 'Notifications', path: '/notifications', icon: Bell },
      { label: 'Billing', path: '/billing', icon: CreditCard },
      { label: 'Settings', path: '/settings', icon: Settings },
    ],
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isViewer, isOwner, userSettings } = useAuth();
  const { unreadCount } = useNotifications();
  const isMobile = useIsMobile();

  // Billing is owner-only; viewers also don't get Settings.
  const groups = useMemo(
    () => NAV_GROUPS.map(g => ({
      ...g,
      items: g.items.filter(item =>
        (item.label !== 'Billing' || isOwner) && (item.label !== 'Settings' || !isViewer)
        && (item.label !== 'Import data' || !isViewer)),
    })),
    [isViewer, isOwner]
  );

  const handleNav = (path: string) => {
    navigate(path);
    if (isMobile) onClose();
  };

  const isCollapsed = !isMobile && collapsed;

  return (
    <>
      {isMobile && open && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      )}

      <aside
        className={cn(
          'flex h-full flex-col border-r border-border bg-sidebar transition-[width,transform] duration-300 ease-in-out',
          isMobile
            ? cn('fixed left-0 top-0 z-50 w-60', open ? 'translate-x-0' : '-translate-x-full')
            : cn('relative shrink-0', isCollapsed ? 'w-16' : 'w-60'),
        )}
      >
        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute -right-3 top-[68px] z-[60] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}

        {/* Logo */}
        <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4', isCollapsed && 'justify-center px-0')}>
          <img src="/icon.png" alt="Lumina Insights" className="h-8 w-8 shrink-0 rounded-lg" />
          {!isCollapsed && (
            <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-foreground">
              Lumina <span className="text-gradient">Insights</span>
            </span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-4">
          {groups.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              {!isCollapsed && (
                <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  const Icon = item.icon;
                  const showCount = item.label === 'Notifications' && unreadCount > 0;
                  return (
                    <li key={item.path}>
                      <button
                        onClick={() => handleNav(item.path)}
                        title={isCollapsed ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group relative flex w-full items-center rounded-lg text-sm transition-colors',
                          isCollapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2',
                          active
                            ? 'bg-primary/10 font-medium text-foreground'
                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-glow" />
                        )}
                        <Icon size={18} className={cn('shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                        {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                        {showCount && !isCollapsed && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                        {showCount && isCollapsed && (
                          <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Business card */}
        {!isCollapsed && userSettings?.business_name && (
          <div className="border-t border-border p-3">
            <button onClick={() => handleNav('/settings#profile')} disabled={isViewer} className="flex w-full disabled:pointer-events-none items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary">
              <UserAvatar className="h-8 w-8 text-xs" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{userSettings.business_name}</p>
                <p className="truncate text-xs text-muted-foreground">{isOwner ? 'Owner' : isViewer ? 'Viewer' : 'Manager'}</p>
              </div>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
