'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

import { Alert } from './Alert';
import { Icon } from './Icon';

type ToastType = 'success' | 'error';
type ToastItem = { id: number; type: ToastType; message: string };

type ToastContextValue = {
  saved: () => void;
  deleted: () => void;
  saveFailed: () => void;
  deleteFailed: () => void;
  accountInactive: () => void;
  duplicateName: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

// Fixed, uniform copy for every save/add/upload/delete outcome across the app — callers
// don't pass their own message, so wording stays consistent without repeating it everywhere.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const value: ToastContextValue = {
    saved: () => push('success', 'Saved Successfully'),
    deleted: () => push('success', 'Deleted Successfully'),
    saveFailed: () => push('error', 'Failed to Save'),
    deleteFailed: () => push('error', 'Failed to Delete'),
    accountInactive: () => push('error', 'Account is not active'),
    duplicateName: () => push('error', 'A series with this name already exists'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-100 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <Alert
            key={toast.id}
            type={toast.type}
            icon={<Icon name={toast.type === 'success' ? 'check-circle' : 'error'} className="h-4 w-4" />}
          >
            {toast.message}
          </Alert>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
