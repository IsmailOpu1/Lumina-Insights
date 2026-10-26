import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Download, Loader2, Check, Palette, LayoutDashboard, Gauge, Bell, Database, Pencil, LogOut, User, Users, Copy, X, MailPlus, Camera, type LucideIcon } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
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

function SettingsCard({ id, icon: Icon, title, description, action, children }: {
  id: string; icon: LucideIcon; title: string; description: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} className="surface scroll-mt-4 overflow-hidden">
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
      setAvatarUrl(publicUrl);
      saveDebounced({ avatar_url: publicUrl });
      toast.success('Avatar updated successfully');
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
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="Settings" />
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

  const sections = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'alerts', label: 'Notifications', icon: Bell },
    { id: 'rules', label: 'Business rules', icon: Gauge },
    ...(isOwner ? [{ id: 'team', label: 'Team', icon: Users }] : []),
    { id: 'data', label: 'Data', icon: Database },
  ];

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Settings"
        subtitle="Your profile, how Lumina looks, and the rules behind your alerts."
        actions={saved && <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success animate-in fade-in"><Check size={13} />Saved</span>}
      />

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* Section nav */}
        <nav aria-label="Settings sections" className="lg:sticky lg:top-4 lg:self-start">
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:px-0">
            {sections.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <a href={`#${id}`} className="flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  <Icon size={16} />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          {/* Profile */}
          <section id="profile" className="surface relative scroll-mt-4 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-primary/20 via-highlight/10 to-transparent" />
            <div className="relative flex flex-col gap-5 p-6 pt-10 md:flex-row md:items-end">
              <div className="relative h-20 w-20 shrink-0">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-highlight text-2xl font-semibold text-primary-foreground ring-4 ring-card">
                  {displayAvatar ? <img src={displayAvatar} alt="" className="h-full w-full object-cover" /> : initials}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-semibold">{displayName}</h2>
                  {planBadge && <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{planBadge}</span>}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{displayEmail}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {businessName}{user?.created_at && <> · Member since {fnsFormat(new Date(user.created_at), 'MMM yyyy')}</>}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openProfileModal}>
                  <Pencil size={14} /> Edit profile
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
                >
                  <LogOut size={14} /> Sign out
                </Button>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <SettingsCard id="appearance" icon={Palette} title="Appearance" description="Lumina uses one dark theme. Pick the font you find easiest to read.">
            <div className="grid grid-cols-2 gap-2 p-5 sm:grid-cols-3">
              {FONT_OPTIONS.map(f => (
                <button
                  key={f}
                  onClick={() => handleFontChange(f)}
                  aria-pressed={fontStyle === f}
                  className={cn(
                    'rounded-lg border px-3 py-3 text-left transition-colors',
                    fontStyle === f ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/40' : 'border-border hover:border-primary/40 hover:bg-secondary'
                  )}
                >
                  <span className="block text-lg leading-none" style={{ fontFamily: FONT_FAMILIES[f] }}>Aa</span>
                  <span className="mt-1.5 block text-xs text-muted-foreground" style={{ fontFamily: FONT_FAMILIES[f] }}>{FONT_LABELS[f]}</span>
                </button>
              ))}
            </div>
          </SettingsCard>

          {/* Dashboard */}
          <SettingsCard id="dashboard" icon={LayoutDashboard} title="Dashboard" description="What you see first when you open Lumina.">
            <SettingRow label="Default date range" description="The period the Dashboard opens on.">
              <Segmented
                label="Default date range"
                value={dashboardFilter}
                onChange={handleDashFilter}
                options={[{ label: 'Today', value: 'today' }, { label: '7 days', value: '7days' }, { label: '30 days', value: '30days' }]}
              />
            </SettingRow>
          </SettingsCard>

          {/* Notifications */}
          <SettingsCard id="alerts" icon={Bell} title="Notifications" description="Choose which alerts you get in the bell menu.">
            <div className="grid sm:grid-cols-2">
              {(Object.keys(PREF_LABELS) as (keyof NotifPrefs)[]).map(key => {
                // The weekly summary is only sent on Pro, so don't offer it elsewhere.
                const proOnly = key === 'weekly_summary' && !features.weeklySummary;
                return (
                  <label key={key} className="flex cursor-pointer items-center justify-between gap-4 border-b border-border/60 px-5 py-3.5 sm:odd:border-r">
                    <span>
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {PREF_LABELS[key]}
                        {proOnly && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Pro</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">{PREF_HINTS[key]}</span>
                    </span>
                    <Switch
                      checked={proOnly ? false : notifPrefs[key]}
                      disabled={proOnly}
                      onCheckedChange={() => handlePrefToggle(key)}
                      aria-label={PREF_LABELS[key]}
                    />
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end px-5 py-3">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setClearOpen(true)}>Clear my notifications</Button>
            </div>
          </SettingsCard>

          {/* Business rules */}
          <SettingsCard id="rules" icon={Gauge} title="Business rules" description="The numbers behind your alerts and insights.">
            <SettingRow label="ROAS alert" description="Warn me when return on ad spend drops below this.">
              <div className="relative w-28">
                <Input type="number" min={0} step="0.1" value={roasThreshold} onChange={e => handleRoas(e.target.value)} className="pr-7 text-right tabular-nums" aria-label="ROAS threshold" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">x</span>
              </div>
            </SettingRow>
            <SettingRow label="Not selling after" description="Flag a product as not selling after this many days without a sale.">
              <div className="relative w-28">
                <Input type="number" min={1} value={deadDays} onChange={e => handleDeadDays(e.target.value)} className="pr-12 text-right tabular-nums" aria-label="Dead product days" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">days</span>
              </div>
            </SettingRow>
            <p className="px-5 py-3 text-xs text-muted-foreground">Low-stock levels are set on each product in Inventory.</p>
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
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-highlight text-xs font-semibold text-primary-foreground">
                    {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
                  </span>
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
              <p className="px-5 py-3 text-xs text-muted-foreground">
                {teamMembers.length + 1} member{teamMembers.length ? 's' : ''}
                {subscription && subscription.limits.max_team_members > 0 && ` · up to ${subscription.limits.max_team_members} on your plan`}
              </p>
            </SettingsCard>
          )}

          {/* Data */}
          <SettingsCard id="data" icon={Database} title="Data" description="Your data belongs to you.">
            <SettingRow label="Export everything" description="Orders, inventory and expenses in one Excel file.">
              <Button variant="outline" onClick={handleExportAll} disabled={exporting}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {exporting ? 'Exporting...' : 'Export'}
              </Button>
            </SettingRow>
          </SettingsCard>
        </div>
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
