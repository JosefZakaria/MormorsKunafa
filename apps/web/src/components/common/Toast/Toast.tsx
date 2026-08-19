import React from 'react';
import { useToast, Toast as ToastType } from '../../../contexts/ToastContext';
import './Toast.css';

export const Toast: React.FC = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast: ToastType) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.type || 'success'}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast__dismiss"
            onClick={() => removeToast(toast.id)}
            aria-label="Stäng meddelande"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>
  );
};
