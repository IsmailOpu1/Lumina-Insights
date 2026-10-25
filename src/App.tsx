import { lazy, Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider, useTheme, THEMES, type FontStyle, type ThemeName } from '@/context/ThemeContext';
import { FilterProvider, useFilter } from '@/context/FilterContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { FABProvider } from '@/context/FABContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/AppShell';
import PageLoader from '@/components/PageLoader';

// Each page is its own chunk, downloaded the first time it is opened.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Orders = lazy(() => import('@/pages/Orders'));
const Inventory = lazy(() => import('@/pages/Inventory'));
const Expenses = lazy(() => import('@/pages/Expenses'));
const MarketingAI = lazy(() => import('@/pages/MarketingAI'));
const AIAssistant = lazy(() => import('@/pages/AIAssistant'));
const Notes = lazy(() => import('@/pages/Notes'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const Login = lazy(() => import('@/pages/Login'));
const Signup = lazy(() => import('@/pages/Signup'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const InvitePage = lazy(() => import('@/pages/InvitePage'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));

const queryClient = new QueryClient();

const VALID_FONTS: FontStyle[] = ['inter', 'poppins', 'roboto', 'playfair', 'nunito', 'dmsans'];
const VALID_THEMES = Object.keys(THEMES) as ThemeName[];

// Dark mode is synced from settings by ThemeProvider itself.
function SettingsBootstrap({ children }: { children: React.ReactNode }) {
  const { setFontStyle, setThemeName } = useTheme();
  const { setDateFilter } = useFilter();
  const { userSettings } = useAuth();

  useEffect(() => {
    if (!userSettings) return;
    const d = userSettings as unknown as Record<string, unknown>;

    const settingsFont = (d.font_style as string) || 'inter';
    if (VALID_FONTS.includes(settingsFont as FontStyle)) setFontStyle(settingsFont as FontStyle);

    const settingsTheme = (d.theme as string) || 'purple';
    if (VALID_THEMES.includes(settingsTheme as ThemeName)) setThemeName(settingsTheme as ThemeName);

    const settingsFilter = (d.dashboard_filter as string) || '7days';
    if (['today', '7days', '30days'].includes(settingsFilter)) {
      setDateFilter(settingsFilter as 'today' | '7days' | '30days');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSettings]);

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <FilterProvider>
          <NotificationProvider>
            <FABProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner position="bottom-right" />
                <BrowserRouter>
                  <SettingsBootstrap>
                    <Suspense fallback={<PageLoader fullScreen />}>
                    <Routes>
                      {/* Public routes */}
                      <Route path="/login" element={<Login />} />
                      <Route path="/signup" element={<Signup />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/invite/:token" element={<InvitePage />} />
                      <Route path="/onboarding" element={<Onboarding />} />

                      {/* Protected routes */}
                      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/orders" element={<Orders />} />
                        <Route path="/inventory" element={<Inventory />} />
                        <Route path="/expenses" element={<Expenses />} />
                        <Route path="/marketing-ai" element={<MarketingAI />} />
                        <Route path="/ai-assistant" element={<AIAssistant />} />
                        <Route path="/notes" element={<Notes />} />
                        <Route path="/notifications" element={<Notifications />} />
                        <Route path="/settings" element={<SettingsPage />} />
                      </Route>
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                    </Suspense>
                  </SettingsBootstrap>
                </BrowserRouter>
              </TooltipProvider>
            </FABProvider>
          </NotificationProvider>
        </FilterProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
