import type { ReactNode } from "react"

interface StatCardProps {
  label: string
  value: ReactNode
  tone?: "blue" | "green" | "orange" | "red"
}

export default function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="admin-stat-card rounded-[18px] border border-[#edf1f6] bg-[#fbfdff] p-6">
      <p className="admin-stat-label text-14 font-medium text-[#8e99aa]">{label}</p>
      <p className="admin-stat-value mt-4 text-30 font-bold text-[#111827]">{value}</p>
    </div>
  )
}
