import { clsx, type ClassValue } from "clsx"

export function cn(...inputs: ClassValue[]): string { return clsx(inputs) }

export function formatPrice(price: string | number): string {
  const n = typeof price === "string" ? parseFloat(price) : price
  if (!Number.isFinite(n)) return "¥0.00"
  return `¥${n.toFixed(2)}`
}

export function formatDate(dateStr: string, format: "short" | "full" = "short"): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "-"
  return format === "short"
    ? d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
    : d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export function resolveAssetUrl(url?: string | null): string {
  const value = url?.trim()
  if (!value) return ""
  if (/^(blob:|data:|https?:\/\/)/i.test(value)) return value
  if (value.startsWith("/static/") && import.meta.env.DEV) {
    return `${import.meta.env.VITE_STATIC_BASE_URL || "http://localhost:8080"}${value}`
  }
  return value
}
