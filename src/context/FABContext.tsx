import React, { createContext, useContext, useState, useCallback } from 'react';

type ModalType = 'order' | 'expense' | 'product' | null;

interface FABContextType {
  activeModal: ModalType;
  openModal: (type: NonNullable<ModalType>) => void;
  closeModal: () => void;
}

const FABContext = createContext<FABContextType | undefined>(undefined);

export function FABProvider({ children }: { children: React.ReactNode }) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const openModal = useCallback((type: NonNullable<ModalType>) => setActiveModal(type), []);
  const closeModal = useCallback(() => setActiveModal(null), []);

  return (
    <FABContext.Provider value={{ activeModal, openModal, closeModal }}>
      {children}
    </FABContext.Provider>
  );
}

export function useFAB() {
  const ctx = useContext(FABContext);
  if (!ctx) throw new Error('useFAB must be used within FABProvider');
  return ctx;
}
