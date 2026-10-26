import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  Send, RefreshCw, ChevronDown, ChevronUp,
  BookmarkPlus, Check, ImageIcon, X, Mic, MicOff, Sparkles, BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import SkeletonLoader from '@/components/SkeletonLoader';
import { useCurrency } from '@/hooks/useCurrency';
import { fetchRecentSnapshot } from '@/lib/businessSnapshot';
import { getSpeechRecognition, type SpeechRecognitionInstance } from '@/lib/speech';
import { dbErrorMessage, functionErrorMessage } from '@/lib/dbErrors';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  savedToNotes?: boolean;
  imagePreview?: string;
}

interface BusinessContext {
  revenue: number;
  profit: number;
  margin: number;
  top_product: string;
  low_stock: number;
  top_sales_source: string;
  total_orders: number;
  total_ad_spend: number;
}

// The AI and the context panel both look at this many recent days.
const CONTEXT_DAYS = 30;

const EXAMPLES = [
  "What's my most profitable product?",
  'How is my business this week?',
  'Should I restock anything?',
];

export default function AIAssistant() {
  const { ownerIdForQueries } = useAuth();
  const { formatCurrency } = useCurrency();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [context, setContext] = useState<BusinessContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextOpen, setContextOpen] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Same numbers the AI sees: business_snapshot() over the last CONTEXT_DAYS.
  async function fetchContext() {
    setContextLoading(true);
    const s = await fetchRecentSnapshot(CONTEXT_DAYS);
    if (s) {
      const top = s.top_products[0];
      const channel = s.sales_by_channel[0];
      setContext({
        revenue: Math.round(s.revenue),
        profit: Math.round(s.net_profit),
        margin: s.margin_pct,
        top_product: top ? `${top.name} (${top.units} units)` : 'N/A',
        low_stock: s.low_stock.length,
        top_sales_source: channel && s.revenue > 0
          ? `${channel.channel} (${Math.round((channel.revenue / s.revenue) * 100)}%)`
          : 'N/A',
        total_orders: s.orders,
        total_ad_spend: Math.round(s.ad_spend),
      });
    }
    setContextLoading(false);
  }

  async function loadHistory() {
    const { data } = await supabase
      .from('notes')
      .select('title, transcript, created_at')
      .eq('source_module', 'business_ai')
      .eq('type', 'ai_output')
      .order('created_at', { ascending: true })
      .limit(20);
    if (data && data.length > 0) {
      const history: ChatMessage[] = [];
      data.forEach((n) => {
        history.push({
          id: crypto.randomUUID(),
          role: 'user',
          content: n.title,
        });
        if (n.transcript) {
          history.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: n.transcript,
            savedToNotes: true,
          });
        }
      });
      setMessages(history);
    }
    setHistoryLoaded(true);
  }

  useEffect(() => {
    fetchContext();
    loadHistory();

    // orders/expenses/inventory are not in the realtime publication, so poll.
    const interval = setInterval(fetchContext, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* already stopped */ }
      }
    };
  }, []);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Image too large',
        description: 'Max 5MB',
        variant: 'destructive',
      });
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function toggleListening() {
    if (isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }

  function startListening() {
    const SR = getSpeechRecognition();
    if (!SR) {
      toast({
        title: 'Speech to text needs Chrome or Edge browser',
        variant: 'destructive',
      });
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    finalTranscriptRef.current = '';

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscriptRef.current +=
            e.results[i][0].transcript + ' ';
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setInput(finalTranscriptRef.current.trim());
      setInterimTranscript(interim);
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed') {
        toast({
          title: 'Microphone access denied',
          variant: 'destructive',
        });
        stopListening();
      }
    };

    rec.onend = () => {
      if (isListeningRef.current) {
        try { rec.start(); } catch (e) {
          console.log('Restart failed:', e);
        }
      }
    };

    recognitionRef.current = rec;
    isListeningRef.current = true;
    setIsListening(true);
    setInterimTranscript('');
    finalTranscriptRef.current = '';
    rec.start();
  }

  function stopListening() {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript('');
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }
  }

  async function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg || isGenerating) return;

    if (isListeningRef.current) stopListening();

    setInput('');
    setInterimTranscript('');
    finalTranscriptRef.current = '';

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msg,
      imagePreview: imagePreview || undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsGenerating(true);

    try {
      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // The function reads the business data from the database itself.
      const body: {
        message: string;
        conversation_history: { role: string; content: string }[];
        image_base64?: string;
        image_type?: string;
      } = {
        message: msg,
        conversation_history: history,
      };

      if (imageFile && imagePreview) {
        const base64 = imagePreview.split(',')[1];
        body.image_base64 = base64;
        body.image_type = imageFile.type;
        removeImage();
      }

      const { data, error } = await supabase.functions.invoke(
        'business-ai-chat',
        { body }
      );
      if (error) throw error;

      const aiText =
        data?.response || 'I could not generate a response.';
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: aiText,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      // Shows the server's explanation, e.g. the daily AI limit or an expired plan.
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: await functionErrorMessage(e, 'Something went wrong. Please try again.'),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveToNotes(msg: ChatMessage) {
    // loadHistory() shows the title as the user's question, so store the
    // question this answer replied to.
    const index = messages.findIndex((m) => m.id === msg.id);
    const question = messages
      .slice(0, index)
      .reverse()
      .find((m) => m.role === 'user')?.content;
    const { error } = await supabase.from('notes').insert({
      type: 'ai_output',
      source_module: 'business_ai',
      title: question ? question.slice(0, 200) : 'AI Insight',
      transcript: msg.content,
      owner_id: ownerIdForQueries,
    });
    if (error) {
      toast({ title: 'Could not save', description: dbErrorMessage(error.message), variant: 'destructive' });
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, savedToNotes: true } : m
      )
    );
    toast({ title: 'Saved ✓' });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const contextItems: { label: string; value: string; tone?: string }[] = context
    ? [
        { label: 'Revenue', value: formatCurrency(context.revenue) },
        { label: 'Net profit', value: formatCurrency(context.profit), tone: context.profit >= 0 ? 'text-success' : 'text-destructive' },
        { label: 'Margin', value: `${context.margin}%`, tone: context.margin >= 0 ? 'text-success' : 'text-destructive' },
        { label: 'Orders', value: `${context.total_orders}` },
        { label: 'Top product', value: context.top_product },
        { label: 'Best channel', value: context.top_sales_source },
        { label: 'Low stock', value: `${context.low_stock} ${context.low_stock === 1 ? 'product' : 'products'}`, tone: context.low_stock > 0 ? 'text-warning' : 'text-success' },
      ]
    : [];

  const contextList = (
    <dl className="divide-y divide-border/60">
      {contextItems.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-3 py-2.5">
          <dt className="shrink-0 text-xs text-muted-foreground">{item.label}</dt>
          <dd className={cn('truncate text-right text-sm font-medium tabular-nums', item.tone ?? 'text-foreground')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );

  const WaveformBars = () => (
    <div className="flex h-6 items-center justify-center gap-[3px]">
      {[0, 100, 200, 300, 400].map((delay) => (
        <span
          key={delay}
          className="w-[3px] rounded-full bg-primary"
          style={{ animation: 'waveform 0.8s ease-in-out infinite', animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );

  const AssistantAvatar = () => (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
      <Sparkles size={15} />
    </span>
  );

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] md:-m-6 md:h-[calc(100%+3rem)]">
      <style>{`
        @keyframes waveform {
          0%, 100% { height: 4px; }
          50% { height: 20px; }
        }
      `}</style>

      {/* Chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile context */}
        <div className="border-b border-border lg:hidden">
          <button
            onClick={() => setContextOpen(!contextOpen)}
            aria-expanded={contextOpen}
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm"
          >
            <span className="flex items-center gap-2 font-medium"><BarChart3 size={15} className="text-primary" />Your business, last {CONTEXT_DAYS} days</span>
            {contextOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          </button>
          {contextOpen && !contextLoading && <div className="px-4 pb-2">{contextList}</div>}
        </div>

        <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
            {messages.length === 0 && !isGenerating && historyLoaded && (
              <div className="flex flex-col items-center py-10 text-center md:py-16">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl" />
                  <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                    <Sparkles size={26} />
                  </span>
                </div>
                <h1 className="mt-5 text-2xl font-semibold tracking-tight">Ask about your business</h1>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Answers come from your own orders, stock and expenses. You can also send a photo, like a product or a receipt.
                </p>
                <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-3">
                  {EXAMPLES.map((e) => (
                    <button
                      key={e}
                      onClick={() => sendMessage(e)}
                      className="surface-interactive px-4 py-3 text-left text-sm text-foreground"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] text-primary-foreground">
                        {msg.imagePreview && (
                          <img src={msg.imagePreview} alt="Uploaded" className="mb-2 max-w-[200px] rounded-lg object-cover" />
                        )}
                        <span className="break-words">{msg.content}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <AssistantAvatar />
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="text-[15px] leading-relaxed text-foreground">
                          <ReactMarkdown
                            components={{
                              strong: ({ children }) => <strong className="font-semibold text-highlight">{children}</strong>,
                              p: ({ children }) => <p className="mb-3 break-words last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-primary">{children}</ul>,
                              ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 marker:text-primary">{children}</ol>,
                              li: ({ children }) => <li className="break-words">{children}</li>,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Based on your live data</span>
                          {msg.savedToNotes ? (
                            <span className="flex items-center gap-1 text-success"><Check size={12} /> Saved to Notes</span>
                          ) : (
                            <button onClick={() => saveToNotes(msg)} className="flex items-center gap-1 transition-colors hover:text-foreground">
                              <BookmarkPlus size={12} /> Save to Notes
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isGenerating && (
                <div className="flex gap-3 animate-in fade-in duration-200">
                  <AssistantAvatar />
                  <div className="flex items-center gap-1.5 pt-3">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/70 [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/70 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/70 [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="px-4 pb-4 pt-2 md:px-6" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto w-full max-w-3xl">
            <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageSelect} />

            <div className="surface p-2 shadow-xl shadow-black/30 focus-within:border-primary/40">
              {imagePreview && (
                <div className="relative mb-2 ml-1 mt-1 inline-block">
                  <img src={imagePreview} alt="Upload" className="h-16 max-w-[200px] rounded-lg border border-border object-cover" />
                  <button
                    onClick={removeImage}
                    aria-label="Remove image"
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {isListening ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleListening}
                    aria-label="Stop listening"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground shadow-[0_0_12px_hsl(var(--destructive)/0.5)]"
                  >
                    <MicOff size={18} />
                  </button>
                  <div className="flex flex-1 flex-col items-center justify-center overflow-hidden">
                    {input || interimTranscript ? (
                      <p className="w-full truncate text-center text-sm">
                        {input} <span className="italic text-muted-foreground">{interimTranscript}</span>
                      </p>
                    ) : (
                      <WaveformBars />
                    )}
                    <span className="mt-1 text-xs text-muted-foreground">Listening... tap to stop</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button onClick={toggleListening} aria-label="Speak your question" className="icon-btn h-10 w-10 shrink-0">
                    <Mic size={18} />
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} aria-label="Attach an image" className="icon-btn h-10 w-10 shrink-0">
                    <ImageIcon size={18} />
                  </button>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything about your business..."
                    className="min-w-0 flex-1 bg-transparent px-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground max-md:text-[16px]"
                    style={{ outline: 'none' }}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={(!input.trim() && !imageFile) || isGenerating}
                    aria-label="Send"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 disabled:opacity-30"
                  >
                    <Send size={17} />
                  </button>
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">AI can make mistakes. Check important numbers on your Dashboard.</p>
          </div>
        </div>
      </div>

      {/* Business context panel (desktop) */}
      <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-sidebar lg:flex">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-medium">Your business</p>
            <p className="text-xs text-muted-foreground">Last {CONTEXT_DAYS} days</p>
          </div>
          <button onClick={fetchContext} aria-label="Refresh numbers" className="icon-btn h-8 w-8">
            <RefreshCw size={14} className={contextLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {contextLoading && !context ? <SkeletonLoader variant="row" count={5} /> : contextList}
          <p className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            The assistant sees these same numbers when it answers.
          </p>
        </div>
      </aside>
    </div>
  );
}
