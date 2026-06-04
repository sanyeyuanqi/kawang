import type { ReactNode } from "react"
import TopNav from "@/components/shop/TopNav"

interface AuthScaffoldProps {
  children: ReactNode
}

export default function AuthScaffold({ children }: AuthScaffoldProps) {
  return (
    <div className="min-h-screen bg-[#f6f9fc]">
      <TopNav />
      {children}
    </div>
  )
}
