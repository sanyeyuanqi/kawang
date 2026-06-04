import { cn } from "@/lib/utils"
interface Props { size?: "sm" | "md" | "lg"; fullscreen?: boolean; className?: string; label?: string }
const s = { sm: "w-4 h-4 border-2", md: "w-8 h-8 border-3", lg: "w-12 h-12 border-4" }
export function LoadingSpinner({ size = "md", fullscreen, className, label }: Props) {
  const el = <div className={cn("flex flex-col items-center justify-center gap-3", className)}><div className={cn("rounded-full border-gray-200 border-t-primary-500 animate-spin", s[size])} role="status"/>{label && <p className="text-14 text-gray-500">{label}</p>}</div>
  if (fullscreen) return <div className="fixed inset-0 flex items-center justify-center bg-white/80 z-50">{el}</div>
  return el
}
