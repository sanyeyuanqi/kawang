import { useCallback, useEffect, useState } from "react"
import api from "@/api/client"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import StatCard from "@/components/ui/StatCard"
import { formatPrice } from "@/lib/utils"

interface DashboardData {
  stats: {
    product_count: number
    available_stock: number
    total_orders?: number
    pending_orders: number
    paid_orders: number
    today_orders?: number
    total_revenue: string
    today_revenue: string
  }
  today_orders?: DashboardOrder[]
  overview_orders?: DashboardOrder[]
  recent_orders?: DashboardOrder[]
}

interface DashboardOrder {
  id: number
  order_no: string
  product_name: string
  contact_info: string
  status: string
  total_amount: string
  created_at: string | null
}

const statusLabel: Record<string, string> = {
  pending: "待支付",
  paid: "已发卡",
  cancelled: "已取消",
  canceled: "已取消",
  refunded: "已退款",
}

const statusClass: Record<string, string> = {
  pending: "bg-warning-50 text-warning-600",
  paid: "bg-success-50 text-success-600",
  cancelled: "bg-gray-100 text-gray-500",
  canceled: "bg-gray-100 text-gray-500",
  refunded: "bg-danger-50 text-danger-500",
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await api.get("/admin/dashboard")
      setData(res.data.data)
    } catch (err: any) {
      setError(err.response?.data?.msg || "系统概览加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stats = data?.stats
  const overviewOrders = data?.overview_orders ?? data?.today_orders ?? data?.recent_orders ?? []
  const cards = stats ? [
    { label: "今日收入", value: formatPrice(stats.today_revenue), tone: "red" as const },
    { label: "总订单", value: stats.total_orders ?? 0, tone: "blue" as const },
    { label: "支付订单", value: stats.paid_orders, tone: "orange" as const },
    { label: "可售卡密", value: stats.available_stock, tone: "green" as const },
  ] : []

  return (
    <div className="admin-dashboard space-y-6">
      <div>
        <h1 className="admin-dashboard-title text-26 font-bold text-[#111827]">系统概览</h1>
        <p className="admin-dashboard-subtitle mt-2 text-14 text-[#8e99aa]">查看销售额、订单、库存与待处理购买记录</p>
      </div>

      {error && (
        <div className="admin-dashboard-panel rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading && !error && (
        <div className="admin-dashboard-panel rounded-[18px] bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,0.06)] md:p-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="admin-dashboard-skeleton h-[138px] animate-pulse rounded-[18px] border border-[#edf1f6] bg-[#f4f7fb]" />
            ))}
          </div>
          <div className="admin-dashboard-skeleton mt-8 h-[260px] animate-pulse rounded-[18px] border border-[#edf1f6] bg-[#f4f7fb]" />
        </div>
      )}

      {!loading && !error && (
      <div className="admin-dashboard-panel rounded-[18px] bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,0.06)] md:p-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        <section className="admin-recent-orders mt-8 rounded-[18px] border border-[#edf1f6] bg-[#fbfdff] p-5">
          <div className="flex items-center justify-between">
            <h2 className="admin-section-title text-18 font-bold text-[#111827]">今日订单 / 待支付</h2>
            <span className="admin-section-meta text-13 text-[#8e99aa]">共 {overviewOrders.length} 条</span>
          </div>

          {overviewOrders.length ? (
            <div className="admin-order-list mt-4 divide-y divide-[#edf1f6]">
              {overviewOrders.map((order) => (
                <div key={order.id} className="admin-order-row grid gap-3 py-4 text-14 md:grid-cols-[1.2fr_1fr_1fr_0.7fr_0.8fr] md:items-center">
                  <span className="admin-order-no font-semibold text-[#111827]">{order.order_no}</span>
                  <span className="admin-order-product text-[#404a5c]">{order.product_name}</span>
                  <span className="admin-order-contact text-[#727c8e]">{order.contact_info}</span>
                  <span className="font-semibold text-[#e82828]">{formatPrice(order.total_amount)}</span>
                  <span className={`admin-order-status justify-self-start rounded-full px-3 py-1 text-12 font-semibold ${statusClass[order.status] || "bg-gray-100 text-gray-500"}`}>
                    {statusLabel[order.status] || order.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无今日订单或待支付订单" description="有新订单或待支付订单后会自动显示在这里。" className="mt-4 rounded-[14px] bg-white" />
          )}
        </section>
      </div>
      )}
    </div>
  )
}
