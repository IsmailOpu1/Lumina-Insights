import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider, useTheme, type FontStyle, type ThemeName } from '@/context/ThemeContext';
import { FilterProvider, useFilter } from '@/context/FilterContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { FABProvider } from '@/context/FABContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppShell from '@/components/AppShell';
import Dashboard from '@/pages/Dashboard';
import Orders from '@/pages/Orders';
import Inventory from '@/pages/Inventory';
import Expenses from '@/pages/Expenses';
import MarketingAI from '@/pages/MarketingAI';
import AIAssistant from '@/pages/AIAssistant';
import Notes from '@/pages/Notes';
import Notifications from '@/pages/Notifications';
import SettingsPage from '@/pages/Settings';
import NotFound from '@/pages/NotFound';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import InvitePage from '@/pages/InvitePage';
import Onboarding from '@/pages/Onboarding';

const queryClient = new QueryClient();

const VALID_FONTS: FontStyle[] = ['inter', 'poppins', 'roboto', 'playfair', 'nunito', 'dmsans'];
const VALID_THEMES: ThemeName[] = ['avocado', 'ocean', 'sunset', 'purple', 'forest', 'rosegold'];

function SettingsBootstrap({ children }: { children: React.ReactNode }) {
  const { toggleDark, setFontStyle, setThemeName, isDark } = useTheme();
  const { setDateFilter } = useFilter();
  const { userSettings } = useAuth();

  useEffect(() => {
    if (!userSettings) return;
    const d = userSettings as unknown as Record<string, unknown>;

    const settingsDark = d.dark_mode as boolean;
    if (settingsDark !== isDark) toggleDark();

    const settingsFont = (d.font_style as string) || 'inter';
    if (VALID_FONTS.includes(settingsFont as FontStyle)) setFontStyle(settingsFont as FontStyle);

    const settingsTheme = (d.theme as string) || 'avocado';
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
