import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Bell, Bot, Check, ChevronDown, Megaphone, Package, ShoppingBag, Sparkles, TrendingUp, Users,
  type LucideIcon,
} from 'lucide-react';
import { useTilt } from '@/hooks/useTilt';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/hooks/useCurrency';
import { LEGAL } from '@/lib/legal';
import WhatsAppButton from '@/components/WhatsAppButton';
import { useInstallApp } from '@/lib/pwa';
import type { BillingPeriod, Plan } from '@/lib/subscription';
import { cn } from '@/lib/utils';
import LanguageToggle from '@/components/LanguageToggle';
import { useT, tr, msg, rich } from '@/i18n';

const FEATURES = [
  { icon: ShoppingBag, title: msg('Orders from every channel'), desc: msg('Facebook, Instagram, WhatsApp, TikTok and your website in one list, with profit worked out on every order.') },
  { icon: Package, title: msg('Stock that keeps itself right'), desc: msg('Stock drops when you sell and comes back when an order is cancelled or returned. Get alerted before you run out.') },
  { icon: BarChart3, title: msg('Real profit, not guesses'), desc: msg('Revenue, product cost, shipping, ad spend and expenses add up to the profit you actually made.') },
  { icon: Bot, title: msg('An AI advisor that knows your shop'), desc: msg('Ask “What should I restock?” or “Is my Facebook ad spend worth it?” and get answers from your own numbers.') },
  { icon: Megaphone, title: msg('Marketing posts in seconds'), desc: msg('Captions, hooks and TikTok scripts written for Bangladeshi customers, ready to post.') },
  { icon: Users, title: msg('Bring your team'), desc: msg('Invite managers to help run the shop, or viewers who can only look. Everyone sees the same live data.') },
];

const STEPS = [
  { title: msg('Create your free account'), desc: msg('Tell us your business name and currency. No payment details needed.') },
  { title: msg('Add products and orders'), desc: msg('Record orders as they come in from any channel; stock and profit update automatically.') },
  { title: msg('Grow with clear numbers'), desc: msg('Check your dashboard, get low-stock alerts and ask the AI what to do next.') },
];

const FAQ = [
  { q: msg('How does the free trial work?'), a: msg('You get every Pro feature free for 14 days. No card or bKash needed. When the trial ends, your data stays safe and readable; choose a plan to keep adding orders.') },
  { q: msg('How do I pay?'), a: msg('With bKash, Nagad, Rocket or a debit/credit card through SSLCommerz. Pay monthly, or yearly and get 2 months free. Plans never renew automatically.') },
  { q: msg('Is my business data private?'), a: msg('Yes. Each business has its own workspace and only the people you invite can see it. Read our Privacy Policy for the details.') },
  { q: msg('Can I change plans later?'), a: msg('Yes. Upgrade from Starter to Pro at any time from the Billing page.') },
];

function priceLabel(p: Plan, period: BillingPeriod) {
  return formatCurrency(period === 'yearly' ? p.yearly_price : p.monthly_price, 'BDT');
}

function planPoints(p: Plan) {
  return [
    p.max_orders_per_month === null ? tr('Unlimited orders') : tr('{n} orders a month', { n: p.max_orders_per_month }),
    p.max_team_members === 0 ? tr('Just you') : tr('Up to {n} team members', { n: p.max_team_members }),
    tr('{n} AI questions a day', { n: p.ai_chat_per_day }),
    p.marketing_per_month === null ? tr('Unlimited Marketing AI') : tr('{n} Marketing AI posts a month', { n: p.marketing_per_month }),
    ...(p.weekly_summary ? [tr('Weekly business summary')] : []),
    ...(p.data_export ? [tr('Excel export')] : []),
  ];
}

const primaryCta = 'inline-flex items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground shadow-glow transition hover:brightness-110';

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="eyebrow text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** A static picture of the dashboard for the hero. Numbers are illustrative. */
function FloatingCard({ icon: Icon, tone, title, detail, className, delay = '0s' }: {
  icon: LucideIcon; tone: string; title: string; detail: string; className: string; delay?: string;
}) {
  return (
    <div className={cn('absolute z-10', className)}>
      <div className="float-y flex items-center gap-3 rounded-xl border border-border bg-popover/90 px-3.5 py-2.5 text-left shadow-2xl shadow-black/60 backdrop-blur-md" style={{ animationDelay: delay }}>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}><Icon size={15} /></span>
        <span className="min-w-0">
          <span className="block whitespace-nowrap text-xs font-medium text-foreground">{title}</span>
          <span className="block whitespace-nowrap text-[11px] text-muted-foreground">{detail}</span>
        </span>
      </div>
    </div>
  );
}

function ProductPreview() {
  const { t } = useT();
  const tiltRef = useTilt<HTMLDivElement>({ max: 9, global: true });
  const bars = [38, 52, 44, 61, 57, 72, 66, 80, 74, 90, 84, 96];
  const points = bars.map((b, i) => `${(i / (bars.length - 1)) * 100},${100 - b}`).join(' ');
  return (
    <div ref={tiltRef} className="tilt tilt-glare-on relative mx-auto mt-16 max-w-5xl" aria-hidden="true">
      <div className="absolute -inset-x-10 -top-10 bottom-0 rounded-[40px] bg-primary/20 blur-3xl" />

      <FloatingCard
        icon={ShoppingBag}
        tone="bg-primary/15 text-primary"
        title={t('New order · {amount}', { amount: '৳2,450' })}
        detail={t('Facebook · just now')}
        className="depth-lg -top-6 left-6 hidden sm:block xl:-left-10"
      />
      <FloatingCard
        icon={Package}
        tone="bg-warning/15 text-warning"
        title={t('Low stock: {product}', { product: 'Panjabi' })}
        detail={t('3 left · restock soon')}
        className="depth-md right-3 top-1/2 hidden sm:block xl:-right-14"
        delay="-2s"
      />
      <FloatingCard
        icon={Bot}
        tone="bg-highlight/15 text-highlight"
        title={t('AI: Facebook ads pay off')}
        detail={t('ROAS 4.2x this week')}
        className="depth-lg -bottom-6 left-1/4 hidden md:block"
        delay="-4s"
      />

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/80 p-2 shadow-2xl shadow-black/60 backdrop-blur">
        <div className="tilt-glare" />
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="ml-3 text-xs text-muted-foreground">{t('Dashboard')}</span>
        </div>
        <div className="grid gap-3 rounded-xl bg-background p-4 text-left sm:grid-cols-4">
          {[
            { l: t('Revenue'), v: '৳2,48,350', d: '+18%' },
            { l: t('Net profit'), v: '৳61,920', d: '+12%' },
            { l: t('Orders'), v: '412', d: '+9%' },
            { l: t('Inventory value'), v: '৳1,12,800', d: '' },
          ].map((k, i) => (
            <div key={k.l} className={cn('surface p-4', i === 0 && 'border-primary/40 shadow-glow')}>
              <p className="text-xs text-muted-foreground">{k.l}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{k.v}</p>
              {k.d && <p className="mt-1 inline-flex items-center gap-1 text-xs text-success"><TrendingUp size={12} />{k.d}</p>}
            </div>
          ))}
          <div className="surface p-4 sm:col-span-3">
            <p className="text-sm font-medium">{t('Revenue')}</p>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-36 w-full">
              <defs>
                <linearGradient id="lp-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={`0,100 ${points} 100,100`} fill="url(#lp-fill)" />
              <polyline points={points} fill="none" stroke="#10B981" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="surface flex flex-col p-4">
            <p className="text-sm font-medium">{t('Top channels')}</p>
            <div className="mt-3 flex flex-1 flex-col justify-center gap-3">
              {[['Facebook', 64], ['Instagram', 22], ['WhatsApp', 14]].map(([n, w]) => (
                <div key={n}>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">{n}</span><span>{w}%</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-highlight" style={{ width: `${w}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A card that tilts toward the pointer with a soft mint glare. */
function TiltCard({ className, children, max = 6 }: { className?: string; children: React.ReactNode; max?: number }) {
  const ref = useTilt<HTMLDivElement>({ max });
  return (
    <div ref={ref} className={cn('tilt relative', className)}>
      <div className="tilt-glare" />
      {children}
    </div>
  );
}

export default function Landing() {
  const { t } = useT();
  const heroRef = useTilt<HTMLElement>({ global: true });
  const [plans, setPlans] = useState<Plan[]>([]);
  const installApp = useInstallApp();
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  useEffect(() => {
    supabase.from('plans').select('*').order('sort_order').then(({ data }) => setPlans(data ?? []));
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <img src="/logo-64.webp" width={32} height={32} alt="" className="h-7 w-7 rounded-lg sm:h-8 sm:w-8" />
            <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight max-[359px]:sr-only sm:text-lg">{LEGAL.businessName}</span>
          </Link>
          <nav className="flex items-center sm:gap-2">
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground md:inline">{t('Features')}</a>
            <a href="#pricing" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline">{t('Pricing')}</a>
            <LanguageToggle className="max-sm:px-1.5 max-sm:[&>svg]:hidden" />
            <Link to="/login" className="whitespace-nowrap rounded-lg px-2 py-2 text-sm sm:px-3 text-muted-foreground hover:text-foreground">{t('Sign in')}</Link>
            <Link to="/signup" className={cn(primaryCta, 'h-9 whitespace-nowrap px-4 text-sm')}>
              <span className="sm:hidden">{t('Free trial')}</span>
              <span className="hidden sm:inline">{t('Start free trial')}</span>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section ref={heroRef} className="relative overflow-hidden">
          <div className="bg-grid parallax pointer-events-none absolute -inset-10 [--shift:-14px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
          <div className="parallax pointer-events-none absolute inset-x-0 top-0 flex justify-center [--shift:40px]">
            <div className="h-[480px] w-[900px] max-w-[160vw] rounded-full bg-primary/15 blur-3xl" />
          </div>
          <div className="parallax pointer-events-none absolute -left-32 top-40 [--shift:-50px]">
            <div className="orb !static h-72 w-72 bg-highlight/15" />
          </div>
          <div className="parallax pointer-events-none absolute -right-24 top-24 [--shift:60px]">
            <div className="orb !static h-64 w-64 bg-primary/20 [animation-delay:-9s]" />
          </div>
          <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:pt-24">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles size={13} /> {t('Built for Bangladeshi online sellers')}
            </p>
            <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
              {rich(t('Know exactly how your shop is doing, {next}'), { next: <span className="text-gradient">{t('and what to do next')}</span> })}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              {t('Orders, stock, expenses and real profit in one place, with an AI business advisor and marketing writer that work from your own numbers.')}
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/signup" className={cn(primaryCta, 'h-12 px-6')}>
                {t('Start your 14-day free trial')} <ArrowRight size={18} />
              </Link>
              <a href="#features" className="inline-flex h-12 items-center rounded-lg border border-border bg-card/60 px-6 font-medium transition-colors hover:bg-secondary">
                {t("See what's inside")}
              </a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{t('No card or bKash needed to start.')}</p>
            <ProductPreview />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <SectionHeading eyebrow={t('Features')} title={t('Everything a growing shop needs')} sub={t('One app instead of a notebook, three spreadsheets and guesswork.')} />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <TiltCard key={title} className="surface-interactive p-6">
                <div className="depth-sm flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <Icon size={20} />
                </div>
                <h3 className="depth-sm mt-4 font-semibold">{t(title)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(desc)}</p>
              </TiltCard>
            ))}
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Bell size={14} className="text-primary" /> {t('Plus live alerts for new orders, low stock and weak ad returns.')}
          </p>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-5xl px-4 py-20">
          <SectionHeading eyebrow={t('How it works')} title={t('Up and running in minutes')} />
          <ol className="relative mt-12 grid gap-6 md:grid-cols-3">
            <div className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-primary/40 bg-background text-sm font-semibold text-primary shadow-glow">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{t(s.title)}</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">{t(s.desc)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-20">
          <SectionHeading eyebrow={t('Pricing')} title={t('Simple pricing in taka')} sub={t('Start with a 14-day free trial of Pro. Pay with bKash, Nagad, Rocket or card.')} />
          <div className="mt-8 flex justify-center">
            <div className="inline-flex rounded-lg border border-border bg-muted p-1" role="group" aria-label={t('Billing period')}>
              {(['monthly', 'yearly'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                    period === p ? 'bg-secondary text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground')}
                >
                  {p === 'yearly' ? t('Yearly') : t('Monthly')}{p === 'yearly' && <span className="text-primary"> · {t('2 months free')}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {plans.map((p) => {
              const pro = p.id === 'pro';
              return (
                <TiltCard
                  key={p.id}
                  max={4}
                  className={cn('flex flex-col rounded-2xl border p-7',
                    pro ? 'border-primary/50 bg-gradient-to-b from-primary/10 to-card shadow-glow' : 'border-border bg-card')}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    {pro && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">{t('Most popular')}</span>}
                  </div>
                  <p className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums">{priceLabel(p, period)}</span>
                    <span className="text-sm text-muted-foreground">/ {period === 'yearly' ? t('year') : t('month')}</span>
                  </p>
                  <ul className="my-6 flex flex-1 flex-col gap-2.5 border-t border-border pt-6">
                    {planPoints(p).map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <Check size={11} strokeWidth={3} />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/signup"
                    className={cn('h-11',
                      pro ? cn(primaryCta) : 'inline-flex items-center justify-center rounded-lg border border-border font-medium transition-colors hover:bg-secondary')}
                  >
                    {t('Start free trial')}
                  </Link>
                </TiltCard>
              );
            })}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20">
          <SectionHeading eyebrow={t('FAQ')} title={t('Questions')} />
          <div className="mt-10 flex flex-col gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="surface group p-5 open:border-primary/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  {t(f.q)}
                  <ChevronDown size={18} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(f.a)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-5xl px-4 pb-24 pt-4">
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card px-6 py-14 text-center">
            <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
            <div className="relative">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('Ready to see your real profit?')}</h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">{t('Set up in a few minutes. Your first 14 days are on us.')}</p>
              <Link to="/signup" className={cn(primaryCta, 'mt-8 h-12 px-6')}>
                {t('Start your free trial')} <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 pb-24 pt-8 text-sm text-muted-foreground sm:flex-row sm:pb-8">
          <p>© {new Date().getFullYear()} {LEGAL.businessName}</p>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {installApp.available && (
              <button type="button" onClick={installApp.install} className="hover:text-foreground">{t('Install the app')}</button>
            )}
            <Link to="/terms" className="hover:text-foreground">{t('Terms of Service')}</Link>
            <Link to="/privacy" className="hover:text-foreground">{t('Privacy Policy')}</Link>
            <Link to="/login" className="hover:text-foreground">{t('Sign in')}</Link>
          </nav>
        </div>
      </footer>
      <WhatsAppButton />
    </div>
  );
}
