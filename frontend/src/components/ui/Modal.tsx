import { useEffect, useRef, useCallback } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface Props { open: boolean; onClose: () => void; title?: string; children: ReactNode; className?: string; showClose?: boolean }
export function Modal({ open, onClose, title, children, className, showClose = true }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const handleKeyDown = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") onClose() }, [onClose])
  useEffect(() => { if (open) { document.addEventListener("keydown", handleKeyDown); document.body.style.overflow = "hidden" } return () => { document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = "" } }, [open, handleKeyDown])
  if (!open) return null
  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 animate-fade-in p-4 md:p-0" onClick={e => { if (e.target === overlayRef.current) onClose() }}>
      <div className={cn("bg-white rounded-2xl shadow-xl w-full max-w-md animate-scale-in max-h-[90vh] flex flex-col fixed bottom-0 left-0 right-0 md:relative md:bottom-auto md:left-auto md:right-auto rounded-b-none md:rounded-b-2xl", className)}>
        {(title || showClose) && <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">{title && <h2 className="text-18 font-semibold text-gray-800">{title}</h2>}{showClose && <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>}</div>}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>, document.body
  )
}
