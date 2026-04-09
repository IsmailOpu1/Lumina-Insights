import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar, { getInitialCollapsed } from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import FAB from '@/components/FAB';
import GlobalOrderModal from '@/components/modals/GlobalOrderModal';
import GlobalExpenseModal from '@/components/modals/GlobalExpenseModal';
import GlobalProductModal from '@/components/modals/GlobalProductModal';
import { useIsMobile } from '@/hooks/use-mobile';

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const isMobile = useIsMobile();

  const handleToggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('lumina_sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  const contentMargin = isMobile ? 0 : (collapsed ? 64 : 240);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      <div
      className="flex flex-1 flex-col overflow-hidden min-w-0 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ marginLeft: isMobile ? 0 : 0 }}
      >
            <Topbar onMenuClick={() => setSidebarOpen((p) => !p)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 text-card-foreground animate-in fade-in duration-200" style={{ backgroundColor: 'var(--page-bg)' }}>
          <Outlet />
        </main>
      </div>
      <FAB />
      <GlobalOrderModal />
      <GlobalExpenseModal />
      <GlobalProductModal />
    </div>
  );
}
