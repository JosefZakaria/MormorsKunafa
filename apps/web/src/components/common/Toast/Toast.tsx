import React from 'react';
import { useToast, Toast as ToastType } from '../../../contexts/ToastContext';
import './Toast.css';

export const Toast: React.FC = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container">
      {toasts.map((toast: ToastType) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.type || 'success'}`}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
};
