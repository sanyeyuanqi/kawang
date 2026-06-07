import type { ReactNode } from "react"

interface AuthScaffoldProps {
  children: ReactNode
}

export default function AuthScaffold({ children }: AuthScaffoldProps) {
  return (
    <div className="min-h-screen bg-[#f6f9fc] md:min-h-[calc(100dvh-clamp(54px,3.38vw,96px))]">
      {children}
    </div>
  )
}
