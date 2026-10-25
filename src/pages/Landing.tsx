import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Bell, Bot, Check, Megaphone, Package, ShoppingBag, Sparkles, Users,
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

export default function Landing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  useEffect(() => {
    supabase.from('plans').select('*').order('sort_order').then(({ data }) => setPlans(data ?? []));
  }, []);

  return (
    <div className="min-h-screen text-white" style={{ background: 'linear-gradient(160deg, #1A3A2A 0%, #2D5A3C 45%, #1B3A4B 100%)' }}>
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <Sparkles size={24} className="shrink-0 text-[#F0B429]" />
          <span className="whitespace-nowrap text-lg font-bold sm:text-xl">{LEGAL.businessName}</span>
        </div>
        <nav className="flex items-center gap-2 sm:gap-4">
          <a href="#pricing" className="hidden text-sm font-semibold text-white/80 hover:text-white sm:inline">Pricing</a>
          <Link to="/login" className="whitespace-nowrap text-sm font-semibold text-white/80 hover:text-white">Sign in</Link>
          <Link to="/signup" className="whitespace-nowrap rounded-lg bg-[#F0B429] px-3 py-2 text-sm font-bold text-[#1A3A2A] hover:bg-[#F0B429]/90">
            <span className="sm:hidden">Free trial</span>
            <span className="hidden sm:inline">Start free trial</span>
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-4 pb-16 pt-10 text-center sm:pt-16">
          <p className="mb-4 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#F0B429]">
            Built for Bangladeshi online sellers
          </p>
          <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
            Know exactly how your online shop is doing — and what to do next
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-white/75">
            Orders, stock, expenses and real profit in one place, with an AI business advisor
            and marketing writer that work from your own numbers.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/signup" className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#F0B429] px-6 font-bold text-[#1A3A2A] hover:bg-[#F0B429]/90">
              Start your 14-day free trial <ArrowRight size={18} />
            </Link>
            <a href="#features" className="inline-flex h-12 items-center rounded-lg border border-white/25 px-6 font-semibold text-white hover:bg-white/10">
              See what's inside
            </a>
          </div>
          <p className="mt-3 text-sm text-white/60">No card or bKash needed to start.</p>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-center text-3xl font-extrabold">Everything a growing shop needs</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl bg-white/10 p-5 backdrop-blur-sm">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#F0B429]/20">
                  <Icon size={20} className="text-[#F0B429]" />
                </div>
                <h3 className="font-bold">{title}</h3>
                <p className="mt-1 text-sm text-white/70">{desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-white/60">
            <Bell size={14} /> Plus live alerts for new orders, low stock and weak ad returns.
          </p>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="text-center text-3xl font-extrabold">Up and running in minutes</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-white/15 p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F0B429] font-extrabold text-[#1A3A2A]">{i + 1}</span>
                <h3 className="mt-3 font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-white/70">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="text-center text-3xl font-extrabold">Simple pricing in taka</h2>
          <p className="mt-2 text-center text-white/70">Start with a 14-day free trial of Pro. Pay with bKash, Nagad, Rocket or card.</p>
          <div className="mt-6 flex justify-center">
            <div className="inline-flex rounded-lg bg-white/10 p-1" role="group" aria-label="Billing period">
              {(['monthly', 'yearly'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={cn('rounded-md px-4 py-1.5 text-sm font-bold capitalize', period === p ? 'bg-[#F0B429] text-[#1A3A2A]' : 'text-white/80')}
                >
                  {p}{p === 'yearly' && ' · 2 months free'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {plans.map((p) => (
              <div key={p.id} className={cn('flex flex-col rounded-2xl p-6', p.id === 'pro' ? 'bg-white text-[#1A3A2A]' : 'bg-white/10')}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-extrabold">{p.name}</h3>
                  {p.id === 'pro' && <span className="rounded-full bg-[#F0B429] px-2 py-0.5 text-xs font-bold text-[#1A3A2A]">Most popular</span>}
                </div>
                <p className="mt-3 text-4xl font-extrabold">
                  {priceLabel(p, period)}
                  <span className={cn('text-base font-semibold', p.id === 'pro' ? 'text-[#1A3A2A]/60' : 'text-white/60')}> / {period === 'yearly' ? 'year' : 'month'}</span>
                </p>
                <ul className="my-5 flex flex-1 flex-col gap-2">
                  {planPoints(p).map((point) => (
                    <li key={point} className="flex items-start gap-2 text-sm">
                      <Check size={16} className="mt-0.5 shrink-0 text-[#4A7C59]" /> {point}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/signup"
                  className={cn('inline-flex h-11 items-center justify-center rounded-lg font-bold',
                    p.id === 'pro' ? 'bg-[#4A7C59] text-white hover:bg-[#3d6a4b]' : 'border border-white/30 hover:bg-white/10')}
                >
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-14">
          <h2 className="text-center text-3xl font-extrabold">Questions</h2>
          <div className="mt-8 flex flex-col gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl bg-white/10 p-4">
                <summary className="cursor-pointer list-none font-bold marker:hidden">{f.q}</summary>
                <p className="mt-2 text-sm text-white/75">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-3xl px-4 pb-20 pt-6 text-center">
          <h2 className="text-3xl font-extrabold">Ready to see your real profit?</h2>
          <Link to="/signup" className="mt-6 inline-flex h-12 items-center gap-2 rounded-lg bg-[#F0B429] px-6 font-bold text-[#1A3A2A] hover:bg-[#F0B429]/90">
            Start your free trial <ArrowRight size={18} />
          </Link>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-white/60 sm:flex-row">
          <p>© {new Date().getFullYear()} {LEGAL.businessName}</p>
          <nav className="flex gap-4">
            <Link to="/terms" className="hover:text-white">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-white">Privacy Policy</Link>
            <Link to="/login" className="hover:text-white">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
