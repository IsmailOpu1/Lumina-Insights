import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface Props {
  content: string;
  className?: string;
}

export default function AITextRenderer({ content, className }: Props) {
  return (
    <div className={cn('ai-markdown text-[15px] font-medium leading-[1.7] text-foreground', className)}>
      <ReactMarkdown
        components={{
          strong: ({ children }) =>
          <strong className="font-bold text-primary">{children}</strong>,

          p: ({ children }) => <p className="mb-3 last:mb-0 font-extrabold font-sans text-base">{children}</p>,
          ol: ({ children }) =>
          <ol className="mb-3 list-decimal space-y-2 pl-5 last:mb-0">{children}</ol>,

          ul: ({ children }) =>
          <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>,

          li: ({ children }) => <li className="font-extrabold text-base font-sans">{children}</li>,
          a: ({ href, children }) =>
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
              {children}
            </a>

        }}>
        
        {content}
      </ReactMarkdown>
    </div>);

}