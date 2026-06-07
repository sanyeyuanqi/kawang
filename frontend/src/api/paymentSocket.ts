export interface OrderStatusEvent {
  type: "order_status" | "pong" | "error"
  order_no?: string
  status?: string
  paid_at?: string | null
  code?: number
  msg?: string
}

export function getOrderStatusSocketUrl(orderNo: string): string {
  const configuredBase = String(import.meta.env.VITE_WS_BASE_URL || "").trim()
  const apiBase = String(import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "")
  const path = `${apiBase}/orders/${encodeURIComponent(orderNo)}/ws`

  if (configuredBase) {
    const url = new URL(path, configuredBase)
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    return url.toString()
  }

  if (/^https?:\/\//i.test(apiBase)) {
    const url = new URL(path)
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    return url.toString()
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}${path}`
}
