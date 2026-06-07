import { useEffect, useRef } from "react"
import api from "@/api/client"
import { getOrderStatusSocketUrl, type OrderStatusEvent } from "@/api/paymentSocket"

interface OrderResult {
  status: string
}

interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

interface Options {
  orderNo?: string
  enabled: boolean
  timeoutMs?: number
  onPaid: () => void
  onCancelled?: () => void
  onTimeout: () => void
  onError?: () => void
}

const FALLBACK_POLL_INTERVAL = 10_000
const RECONNECT_DELAY = 2_000
const HEARTBEAT_INTERVAL = 20_000
const DEFAULT_MONITOR_TIMEOUT = 16 * 60_000

export function useOrderPaymentMonitor({
  orderNo,
  enabled,
  timeoutMs = DEFAULT_MONITOR_TIMEOUT,
  onPaid,
  onCancelled,
  onTimeout,
  onError,
}: Options) {
  const callbacksRef = useRef({ onPaid, onCancelled, onTimeout, onError })
  callbacksRef.current = { onPaid, onCancelled, onTimeout, onError }

  useEffect(() => {
    if (!orderNo || !enabled) return

    let stopped = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined

    const handleStatus = (status?: string) => {
      if (stopped) return
      if (status === "paid") callbacksRef.current.onPaid()
      if (status === "cancelled") callbacksRef.current.onCancelled?.()
    }

    const checkStatus = async () => {
      try {
        const response = await api.get<ApiResponse<OrderResult>>(`/orders/${orderNo}/result`)
        handleStatus(response.data.data?.status)
      } catch {
        callbacksRef.current.onError?.()
      }
    }

    const connect = () => {
      if (stopped) return
      socket = new WebSocket(getOrderStatusSocketUrl(orderNo))

      socket.addEventListener("open", () => {
        heartbeatTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("ping")
        }, HEARTBEAT_INTERVAL)
      })

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data) as OrderStatusEvent
          if (payload.type === "order_status") handleStatus(payload.status)
        } catch {
          callbacksRef.current.onError?.()
        }
      })

      socket.addEventListener("close", () => {
        clearInterval(heartbeatTimer)
        if (!stopped) reconnectTimer = setTimeout(connect, RECONNECT_DELAY)
      })
    }

    void checkStatus()
    connect()
    const pollTimer = setInterval(checkStatus, FALLBACK_POLL_INTERVAL)
    const timeoutTimer = setTimeout(() => callbacksRef.current.onTimeout(), timeoutMs)

    return () => {
      stopped = true
      clearInterval(pollTimer)
      clearTimeout(timeoutTimer)
      clearTimeout(reconnectTimer)
      clearInterval(heartbeatTimer)
      socket?.close()
    }
  }, [enabled, orderNo, timeoutMs])
}
