import { Suspense, useState, useCallback, useEffect } from 'react';
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

// Once the app is on screen, fetch the other pages' code in the background so
// opening them later doesn't wait on a download.
function preloadPages() {
  void Promise.allSettled([
    import('@/pages/Dashboard'),
    import('@/pages/Orders'),
    import('@/pages/Inventory'),
    import('@/pages/Expenses'),
    import('@/pages/Insights'),
    import('@/pages/ProfitCalculator'),
    import('@/pages/AIAssistant'),
    import('@/pages/MarketingAI'),
    import('@/pages/Notes'),
    import('@/pages/Notifications'),
    import('@/pages/Settings'),
    import('@/pages/Billing'),
    import('@/pages/ImportData'),
  ]);
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

  useEffect(() => {
    // Skipped when Data Saver is on; pages then load the first time they open.
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(preloadPages);
    return () => cancel(id);
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
