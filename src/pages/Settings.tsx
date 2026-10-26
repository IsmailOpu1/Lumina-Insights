import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/context/AuthContext';
import { useTheme, FONT_FAMILIES, FONT_LABELS, type FontStyle } from '@/context/ThemeContext';
import { useNotifications } from '@/context/NotificationContext';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import SkeletonLoader from '@/components/SkeletonLoader';
import { Download, Loader2, Check, Palette, Gauge, Bell, Database, Pencil, LogOut, Users, Copy, X, MailPlus, Camera, Crown, ShoppingBag, Sparkles, Mail, Building2, CalendarDays, CreditCard, UserRound, FileSpreadsheet, Package, Receipt, ShieldCheck, XCircle, AlertTriangle, PackageX, TrendingDown, Megaphone, type LucideIcon } from 'lucide-react';
import GlowBackdrop from '@/components/GlowBackdrop';
import UserAvatar from '@/components/UserAvatar';
import Segmented from '@/components/dashboard/Segmented';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { todaySuffix } from '@/lib/xlsxExport';
import { format as fnsFormat } from 'date-fns';
import { createInvite, inviteLink } from '@/lib/invites';
import { useCurrency } from '@/hooks/useCurrency';
import { useExportGate } from '@/hooks/useExportGate';
import { useSubscription } from '@/context/SubscriptionContext';
import { parseDay } from '@/lib/dates';

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
  new_order: 'New order', cancelled_order: 'Cancelled order',
  low_stock: 'Low stock', critical_stock: 'Out of stock',
  profit_drop: 'Profit drop', roas_alert: 'ROAS alert', weekly_summary: 'Weekly summary',
};

const PREF_HINTS: Record<keyof NotifPrefs, string> = {
  new_order: 'When an order comes in',
  cancelled_order: 'When an order is cancelled',
  low_stock: 'When a product drops below its threshold',
  critical_stock: 'When a product runs out',
  profit_drop: 'When profit falls sharply',
  roas_alert: 'When ad returns drop below your limit',
  weekly_summary: 'A short recap every week',
};

const PREF_ICONS: Record<keyof NotifPrefs, LucideIcon> = {
  new_order: ShoppingBag,
  cancelled_order: XCircle,
  low_stock: AlertTriangle,
  critical_stock: PackageX,
  profit_drop: TrendingDown,
  roas_alert: Megaphone,
  weekly_summary: CalendarDays,
};

const ROLE_STYLE: Record<string, string> = {
  owner: 'border-primary/30 bg-primary/10 text-primary',
  manager: 'border-highlight/30 bg-highlight/10 text-highlight',
  viewer: 'border-border bg-muted text-muted-foreground',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn('shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize', ROLE_STYLE[role] ?? ROLE_STYLE.viewer)}>
      {role}
    </span>
  );
}

function SettingsCard({ id, icon: Icon, title, description, action, className, children }: {
  id: string; icon: LucideIcon; title: string; description: string; action?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <section id={id} className={cn('scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card/80 backdrop-blur-xl', className)}>
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <Icon size={16} />
          </span>
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function SettingRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const FONT_OPTIONS: FontStyle[] = ['inter', 'poppins', 'roboto', 'playfair', 'nunito', 'dmsans'];

export default function SettingsPage() {
  const { symbol } = useCurrency();
  const canExport = useExportGate();
  const navigate = useNavigate();
  const { subscription, features } = useSubscription();
  // Starter has no team seats; trials and Pro do.
  const teamAllowed = !subscription || subscription.limits.max_team_members > 0;
  const { user, userSettings, isOwner, signOut, refreshSettings } = useAuth();
  const { fontStyle, setFontStyle } = useTheme();
  const { dismiss } = useNotifications();
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
  const [fullName, setFullName] = useState(userSettings?.full_name || '');
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Profile display variables - always show logged-in user's own data
  const displayName = userSettings?.full_name || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || '';
  const displayAvatar = userSettings?.avatar_url || null;
  
  // Profile editing state
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileFullName, setProfileFullName] = useState('');
  const [profileBusinessName, setProfileBusinessName] = useState('');

  // Team management state
  const [teamMembers, setTeamMembers] = useState<Tables<'team_members'>[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Tables<'invites'>[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'viewer'>('viewer');
  const [sendingInvite, setSendingInvite] = useState(false);

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
      setFullName(data.full_name || '');
      if (data.avatar_url) {
        setAvatarUrl(data.avatar_url);
      }
      if (data.notification_preferences) setNotifPrefs({ ...DEFAULT_PREFS, ...(data.notification_preferences as Record<string, boolean>) });
      // Font and dark mode are applied app-wide by SettingsBootstrap/ThemeProvider.
    } else {
      const { data: newRow } = await supabase.from('user_settings').insert({
        user_id: user.id,
        owner_id: user.id,
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

  // Links like /settings#profile land on that card once the page has loaded.
  const { hash } = useLocation();
  useEffect(() => {
    if (!loading && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, hash]);

  const fetchTeamData = useCallback(async () => {
    if (!user || !isOwner) return;
    const [membersRes, invitesRes] = await Promise.all([
      supabase.from('team_members').select('*').eq('owner_id', user.id),
      supabase.from('invites').select('*').eq('owner_id', user.id).eq('used', false).gt('expires_at', new Date().toISOString()),
    ]);
    setTeamMembers(membersRes.data || []);
    setPendingInvites(invitesRes.data || []);
  }, [user, isOwner]);

  useEffect(() => { fetchTeamData(); }, [fetchTeamData]);

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

  function handleFontChange(f: FontStyle) {
    setFontStyle(f);
    saveDebounced({ font_style: f });
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
    if (!user || !settingsId) return;
    saveDebounced({ business_name: businessName });
    setEditingName(false);
  }

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !event.target.files || !event.target.files[0]) return;
    
    const file = event.target.files[0];
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${fileExt}`;
    
    setUploadingAvatar(true);
    try {
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, {
        upsert: true,
      });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      // Same file name on every upload, so bust caches to show the new photo.
      const url = `${publicUrl}?v=${Date.now()}`;
      if (settingsId) {
        const { error } = await supabase.from('user_settings').update({ avatar_url: url }).eq('id', settingsId);
        if (error) throw error;
      }
      setAvatarUrl(url);
      await refreshSettings();
      toast.success('Photo updated');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  }

  function handleProfileSave() {
    if (!user || !settingsId) return;
    saveDebounced({ 
      full_name: profileFullName.trim(),
      business_name: profileBusinessName.trim() 
    });
    setFullName(profileFullName.trim());
    setBusinessName(profileBusinessName.trim());
    setProfileModalOpen(false);
    setIsEditingProfile(false);
    toast.success('Profile updated successfully');
  }

  function openProfileModal() {
    setProfileFullName(fullName);
    setProfileBusinessName(businessName);
    setProfileModalOpen(true);
    setIsEditingProfile(true);
  }

  async function handleExportAll() {
    if (!canExport()) return;
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
      const oHeaders = ['Order #', 'Customer', 'Product', 'Source', 'Status', 'Qty', `Selling ${symbol}`, `Shipping ${symbol}`, `Ad Cost ${symbol}`, `Profit ${symbol}`, 'Date'];
      const oRows = orders.map((o) => [
        o.order_number, o.customer_name, (o.inventory?.product_name ?? o.product_name) || '', o.source || '', o.status,
        o.quantity, o.selling_price, o.shipping_cost, o.ad_cost, o.profit_per_order ?? 0,
        fnsFormat(parseDay(o.date), 'dd/MM/yyyy'),
      ]);
      const oTotals = [
        'TOTALS', '', '', '', '',
        orders.reduce((s, o) => s + o.quantity, 0),
        orders.reduce((s, o) => s + o.selling_price, 0),
        orders.reduce((s, o) => s + o.shipping_cost, 0),
        orders.reduce((s, o) => s + o.ad_cost, 0),
        orders.reduce((s, o) => s + (o.profit_per_order ?? 0), 0),
        '',
      ];
      const oAll = [oHeaders, ...oRows, oTotals];
      const oWs = XLSX.utils.aoa_to_sheet(oAll);
      oWs['!cols'] = oHeaders.map((h, i) => {
        let max = h.length;
        oRows.forEach((r) => { const cl = String(r[i] ?? '').length; if (cl > max) max = cl; });
        return { wch: Math.min(max + 4, 40) };
      });
      XLSX.utils.book_append_sheet(wb, oWs, 'Orders');

      const inv = invRes.data || [];
      const iHeaders = ['Product', 'SKU', `Cost ${symbol}`, `Selling ${symbol}`, 'Stock', 'Threshold', `Value ${symbol}`, 'Supplier'];
      const iRows = inv.map((p) => [
        p.product_name, p.sku || '', p.cost_price, p.selling_price, p.stock_quantity,
        p.low_stock_threshold, p.stock_quantity * p.cost_price, p.supplier || '',
      ]);
      const iTotals = [
        'TOTALS', '',
        inv.reduce((s, p) => s + p.cost_price, 0),
        inv.reduce((s, p) => s + p.selling_price, 0),
        inv.reduce((s, p) => s + p.stock_quantity, 0),
        '',
        inv.reduce((s, p) => s + p.stock_quantity * p.cost_price, 0),
        '',
      ];
      const iAll = [iHeaders, ...iRows, iTotals];
      const iWs = XLSX.utils.aoa_to_sheet(iAll);
      iWs['!cols'] = iHeaders.map((h, i) => {
        let max = h.length;
        iRows.forEach((r) => { const cl = String(r[i] ?? '').length; if (cl > max) max = cl; });
        return { wch: Math.min(max + 4, 40) };
      });
      XLSX.utils.book_append_sheet(wb, iWs, 'Inventory');

      const exps = expRes.data || [];
      const eHeaders = ['Type', `Amount ${symbol}`, 'Platform', 'Notes', 'Date'];
      const eRows = exps.map((e) => [
        e.type, e.amount, e.platform || '', e.notes || '', fnsFormat(parseDay(e.date), 'dd/MM/yyyy'),
      ]);
      const eTotals = [
        'TOTALS',
        exps.reduce((s, e) => s + e.amount, 0),
        '', '', '',
      ];
      const eAll = [eHeaders, ...eRows, eTotals];
      const eWs = XLSX.utils.aoa_to_sheet(eAll);
      eWs['!cols'] = eHeaders.map((h, i) => {
        let max = h.length;
        eRows.forEach((r) => { const cl = String(r[i] ?? '').length; if (cl > max) max = cl; });
        return { wch: Math.min(max + 4, 40) };
      });
      XLSX.utils.book_append_sheet(wb, eWs, 'Expenses');

      XLSX.writeFile(wb, `LuminaInsights_Export_${todaySuffix()}.xlsx`);
      toast.success('Exported successfully ✓');
    } catch { toast.error('Export failed'); }
    setExporting(false);
  }

  async function handleClearNotifs() {
    // Hides them for this user only; teammates keep theirs.
    await dismiss();
    toast.success('Cleared ✓');
    setClearOpen(false);
  }

  async function sendTeamInvite() {
    if (!inviteEmail.trim() || !user || !isOwner) return;
    setSendingInvite(true);
    const { error, emailed } = await createInvite(user.id, inviteEmail, inviteRole);
    setSendingInvite(false);

    if (error) {
      toast.error('Failed to create invite', { description: error });
      return;
    }

    setInviteEmail('');
    setInviteModalOpen(false);
    fetchTeamData();
    if (emailed) toast.success('Invite email sent!');
    else toast.warning('Invite created, but the email could not be sent. Use the copy-link button to share it.');
  }

  async function removeTeamMember(memberId: string) {
    const { error } = await supabase.from('team_members').delete().eq('id', memberId);
    if (error) {
      toast.error('Failed to remove member', { description: error.message });
    } else {
      toast.success('Member removed');
      fetchTeamData();
    }
  }

  async function revokeInvite(inviteId: string) {
    const { error } = await supabase.from('invites').delete().eq('id', inviteId);
    if (error) {
      toast.error('Failed to revoke invite', { description: error.message });
    } else {
      toast.success('Invite revoked');
      fetchTeamData();
    }
  }

  function copyInviteLink(token: string) {
    navigator.clipboard.writeText(inviteLink(token));
    toast.success('Link copied!');
  }

  if (loading) return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="page-title mb-6">Settings</h1>
      <SkeletonLoader variant="row" count={6} />
    </div>
  );

  const initials = (fullName || businessName)
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const planBadge = !subscription ? null
    : subscription.state === 'trialing' ? 'Pro trial'
    : subscription.state === 'expired' ? 'Expired'
    : subscription.limits.name;

  const usage = subscription?.usage;
  const limits = subscription?.limits;
  const heroStats = subscription && usage && limits ? [
    { label: 'Plan', value: planBadge ?? '—', icon: Crown },
    { label: 'Orders this month', value: limits.max_orders_per_month === null ? `${usage.orders_this_month}` : `${usage.orders_this_month} / ${limits.max_orders_per_month}`, icon: ShoppingBag },
    { label: 'AI questions today', value: `${usage.ai_chat_today} / ${limits.ai_chat_per_day}`, icon: Sparkles },
    { label: 'Team', value: limits.max_team_members > 0 ? `${usage.team_members + 1} / ${limits.max_team_members + 1}` : 'Just you', icon: Users },
  ] : [];

  return (
    <div className="relative isolate mx-auto max-w-[1200px]">
      <GlowBackdrop className="-inset-x-10 -top-10" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Your account, how Lumina looks, and the rules behind your alerts.</p>
        </div>
        {saved && <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success animate-in fade-in"><Check size={13} />Saved</span>}
      </div>

      {/* Profile hero */}
      <section id="profile" className="relative mb-6 scroll-mt-4 overflow-hidden rounded-2xl border border-primary/25 bg-card/70 backdrop-blur-xl">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />
        <div className="pointer-events-none absolute -left-20 -top-32 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-[-120px] h-64 w-64 rounded-full bg-highlight/20 blur-3xl" />

        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:p-8">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="group relative h-24 w-24 shrink-0 self-start rounded-3xl md:self-auto"
            aria-label="Change profile photo"
          >
            <span className="absolute -inset-1 rounded-[28px] bg-gradient-to-br from-primary to-highlight opacity-60 blur-md transition-opacity group-hover:opacity-90" />
            <span className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-highlight text-3xl font-semibold text-primary-foreground ring-2 ring-background">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </span>
            <span className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
              {uploadingAvatar ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-semibold tracking-tight">{displayName}</h2>
              {planBadge && <span className="rounded-full border border-primary/40 bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary shadow-glow">{planBadge}</span>}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Mail size={14} />{displayEmail}</span>
              <span className="flex items-center gap-1.5"><Building2 size={14} />{businessName}</span>
              {user?.created_at && <span className="flex items-center gap-1.5"><CalendarDays size={14} />Since {fnsFormat(new Date(user.created_at), 'MMM yyyy')}</span>}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" className="gap-1.5" onClick={openProfileModal}>
                <Pencil size={14} /> Edit profile
              </Button>
              {isOwner && (
                <Button size="sm" variant="outline" className="gap-1.5 bg-background/40" onClick={() => navigate('/billing')}>
                  <CreditCard size={14} /> Billing
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
              >
                <LogOut size={14} /> Sign out
              </Button>
            </div>
          </div>
        </div>

        {heroStats.length > 0 && (
          <div className="relative grid grid-cols-2 border-t border-border/70 bg-background/30 lg:grid-cols-4">
            {heroStats.map(({ label, value, icon: Icon }, i) => (
              <div key={label} className={cn('flex items-center gap-3 px-6 py-4', i % 2 === 1 && 'border-l border-border/70', i >= 2 && 'max-lg:border-t lg:border-l')}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={16} /></span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{label}</p>
                  <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Appearance */}
        <SettingsCard id="appearance" icon={Palette} title="Appearance" description="Pick the font you find easiest to read.">
          <div className="grid grid-cols-3 gap-2 p-5">
            {FONT_OPTIONS.map(f => (
              <button
                key={f}
                onClick={() => handleFontChange(f)}
                aria-pressed={fontStyle === f}
                className={cn(
                  'relative rounded-xl border px-3 py-3 text-left transition-colors',
                  fontStyle === f ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/40' : 'border-border bg-background/30 hover:border-primary/40 hover:bg-secondary'
                )}
              >
                {fontStyle === f && <Check size={13} className="absolute right-2 top-2 text-primary" />}
                <span className="block text-2xl leading-none" style={{ fontFamily: FONT_FAMILIES[f] }}>Aa</span>
                <span className="mt-2 block text-xs text-muted-foreground" style={{ fontFamily: FONT_FAMILIES[f] }}>{FONT_LABELS[f]}</span>
              </button>
            ))}
          </div>
        </SettingsCard>

        {/* Dashboard + rules */}
        <SettingsCard id="rules" icon={Gauge} title="Dashboard and alerts" description="What you see first, and when Lumina warns you.">
          <SettingRow label="Default date range" description="The period the Dashboard opens on.">
            <Segmented
              label="Default date range"
              value={dashboardFilter}
              onChange={handleDashFilter}
              options={[{ label: 'Today', value: 'today' }, { label: '7 days', value: '7days' }, { label: '30 days', value: '30days' }]}
            />
          </SettingRow>
          <SettingRow label="ROAS alert" description="Warn me when return on ad spend drops below this.">
            <div className="relative w-28">
              <Input type="number" min={0} step="0.1" value={roasThreshold} onChange={e => handleRoas(e.target.value)} className="pr-7 text-right tabular-nums" aria-label="ROAS threshold" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">x</span>
            </div>
          </SettingRow>
          <SettingRow label="Not selling after" description="Flag a product after this many days without a sale.">
            <div className="relative w-28">
              <Input type="number" min={1} value={deadDays} onChange={e => handleDeadDays(e.target.value)} className="pr-12 text-right tabular-nums" aria-label="Dead product days" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">days</span>
            </div>
          </SettingRow>
        </SettingsCard>

        {/* Notifications */}
        <SettingsCard
          id="alerts"
          icon={Bell}
          title="Notifications"
          description="Choose which alerts reach your bell menu."
          className="lg:col-span-2"
          action={<Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setClearOpen(true)}>Clear mine</Button>}
        >
          <div className="grid gap-2 p-5 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(PREF_LABELS) as (keyof NotifPrefs)[]).map(key => {
              // The weekly summary is only sent on Pro, so don't offer it elsewhere.
              const proOnly = key === 'weekly_summary' && !features.weeklySummary;
              const on = proOnly ? false : notifPrefs[key];
              const Icon = PREF_ICONS[key];
              return (
                <label
                  key={key}
                  className={cn(
                    'flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-colors',
                    on ? 'border-primary/30 bg-primary/[0.06]' : 'border-border bg-background/30',
                    proOnly && 'cursor-not-allowed opacity-70'
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', on ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                      <Icon size={15} />
                    </span>
                    <Switch
                      checked={on}
                      disabled={proOnly}
                      onCheckedChange={() => handlePrefToggle(key)}
                      aria-label={PREF_LABELS[key]}
                    />
                  </span>
                  <span>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {PREF_LABELS[key]}
                      {proOnly && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Pro</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{PREF_HINTS[key]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </SettingsCard>

        {/* Team */}
        {isOwner && (
          <SettingsCard
            id="team"
            icon={Users}
            title="Team"
            description="Managers can add and edit data. Viewers can only look."
            action={teamAllowed && (
              <Button size="sm" className="gap-1.5" onClick={() => setInviteModalOpen(true)}>
                <MailPlus size={14} /> Invite
              </Button>
            )}
          >
            {!teamAllowed && (
              <div className="m-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium">Team members are a Pro feature.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upgrade to Pro to invite people. Anyone you invited before keeps their place and gets access back when you upgrade.
                </p>
                <Button size="sm" className="mt-3" onClick={() => navigate('/billing')}>See plans</Button>
              </div>
            )}

            <ul>
              <li className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
                <UserAvatar className="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fullName || businessName} <span className="text-muted-foreground">(you)</span></p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <RoleBadge role="owner" />
              </li>
              {teamMembers.map((member) => (
                <li key={member.id} className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {member.email?.[0]?.toUpperCase() || '?'}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm">{member.email}</p>
                  <RoleBadge role={member.role} />
                  <button onClick={() => removeTeamMember(member.id)} className="icon-btn-danger" aria-label={`Remove ${member.email}`}>
                    <X size={16} />
                  </button>
                </li>
              ))}
              {pendingInvites.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                    <MailPlus size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">Invite pending · expires {fnsFormat(new Date(invite.expires_at), 'MMM d')}</p>
                  </div>
                  <RoleBadge role={invite.role} />
                  <button onClick={() => copyInviteLink(invite.token)} className="icon-btn" aria-label="Copy invite link">
                    <Copy size={16} />
                  </button>
                  <button onClick={() => revokeInvite(invite.id)} className="icon-btn-danger" aria-label="Revoke invite">
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
            {teamMembers.length === 0 && pendingInvites.length === 0 && teamAllowed && (
              <div className="flex flex-col items-center px-5 py-8 text-center">
                <div className="flex -space-x-2">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-muted text-muted-foreground"><UserRound size={15} /></span>
                  ))}
                </div>
                <p className="mt-3 text-sm font-medium">Run the shop together</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">Invite a manager to record orders, or a viewer like a partner who only wants to see the numbers.</p>
              </div>
            )}
          </SettingsCard>
        )}

        {/* Data */}
        <SettingsCard id="data" icon={Database} title="Your data" description="It belongs to you. Take a copy any time." className={cn(!isOwner && 'lg:col-span-2')}>
          <div className="space-y-3 p-5">
            <button
              onClick={handleExportAll}
              disabled={exporting}
              className="group flex w-full items-center gap-4 rounded-xl border border-border bg-background/30 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04] disabled:opacity-60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {exporting ? <Loader2 size={20} className="animate-spin" /> : <FileSpreadsheet size={20} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{exporting ? 'Exporting...' : 'Export everything to Excel'}</span>
                <span className="block text-xs text-muted-foreground">Orders, inventory and expenses, one sheet each</span>
              </span>
              <Download size={16} className="text-muted-foreground transition-colors group-hover:text-primary" />
            </button>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[{ label: 'Orders', icon: ShoppingBag }, { label: 'Inventory', icon: Package }, { label: 'Expenses', icon: Receipt }].map(({ label, icon: Icon }) => (
                <div key={label} className="rounded-lg border border-border/70 bg-background/20 px-2 py-3">
                  <Icon size={16} className="mx-auto text-muted-foreground" />
                  <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck size={14} className="mt-px shrink-0 text-primary" />
              Only you and the people you invite can see this workspace.
            </p>
          </div>
        </SettingsCard>
      </div>

      <AlertDialog open={clearOpen} onOpenChange={o => { if (!o) setClearOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear your notifications?</AlertDialogTitle>
            <AlertDialogDescription>They disappear from your bell menu. Your teammates keep theirs.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearNotifs} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite Modal */}
      <AlertDialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invite a team member</AlertDialogTitle>
            <AlertDialogDescription>They get an email with a link to join your workspace.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="mb-2 block text-sm">Email Address</Label>
              <Input
                type="email"
                placeholder="team@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                disabled={sendingInvite}
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Role</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={inviteRole === 'manager' ? 'default' : 'outline'}
                  
                  onClick={() => setInviteRole('manager')}
                  disabled={sendingInvite}
                >
                  Manager
                </Button>
                <Button
                  type="button"
                  variant={inviteRole === 'viewer' ? 'default' : 'outline'}
                  
                  onClick={() => setInviteRole('viewer')}
                  disabled={sendingInvite}
                >
                  Viewer
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {inviteRole === 'manager' ? 'Can add/edit data and manage team' : 'Can only view data'}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingInvite}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={sendTeamInvite}
              disabled={!inviteEmail.trim() || sendingInvite}
              
            >
              {sendingInvite ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Profile Edit Modal */}
      <AlertDialog open={profileModalOpen} onOpenChange={setProfileModalOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Edit profile</AlertDialogTitle>
            <AlertDialogDescription>Update your profile information</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center gap-3">
              <div 
                className="relative w-20 h-20 mx-auto group cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {/* Avatar image or fallback */}
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-border">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-primary to-highlight text-xl font-semibold text-primary-foreground">
                      {user?.email?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Camera overlay — centered, shows on hover */}
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera size={22} className="text-white" />
                </div>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <Label className="mb-2 block text-sm">Full Name</Label>
              <Input
                value={profileFullName}
                onChange={e => setProfileFullName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>

            {/* Business Name - only for owners */}
            {isOwner && (
              <div>
                <Label className="mb-2 block text-sm">Business Name</Label>
                <Input
                  value={profileBusinessName}
                  onChange={e => setProfileBusinessName(e.target.value)}
                  placeholder="Enter your business name"
                />
              </div>
            )}

            {/* Email (Read-only) */}
            <div>
              <Label className="mb-2 block text-sm">Email</Label>
              <Input
                value={user?.email || ''}
                disabled
                className="bg-muted/50"
              />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleProfileSave}
              disabled={!profileFullName.trim() && !profileBusinessName.trim()}
              
            >
              Save changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
