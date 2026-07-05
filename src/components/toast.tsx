"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "success" | "error";
type ToastItem = { id: number; message: string; variant: Variant };

const ToastContext = createContext<{
  toast: (message: string, variant?: Variant) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: Variant = "success") => {
      const id = ++idRef.current;
      setItems((xs) => [...xs, { id, message, variant }]);
      setTimeout(() => remove(id), 2800);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "tt-rise pointer-events-auto flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm shadow-lg",
              t.variant === "success" ? "border-emerald-200 dark:border-emerald-500/30" : "border-rose-200 dark:border-rose-500/30"
            )}
          >
            {t.variant === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            )}
            <span className="font-medium">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
