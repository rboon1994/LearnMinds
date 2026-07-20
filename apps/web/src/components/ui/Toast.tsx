'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

import { Alert } from './Alert';
import { Icon } from './Icon';
import type { IconName } from './Icon';

type ToastType = 'success' | 'error' | 'warning';
type ToastItem = { id: number; type: ToastType; message: string };

const TOAST_ICON: Record<ToastType, IconName> = {
  success: 'check-circle',
  error: 'error',
  warning: 'warning',
};

type ToastContextValue = {
  saved: () => void;
  deleted: () => void;
  reset: () => void;
  saveFailed: () => void;
  deleteFailed: () => void;
  accountInactive: () => void;
  duplicateName: () => void;
  // Unlike the fixed canned messages above, this carries the backend's own message text —
  // for business-rule guardrails (e.g. "can't deactivate the default model") that are blocked
  // by design, not a hard failure, so they read as a warning rather than an error.
  warning: (message: string) => void;
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
    reset: () => push('success', 'Reset Successfully'),
    saveFailed: () => push('error', 'Failed to Save'),
    deleteFailed: () => push('error', 'Failed to Delete'),
    accountInactive: () => push('error', 'Account is not active'),
    duplicateName: () => push('error', 'A series with this name already exists'),
    warning: (message: string) => push('warning', message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-100 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <Alert key={toast.id} type={toast.type} icon={<Icon name={TOAST_ICON[toast.type]} className="h-4 w-4" />}>
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
