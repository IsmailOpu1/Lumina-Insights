import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Sparkles, ArrowRight, Check, Loader2, ShoppingBag, Megaphone, MessageSquare, Copy } from 'lucide-react';
import { toast } from 'sonner';

const BUSINESS_TYPES = ['Fashion/Clothing', 'Electronics', 'Food & Beverage', 'Beauty & Skincare', 'Home & Living', 'Other'];

const CURRENCIES = [
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refreshSettings } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 2
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [businessDesc, setBusinessDesc] = useState('');
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');

  // Step 3
  const [currency, setCurrency] = useState('BDT');

  // Step 4
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [sentInvites, setSentInvites] = useState<{ email: string; role: string; link: string }[]>([]);
  const [sendingInvite, setSendingInvite] = useState(false);

  const totalSteps = 5;
  const progress = (step / totalSteps) * 100;

  const nextStep = () => setStep((s) => Math.min(s + 1, totalSteps));
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !user) return;
    setSendingInvite(true);
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('invites').insert({
      owner_id: user.id,
      email: inviteEmail.trim(),
      role: inviteRole,
      token,
      expires_at: expiresAt,
    });

    const link = `${window.location.origin}/invite/${token}`;
    setSentInvites((prev) => [...prev, { email: inviteEmail.trim(), role: inviteRole, link }]);
    setInviteEmail('');
    setSendingInvite(false);
    toast.success('Invite sent!');
  };

  const finish = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('user_settings').upsert({
      user_id: user.id,
      owner_id: user.id,
      business_name: businessName.trim(),
      business_type: businessType,
      business_description: businessDesc.trim(),
      currency,
      user_full_name: fullName.trim(),
      role: 'owner',
      onboarding_complete: true,
    } as any, { onConflict: 'user_id' });

    await refreshSettings();
    setSaving(false);
    navigate('/', { replace: true });
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #1A3A2A, #2D5A3C, #1B3A4B)',
        backgroundSize: '200% 200%',
        animation: 'authGradient 10s ease infinite',
      }}
    >
      <style>{`
        @keyframes authGradient { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes slideLeft { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes confetti { 0% { transform: translateY(0) rotate(0); opacity: 1; } 100% { transform: translateY(-200px) rotate(720deg); opacity: 0; } }
      `}</style>

      <div className="w-full max-w-[560px]">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-3 w-3 rounded-full transition-all ${i + 1 <= step ? 'bg-[#F0B429]' : 'bg-white/20'}`} />
          ))}
        </div>
        <Progress value={progress} className="h-1.5 mb-6" />

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-card p-8 shadow-2xl" style={{ animation: 'slideLeft 400ms ease' }}>
          {step === 1 && (
            <div className="text-center flex flex-col items-center gap-4">
              <div style={{ animation: 'scaleIn 600ms ease' }}>
                <Sparkles size={56} className="text-[#F0B429]" />
              </div>
              <h1 className="text-[28px] font-bold text-foreground">Welcome to Lumina Insights!</h1>
              <p className="text-muted-foreground">Let's set up your business in just a few steps</p>
              <Button onClick={nextStep} className="mt-4 h-12 w-full bg-[#4A7C59] font-bold text-white hover:bg-[#3d6a4b]">
                Let's Get Started <ArrowRight size={18} className="ml-2" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold text-foreground">Tell us about your business</h2>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Business Name *</label>
                <Input placeholder='e.g. Rahman Electronics' value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="h-12" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Business Type *</label>
                <Select value={businessType} onValueChange={setBusinessType}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Business Description *</label>
                <Textarea
                  placeholder="e.g. We sell handmade jewelry on Instagram and WhatsApp in Dhaka. Our main customers are women aged 18-35 in Bangladesh."
                  value={businessDesc}
                  onChange={(e) => setBusinessDesc(e.target.value.slice(0, 300))}
                  className="min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground mt-1">{businessDesc.length}/300 — This helps our AI give you better advice</p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Your Full Name *</label>
                <Input placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12" />
              </div>
              <div className="flex gap-3 mt-2">
                <Button variant="outline" onClick={prevStep} className="flex-1 h-12">Back</Button>
                <Button
                  onClick={nextStep}
                  disabled={!businessName.trim() || !businessType || !businessDesc.trim() || !fullName.trim()}
                  className="flex-1 h-12 bg-[#4A7C59] font-bold text-white hover:bg-[#3d6a4b]"
                >
                  Continue <ArrowRight size={18} className="ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-bold text-foreground">Choose your currency</h2>
              <p className="text-muted-foreground">This will be used across your entire dashboard</p>
              <div className="grid grid-cols-3 max-md:grid-cols-2 gap-3 mt-2">
                {CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => setCurrency(c.code)}
                    className={`relative rounded-xl border-2 p-4 text-center transition-all ${
                      currency === c.code ? 'border-[#F0B429] bg-[#F0B429]/10' : 'border-border bg-card hover:border-muted-foreground/30'
                    }`}
                  >
                    {currency === c.code && (
                      <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#F0B429]">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                    <p className="text-3xl font-bold text-foreground">{c.symbol}</p>
                    <p className="text-sm text-muted-foreground mt-1">{c.name}</p>
                    <span className="inline-block mt-1 rounded bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">{c.code}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-3 mt-2">
                <Button variant="outline" onClick={prevStep} className="flex-1 h-12">Back</Button>
                <Button onClick={nextStep} className="flex-1 h-12 bg-[#4A7C59] font-bold text-white hover:bg-[#3d6a4b]">
                  Continue <ArrowRight size={18} className="ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-foreground">Build your team</h2>
                <button onClick={nextStep} className="text-sm font-bold text-muted-foreground hover:underline">Skip for now</button>
              </div>
              <p className="text-muted-foreground">Invite team members to collaborate</p>

              <div className="flex gap-2">
                <Input placeholder="Email address" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="flex-1 h-11" />
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="w-[120px] h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={sendInvite} disabled={sendingInvite || !inviteEmail.trim()} className="h-11 bg-[#4A7C59] text-white hover:bg-[#3d6a4b]">
                  {sendingInvite ? <Loader2 className="animate-spin" size={16} /> : 'Send'}
                </Button>
              </div>

              {sentInvites.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  {sentInvites.map((inv, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                      <Check size={14} className="text-[#4A7C59] shrink-0" />
                      <span className="font-medium text-foreground truncate flex-1">{inv.email}</span>
                      <span className="text-xs text-muted-foreground capitalize">{inv.role}</span>
                      <button onClick={() => { navigator.clipboard.writeText(inv.link); toast.success('Link copied!'); }} className="text-muted-foreground hover:text-foreground">
                        <Copy size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <Button variant="outline" onClick={prevStep} className="flex-1 h-12">Back</Button>
                <Button onClick={nextStep} className="flex-1 h-12 bg-[#4A7C59] font-bold text-white hover:bg-[#3d6a4b]">
                  Continue <ArrowRight size={18} className="ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center flex flex-col items-center gap-4">
              {/* Confetti dots */}
              <div className="relative h-16 w-full overflow-hidden">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute bottom-0 h-3 w-3 rounded-full"
                    style={{
                      left: `${8 + i * 8}%`,
                      backgroundColor: ['#F0B429', '#4A7C59', '#3B82F6', '#EF4444'][i % 4],
                      animation: `confetti 1.5s ease ${i * 80}ms infinite`,
                    }}
                  />
                ))}
              </div>

              <div style={{ animation: 'scaleIn 600ms ease' }}>
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#4A7C59]/20 mx-auto">
                  <Check size={40} className="text-[#4A7C59]" />
                </div>
              </div>
              <h1 className="text-[28px] font-bold text-foreground">You're all set! 🎉</h1>
              <p className="text-lg font-bold text-foreground">{businessName}</p>
              <p className="text-muted-foreground">Your dashboard is ready</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mt-2">
                {[
                  { icon: ShoppingBag, label: 'Add your first order', path: '/orders' },
                  { icon: Megaphone, label: 'Generate marketing content', path: '/marketing-ai' },
                  { icon: MessageSquare, label: 'Ask your AI assistant', path: '/ai-assistant' },
                ].map((tip) => (
                  <button
                    key={tip.path}
                    onClick={() => { finish().then(() => navigate(tip.path)); }}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-center transition-all hover:border-[#F0B429]/50 hover:bg-[#F0B429]/5"
                  >
                    <tip.icon size={24} className="text-[#F0B429]" />
                    <span className="text-sm font-medium text-foreground">{tip.label}</span>
                  </button>
                ))}
              </div>

              <Button onClick={finish} disabled={saving} className="mt-4 h-12 w-full bg-[#4A7C59] font-bold text-white hover:bg-[#3d6a4b]">
                {saving ? <Loader2 className="animate-spin" size={20} /> : <>Go to Dashboard <ArrowRight size={18} className="ml-2" /></>}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
