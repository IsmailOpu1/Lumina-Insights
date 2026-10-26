import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface Props {
  content: string;
  className?: string;
}

export default function AITextRenderer({ content, className }: Props) {
  return (
    <div className={cn('ai-markdown text-[15px] leading-relaxed text-foreground', className)}>
      <ReactMarkdown
        components={{
          strong: ({ children }) =>
          <strong className="font-semibold text-highlight">{children}</strong>,

          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ol: ({ children }) =>
          <ol className="mb-3 list-decimal space-y-2 pl-5 last:mb-0">{children}</ol>,

          ul: ({ children }) =>
          <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>,

          li: ({ children }) => <li>{children}</li>,
          a: ({ href, children }) =>
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
              {children}
            </a>

        }}>
        
        {content}
      </ReactMarkdown>
    </div>);

}