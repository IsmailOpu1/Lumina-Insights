import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useTheme, FONT_FAMILIES, FONT_LABELS, type FontStyle } from '@/context/ThemeContext';
import { useNotifications } from '@/context/NotificationContext';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import SkeletonLoader from '@/components/SkeletonLoader';
import { Download, Loader2, Check, Palette, Type, LayoutDashboard, Gauge, Bell, Database, Pencil, LogOut, User, Users, Copy, X, MailPlus, Camera } from 'lucide-react';
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

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, userSettings, isOwner, signOut, refreshSettings } = useAuth();
  const { isDark, toggleDark, fontStyle, setFontStyle } = useTheme();
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
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
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
      setFullName((data as any).full_name || '');
      if ((data as any).avatar_url) {
        setAvatarUrl((data as any).avatar_url);
      }
      if (data.notification_preferences) setNotifPrefs({ ...DEFAULT_PREFS, ...(data.notification_preferences as Record<string, boolean>) });
      if (data.font_style && data.font_style !== fontStyle) {
        setFontStyle(data.font_style as FontStyle);
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

  function handleDarkToggle() {
    toggleDark();
    saveDebounced({ dark_mode: !isDark });
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

  async function sendTeamInvite() {
    if (!inviteEmail.trim() || !user) return;
    setSendingInvite(true);
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from('invites').insert({
      owner_id: user.id,
      email: inviteEmail.trim(),
      role: inviteRole,
      token,
      expires_at: expiresAt,
    });

    if (insertError) {
      toast.error('Failed to create invite', { description: insertError.message });
      setSendingInvite(false);
      return;
    }

    const link = `${window.location.origin}/invite/${token}`;
    setInviteEmail('');
    setInviteModalOpen(false);
    fetchTeamData();
    setSendingInvite(false);
    toast.success('Invite created successfully!');
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
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copied!');
  }

  const sectionClass = 'settings-hover rounded-xl border border-border p-5 bg-[var(--chart-card-bg)]';
  const sectionTitleClass = 'flex items-center gap-2 text-base font-bold text-foreground mb-4 pb-3 border-b border-border';

  if (loading) return (
    <div>
      <h1 className="mb-5 text-[28px] font-bold text-pink-200">Settings</h1>
      <SkeletonLoader variant="row" count={6} />
    </div>
  );

  const initials = (fullName || businessName)
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
          <div 
            className={`relative shrink-0 w-16 h-16 ${isEditingProfile ? 'group cursor-pointer' : ''}`}
            onClick={isEditingProfile ? () => fileInputRef.current?.click() : undefined}
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white overflow-hidden"
              style={{
                backgroundColor: displayAvatar ? 'transparent' : 'var(--accent-color)',
                border: '3px solid rgba(255,255,255,0.2)',
              }}
            >
              {displayAvatar ? (
                <img src={displayAvatar} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            
            {/* Camera icon — only in edit mode on hover */}
            {isEditingProfile && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={20} className="text-white" />
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
              disabled={uploadingAvatar}
            />
            <span
              className="online-pulse absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white"
              style={{ backgroundColor: '#10B981' }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-foreground">{displayName}</h2>
              <button
                onClick={openProfileModal}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <Pencil size={14} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">{displayEmail}</p>
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
              onClick={openProfileModal}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
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
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
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

          {/* Team Management - Only for owners */}
          {isOwner && (
            <div className={sectionClass}>
              <h2 className={sectionTitleClass}>
                <Users size={18} style={{ color: 'var(--accent-color)' }} />
                Team Management
              </h2>
              <Button
                variant="outline"
                className="w-full border-primary/30 text-primary hover:bg-primary/5 font-bold mb-4"
                onClick={() => setInviteModalOpen(true)}
              >
                <MailPlus className="mr-2 h-4 w-4" />
                Invite Team Member
              </Button>

              {/* Pending Invites */}
              {pendingInvites.length > 0 && (
                <div className="mb-4">
                  <Label className="text-sm font-extrabold mb-2 block">Pending Invites ({pendingInvites.length})</Label>
                  <div className="flex flex-col gap-2">
                    {pendingInvites.map((invite) => (
                      <div key={invite.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{invite.email}</p>
                          <p className="text-xs text-muted-foreground capitalize">{invite.role} · Expires {fnsFormat(new Date(invite.expires_at), 'MMM d')}</p>
                        </div>
                        <button
                          onClick={() => copyInviteLink(invite.token)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy invite link"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          onClick={() => revokeInvite(invite.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Revoke invite"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Current Team Members */}
              <div>
                <Label className="text-sm font-extrabold mb-2 block">Team Members ({teamMembers.length + 1})</Label>
                <div className="flex flex-col gap-2">
                  {/* Owner (you) */}
                  <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden bg-[#F0B429] text-xs font-bold text-white">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        businessName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{fullName || businessName}</p>
                      <p className="text-xs text-muted-foreground">{user?.email} · <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#F0B429]/20 text-[#F0B429]">Owner</span></p>
                    </div>
                  </div>
                  {/* Other members */}
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                        {member.email?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{member.email}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {member.role === 'owner' && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#F0B429]/20 text-[#F0B429]">Owner</span>
                          )}
                          {member.role === 'manager' && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Manager</span>
                          )}
                          {member.role === 'viewer' && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Viewer</span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => removeTeamMember(member.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove member"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

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

      {/* Invite Modal */}
      <AlertDialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invite Team Member</AlertDialogTitle>
            <AlertDialogDescription>Send an invite to join your team</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-extrabold mb-2 block">Email Address</Label>
              <Input
                type="email"
                placeholder="team@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                disabled={sendingInvite}
              />
            </div>
            <div>
              <Label className="text-sm font-extrabold mb-2 block">Role</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={inviteRole === 'manager' ? 'default' : 'outline'}
                  className={inviteRole === 'manager' ? 'bg-[#F0B429] text-black hover:bg-[#F0B429]/90' : ''}
                  onClick={() => setInviteRole('manager')}
                  disabled={sendingInvite}
                >
                  Manager
                </Button>
                <Button
                  type="button"
                  variant={inviteRole === 'viewer' ? 'default' : 'outline'}
                  className={inviteRole === 'viewer' ? 'bg-[#F0B429] text-black hover:bg-[#F0B429]/90' : ''}
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
              className="bg-[#4A7C59] hover:bg-[#3d6a4b]"
            >
              {sendingInvite ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send Invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Profile Edit Modal */}
      <AlertDialog open={profileModalOpen} onOpenChange={setProfileModalOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Profile</AlertDialogTitle>
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
                    <div className="w-full h-full rounded-full bg-[#F0B429] flex items-center justify-center text-xl font-bold text-white">
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
              <Label className="text-sm font-extrabold mb-2 block">Full Name</Label>
              <Input
                value={profileFullName}
                onChange={e => setProfileFullName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>

            {/* Business Name - only for owners */}
            {isOwner && (
              <div>
                <Label className="text-sm font-extrabold mb-2 block">Business Name</Label>
                <Input
                  value={profileBusinessName}
                  onChange={e => setProfileBusinessName(e.target.value)}
                  placeholder="Enter your business name"
                />
              </div>
            )}

            {/* Email (Read-only) */}
            <div>
              <Label className="text-sm font-extrabold mb-2 block">Email</Label>
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
              className="bg-[#4A7C59] hover:bg-[#3d6a4b]"
            >
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
