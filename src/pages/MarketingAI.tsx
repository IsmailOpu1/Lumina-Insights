import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import AITextRenderer from '@/components/AITextRenderer';
import { Copy, RefreshCw, Save, Trash2, Sparkles, Loader2, Anchor, Gem, Megaphone, MessageSquareText, Clapperboard, Hash, Lightbulb, Wand2, PenLine, Facebook, Instagram, Music2, type LucideIcon } from 'lucide-react';
import GlowBackdrop from '@/components/GlowBackdrop';
import { useSubscription } from '@/context/SubscriptionContext';
import PageHeader from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { dbErrorMessage, functionErrorMessage } from '@/lib/dbErrors';

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok'] as const;
type Platform = typeof PLATFORMS[number];

const EXAMPLE_BRIEFS: { product: string; platform: Platform; features: string; audience: string }[] = [
  { product: 'Handloom cotton saree', platform: 'Facebook', features: 'Pure Tangail cotton, breathable, hand-woven, 6 colours, free delivery in Dhaka', audience: 'Women 25-45 who want comfortable saree for office and daily wear' },
  { product: 'Organic Sundarbans honey', platform: 'Instagram', features: 'Raw, unprocessed, lab tested, 500g glass jar, 10% off this week', audience: 'Health-conscious families in Dhaka and Chattogram' },
  { product: 'Wireless earbuds', platform: 'TikTok', features: '30 hour battery, noise cancelling, 1 year warranty, cash on delivery', audience: 'Students and young professionals aged 18-30' },
];

interface MarketingOutput {
  hook: string | null;
  value_proposition: string | null;
  cta: string | null;
  caption: string | null;
  script: string | null;
  hashtags: string[] | null;
}

export default function MarketingAI() {
  const { ownerIdForQueries } = useAuth();
  const [productName, setProductName] = useState('');
  const [platform, setPlatform] = useState<Platform>('Instagram');
  const [features, setFeatures] = useState('');
  const [audience, setAudience] = useState('');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<MarketingOutput | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<string[]>([]);
  const { subscription } = useSubscription();

  useEffect(() => {
    supabase.from('inventory').select('product_name').order('product_name').limit(6)
      .then(({ data }) => setProducts((data ?? []).map((r) => r.product_name)));
  }, []);

  const generate = async () => {
    if (!productName.trim()) {
      toast({ title: 'Product name is required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setError('');
    setOutput(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'generate-marketing-content',
        {
          body: {
            product_name: productName,
            platform,
            product_features: features,
            target_audience: audience,
          },
        }
      );

      if (fnError) throw new Error(await functionErrorMessage(fnError, 'Generation failed. Please try again.'));
      if (data?.error) throw new Error(data.error);

      let hashtags = data.hashtags;
      if (typeof hashtags === 'string') {
        hashtags = hashtags.split(/[,\s]+/).filter(Boolean);
      }
      if (Array.isArray(hashtags)) {
        hashtags = hashtags.map((h: string) => h.replace(/^#/, ''));
      }

      setOutput({ ...data, hashtags });
    } catch (e) {
      console.error(e);
      setError((e instanceof Error && e.message) || 'Generation failed. Check API key or try again.');
    } finally {
      setLoading(false);
    }
  };

  const saveToNotes = async () => {
    if (!output) return;
    setSaving(true);
    try {
      const now = new Date().toLocaleDateString('en-GB');
      const hashtagStr = output.hashtags?.map((h) => `#${h}`).join(' ') || '';

      const { error: outputError } = await supabase.from('marketing_outputs').insert({
        product_name: productName,
        platform,
        product_features: features || null,
        target_audience: audience || null,
        hook: output.hook,
        value_proposition: output.value_proposition,
        cta: output.cta,
        caption: output.caption,
        script: output.script,
        hashtags: hashtagStr,
        owner_id: ownerIdForQueries,
      });
      if (outputError) throw new Error(dbErrorMessage(outputError.message));

      const { error: noteError } = await supabase.from('notes').insert({
        type: 'ai_output',
        source_module: 'marketing_ai',
        title: `${productName} — ${platform} — ${now}`,
        transcript: `${output.hook || ''}\n\n${output.caption || ''}`,
        owner_id: ownerIdForQueries,
      });
      if (noteError) throw new Error(dbErrorMessage(noteError.message));

      toast({ title: 'Saved to Notes ✓' });
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  const copyHashtag = (tag: string) => {
    navigator.clipboard.writeText(`#${tag}`);
    toast({ title: `Copied #${tag}!` });
  };

  const copyAllHashtags = () => {
    if (!output?.hashtags) return;
    const all = output.hashtags.map((h) => `#${h}`).join(' ');
    navigator.clipboard.writeText(all);
    toast({ title: 'All hashtags copied!' });
  };

  const clear = () => {
    setOutput(null);
    setError('');
  };

  const getScriptLabel = () => {
    if (platform === 'TikTok') return 'TikTok video script';
    if (platform === 'Instagram') return 'Instagram Reel script';
    return 'Facebook video script';
  };

  const getScriptTip = () => {
    if (platform === 'TikTok')
      return 'Paste into Runway, Kling or CapCut — add your product images where indicated.';
    if (platform === 'Instagram')
      return 'Paste into CapCut or InShot — add your product visuals where indicated.';
    return 'Paste into any video editor — add your product footage where indicated.';
  };

  const PLATFORM_META: Record<Platform, { hint: string; icon: LucideIcon; tint: string }> = {
    Facebook: { hint: 'Post + video script', icon: Facebook, tint: 'text-[#60A5FA]' },
    Instagram: { hint: 'Caption + Reel script', icon: Instagram, tint: 'text-[#F472B6]' },
    TikTok: { hint: 'Hook + video script', icon: Music2, tint: 'text-highlight' },
  };

  const filled = [productName, features, audience].filter((v) => v.trim()).length;

  function applyExample(e: typeof EXAMPLE_BRIEFS[number]) {
    setProductName(e.product);
    setPlatform(e.platform);
    setFeatures(e.features);
    setAudience(e.audience);
  }

  return (
    <div className="relative isolate mx-auto max-w-[1400px]">
      <GlowBackdrop className="-inset-x-10 -top-10 opacity-70" />
      <PageHeader
        title="Marketing AI"
        subtitle="Describe a product and get a ready-to-post hook, caption, video script and hashtags for Bangladeshi buyers."
        actions={subscription && subscription.limits.marketing_per_month !== null && (
          <span className="rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            {subscription.usage.marketing_this_month} / {subscription.limits.marketing_per_month} used this month
          </span>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(340px,420px)_1fr]">
        {/* Brief */}
        <section className="self-start rounded-xl border border-border bg-card/80 backdrop-blur-xl lg:sticky lg:top-4">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold"><PenLine size={16} className="text-primary" />Product brief</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => <span key={i} className={cn('h-1.5 w-4 rounded-full', i < filled ? 'bg-primary' : 'bg-muted')} />)}
              </div>
              {filled}/3
            </div>
          </div>

          <div className="space-y-6 p-5">
            <div>
              <Label htmlFor="mkt-product" className="text-sm">1. Product <span className="text-primary">*</span></Label>
              <Input
                id="mkt-product"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Organic Honey from Sundarbans"
                className="mt-2"
              />
              {products.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="self-center text-[11px] text-muted-foreground">Your products:</span>
                  {products.map((name) => (
                    <button
                      key={name}
                      onClick={() => setProductName(name)}
                      className={cn(
                        'max-w-[160px] truncate rounded-md border px-2 py-0.5 text-xs transition-colors',
                        productName === name ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-sm">2. Where will you post it?</Label>
              <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Platform">
                {PLATFORMS.map((p) => {
                  const meta = PLATFORM_META[p];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      aria-pressed={platform === p}
                      className={cn(
                        'flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors',
                        platform === p
                          ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/40'
                          : 'border-border bg-background/30 hover:border-primary/40 hover:bg-secondary'
                      )}
                    >
                      <Icon size={18} className={meta.tint} />
                      <span>
                        <span className="block text-sm font-medium">{p}</span>
                        <span className="block text-[11px] leading-tight text-muted-foreground">{meta.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label htmlFor="mkt-features" className="text-sm">3. What makes it special</Label>
              <Textarea
                id="mkt-features"
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
                placeholder="Key features, benefits, price, offer..."
                rows={3}
                className="mt-2 resize-none"
              />
            </div>

            <div>
              <Label htmlFor="mkt-audience" className="text-sm">4. Who is it for</Label>
              <Input
                id="mkt-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Health-conscious women aged 25-40 in Dhaka"
                className="mt-2"
              />
            </div>

            <Button onClick={generate} disabled={loading} className="h-11 w-full gap-2 font-semibold shadow-glow">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? 'Writing...' : output ? 'Write again' : 'Write my content'}
            </Button>
          </div>
        </section>

        {/* Result */}
        <section className="min-w-0">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                <Loader2 size={14} className="animate-spin text-primary" /> Writing your {platform} content...
              </p>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn('surface space-y-3 p-5', i === 2 && 'sm:col-span-2')}>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  {i === 2 && <Skeleton className="h-24 w-full" />}
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="surface border-destructive/40 p-6">
              <p className="font-medium text-destructive">Could not write the content</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={generate}>
                <RefreshCw size={14} /> Try again
              </Button>
            </div>
          ) : output ? (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-card/80 px-5 py-3 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  {(() => { const Icon = PLATFORM_META[platform].icon; return <Icon size={18} className={PLATFORM_META[platform].tint} />; })()}
                  <div>
                    <p className="text-sm font-semibold">{productName}</p>
                    <p className="text-xs text-muted-foreground">Ready for {platform}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={clear} variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                    <Trash2 size={14} /> Clear
                  </Button>
                  <Button onClick={generate} variant="outline" size="sm" className="gap-1.5">
                    <RefreshCw size={14} /> Regenerate
                  </Button>
                  <Button onClick={saveToNotes} disabled={saving} size="sm" className="gap-1.5">
                    <Save size={14} />
                    {saving ? 'Saving...' : 'Save to Notes'}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {output.hook && (
                  <Section icon={Anchor} label="Hook" className="sm:col-span-2 border-primary/30 bg-primary/[0.05]" onCopy={() => copyToClipboard(output.hook || '', 'Hook')}>
                    <AITextRenderer content={output.hook} className="text-lg font-medium" />
                  </Section>
                )}
                {output.value_proposition && (
                  <Section icon={Gem} label="Why buy it" onCopy={() => copyToClipboard(output.value_proposition || '', 'Value proposition')}>
                    <AITextRenderer content={output.value_proposition} />
                  </Section>
                )}
                {output.cta && (
                  <Section icon={Megaphone} label="Call to action" onCopy={() => copyToClipboard(output.cta || '', 'Call to action')}>
                    <AITextRenderer content={output.cta} />
                  </Section>
                )}
                {output.caption && (
                  <Section icon={MessageSquareText} label="Caption" className="sm:col-span-2" onCopy={() => copyToClipboard(output.caption || '', 'Caption')}>
                    <AITextRenderer content={output.caption} />
                  </Section>
                )}
                {output.script && (
                  <Section icon={Clapperboard} label={getScriptLabel()} className={cn(!(output.hashtags && output.hashtags.length) && 'sm:col-span-2')} onCopy={() => copyToClipboard(output.script || '', 'Script')}>
                    <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 font-sans text-sm leading-relaxed text-foreground">
                      {typeof output.script === 'string' ? output.script : JSON.stringify(output.script)}
                    </pre>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Lightbulb size={13} className="mt-px shrink-0 text-warning" /> {getScriptTip()}
                    </p>
                  </Section>
                )}
                {output.hashtags && output.hashtags.length > 0 && (
                  <Section icon={Hash} label="Hashtags" copyLabel="Copy all" onCopy={copyAllHashtags} className={cn(!output.script && 'sm:col-span-2')}>
                    <div className="flex flex-wrap gap-1.5">
                      {output.hashtags.map((tag, i) => (
                        <button
                          key={i}
                          onClick={() => copyHashtag(tag)}
                          className="rounded-md border border-highlight/25 bg-highlight/10 px-2.5 py-1 text-xs font-medium text-highlight transition-colors hover:bg-highlight/20"
                          title="Click to copy"
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
              {/* What you get */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center backdrop-blur-xl">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-xl" />
                  <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                    <Wand2 size={24} />
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-semibold">Your post appears here</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Fill in the brief, or try an example. The more you say about the product and buyer, the better the result.
                </p>
                <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-2 text-left sm:grid-cols-3">
                  {[
                    { icon: Anchor, label: 'Hook', desc: 'Stops the scroll' },
                    { icon: MessageSquareText, label: 'Caption', desc: 'Ready to paste' },
                    { icon: Clapperboard, label: 'Video script', desc: 'Scene by scene' },
                    { icon: Gem, label: 'Why buy it', desc: 'The main benefit' },
                    { icon: Megaphone, label: 'Call to action', desc: 'What to do next' },
                    { icon: Hash, label: 'Hashtags', desc: 'Tap to copy' },
                  ].map(({ icon: Icon, label, desc }) => (
                    <div key={label} className="rounded-lg border border-border bg-background/30 p-3">
                      <Icon size={15} className="text-primary" />
                      <p className="mt-2 text-xs font-medium">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Examples */}
              <div className="rounded-xl border border-border bg-card/80 p-5 backdrop-blur-xl">
                <p className="flex items-center gap-2 text-sm font-semibold"><Lightbulb size={15} className="text-warning" />Try an example</p>
                <p className="mt-1 text-xs text-muted-foreground">Fills in the brief so you can see how it works.</p>
                <div className="mt-4 space-y-2">
                  {EXAMPLE_BRIEFS.map((e) => {
                    const Icon = PLATFORM_META[e.platform].icon;
                    return (
                      <button
                        key={e.product}
                        onClick={() => applyExample(e)}
                        className="group w-full rounded-lg border border-border bg-background/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{e.product}</span>
                          <Icon size={14} className={PLATFORM_META[e.platform].tint} />
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{e.audience}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  label,
  children,
  onCopy,
  copyLabel = 'Copy',
  className,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  onCopy: () => void;
  copyLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card/80 px-5 py-4 backdrop-blur-xl', className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon size={14} className="text-primary" /> {label}
        </p>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Copy size={12} /> {copyLabel}
        </button>
      </div>
      {children}
    </div>
  );
}
