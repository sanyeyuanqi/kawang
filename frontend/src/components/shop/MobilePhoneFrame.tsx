import type { ReactNode } from "react"

interface MobilePhoneFrameProps {
  children: ReactNode
  className?: string
  contentClassName?: string
  showHomeIndicator?: boolean
}

export function MobileHomeIndicator() {
  return <div className="mx-auto h-1 w-[122px] rounded-full bg-[#0e131e]" />
}

export default function MobilePhoneFrame({ children, className = "", contentClassName = "", showHomeIndicator = true }: MobilePhoneFrameProps) {
  return (
    <div className={"mx-auto min-h-[100svh] w-full max-w-[430px] bg-[#f6f9fc] md:hidden " + className}>
      <div className={contentClassName}>{children}</div>
      {showHomeIndicator && (
        <div className="fixed bottom-3 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2">
          <MobileHomeIndicator />
        </div>
      )}
    </div>
  )
}
