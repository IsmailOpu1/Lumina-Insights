import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useTheme, FONT_FAMILIES, FONT_LABELS, THEMES, type FontStyle, type ThemeName } from '@/context/ThemeContext';
import { useNotifications } from '@/context/NotificationContext';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import SkeletonLoader from '@/components/SkeletonLoader';
import { Download, Loader2, Check, Palette, Type, LayoutDashboard, Gauge, Bell, Database, Pencil, LogOut, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { todaySuffix } from '@/lib/xlsxExport';
import { format as fnsFormat } from 'date-fns';

interface NotifPrefs {
  new_order: boolean;
  cancelled_order: boolean;
  low_stock: boolean;
  critical_stock: boolean;
  profit_drop: boolean;
  roas_alert: boolean;
  weekly_summary: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  new_order: true, cancelled_order: true, low_stock: true,
  critical_stock: true, profit_drop: true, roas_alert: true, weekly_summary: true,
};

const PREF_LABELS: Record<keyof NotifPrefs, string> = {
  new_order: 'New Order', cancelled_order: 'Cancelled Order',
  low_stock: 'Low Stock', critical_stock: 'Critical Stock',
  profit_drop: 'Profit Drop', roas_alert: 'ROAS Alerts', weekly_summary: 'Weekly Summary',
};

const FONT_OPTIONS: FontStyle[] = ['inter', 'poppins', 'roboto', 'playfair', 'nunito', 'dmsans'];
const THEME_OPTIONS: ThemeName[] = ['avocado', 'ocean', 'sunset', 'purple', 'forest', 'rosegold'];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, userSettings, isOwner, signOut, refreshSettings } = useAuth();
  const { isDark, toggleDark, fontStyle, setFontStyle, themeName, setThemeName } = useTheme();
  const { refreshCount } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [dashboardFilter, setDashboardFilter] = useState('7days');
  const [roasThreshold, setRoasThreshold] = useState('2.0');
  const [deadDays, setDeadDays] = useState('30');
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [businessName, setBusinessName] = useState(userSettings?.business_name || 'My Business');
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
    if (data) {
      setSettingsId(data.id);
      setDashboardFilter(data.dashboard_filter || '7days');
      setRoasThreshold(String(data.roas_threshold ?? 2.0));
      setDeadDays(String(data.dead_product_days ?? 30));
      setBusinessName(data.business_name || 'My Business');
      if (data.notification_preferences) setNotifPrefs({ ...DEFAULT_PREFS, ...(data.notification_preferences as Record<string, boolean>) });
      if (data.font_style && data.font_style !== fontStyle) {
        setFontStyle(data.font_style as FontStyle);
      }
      const dbTheme = (data as any).theme as string;
      if (dbTheme && dbTheme !== themeName && THEME_OPTIONS.includes(dbTheme as ThemeName)) {
        setThemeName(dbTheme as ThemeName);
      }
    } else {
      const { data: newRow } = await supabase.from('user_settings').insert({
        user_id: user.id,
        owner_id: user.id,
        dark_mode: isDark,
        font_style: fontStyle,
        dashboard_filter: '7days',
        roas_threshold: 2.0,
        dead_product_days: 30,
        notification_preferences: DEFAULT_PREFS as never,
      }).select().single();
      if (newRow) setSettingsId(newRow.id);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  useEffect(() => {
    if (editingName && nameInputRef.current) nameInputRef.current.focus();
  }, [editingName]);

  function saveDebounced(patch: Record<string, unknown>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!settingsId) return;
      await supabase.from('user_settings').update(patch as never).eq('id', settingsId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 500);
  }

  function handleDarkToggle() {
    toggleDark();
    saveDebounced({ dark_mode: !isDark });
  }

  function handleFontChange(f: FontStyle) {
    setFontStyle(f);
    saveDebounced({ font_style: f });
  }

  function handleThemeChange(t: ThemeName) {
    setThemeName(t);
    saveDebounced({ theme: t });
  }

  function handleDashFilter(v: string) {
    setDashboardFilter(v);
    saveDebounced({ dashboard_filter: v });
  }

  function handleRoas(v: string) {
    setRoasThreshold(v);
    const n = parseFloat(v);
    if (!isNaN(n)) saveDebounced({ roas_threshold: n });
  }

  function handleDeadDays(v: string) {
    setDeadDays(v);
    const n = parseInt(v);
    if (!isNaN(n)) saveDebounced({ dead_product_days: n });
  }

  function handlePrefToggle(key: keyof NotifPrefs) {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    saveDebounced({ notification_preferences: updated });
  }

  function handleBusinessNameSave() {
    setEditingName(false);
    if (settingsId) {
      saveDebounced({ business_name: businessName.trim() });
    }
  }

  async function handleExportAll() {
    setExporting(true);
    try {
      const [ordersRes, invRes, expRes] = await Promise.all([
        supabase.from('orders').select('*, inventory!orders_product_id_fkey(product_name)').order('date', { ascending: false }),
        supabase.from('inventory').select('*').order('product_name'),
        supabase.from('expenses').select('*').order('date', { ascending: false }),
      ]);

      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const orders = ordersRes.data || [];
      const oHeaders = ['Order #', 'Customer', 'Product', 'Source', 'Status', 'Qty', 'Selling ৳', 'Shipping ৳', 'Ad Cost ৳', 'Profit ৳', 'Date'];
      const oRows = orders.map((o: any) => [
        o.order_number, o.customer_name, o.inventory?.product_name || '', o.source || '', o.status,
        o.quantity, o.selling_price, o.shipping_cost, o.ad_cost, o.profit_per_order ?? 0,
        fnsFormat(new Date(o.date), 'dd/MM/yyyy'),
      ]);
      const oTotals = [
        'TOTALS', '', '', '', '',
        orders.reduce((s: number, o: any) => s + o.quantity, 0),
        orders.reduce((s: number, o: any) => s + o.selling_price, 0),
        orders.reduce((s: number, o: any) => s + o.shipping_cost, 0),
        orders.reduce((s: number, o: any) => s + o.ad_cost, 0),
        orders.reduce((s: number, o: any) => s + (o.profit_per_order ?? 0), 0),
        '',
      ];
      const oAll = [oHeaders, ...oRows, oTotals];
      const oWs = XLSX.utils.aoa_to_sheet(oAll);
      oWs['!cols'] = oHeaders.map((h, i) => {
        let max = h.length;
        oRows.forEach((r: any[]) => { const cl = String(r[i] ?? '').length; if (cl > max) max = cl; });
        return { wch: Math.min(max + 4, 40) };
      });
      XLSX.utils.book_append_sheet(wb, oWs, 'Orders');

      const inv = invRes.data || [];
      const iHeaders = ['Product', 'SKU', 'Cost ৳', 'Selling ৳', 'Stock', 'Threshold', 'Value ৳', 'Supplier'];
      const iRows = inv.map((p: any) => [
        p.product_name, p.sku || '', p.cost_price, p.selling_price, p.stock_quantity,
        p.low_stock_threshold, p.stock_quantity * p.cost_price, p.supplier || '',
      ]);
      const iTotals = [
        'TOTALS', '',
        inv.reduce((s: number, p: any) => s + p.cost_price, 0),
        inv.reduce((s: number, p: any) => s + p.selling_price, 0),
        inv.reduce((s: number, p: any) => s + p.stock_quantity, 0),
        '',
        inv.reduce((s: number, p: any) => s + p.stock_quantity * p.cost_price, 0),
        '',
      ];
      const iAll = [iHeaders, ...iRows, iTotals];
      const iWs = XLSX.utils.aoa_to_sheet(iAll);
      iWs['!cols'] = iHeaders.map((h, i) => {
        let max = h.length;
        iRows.forEach((r: any[]) => { const cl = String(r[i] ?? '').length; if (cl > max) max = cl; });
        return { wch: Math.min(max + 4, 40) };
      });
      XLSX.utils.book_append_sheet(wb, iWs, 'Inventory');

      const exps = expRes.data || [];
      const eHeaders = ['Type', 'Amount ৳', 'Platform', 'Notes', 'Date'];
      const eRows = exps.map((e: any) => [
        e.type, e.amount, e.platform || '', e.notes || '', fnsFormat(new Date(e.date), 'dd/MM/yyyy'),
      ]);
      const eTotals = [
        'TOTALS',
        exps.reduce((s: number, e: any) => s + e.amount, 0),
        '', '', '',
      ];
      const eAll = [eHeaders, ...eRows, eTotals];
      const eWs = XLSX.utils.aoa_to_sheet(eAll);
      eWs['!cols'] = eHeaders.map((h, i) => {
        let max = h.length;
        eRows.forEach((r: any[]) => { const cl = String(r[i] ?? '').length; if (cl > max) max = cl; });
        return { wch: Math.min(max + 4, 40) };
      });
      XLSX.utils.book_append_sheet(wb, eWs, 'Expenses');

      XLSX.writeFile(wb, `LuminaInsights_Export_${todaySuffix()}.xlsx`);
      toast.success('Exported successfully ✓');
    } catch { toast.error('Export failed'); }
    setExporting(false);
  }

  async function handleClearNotifs() {
    await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await refreshCount();
    toast.success('Cleared ✓');
    setClearOpen(false);
  }

  const sectionClass = 'settings-hover rounded-xl border border-border p-5 bg-[var(--chart-card-bg)]';
  const sectionTitleClass = 'flex items-center gap-2 text-base font-bold text-foreground mb-4 pb-3 border-b border-border';

  if (loading) return (
    <div>
      <h1 className="mb-5 text-[28px] font-bold text-pink-200">Settings</h1>
      <SkeletonLoader variant="row" count={6} />
    </div>
  );

  const initials = businessName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="max-w-[1100px]">
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-[28px] font-bold text-pink-200">Settings</h1>
        {saved && <span className="text-sm font-bold text-primary flex items-center gap-1 animate-in fade-in"><Check size={14} />Saved ✓</span>}
      </div>

      {/* User Info Section — full width */}
      <div className={cn(sectionClass, 'mb-6')}>
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
              style={{
                backgroundColor: 'var(--accent-color)',
                border: '3px solid rgba(255,255,255,0.2)',
              }}
            >
              {initials}
            </div>
            <span
              className="online-pulse absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white"
              style={{ backgroundColor: '#10B981' }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {editingName ? (
                <input
                  ref={nameInputRef}
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  onBlur={handleBusinessNameSave}
                  onKeyDown={e => e.key === 'Enter' && handleBusinessNameSave()}
                  className="text-xl font-bold bg-transparent border-b-2 border-[var(--accent-color)] outline-none text-foreground w-full max-w-[300px]"
                />
              ) : (
                <>
                  <h2 className="text-xl font-bold text-foreground">{businessName}</h2>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  >
                    <Pencil size={14} />
                  </button>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{user?.email || 'yourname@email.com'}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground">
                Member since {fnsFormat(new Date(), 'MMM yyyy')}
              </span>
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ backgroundColor: '#F0B429', color: '#000' }}
              >
                Pro
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              className="gap-1.5 font-bold border-border"
              onClick={() => setEditingName(true)}
            >
              <Pencil size={14} /> Edit Profile
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 font-bold border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
            >
              <LogOut size={14} /> Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Two column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-6">
          {/* Appearance */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>
              <Palette size={18} style={{ color: 'var(--accent-color)' }} />
              Appearance
            </h2>
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm font-extrabold">Dark Mode</Label>
              <Switch checked={isDark} onCheckedChange={handleDarkToggle} />
            </div>
            <div>
              <Label className="text-sm font-extrabold mb-2 block">Font Style</Label>
              <div className="grid grid-cols-3 gap-2">
                {FONT_OPTIONS.map(f => (
                  <button
                    key={f}
                    onClick={() => handleFontChange(f)}
                    style={{ fontFamily: FONT_FAMILIES[f] }}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm transition-colors text-center',
                      fontStyle === f
                        ? 'bg-[#F0B429]/20 border-2 border-[#F0B429] font-bold text-foreground'
                        : 'border border-border hover:border-primary text-accent font-extrabold'
                    )}
                  >
                    {FONT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Themes */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>
              <Type size={18} style={{ color: 'var(--accent-color)' }} />
              Theme
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {THEME_OPTIONS.map(t => {
                const theme = THEMES[t];
                const active = themeName === t;
                return (
                  <button
                    key={t}
                    onClick={() => handleThemeChange(t)}
                    className={cn(
                      'rounded-lg p-3 transition-all text-left relative',
                      active
                        ? 'border-2 border-[#F0B429] bg-[#F0B429]/10'
                        : 'border border-border hover:border-primary/50 bg-card/50'
                    )}
                  >
                    {active && (
                      <div className="absolute top-1.5 right-1.5">
                        <Check size={14} className="text-[#F0B429]" />
                      </div>
                    )}
                    <div className="flex gap-1.5 mb-2">
                      <span className="w-5 h-5 rounded-full border border-border/50" style={{ backgroundColor: theme.colors.sidebar }} />
                      <span className="w-5 h-5 rounded-full border border-border/50" style={{ backgroundColor: theme.colors.accent }} />
                    </div>
                    <span className={cn(active ? 'text-xs font-bold text-foreground' : 'font-extrabold text-sm text-accent')}>
                      {theme.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-6">
          {/* Dashboard Defaults */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>
              <LayoutDashboard size={18} style={{ color: 'var(--accent-color)' }} />
              Dashboard Defaults
            </h2>
            <Label className="text-sm font-extrabold mb-2 block">Default Date Filter</Label>
            <div className="flex gap-2">
              {[{ l: 'Today', v: 'today' }, { l: '7 Days', v: '7days' }, { l: '30 Days', v: '30days' }].map(o => (
                <button
                  key={o.v}
                  onClick={() => handleDashFilter(o.v)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm transition-colors',
                    dashboardFilter === o.v
                      ? 'font-extrabold bg-teal-950 text-gray-500'
                      : 'border border-border hover:border-primary text-accent font-extrabold'
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Business Thresholds */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>
              <Gauge size={18} style={{ color: 'var(--accent-color)' }} />
              Business Thresholds
            </h2>
            <div className="mb-4">
              <Label className="text-sm font-extrabold">ROAS Threshold</Label>
              <p className="mb-1 text-accent font-extrabold text-sm">Alert when ROAS falls below this value</p>
              <Input type="number" min={0} step="0.1" value={roasThreshold} onChange={e => handleRoas(e.target.value)} className="w-32" />
            </div>
            <div className="mb-3">
              <Label className="text-sm font-extrabold">Dead Product Days</Label>
              <p className="mb-1 text-accent font-extrabold text-sm">Flag products with no sales in this many days</p>
              <Input type="number" min={1} value={deadDays} onChange={e => handleDeadDays(e.target.value)} className="w-32" />
            </div>
            <p className="italic text-accent font-extrabold text-sm">Low stock threshold is set per-product in Inventory module</p>
          </div>

          {/* Notification Preferences */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>
              <Bell size={18} style={{ color: 'var(--accent-color)' }} />
              Notification Preferences
            </h2>
            <div className="flex flex-col gap-3">
              {(Object.keys(PREF_LABELS) as (keyof NotifPrefs)[]).map(key => (
                <div key={key} className="flex items-center justify-between">
                  <Label className="text-sm font-extrabold">{PREF_LABELS[key]}</Label>
                  <Switch checked={notifPrefs[key]} onCheckedChange={() => handlePrefToggle(key)} />
                </div>
              ))}
            </div>
          </div>

          {/* Data Management */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}>
              <Database size={18} style={{ color: 'var(--accent-color)' }} />
              Data Management
            </h2>
            <div className="flex flex-col gap-3">
              <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/5 font-bold justify-start" onClick={handleExportAll} disabled={exporting}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {exporting ? 'Exporting...' : 'Export All Data (XLSX)'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={clearOpen} onOpenChange={o => { if (!o) setClearOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete all notifications.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearNotifs} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Clear All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
