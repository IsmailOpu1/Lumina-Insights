import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  Send, RefreshCw, ChevronDown, ChevronUp,
  BookmarkPlus, Check, ImageIcon, X, Mic, MicOff
} from 'lucide-react';
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

  const contextItems = context
    ? [
        {
          label: 'Revenue',
          value: formatCurrency(context.revenue),
          color: '#F0B429',
        },
        {
          label: 'Net Profit',
          value: formatCurrency(context.profit),
          color: context.profit >= 0 ? '#10B981' : '#EF4444',
        },
        {
          label: 'Margin',
          value: `${context.margin}%`,
          color: context.margin >= 0 ? '#10B981' : '#EF4444',
        },
        { label: 'Top Product', value: context.top_product },
        {
          label: 'Low Stock',
          value: `${context.low_stock} items`,
          color: context.low_stock > 0 ? '#F59E0B' : '#10B981',
        },
        { label: 'Best Channel', value: context.top_sales_source },
        { label: `Orders (${CONTEXT_DAYS} days)`, value: `${context.total_orders}` },
      ]
    : [];

  const WaveformBars = () => (
    <div className="flex items-center justify-center gap-[3px] h-6">
      {[0, 100, 200, 300, 400].map((delay) => (
        <span
          key={delay}
          className="w-[3px] rounded-full"
          style={{
            backgroundColor: '#F0B429',
            animation: `waveform 0.8s ease-in-out infinite`,
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  );

  return (
    // FIX 1: removed -m-4 md:-m-6 negative margins
    // Use w-full instead to fill container properly
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)]">
      <style>{`
        @keyframes waveform {
          0%, 100% { height: 4px; }
          50% { height: 20px; }
        }
      `}</style>

      {/* Context Panel Desktop */}
      <div className="hidden md:flex items-center gap-2 p-3 border-b border-border overflow-x-auto scrollbar-none w-full">
        {contextLoading ? (
          <SkeletonLoader variant="card" count={1} />
        ) : (
          <>
            <span className="shrink-0 whitespace-nowrap border border-border rounded-full px-2 py-1 font-extrabold text-sm text-teal-700 bg-cyan-950">
              📊 Last {CONTEXT_DAYS} days
            </span>
            {contextItems.map((item) => (
              <div
                key={item.label}
                className="shrink-0 rounded-lg px-3 py-2"
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                <p className="font-extrabold text-xs text-green-600">
                  {item.label}
                </p>
                <p
                  className="text-[14px] font-bold"
                  style={{ color: item.color || '#F0B429' }}
                >
                  {item.value}
                </p>
              </div>
            ))}
            <button
              onClick={fetchContext}
              className="shrink-0 ml-auto text-muted-foreground hover:text-card-foreground transition-colors p-2"
            >
              <RefreshCw
                size={14}
                className={contextLoading ? 'animate-spin' : ''}
              />
            </button>
          </>
        )}
      </div>

      {/* Mobile Context */}
      {/* FIX 2: w-full ensures full width */}
      <div
        className="md:hidden border-b border-border w-full"
        style={{ backgroundColor: 'var(--chart-card-bg)' }}
      >
        <button
          onClick={() => setContextOpen(!contextOpen)}
          className="flex items-center justify-between w-full px-4 py-2 text-sm font-bold text-card-foreground"
        >
          Your Business (last {CONTEXT_DAYS} days)
          {contextOpen ? (
            <ChevronUp size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </button>
        {contextOpen && !contextLoading && (
          <div className="grid grid-cols-2 gap-2 px-4 pb-3">
            {contextItems.map((item) => (
              <div key={item.label}>
                <p className="text-[10px] text-accent font-extrabold">
                  {item.label}
                </p>
                <p
                  className="font-bold text-xs"
                  style={item.color ? { color: item.color } : undefined}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FIX 3: Messages with overflow-hidden */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 w-full min-h-0"
      >
        <div style={{ flex: 1 }} />

        {messages.length === 0 && !isGenerating && historyLoaded && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <img src="/icon.png" alt="" className="w-8 h-8" />
            <p className="text-[18px] font-bold text-center text-pink-200">
              ✦ Ask me anything about your business
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => sendMessage(e)}
                  className="rounded-full border px-3 py-1.5 transition-colors border-[#414039] bg-[#f0b428]/[0.07] font-extrabold text-sm opacity-65 text-pink-200"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FIX 4: w-full overflow-hidden on messages */}
        <div className="space-y-3 w-full">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex w-full ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              } animate-in fade-in slide-in-from-bottom-2 duration-200`}
            >
              {/* FIX 5: max-w-[80%] and overflow-hidden */}
              <div
                className={`max-w-[80%] px-4 py-2.5 overflow-hidden ${
                  msg.role === 'user'
                    ? 'bg-[var(--sidebar-bg)] text-white font-bold rounded-[18px_18px_4px_18px]'
                    : 'border border-border text-card-foreground rounded-[18px_18px_18px_4px] bg-[var(--chart-card-bg)]'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="text-[15px] font-medium leading-[1.6] overflow-hidden">
                    <ReactMarkdown
                      components={{
                        strong: ({ children }) => (
                          <strong className="text-accent font-extrabold">
                            {children}
                          </strong>
                        ),
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0 font-extrabold break-words">
                            {children}
                          </p>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc pl-4 mb-2">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal pl-4 mb-2">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => (
                          <li className="mb-1 break-words">{children}</li>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                      <span className="text-[11px] text-accent font-extrabold">
                        Based on your live data
                      </span>
                      {msg.savedToNotes ? (
                        <span className="text-[11px] text-green-600 font-bold flex items-center gap-1">
                          <Check size={12} /> Saved ✓
                        </span>
                      ) : (
                        <button
                          onClick={() => saveToNotes(msg)}
                          className="text-[11px] text-muted-foreground hover:text-card-foreground font-bold flex items-center gap-1 transition-colors"
                        >
                          <BookmarkPlus size={12} /> Save to Notes
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {msg.role === 'user' && msg.imagePreview && (
                      <img
                        src={msg.imagePreview}
                        alt="Uploaded"
                        className="max-w-[200px] rounded-lg mb-2 object-cover border border-border"
                      />
                    )}
                    <span className="text-[15px] break-words">
                      {msg.content}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}

          {isGenerating && (
            <div className="flex justify-start animate-in fade-in duration-200">
              <div className="bg-card border border-border rounded-[18px_18px_18px_4px] px-4 py-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-4 pb-1 w-full">
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Upload"
              className="h-[60px] rounded-lg border border-border object-cover max-w-[200px]"
            />
            <button
              onClick={removeImage}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center"
            >
              <X size={12} />
            </button>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[200px]">
              {imageFile?.name}
            </p>
          </div>
        </div>
      )}

      {/* FIX 6: Input bar full width, no mx-2 gap */}
      <div className="border-t border-border w-full"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />

        {isListening ? (
          <div className="flex items-center gap-3 px-3 py-3 bg-[var(--chart-card-bg)] rounded-full mx-2 my-2 w-[calc(100%-16px)]">
            <button
              onClick={toggleListening}
              className="w-11 h-11 flex items-center justify-center shrink-0 rounded-full bg-destructive text-white"
              style={{ boxShadow: '0 0 12px rgba(239,68,68,0.5)' }}
            >
              <MicOff size={20} />
            </button>
            <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
              {input || interimTranscript ? (
                <p className="text-sm truncate w-full text-center text-card-foreground font-extrabold">
                  {input}{' '}
                  <span className="italic text-accent text-sm font-extrabold">
                    {interimTranscript}
                  </span>
                </p>
              ) : (
                <WaveformBars />
              )}
              <span className="text-xs mt-1 font-extrabold text-accent">
                Listening... tap to stop
              </span>
            </div>
          </div>
        ) : (
          /* FIX 7: w-[calc(100%-16px)] fills full width */
          <div className="flex items-center gap-2 px-3 py-0 border rounded-full bg-[var(--chart-card-bg)] mx-2 my-2 w-[calc(100%-16px)]">
            <button
              onClick={toggleListening}
              className="w-11 h-11 shrink-0 rounded-full transition-colors flex items-center justify-center"
            >
              <Mic size={20} className="text-lime-900" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-11 h-11 shrink-0 transition-colors flex items-center justify-start"
            >
              <ImageIcon size={20} className="text-lime-900" />
            </button>

            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your business..."
              className="flex-1 bg-transparent text-[16px] outline-none font-extrabold text-accent min-w-0"
            />

            <button
              onClick={() => sendMessage()}
              disabled={
                (!input.trim() && !imageFile) || isGenerating
              }
              className="w-11 h-11 rounded-full bg-[var(--sidebar-bg)] text-white flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity hover:opacity-90"
            >
              <Send size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
