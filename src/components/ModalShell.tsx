import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function ModalShell({ isOpen, onClose, title, children }: ModalShellProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200"
      onClick={(e) => {if (e.target === overlayRef.current) onClose();}}>
      
      <div
        ref={contentRef}
        className="w-full max-w-[520px] rounded-xl bg-card shadow-2xl animate-in zoom-in-95 duration-200
          max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-w-none max-md:rounded-b-none max-md:animate-in max-md:slide-in-from-bottom">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 font-extrabold bg-accent">
          <h2 className="text-foreground border-sidebar-foreground border-0 border-none font-extrabold text-xl">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors active:scale-95 text-orange-600 bg-secondary-foreground">
            
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 bg-[var(--chart-card-bg)]" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          {children}
        </div>
      </div>
    </div>);

}