import { useToast } from "../../contexts/ToastContext";

export function ToastViewport() {
  const { toasts, removeToast } = useToast();

  if (!toasts.length) {
    return null;
  }

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast toast--${toast.kind}`}
          onClick={() => removeToast(toast.id)}
          type="button"
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
