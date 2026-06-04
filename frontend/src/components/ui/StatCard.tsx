import type { ReactNode } from "react"

interface StatCardProps {
  label: string
  value: ReactNode
  tone?: "blue" | "green" | "orange" | "red"
}

const toneMap = {
  blue: "bg-[#ebf2ff] text-[#2562eb]",
  green: "bg-[#e8faf4] text-[#07a577]",
  orange: "bg-[#fff6df] text-[#ef9e1e]",
  red: "bg-[#ffedeb] text-[#e82828]",
}

export default function StatCard({ label, value, tone = "blue" }: StatCardProps) {
  return (
    <div className="rounded-[18px] border border-[#edf1f6] bg-[#fbfdff] p-6">
      <div className="flex items-center justify-between">
        <p className="text-14 font-medium text-[#8e99aa]">{label}</p>
        <span className={"grid h-9 w-9 place-items-center rounded-[12px] text-16 font-bold " + toneMap[tone]}>
          {String(label).slice(0, 1)}
        </span>
      </div>
      <p className="mt-4 text-30 font-bold text-[#111827]">{value}</p>
    </div>
  )
}
