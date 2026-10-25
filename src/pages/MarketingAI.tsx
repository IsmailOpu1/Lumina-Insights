import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import AITextRenderer from '@/components/AITextRenderer';
import { Copy, RefreshCw, Save, Trash2, Sparkles } from 'lucide-react';

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

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      let hashtags = data.hashtags;
      if (typeof hashtags === 'string') {
        hashtags = hashtags.split(/[,\s]+/).filter(Boolean);
      }
      if (Array.isArray(hashtags)) {
        hashtags = hashtags.map((h: string) => h.replace(/^#/, ''));
      }

      setOutput({ ...data, hashtags });
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Generation failed. Check API key or try again.');
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

      await supabase.from('marketing_outputs').insert({
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

      await supabase.from('notes').insert({
        type: 'ai_output',
        source_module: 'marketing_ai',
        title: `${productName} — ${platform} — ${now}`,
        transcript: `${output.hook || ''}\n\n${output.caption || ''}`,
        owner_id: ownerIdForQueries,
      });

      toast({ title: 'Saved to Notes ✓' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
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
    if (platform === 'TikTok') return 'TikTok Video Script';
    if (platform === 'Instagram') return 'Instagram Reel Script';
    return 'Facebook Video Script';
  };

  const getScriptTip = () => {
    if (platform === 'TikTok')
      return 'Paste into Runway, Kling or CapCut — add your product images where indicated.';
    if (platform === 'Instagram')
      return 'Paste into CapCut or InShot — add your product visuals where indicated.';
    return 'Paste into any video editor — add your product footage where indicated.';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-pink-200">
        Marketing AI
      </h1>

      {/* Input Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-extrabold">
            <Sparkles size={20} className="text-[#6366F1]" />
            Generate Marketing Content
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="font-extrabold">Product Name *</Label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Organic Honey from Sundarbans"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="font-semibold">Platform</Label>
            <div className="mt-1 flex gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    platform === p
                      ? 'shadow-md text-fuchsia-950 bg-[#f0b428]/[0.61]'
                      : 'bg-primary text-pink-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="font-semibold">Product Features</Label>
            <Textarea
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder="Key features, benefits, USP..."
              rows={3}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="font-semibold">Target Audience</Label>
            <Input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. Health-conscious women aged 25-40 in Dhaka"
              className="mt-1"
            />
          </div>

          <Button
            onClick={generate}
            disabled={loading}
            className="w-full h-12 text-base font-bold text-pink-200"
          >
            {loading ? '✦ Generating...' : '✦ Generate Content'}
          </Button>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card className="animate-pulse">
          <CardContent className="space-y-4 py-6">
            <p className="text-center text-sm font-medium text-muted-foreground animate-pulse">
              ✦ Generating your {platform} content...
            </p>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="py-6 text-center">
            <p className="font-semibold text-destructive">Generation failed</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Output */}
      {output && !loading && (
        <Card className="marketing-hover animate-in fade-in duration-300">
          <CardHeader>
            <CardTitle className="text-lg">
              Generated Content — {platform}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            {output.hook && (
              <Section
                emoji="🎣"
                label="Hook"
                onCopy={() => copyToClipboard(output.hook || '', 'Hook')}
              >
                <AITextRenderer content={output.hook} />
              </Section>
            )}

            {output.value_proposition && (
              <Section
                emoji="💎"
                label="Value Proposition"
                onCopy={() =>
                  copyToClipboard(
                    output.value_proposition || '',
                    'Value Proposition'
                  )
                }
              >
                <AITextRenderer content={output.value_proposition} />
              </Section>
            )}

            {output.cta && (
              <Section
                emoji="📣"
                label="Call to Action"
                onCopy={() =>
                  copyToClipboard(output.cta || '', 'Call to Action')
                }
              >
                <AITextRenderer content={output.cta} />
              </Section>
            )}

            {output.caption && (
              <Section
                emoji="📱"
                label="Caption"
                onCopy={() =>
                  copyToClipboard(output.caption || '', 'Caption')
                }
              >
                <AITextRenderer content={output.caption} />
              </Section>
            )}

            {/* Script — ALL platforms */}
            {output.script && (
              <Section
                emoji="🎬"
                label={getScriptLabel()}
                onCopy={() =>
                  copyToClipboard(output.script || '', 'Script')
                }
              >
                <pre className="whitespace-pre-wrap leading-[1.7] text-card-foreground font-sans font-extrabold text-base">
                  {typeof output.script === 'string'
                    ? output.script
                    : JSON.stringify(output.script)}
                </pre>
                <p className="mt-2 italic text-cyan-900 text-xs font-extrabold font-serif">
                  💡 {getScriptTip()}
                </p>
              </Section>
            )}

            {/* Hashtags */}
            {output.hashtags && output.hashtags.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-foreground">
                    #️⃣ Hashtags
                  </p>
                  <button
                    onClick={copyAllHashtags}
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                  >
                    <Copy size={10} /> Copy All
                  </button>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex flex-wrap gap-2">
                    {output.hashtags.map((tag, i) => (
                      <button
                        key={i}
                        onClick={() => copyHashtag(tag)}
                        className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/80"
                        title="Click to copy"
                      >
                        <Copy size={10} />
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 border-t border-border pt-4">
              <Button
                onClick={generate}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <RefreshCw size={14} /> Regenerate
              </Button>
              <Button
                onClick={saveToNotes}
                disabled={saving}
                size="sm"
                className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Save size={14} />
                {saving ? 'Saving...' : 'Save to Notes'}
              </Button>
              <Button
                onClick={clear}
                variant="ghost"
                size="sm"
                className="gap-1"
              >
                <Trash2 size={14} /> Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({
  emoji,
  label,
  children,
  onCopy,
}: {
  emoji: string;
  label: string;
  children: React.ReactNode;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-foreground">
          {emoji} {label}
        </p>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Copy size={10} /> Copy
        </button>
      </div>
      <div className="rounded-lg bg-muted/50 p-3">{children}</div>
    </div>
  );
}
