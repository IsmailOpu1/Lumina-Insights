import { Sparkles } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
}

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-full max-w-md rounded-xl border border-primary/20 bg-primary/5 p-8 text-center">
        <Sparkles size={32} className="mx-auto mb-4 text-primary" />
        <h2 className="text-2xl font-bold text-foreground md:text-[28px]">{title}</h2>
        <p className="mt-2 text-sm font-medium text-primary">Coming Soon — Building this next</p>
      </div>
    </div>
  );
}
