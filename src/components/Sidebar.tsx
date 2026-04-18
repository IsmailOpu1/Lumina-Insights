import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingBag, Package, Receipt, Sparkles,
  Bot, StickyNote, Bell, Settings, Sun, Moon, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useMemo } from 'react';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Orders', path: '/orders', icon: ShoppingBag },
  { label: 'Inventory', path: '/inventory', icon: Package },
  { label: 'Expenses', path: '/expenses', icon: Receipt },
  { label: 'Marketing AI', path: '/marketing-ai', icon: Sparkles },
  { label: 'AI Assistant', path: '/ai-assistant', icon: Bot },
  { label: 'Notes', path: '/notes', icon: StickyNote },
  { label: 'Notifications', path: '/notifications', icon: Bell },
  { label: 'Settings', path: '/settings', icon: Settings },
];

function getInitialCollapsed() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('lumina_sidebar_collapsed') === 'true';
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleDark } = useTheme();
  const { isViewer } = useAuth();
  const { unreadCount } = useNotifications();
  const isMobile = useIsMobile();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const navItems = useMemo(() => {
    if (isViewer) {
      return NAV_ITEMS.filter(item => item.label !== 'Settings');
    }
    return NAV_ITEMS;
  }, [isViewer]);

  const handleNav = (path: string) => {
    navigate(path);
    if (isMobile) onClose();
  };

  const isCollapsed = !isMobile && collapsed;
  const sidebarWidth = isCollapsed ? 64 : 240;

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && open && (
        <div
          className="fixed inset-0 z-40 transition-opacity duration-300"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
  flex h-full flex-col border-r border-sidebar-border
  transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
  ${isMobile
    ? `fixed top-0 left-0 z-50 w-60 ${open ? 'translate-x-0' : '-translate-x-full'}`
    : 'relative z-auto translate-x-0 shrink-0'
  }
`}
        style={{
          willChange: 'transform, width',
          backgroundColor: 'var(--sidebar-bg)',
          width: isMobile ? 240 : sidebarWidth,
        }}
      >
        {/* Collapse toggle - desktop only */}
        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-[60] flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110"
            style={{
              backgroundColor: 'var(--sidebar-bg)',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {isCollapsed
              ? <ChevronRight size={14} className="text-white/80" />
              : <ChevronLeft size={14} className="text-white/80" />
            }
          </button>
        )}

        {/* Logo */}
        <div
          className="flex items-center px-4 rounded-none shadow py-[18px] gap-[5px] overflow-hidden"
          style={{ backgroundColor: 'var(--sidebar-bg)', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
        >
          <img
            src="/icon.png"
            alt="Lumina Insights"
            style={{ width: isCollapsed ? 28 : 36, height: isCollapsed ? 28 : 36, transition: 'all 300ms' }}
          />
          <span
            className="font-extrabold font-serif text-lg whitespace-nowrap text-fuchsia-300"
            style={{
              opacity: isCollapsed ? 0 : 1,
              width: isCollapsed ? 0 : 'auto',
              overflow: 'hidden',
              transition: 'opacity 150ms ease 150ms, width 200ms ease',
            }}
          >
            Lumina Insights
          </span>
        </div>

        {/* Nav */}
        <nav
          className="flex-1 space-y-0.5 overflow-y-auto px-[10px] rounded-none border-0 border-none shadow-none py-2"
          style={{ backgroundColor: 'var(--sidebar-bg)' }}
        >
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            const Icon = item.icon;
            const isBell = item.label === 'Notifications';

            return (
              <div key={item.path} className="relative">
                <button
                  onClick={() => handleNav(item.path)}
                  onMouseEnter={() => setHoveredItem(item.path)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`
                    group relative flex w-full items-center rounded-lg transition-all duration-150
                    active:scale-[0.97]
                    ${isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'}
                    ${active
                      ? 'bg-white/10 font-bold text-sm border-l-[3px]'
                      : 'text-sidebar-foreground hover:bg-white/[0.08] font-extrabold text-base border-l-[3px] border-transparent'
                    }
                  `}
                  style={active ? { borderLeftColor: 'var(--accent-color)' } : undefined}
                >
                  <Icon
                    size={isCollapsed ? 20 : 18}
                    className="transition-transform duration-150 group-hover:scale-110 text-[#73e600]/[0.81]"
                    style={active ? { transform: 'scale(1.05)' } : undefined}
                  />
                  {!isCollapsed && (
                    <span className="border-0 text-sm font-sans rounded-3xl font-extrabold whitespace-nowrap text-[#fbd0e8]/[0.73]">
                      {item.label}
                    </span>
                  )}
                  {!isCollapsed && isBell && unreadCount > 0 && (
                    <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                  {isCollapsed && isBell && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Tooltip - collapsed desktop only */}
                {isCollapsed && hoveredItem === item.path && (
                  <div
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-[100] whitespace-nowrap animate-in fade-in duration-150"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.8)',
                      color: 'white',
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: 6,
                      padding: '4px 8px',
                    }}
                  >
                    {item.label}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom toggle */}
        <div
          className="border-t px-4 py-3 shadow rounded-none"
          style={{
            backgroundColor: 'var(--sidebar-bg)',
            borderColor: 'var(--sidebar-bg)',
            padding: isCollapsed ? '12px 8px' : undefined,
          }}
        >
          <button
            onClick={toggleDark}
            className={`flex w-full items-center justify-center rounded-full bg-sidebar-accent text-sm font-bold text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent/80 active:scale-[0.97] ${isCollapsed ? 'py-2.5 px-0' : 'gap-2 py-2.5'}`}
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
            {!isCollapsed && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

export { getInitialCollapsed };
