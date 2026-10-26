import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

type ModalType = 'order' | 'expense' | 'product' | null;
type RecordType = NonNullable<ModalType>;

interface FABContextType {
  activeModal: ModalType;
  openModal: (type: RecordType) => void;
  closeModal: () => void;
  /** How many times each record type has been saved from the "+" button forms. */
  saveCounts: Record<RecordType, number>;
  /** Called by the "+" button forms after a successful save. */
  notifySaved: (type: RecordType) => void;
}

const FABContext = createContext<FABContextType | undefined>(undefined);

export function FABProvider({ children }: { children: React.ReactNode }) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [saveCounts, setSaveCounts] = useState<Record<RecordType, number>>({ order: 0, expense: 0, product: 0 });

  const openModal = useCallback((type: RecordType) => setActiveModal(type), []);
  const closeModal = useCallback(() => setActiveModal(null), []);
  const notifySaved = useCallback(
    (type: RecordType) => setSaveCounts((c) => ({ ...c, [type]: c[type] + 1 })),
    []
  );

  return (
    <FABContext.Provider value={{ activeModal, openModal, closeModal, saveCounts, notifySaved }}>
      {children}
    </FABContext.Provider>
  );
}

export function useFAB() {
  const ctx = useContext(FABContext);
  if (!ctx) throw new Error('useFAB must be used within FABProvider');
  return ctx;
}

/** Reloads a page's data whenever a record of `type` is saved from the "+" button. */
export function useRefreshOnSave(type: RecordType, refresh: () => void) {
  const count = useFAB().saveCounts[type];
  const seen = useRef(count);
  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;

  useEffect(() => {
    if (count === seen.current) return;
    seen.current = count;
    latestRefresh.current();
  }, [count]);
}
