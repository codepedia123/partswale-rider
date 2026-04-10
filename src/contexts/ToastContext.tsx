import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { ToastKind } from "../types/domain";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  pushToast: (kind: ToastKind, message: string) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const nextIdRef = useRef(1);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      pushToast(kind, message) {
        const id = nextIdRef.current++;
        setToasts((current) => [...current, { id, kind, message }]);
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, kind === "error" ? 5000 : 3000);
      },
      removeToast(id) {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      },
    }),
    [toasts],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
