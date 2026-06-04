import type { ReactNode } from "react"

interface MobilePhoneFrameProps {
  children: ReactNode
  className?: string
  contentClassName?: string
  showHomeIndicator?: boolean
}

export function MobileStatusBar() {
  return (
    <div className="relative h-11 w-full shrink-0">
      <div className="absolute left-8 top-[18px] text-[15px] font-semibold leading-none text-[#0e131e]">9:41</div>
      <div className="absolute right-[54px] top-5 h-[11px] w-5 rounded-[3px] bg-[#0e131e]" />
      <div className="absolute right-[24px] top-[19px] h-3 w-7 rounded-[3px] bg-[#0e131e]" />
    </div>
  )
}

export function MobileHomeIndicator() {
  return <div className="mx-auto h-1 w-[122px] rounded-full bg-[#0e131e]" />
}

export default function MobilePhoneFrame({ children, className = "", contentClassName = "", showHomeIndicator = true }: MobilePhoneFrameProps) {
  return (
    <div className={"mx-auto min-h-[100svh] w-full max-w-[430px] bg-[#f6f9fc] md:hidden " + className}>
      <MobileStatusBar />
      <div className={contentClassName}>{children}</div>
      {showHomeIndicator && (
        <div className="fixed bottom-3 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2">
          <MobileHomeIndicator />
        </div>
      )}
    </div>
  )
}
