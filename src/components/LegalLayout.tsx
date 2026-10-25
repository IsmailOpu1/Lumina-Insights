import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { LEGAL } from '@/lib/legal';

export interface LegalSection {
  heading: string;
  body: React.ReactNode;
}

// Shared layout for the Terms of Service and Privacy Policy pages.
export default function LegalLayout({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Sparkles size={22} className="text-[#F0B429]" /> {LEGAL.businessName}
          </Link>
          <Link to="/login" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Sign in</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated: {LEGAL.lastUpdated}</p>
        <p className="mt-6 leading-relaxed">{intro}</p>

        {sections.map((s, i) => (
          <section key={s.heading} className="mt-8">
            <h2 className="text-xl font-bold">{i + 1}. {s.heading}</h2>
            <div className="mt-2 space-y-3 leading-relaxed text-foreground/90">{s.body}</div>
          </section>
        ))}

        <section className="mt-10 rounded-xl border border-border p-5">
          <h2 className="font-bold">Contact</h2>
          <p className="mt-1 text-sm">
            {LEGAL.legalEntity}<br />
            {LEGAL.address}<br />
            {LEGAL.contactEmail}
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <nav className="mx-auto flex max-w-3xl gap-4 px-4 py-5 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link to="/" className="hover:text-foreground">Home</Link>
        </nav>
      </footer>
    </div>
  );
}
