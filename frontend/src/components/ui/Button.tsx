import { forwardRef } from "react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

type Variant = "primary" | "secondary" | "danger" | "ghost"
type Size = "sm" | "md" | "lg"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; loading?: boolean; children: ReactNode
}

const vStyle: Record<Variant, string> = {
  primary: "bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 disabled:bg-primary-300",
  secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100",
  danger: "bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700 disabled:bg-danger-300",
  ghost: "text-gray-600 hover:bg-gray-100 disabled:text-gray-300",
}
const sStyle: Record<Size, string> = {
  sm: "px-3 py-1.5 text-13 rounded-md",
  md: "px-4 py-2 text-14 rounded-lg",
  lg: "px-6 py-3 text-16 rounded-lg",
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => (
    <button ref={ref} className={cn("inline-flex items-center justify-center gap-2 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40", vStyle[variant], sStyle[size], (disabled || loading) && "cursor-not-allowed", className)} disabled={disabled || loading} {...props}>
      {loading && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
      {children}
    </button>
  )
)
Button.displayName = "Button"
export { Button }; export type { ButtonProps, Variant as ButtonVariant, Size as ButtonSize }
