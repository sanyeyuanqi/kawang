import { useEffect, useCallback } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface Props { open: boolean; onClose: () => void; title?: string; children: ReactNode; width?: string }
export function Drawer({ open, onClose, title, children, width = "400px" }: Props) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") onClose() }, [onClose])
  useEffect(() => { if (open) { document.addEventListener("keydown", handleKeyDown); document.body.style.overflow = "hidden" } return () => { document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = "" } }, [open, handleKeyDown])
  if (!open) return null
  return createPortal(<div className="fixed inset-0 z-[999]"><div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose}/><div className={cn("app-drawer absolute top-0 right-0 h-full bg-white shadow-xl animate-slide-in-right flex flex-col")} style={{ width }}><div className="app-drawer-header flex items-center justify-between px-6 h-16 border-b shrink-0">{title && <h2 className="app-drawer-title text-18 font-semibold">{title}</h2>}<button onClick={onClose} className="app-drawer-close w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button></div><div className="flex-1 overflow-y-auto p-6">{children}</div></div></div>, document.body)
}
