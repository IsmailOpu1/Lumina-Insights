import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Search, Plus, Trash2, Pencil, X as XIcon, Mic, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import ModalShell from '@/components/ModalShell';
import SkeletonLoader from '@/components/SkeletonLoader';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';

interface Note {
  id: string;
  title: string;
  transcript: string | null;
  type: string | null;
  source_module: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface MarketingOutput {
  id: string;
  product_name: string;
  platform: string;
  hook: string | null;
  value_proposition: string | null;
  cta: string | null;
  caption: string | null;
  script: string | null;
  hashtags: string | null;
  target_audience: string | null;
  product_features: string | null;
  created_at: string | null;
}

type TabFilter = 'all' | 'manual' | 'ai_output';

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6} /g, '')
    .replace(/\n/g, ' ')
    .slice(0, 80);
}

export default function Notes() {
  const { ownerIdForQueries } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [marketingOutputs, setMarketingOutputs] = useState<MarketingOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeMarketingId, setActiveMarketingId] = useState<string | null>(null);

  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editTranscript, setEditTranscript] = useState('');
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // New note modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTranscript, setNewTranscript] = useState('');

  // Voice recording in modal
  const [isModalRecording, setIsModalRecording] = useState(false);
  const modalRecRef = useRef<any>(null);
  const modalSilenceRef = useRef<any>(null);

  // Standalone voice recording overlay
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [recognition, setRecognition] = useState<any>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'note' | 'marketing'; id: string } | null>(null);

  // Mobile tab
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<'list' | 'view'>('list');

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [notesRes, marketingRes] = await Promise.all([
      supabase.from('notes').select('*').order('created_at', { ascending: false }),
      supabase.from('marketing_outputs').select('*').order('created_at', { ascending: false }),
    ]);
    setNotes(notesRes.data || []);
    setMarketingOutputs(marketingRes.data || []);
    setLoading(false);
  }

  const filteredItems = useMemo(() => {
    let items: Array<{
      kind: 'note' | 'marketing';
      id: string;
      title: string;
      preview: string;
      type: string;
      date: string;
      platform?: string;
    }> = [];

    if (activeTab !== 'ai_output') {
      const filtered = notes.filter((n) => {
        if (activeTab === 'manual' && n.type !== 'manual') return false;
        if (activeTab === 'all') return true;
        return true;
      });
      items.push(
        ...filtered.map((n) => ({
          kind: 'note' as const,
          id: n.id,
          title: n.title,
          preview: stripMarkdown(n.transcript || ''),
          type: n.type || 'manual',
          date: n.created_at || '',
        }))
      );
    }

    if (activeTab === 'all' || activeTab === 'ai_output') {
      const aiNotes = notes.filter((n) => n.type === 'ai_output');
      if (activeTab === 'ai_output') {
        items.push(
          ...aiNotes.map((n) => ({
            kind: 'note' as const,
            id: n.id,
            title: n.title,
            preview: stripMarkdown(n.transcript || ''),
            type: 'ai_output',
            date: n.created_at || '',
          }))
        );
      }

      items.push(
        ...marketingOutputs.map((m) => ({
          kind: 'marketing' as const,
          id: m.id,
          title: m.product_name,
          preview: stripMarkdown(m.hook || ''),
          type: 'ai_output',
          date: m.created_at || '',
          platform: m.platform,
        }))
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i) => i.title.toLowerCase().includes(q) || i.preview.toLowerCase().includes(q));
    }

    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return items;
  }, [notes, marketingOutputs, activeTab, search]);

  function selectNote(id: string) {
    setActiveMarketingId(null);
    setActiveNoteId(id);
    setIsEditing(false);
    const note = notes.find((n) => n.id === id);
    if (note) {
      setEditTitle(note.title);
      setEditTranscript(note.transcript || '');
      setHasUnsaved(false);
    }
    if (isMobile) setMobileTab('view');
  }

  function selectMarketing(id: string) {
    setActiveNoteId(null);
    setActiveMarketingId(id);
    setIsEditing(false);
    setHasUnsaved(false);
    if (isMobile) setMobileTab('view');
  }

  async function saveNote() {
    if (!activeNoteId) return;
    const { error } = await supabase
      .from('notes')
      .update({
        title: editTitle,
        transcript: editTranscript,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeNoteId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved ✓' });
      setHasUnsaved(false);
      setIsEditing(false);
      fetchAll();
    }
  }

  async function createNote() {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from('notes').insert({
      title: newTitle,
      transcript: newTranscript || null,
      type: 'manual',
      owner_id: ownerIdForQueries,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Note created ✓' });
      setShowNewModal(false);
      setNewTitle('');
      setNewTranscript('');
      fetchAll();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'note') {
      await supabase.from('notes').delete().eq('id', deleteTarget.id);
      if (activeNoteId === deleteTarget.id) {
        setActiveNoteId(null);
        if (isMobile) setMobileTab('list');
      }
    } else {
      await supabase.from('marketing_outputs').delete().eq('id', deleteTarget.id);
      if (activeMarketingId === deleteTarget.id) {
        setActiveMarketingId(null);
        if (isMobile) setMobileTab('list');
      }
    }
    setDeleteTarget(null);
    toast({ title: 'Deleted' });
    fetchAll();
  }

  // --- Standalone voice recording (opens modal after) ---
  function startVoiceNote() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: 'Voice notes need Chrome or Edge', variant: 'destructive' });
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let finalText = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalText += e.results[i][0].transcript + ' ';
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setLiveTranscript(finalText + interim);
    };
    rec.onerror = () => {
      toast({ title: 'Mic error', variant: 'destructive' });
      setIsRecording(false);
    };
    rec.onend = () => {};
    setRecognition(rec);
    setLiveTranscript('');
    setIsRecording(true);
    rec.start();
  }

  function stopVoiceNote() {
    if (recognition) recognition.stop();
    setIsRecording(false);
    const now = format(new Date(), 'hh:mm a — MMM d');
    setNewTitle(`Voice Note — ${now}`);
    setNewTranscript(liveTranscript.trim());
    setShowNewModal(true);
  }

  // --- Modal voice recording (mic in new note modal) ---
  function toggleModalRecording() {
    if (isModalRecording) {
      stopModalRecording();
    } else {
      startModalRecording();
    }
  }

  function startModalRecording() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: 'Voice notes need Chrome or Edge', variant: 'destructive' });
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onresult = (e: any) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript + ' ';
      }
      setNewTranscript((prev) => (prev ? prev + ' ' : '') + transcript.trim());
      stopModalRecording();
    };

    rec.onerror = () => {
      toast({ title: 'Mic error', variant: 'destructive' });
      stopModalRecording();
    };

    rec.onend = () => {
      stopModalRecording();
    };

    modalRecRef.current = rec;
    setIsModalRecording(true);
    rec.start();

    modalSilenceRef.current = setTimeout(() => stopModalRecording(), 3000);
  }

  function stopModalRecording() {
    if (modalRecRef.current) {
      try { modalRecRef.current.stop(); } catch {}
      modalRecRef.current = null;
    }
    if (modalSilenceRef.current) {
      clearTimeout(modalSilenceRef.current);
      modalSilenceRef.current = null;
    }
    setIsModalRecording(false);
  }

  const activeNote = activeNoteId ? notes.find((n) => n.id === activeNoteId) : null;
  const activeMarketing = activeMarketingId ? marketingOutputs.find((m) => m.id === activeMarketingId) : null;

  const typeBadge = (type: string, platform?: string) => {
    if (type === 'voice') return <Badge className="bg-[#6366F1] text-white text-[11px]">Voice</Badge>;
    if (type === 'ai_output') return <Badge className="bg-[#F0B429] text-black text-[11px]">{platform ? platform : 'AI Output'}</Badge>;
    return <Badge variant="secondary" className="text-[11px]">Manual</Badge>;
  };

  const tabs: { label: string; value: TabFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Manual', value: 'manual' },
    { label: 'AI Output', value: 'ai_output' },
  ];

  const hasActiveItem = !!activeNote || !!activeMarketing;

  // --- Render active note panel content ---
  function renderActivePanel() {
    if (!activeNote && !activeMarketing) {
      return <p className="text-center py-16 text-accent font-extrabold">Select a note to view it</p>;
    }

    if (activeNote) {
      return (
        <div className="flex flex-col h-full min-h-0">
          {/* Mobile back button */}
          {isMobile && (
            <button
              onClick={() => setMobileTab('list')}
              className="flex items-center gap-1 text-sm font-bold text-muted-foreground mb-2 hover:text-card-foreground transition-colors"
            >
              <ArrowLeft size={14} /> Notes
            </button>
          )}
          {/* Title + badges */}
          <div className="shrink-0 mb-3">
            <div className="flex items-start justify-between gap-2">
              <input
                value={editTitle}
                onChange={(e) => { setEditTitle(e.target.value); setHasUnsaved(true); }}
                className="text-xl font-bold bg-transparent border-none outline-none w-full text-card-foreground"
              />
              {hasUnsaved && <span className="w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0 mt-2" />}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {typeBadge(activeNote.type || 'manual')}
              {activeNote.source_module && (
                <Badge variant="outline" className="text-[11px]">{activeNote.source_module}</Badge>
              )}
              <span className="text-[13px] text-muted-foreground">
                {activeNote.created_at ? format(new Date(activeNote.created_at), 'MMM d, yyyy') : ''}
              </span>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="ml-auto text-muted-foreground hover:text-card-foreground transition-colors p-1"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
              )}
              {isEditing && (
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditTranscript(activeNote.transcript || '');
                    setHasUnsaved(false);
                  }}
                  className="ml-auto text-muted-foreground hover:text-card-foreground transition-colors p-1"
                  title="Cancel edit"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Transcript */}
          <div className="flex-1 overflow-y-auto min-h-0" style={isMobile ? { height: 'calc(100vh - 220px)' } : undefined}>
            {isEditing ? (
              <textarea
                value={editTranscript}
                onChange={(e) => { setEditTranscript(e.target.value); setHasUnsaved(true); }}
                className="w-full h-full bg-transparent border-none outline-none resize-none text-[15px] leading-[1.7] text-card-foreground font-medium"
                placeholder="Write something..."
              />
            ) : activeNote.type === 'ai_output' ? (
              <div className="text-[15px] font-medium leading-[1.7] text-card-foreground">
                <ReactMarkdown
                  components={{
                    strong: ({ children }) => <strong className="font-extrabold text-accent">{children}</strong>,
                    p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="font-bold">{children}</li>,
                  }}
                >
                  {editTranscript}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-[15px] leading-[1.7] text-card-foreground whitespace-pre-wrap">{editTranscript}</div>
            )}
          </div>

          {/* Buttons */}
          <div className={`flex gap-2 shrink-0 pt-3 ${isMobile ? 'sticky bottom-0 bg-transparent pb-2' : ''}`}>
            {hasUnsaved && (
              <Button onClick={saveNote} className="font-bold">Save Changes</Button>
            )}
            <Button
              variant="destructive"
              onClick={() => setDeleteTarget({ type: 'note', id: activeNote.id })}
              className="font-bold gap-1"
            >
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </div>
      );
    }

    if (activeMarketing) {
      return (
        <div className="flex flex-col h-full min-h-0">
          {isMobile && (
            <button
              onClick={() => setMobileTab('list')}
              className="flex items-center gap-1 text-sm font-bold text-muted-foreground mb-2 hover:text-card-foreground transition-colors"
            >
              <ArrowLeft size={14} /> Notes
            </button>
          )}
          <div className="shrink-0 mb-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-[#F0B429] text-black font-bold">{activeMarketing.platform}</Badge>
              <h2 className="text-xl font-bold text-card-foreground">{activeMarketing.product_name}</h2>
            </div>
            <span className="text-[13px] text-muted-foreground">
              {activeMarketing.created_at ? format(new Date(activeMarketing.created_at), 'MMM d, yyyy') : ''}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4" style={isMobile ? { height: 'calc(100vh - 220px)' } : undefined}>
            {activeMarketing.hook && (
              <div>
                <p className="font-bold text-card-foreground">🎣 Hook</p>
                <p className="text-card-foreground">{activeMarketing.hook}</p>
              </div>
            )}
            {activeMarketing.value_proposition && (
              <div>
                <p className="font-bold text-card-foreground">💎 Value Proposition</p>
                <p className="text-card-foreground">{activeMarketing.value_proposition}</p>
              </div>
            )}
            {activeMarketing.cta && (
              <div>
                <p className="font-bold text-card-foreground">📣 Call to Action</p>
                <p className="text-card-foreground">{activeMarketing.cta}</p>
              </div>
            )}
            {activeMarketing.caption && (
              <div>
                <p className="font-bold text-card-foreground">📱 Caption</p>
                <p className="text-card-foreground">{activeMarketing.caption}</p>
              </div>
            )}
            {activeMarketing.script && (
              <div>
                <p className="font-bold text-card-foreground">🎬 Script</p>
                <p className="text-card-foreground whitespace-pre-wrap">{activeMarketing.script}</p>
              </div>
            )}
            {activeMarketing.hashtags && (
              <div>
                <p className="font-bold text-card-foreground mb-1">#️⃣ Hashtags</p>
                <div className="flex flex-wrap gap-1.5">
                  {activeMarketing.hashtags.split(',').map((h, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        navigator.clipboard.writeText(h.trim());
                        toast({ title: 'Copied!' });
                      }}
                      className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
                    >
                      {h.trim()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className={`shrink-0 pt-3 ${isMobile ? 'sticky bottom-0 bg-transparent pb-2' : ''}`}>
            <Button
              variant="destructive"
              onClick={() => setDeleteTarget({ type: 'marketing', id: activeMarketing.id })}
              className="font-bold gap-1"
            >
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </div>
      );
    }

    return null;
  }

  // Waveform for modal
  const ModalWaveform = () => (
    <div className="flex items-center justify-center gap-[3px] h-5">
      {[0, 100, 200, 300, 400].map((delay) => (
        <span
          key={delay}
          className="w-[3px] rounded-full"
          style={{
            backgroundColor: '#F0B429',
            animation: 'waveform 0.8s ease-in-out infinite',
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <style>{`
        @keyframes waveform {
          0%, 100% { height: 4px; }
          50% { height: 20px; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-[28px] font-bold text-pink-200">Notes</h1>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              startVoiceNote();
            }}
            variant="outline"
            className="font-bold gap-1.5 border-[#6366F1] text-[#6366F1] hover:bg-[#6366F1]/10"
          >
            <Mic size={16} /> Voice Note
          </Button>
          <Button
            onClick={() => {
              setNewTitle('');
              setNewTranscript('');
              setShowNewModal(true);
            }}
            className="font-bold gap-1.5"
          >
            <Plus size={16} /> New Note
          </Button>
        </div>
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes..." className="pl-9" />
        </div>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                activeTab === t.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile tab bar */}
      {isMobile && (
        <div className="flex border-b border-border mb-3">
          <button
            onClick={() => setMobileTab('list')}
            className={`flex-1 py-2 text-sm font-bold text-center transition-colors ${
              mobileTab === 'list' ? 'border-b-2 border-[#F0B429] text-card-foreground' : 'text-muted-foreground'
            }`}
          >
            Notes
          </button>
          <button
            onClick={() => setMobileTab('view')}
            className={`flex-1 py-2 text-sm font-bold text-center transition-colors ${
              mobileTab === 'view' ? 'border-b-2 border-[#F0B429] text-card-foreground' : 'text-muted-foreground'
            }`}
          >
            View Note
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonLoader variant="card" count={4} />
      ) : isMobile ? (
        /* Mobile: tab-based layout */
        <div style={{ height: 'calc(100vh - 260px)' }}>
          {mobileTab === 'list' ? (
            <div className="overflow-y-auto h-full space-y-2 pr-1">
              {filteredItems.length === 0 ? (
                <p className="text-center py-8 font-extrabold text-accent">No notes yet.</p>
              ) : (
                filteredItems.map((item) => {
                  const isActive =
                    (item.kind === 'note' && item.id === activeNoteId) ||
                    (item.kind === 'marketing' && item.id === activeMarketingId);
                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      onClick={() => (item.kind === 'note' ? selectNote(item.id) : selectMarketing(item.id))}
                      className={`note-hover rounded-lg border border-border p-3 cursor-pointer bg-[var(--chart-card-bg)] ${
                        isActive ? 'border-l-[3px] border-l-[#F0B429]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[15px] text-card-foreground line-clamp-1 font-extrabold">{item.title}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {typeBadge(item.type, item.platform)}
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {item.date ? format(new Date(item.date), 'MMM d') : ''}
                          </span>
                        </div>
                      </div>
                      {item.preview && <p className="text-[13px] mt-1 line-clamp-2 font-extrabold text-accent">{item.preview}</p>}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="h-full overflow-y-auto rounded-xl border border-border p-4 bg-[var(--chart-card-bg)]">
              {renderActivePanel()}
            </div>
          )}
        </div>
      ) : (
        /* Desktop: two-panel layout */
        <div className="flex gap-4 overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
          {/* List */}
          <div className="w-[35%] shrink-0 overflow-y-auto space-y-2 pr-1 h-full">
            {filteredItems.length === 0 ? (
              <p className="text-center py-8 font-extrabold text-accent">No notes yet.</p>
            ) : (
              filteredItems.map((item) => {
                const isActive =
                  (item.kind === 'note' && item.id === activeNoteId) ||
                  (item.kind === 'marketing' && item.id === activeMarketingId);
                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    onClick={() => (item.kind === 'note' ? selectNote(item.id) : selectMarketing(item.id))}
                    className={`note-hover rounded-lg border border-border p-3 cursor-pointer bg-[var(--chart-card-bg)] ${
                      isActive ? 'border-l-[3px] border-l-[#F0B429]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[15px] text-card-foreground line-clamp-1 font-extrabold">{item.title}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {typeBadge(item.type, item.platform)}
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {item.date ? format(new Date(item.date), 'MMM d') : ''}
                        </span>
                      </div>
                    </div>
                    {item.preview && <p className="text-[13px] mt-1 line-clamp-2 font-extrabold text-accent">{item.preview}</p>}
                  </div>
                );
              })
            )}
          </div>

          {/* Active Panel */}
          <div className="flex-1 rounded-xl border border-border p-5 flex flex-col overflow-hidden bg-[var(--chart-card-bg)]">
            {renderActivePanel()}
          </div>
        </div>
      )}

      {/* Voice recording overlay */}
      {isRecording && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/70 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-bold text-lg">Recording... speak now</span>
          </div>
          <p className="text-white/80 text-center max-w-md mb-6 min-h-[60px]">{liveTranscript || 'Listening...'}</p>
          <Button onClick={stopVoiceNote} variant="destructive" className="font-bold gap-1.5 h-12 px-8">
            ⏹ Stop Recording
          </Button>
        </div>
      )}

      {/* New note modal */}
      <ModalShell isOpen={showNewModal} onClose={() => { setShowNewModal(false); stopModalRecording(); }} title="New Note">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-card-foreground mb-1 block">Title</label>
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Note title" required />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold text-card-foreground">Transcript</label>
              <button
                onClick={toggleModalRecording}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                  isModalRecording ? 'bg-destructive text-white' : 'text-muted-foreground hover:text-card-foreground'
                }`}
                style={isModalRecording ? { boxShadow: '0 0 10px rgba(239,68,68,0.5)' } : undefined}
                title={isModalRecording ? 'Stop recording' : 'Record voice'}
              >
                <Mic size={16} />
              </button>
            </div>
            {isModalRecording && (
              <div className="flex items-center gap-2 mb-2 px-2 py-1 rounded-lg bg-muted/50">
                <ModalWaveform />
                <span className="text-xs text-muted-foreground font-bold">Listening...</span>
              </div>
            )}
            <Textarea value={newTranscript} onChange={(e) => setNewTranscript(e.target.value)} rows={5} placeholder="Write your note..." />
          </div>
          <Button onClick={createNote} disabled={!newTitle.trim()} className="w-full h-12 font-bold">
            Save Note
          </Button>
        </div>
      </ModalShell>

      {/* Delete confirmation */}
      <ModalShell isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete">
        <p className="text-card-foreground font-bold mb-4">Are you sure you want to delete this item? This cannot be undone.</p>
        <div className="flex gap-3">
          <Button variant="destructive" onClick={handleDelete} className="flex-1 font-bold">
            Delete
          </Button>
          <Button variant="outline" onClick={() => setDeleteTarget(null)} className="flex-1 font-bold">
            Cancel
          </Button>
        </div>
      </ModalShell>
    </div>
  );
}
