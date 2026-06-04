import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type ToastType = "success" | "error" | "warning" | "info"
interface Toast { id: string; type: ToastType; message: string }
interface ToastCtx { toasts: Toast[]; addToast: (t: Omit<Toast, "id">) => void; removeToast: (id: string) => void }

const ToastContext = createContext<ToastCtx | null>(null)
const styles: Record<ToastType, string> = { success: "bg-success-500", error: "bg-danger-500", warning: "bg-warning-500", info: "bg-primary-500" }
const icons: Record<ToastType, string> = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" }

function ToastContainer() {
  const { toasts, removeToast } = useToast()
  return <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">{toasts.map(t => (<div key={t.id} className={cn("flex items-center gap-3 px-4 py-3 rounded-lg text-white text-14 shadow-lg animate-slide-up", styles[t.type])} role="alert"><span className="text-16 shrink-0">{icons[t.type]}</span><span className="flex-1">{t.message}</span><button onClick={() => removeToast(t.id)} className="shrink-0 opacity-70 hover:opacity-100">✕</button></div>))}</div>
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts(p => [...p, { ...t, id }])
    const timer = setTimeout(() => { setToasts(p => p.filter(x => x.id !== id)); timers.current.delete(id) }, 3000)
    timers.current.set(id, timer)
  }, [])
  const removeToast = useCallback((id: string) => {
    const t = timers.current.get(id); if (t) { clearTimeout(t); timers.current.delete(id) }
    setToasts(p => p.filter(x => x.id !== id))
  }, [])
  useEffect(() => () => timers.current.forEach(t => clearTimeout(t)), [])
  return <ToastContext.Provider value={{ toasts, addToast, removeToast }}>{children}<ToastContainer /></ToastContext.Provider>
}

export function useToast() { const ctx = useContext(ToastContext); if (!ctx) throw new Error("useToast must be within ToastProvider"); return ctx }
export type { ToastType }
