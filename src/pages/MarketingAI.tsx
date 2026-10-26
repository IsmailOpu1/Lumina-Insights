import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import AITextRenderer from '@/components/AITextRenderer';
import { Copy, RefreshCw, Save, Trash2, Sparkles, Loader2, Anchor, Gem, Megaphone, MessageSquareText, Clapperboard, Hash, Lightbulb, Wand2, type LucideIcon } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { dbErrorMessage, functionErrorMessage } from '@/lib/dbErrors';

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok'] as const;
type Platform = typeof PLATFORMS[number];

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

  const PLATFORM_HINT: Record<Platform, string> = {
    Facebook: 'Post + video script',
    Instagram: 'Caption + Reel script',
    TikTok: 'Hook + video script',
  };

  const filled = [productName, features, audience].filter((v) => v.trim()).length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Marketing AI"
        subtitle="Describe a product and get a ready-to-post hook, caption, video script and hashtags for Bangladeshi buyers."
      />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Brief */}
        <section className="surface self-start p-5 lg:sticky lg:top-4">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold">Product brief</h2>
            <span className="text-xs text-muted-foreground">{filled}/3 filled</span>
          </div>

          <div className="space-y-5">
            <div>
              <Label htmlFor="mkt-product" className="text-sm">Product name <span className="text-primary">*</span></Label>
              <Input
                id="mkt-product"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Organic Honey from Sundarbans"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label className="text-sm">Platform</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-2" role="group" aria-label="Platform">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    aria-pressed={platform === p}
                    className={cn(
                      'rounded-lg border px-2 py-2.5 text-left transition-colors',
                      platform === p
                        ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/40'
                        : 'border-border hover:border-primary/40 hover:bg-secondary'
                    )}
                  >
                    <span className="block text-sm font-medium">{p}</span>
                    <span className="block text-[11px] leading-tight text-muted-foreground">{PLATFORM_HINT[p]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="mkt-features" className="text-sm">What makes it special</Label>
              <Textarea
                id="mkt-features"
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
                placeholder="Key features, benefits, price, offer..."
                rows={4}
                className="mt-1.5 resize-none"
              />
            </div>

            <div>
              <Label htmlFor="mkt-audience" className="text-sm">Who is it for</Label>
              <Input
                id="mkt-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Health-conscious women aged 25-40 in Dhaka"
                className="mt-1.5"
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
            <div className="surface space-y-5 p-6">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin text-primary" /> Writing your {platform} content...
              </p>
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ))}
              <Skeleton className="h-28 w-full" />
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
            <div className="surface animate-in fade-in duration-300">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <p className="text-sm font-semibold">{productName}</p>
                  <p className="text-xs text-muted-foreground">For {platform}</p>
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
              </header>

              <div className="divide-y divide-border/60">
                {output.hook && (
                  <Section icon={Anchor} label="Hook" onCopy={() => copyToClipboard(output.hook || '', 'Hook')}>
                    <AITextRenderer content={output.hook} className="text-base font-medium" />
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
                  <Section icon={MessageSquareText} label="Caption" onCopy={() => copyToClipboard(output.caption || '', 'Caption')}>
                    <AITextRenderer content={output.caption} />
                  </Section>
                )}
                {output.script && (
                  <Section icon={Clapperboard} label={getScriptLabel()} onCopy={() => copyToClipboard(output.script || '', 'Script')}>
                    <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 font-sans text-sm leading-relaxed text-foreground">
                      {typeof output.script === 'string' ? output.script : JSON.stringify(output.script)}
                    </pre>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Lightbulb size={13} className="mt-px shrink-0 text-warning" /> {getScriptTip()}
                    </p>
                  </Section>
                )}
                {output.hashtags && output.hashtags.length > 0 && (
                  <Section icon={Hash} label="Hashtags" copyLabel="Copy all" onCopy={copyAllHashtags}>
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
            <div className="surface flex min-h-[420px] flex-col items-center justify-center border-dashed p-8 text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-xl" />
                <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                  <Wand2 size={24} />
                </span>
              </div>
              <h2 className="mt-5 text-lg font-semibold">Your content appears here</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Fill in the brief and press Write. The more you say about the product and buyer, the better the result.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                {['Hook', 'Caption', 'Video script', 'Hashtags'].map((t) => (
                  <span key={t} className="rounded-md border border-border px-2 py-1">{t}</span>
                ))}
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
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  onCopy: () => void;
  copyLabel?: string;
}) {
  return (
    <div className="px-5 py-4">
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
