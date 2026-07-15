import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Button } from './Button';
import { Icon } from './Icon';

type DialogProps = {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
};

export function Dialog({ children, isOpen, onClose, title }: DialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
          <button
            className="ml-auto text-slate-400 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <Icon className="h-5 w-5" name="x" />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

type ConfirmDeleteDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  userEmail: string;
};

// Destructive delete confirmation: requires typing the logged-in user's own email
// (not the entity's name) before the delete action enables — a stronger guard than a
// plain confirm(), reserved for irreversible deletes (course/lesson/file).
export function ConfirmDeleteDialog({ isOpen, onClose, onConfirm, title, userEmail }: ConfirmDeleteDialogProps) {
  const [input, setInput] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale input each time the dialog reopens
    if (isOpen) setInput('');
  }, [isOpen]);

  if (!isOpen) return null;

  const isMatch = input.trim().toLowerCase() === userEmail.toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <Icon name="warning" className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          </div>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose} type="button">
            <Icon className="h-5 w-5" name="x" />
          </button>
        </div>
        <label className="mb-1.5 block text-xs font-medium tracking-wide text-slate-500" htmlFor="confirm-delete-email">
          Type your email to confirm
        </label>
        <input
          autoFocus
          className="mb-4 block w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-slate-900 placeholder-slate-400 transition-all focus:outline-none focus:ring-4 focus:ring-teal-400/10 focus:border-teal-400"
          id="confirm-delete-email"
          onChange={(e) => setInput(e.target.value)}
          placeholder={userEmail}
          value={input}
        />
        <Button
          variant="danger"
          className={`w-full ${isMatch ? 'border-transparent bg-red-600 text-white hover:bg-red-700' : ''}`}
          disabled={!isMatch}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

type ConfirmDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
};

// Lightweight, non-destructive confirmation: plain Confirm/Cancel, no typed-input gate.
// Reserved for actions that are impactful but reversible (e.g. reset password) — for
// irreversible deletes, use ConfirmDeleteDialog instead.
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmLabel = 'Confirm' }: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Icon name="warning" className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          </div>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose} type="button">
            <Icon className="h-5 w-5" name="x" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-600">{description}</p>
        <Button
          className="w-full border-transparent bg-amber-500 text-white hover:bg-amber-600"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
