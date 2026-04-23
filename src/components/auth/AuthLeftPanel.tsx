import { Sparkles, BarChart3, Megaphone, MessageSquare, Mic, Bell } from 'lucide-react';

const FEATURES = [
  { icon: BarChart3, name: 'AI Business Insights', desc: 'Smart analysis of your real business data' },
  { icon: Megaphone, name: 'Marketing AI', desc: 'Generate content for Instagram, Facebook, TikTok' },
  { icon: MessageSquare, name: 'Business AI Assistant', desc: 'Personal advisor that knows your business' },
  { icon: Mic, name: 'Voice Notes', desc: 'Record and transcribe business notes instantly' },
  { icon: Bell, name: 'Smart Notifications', desc: 'Real-time alerts for orders, stock, performance' },
];

export default function AuthLeftPanel() {
  return (
    <div className="hidden lg:flex relative overflow-hidden flex-col justify-between p-10 h-full"
      style={{
        background: 'linear-gradient(135deg, #1A3A2A, #2D5A3C, #1B3A4B)',
        backgroundSize: '200% 200%',
        animation: 'authGradient 10s ease infinite',
      }}
    >
      <style>{`
        @keyframes authGradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Logo */}
      <div className="flex items-center gap-2">
        <Sparkles size={28} className="text-[#F0B429]" />
        <span className="text-[32px] font-bold text-white">Lumina Insights</span>
      </div>

      {/* Feature cards */}
      <div className="flex flex-col gap-6 my-auto max-w-lg mx-auto w-full">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={f.name}
              className="flex items-start gap-4 rounded-xl bg-white/10 backdrop-blur-sm p-4"
              style={{
                animation: `slideUp 500ms ease ${i * 100}ms backwards`,
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F0B429]/20">
                <Icon size={20} className="text-[#F0B429]" />
              </div>
              <div>
                <p className="font-bold text-white">{f.name}</p>
                <p className="text-sm text-white/70">{f.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-white/40">© {new Date().getFullYear()} Lumina Insights</p>
    </div>
  );
}
