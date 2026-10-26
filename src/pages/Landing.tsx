import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Bell, Bot, Check, ChevronDown, Megaphone, Package, ShoppingBag, Sparkles, TrendingUp, Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/hooks/useCurrency';
import { LEGAL } from '@/lib/legal';
import type { BillingPeriod, Plan } from '@/lib/subscription';
import { cn } from '@/lib/utils';

const FEATURES = [
  { icon: ShoppingBag, title: 'Orders from every channel', desc: 'Facebook, Instagram, WhatsApp, TikTok and your website in one list, with profit worked out on every order.' },
  { icon: Package, title: 'Stock that keeps itself right', desc: 'Stock drops when you sell and comes back when an order is cancelled. Get alerted before you run out.' },
  { icon: BarChart3, title: 'Real profit, not guesses', desc: 'Revenue, product cost, shipping, ad spend and expenses add up to the profit you actually made.' },
  { icon: Bot, title: 'An AI advisor that knows your shop', desc: 'Ask “What should I restock?” or “Is my Facebook ad spend worth it?” and get answers from your own numbers.' },
  { icon: Megaphone, title: 'Marketing posts in seconds', desc: 'Captions, hooks and TikTok scripts written for Bangladeshi customers, ready to post.' },
  { icon: Users, title: 'Bring your team', desc: 'Invite managers to help run the shop, or viewers who can only look. Everyone sees the same live data.' },
];

const STEPS = [
  { title: 'Create your free account', desc: 'Tell us your business name and currency. No payment details needed.' },
  { title: 'Add products and orders', desc: 'Record orders as they come in from any channel; stock and profit update automatically.' },
  { title: 'Grow with clear numbers', desc: 'Check your dashboard, get low-stock alerts and ask the AI what to do next.' },
];

const FAQ = [
  { q: 'How does the free trial work?', a: 'You get every Pro feature free for 14 days. No card or bKash needed. When the trial ends, your data stays safe and readable; choose a plan to keep adding orders.' },
  { q: 'How do I pay?', a: 'With bKash, Nagad, Rocket or a debit/credit card through SSLCommerz. Pay monthly, or yearly and get 2 months free. Plans never renew automatically.' },
  { q: 'Is my business data private?', a: 'Yes. Each business has its own workspace and only the people you invite can see it. Read our Privacy Policy for the details.' },
  { q: 'Can I change plans later?', a: 'Yes. Upgrade from Starter to Pro at any time from the Billing page.' },
];

function priceLabel(p: Plan, period: BillingPeriod) {
  return formatCurrency(period === 'yearly' ? p.yearly_price : p.monthly_price, 'BDT');
}

function planPoints(p: Plan) {
  return [
    p.max_orders_per_month === null ? 'Unlimited orders' : `${p.max_orders_per_month} orders a month`,
    p.max_team_members === 0 ? 'Just you' : `Up to ${p.max_team_members} team members`,
    `${p.ai_chat_per_day} AI questions a day`,
    p.marketing_per_month === null ? 'Unlimited Marketing AI' : `${p.marketing_per_month} Marketing AI posts a month`,
    ...(p.weekly_summary ? ['Weekly business summary'] : []),
    ...(p.data_export ? ['Excel export'] : []),
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
function ProductPreview() {
  const bars = [38, 52, 44, 61, 57, 72, 66, 80, 74, 90, 84, 96];
  const points = bars.map((b, i) => `${(i / (bars.length - 1)) * 100},${100 - b}`).join(' ');
  return (
    <div className="relative mx-auto mt-16 max-w-5xl" aria-hidden="true">
      <div className="absolute -inset-x-10 -top-10 bottom-0 rounded-[40px] bg-primary/20 blur-3xl" />
      <div className="relative rounded-2xl border border-border bg-card/80 p-2 shadow-2xl shadow-black/60 backdrop-blur">
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="ml-3 text-xs text-muted-foreground">Dashboard</span>
        </div>
        <div className="grid gap-3 rounded-xl bg-background p-4 text-left sm:grid-cols-4">
          {[
            { l: 'Revenue', v: '৳2,48,350', d: '+18%' },
            { l: 'Net profit', v: '৳61,920', d: '+12%' },
            { l: 'Orders', v: '412', d: '+9%' },
            { l: 'Inventory value', v: '৳1,12,800', d: '' },
          ].map((k, i) => (
            <div key={k.l} className={cn('surface p-4', i === 0 && 'border-primary/40 shadow-glow')}>
              <p className="text-xs text-muted-foreground">{k.l}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{k.v}</p>
              {k.d && <p className="mt-1 inline-flex items-center gap-1 text-xs text-success"><TrendingUp size={12} />{k.d}</p>}
            </div>
          ))}
          <div className="surface p-4 sm:col-span-3">
            <p className="text-sm font-medium">Revenue</p>
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
            <p className="text-sm font-medium">Top channels</p>
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

export default function Landing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  useEffect(() => {
    supabase.from('plans').select('*').order('sort_order').then(({ data }) => setPlans(data ?? []));
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/icon.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="whitespace-nowrap text-base font-semibold tracking-tight sm:text-lg">{LEGAL.businessName}</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground md:inline">Features</a>
            <a href="#pricing" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline">Pricing</a>
            <Link to="/login" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
            <Link to="/signup" className={cn(primaryCta, 'h-9 whitespace-nowrap px-4 text-sm')}>
              <span className="sm:hidden">Free trial</span>
              <span className="hidden sm:inline">Start free trial</span>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:pt-24">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles size={13} /> Built for Bangladeshi online sellers
            </p>
            <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
              Know exactly how your shop is doing, <span className="text-gradient">and what to do next</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Orders, stock, expenses and real profit in one place, with an AI business advisor
              and marketing writer that work from your own numbers.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/signup" className={cn(primaryCta, 'h-12 px-6')}>
                Start your 14-day free trial <ArrowRight size={18} />
              </Link>
              <a href="#features" className="inline-flex h-12 items-center rounded-lg border border-border bg-card/60 px-6 font-medium transition-colors hover:bg-secondary">
                See what's inside
              </a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">No card or bKash needed to start.</p>
            <ProductPreview />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <SectionHeading eyebrow="Features" title="Everything a growing shop needs" sub="One app instead of a notebook, three spreadsheets and guesswork." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="surface-interactive p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <Icon size={20} />
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Bell size={14} className="text-primary" /> Plus live alerts for new orders, low stock and weak ad returns.
          </p>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-5xl px-4 py-20">
          <SectionHeading eyebrow="How it works" title="Up and running in minutes" />
          <ol className="relative mt-12 grid gap-6 md:grid-cols-3">
            <div className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-primary/40 bg-background text-sm font-semibold text-primary shadow-glow">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-20">
          <SectionHeading eyebrow="Pricing" title="Simple pricing in taka" sub="Start with a 14-day free trial of Pro. Pay with bKash, Nagad, Rocket or card." />
          <div className="mt-8 flex justify-center">
            <div className="inline-flex rounded-lg border border-border bg-muted p-1" role="group" aria-label="Billing period">
              {(['monthly', 'yearly'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                    period === p ? 'bg-secondary text-foreground ring-1 ring-border' : 'text-muted-foreground hover:text-foreground')}
                >
                  {p === 'yearly' ? 'Yearly' : 'Monthly'}{p === 'yearly' && <span className="text-primary"> · 2 months free</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {plans.map((p) => {
              const pro = p.id === 'pro';
              return (
                <div
                  key={p.id}
                  className={cn('relative flex flex-col rounded-2xl border p-7',
                    pro ? 'border-primary/50 bg-gradient-to-b from-primary/10 to-card shadow-glow' : 'border-border bg-card')}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    {pro && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">Most popular</span>}
                  </div>
                  <p className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums">{priceLabel(p, period)}</span>
                    <span className="text-sm text-muted-foreground">/ {period === 'yearly' ? 'year' : 'month'}</span>
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
                    Start free trial
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20">
          <SectionHeading eyebrow="FAQ" title="Questions" />
          <div className="mt-10 flex flex-col gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="surface group p-5 open:border-primary/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown size={18} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-5xl px-4 pb-24 pt-4">
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card px-6 py-14 text-center">
            <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
            <div className="relative">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to see your real profit?</h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">Set up in a few minutes. Your first 14 days are on us.</p>
              <Link to="/signup" className={cn(primaryCta, 'mt-8 h-12 px-6')}>
                Start your free trial <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} {LEGAL.businessName}</p>
          <nav className="flex gap-5">
            <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link to="/login" className="hover:text-foreground">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
