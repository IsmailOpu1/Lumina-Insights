import { Suspense, useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import FAB from '@/components/FAB';
import GlobalOrderModal from '@/components/modals/GlobalOrderModal';
import GlobalExpenseModal from '@/components/modals/GlobalExpenseModal';
import GlobalProductModal from '@/components/modals/GlobalProductModal';
import PageLoader from '@/components/PageLoader';
import SubscriptionBanner from '@/components/SubscriptionBanner';

const SIDEBAR_COLLAPSED_KEY = 'lumina_sidebar_collapsed';

function getInitialCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  const handleToggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);


  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen((p) => !p)} />
        <SubscriptionBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 text-foreground animate-in fade-in duration-200">
          {/* Keeps the sidebar and top bar on screen while a page loads. */}
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <FAB />
      <GlobalOrderModal />
      <GlobalExpenseModal />
      <GlobalProductModal />
    </div>
  );
}
