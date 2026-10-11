'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type Toast = { id: number; emoji: string; title: string; body?: string; tone?: 'info' | 'success' | 'alert' };

export function useToasts(lifetime = 4500) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = ++nextId.current;
    // Keep at most four on screen; the oldest drops off first.
    setToasts((list) => [...list.slice(-3), { ...toast, id }]);
    timers.current.push(window.setTimeout(() => dismiss(id), lifetime));
  }, [dismiss, lifetime]);

  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <button key={toast.id} className={`toast ${toast.tone ?? 'info'}`} onClick={() => onDismiss(toast.id)} aria-label={`${toast.title}. Dismiss`}>
          <span className="toast-emoji" aria-hidden="true">{toast.emoji}</span>
          <span className="toast-copy"><b>{toast.title}</b>{toast.body && <small>{toast.body}</small>}</span>
          <span className="toast-timer" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
