import { cn } from "@/lib/utils"
type Variant = "success" | "warning" | "danger" | "info" | "default"
interface Props { variant?: Variant; children: React.ReactNode; className?: string; size?: "sm" | "md" }
const v: Record<Variant, string> = { success: "bg-success-50 text-success-500", warning: "bg-warning-50 text-warning-500", danger: "bg-danger-50 text-danger-500", info: "bg-primary-50 text-primary-500", default: "bg-gray-100 text-gray-500" }
export function Pill({ variant = "default", size = "md", children, className }: Props) {
  return <span className={cn("inline-flex items-center rounded-full font-medium", v[variant], size === "sm" ? "px-2 py-0.5 text-12" : "px-3 py-1 text-13", className)}>{children}</span>
}
