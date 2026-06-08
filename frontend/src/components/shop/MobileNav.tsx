import { Link, useLocation } from "react-router-dom"
import { MobileHomeIndicator } from "@/components/shop/MobilePhoneFrame"
import { useLanguage } from "@/context/LanguageContext"

const navItems = [
  { labelKey: "nav.home", icon: "⌂", to: "/", match: (path: string) => path === "/" },
  { labelKey: "nav.announcements", icon: "!", to: "/announcements", match: (path: string) => path === "/announcements" },
  { labelKey: "nav.orders", icon: "▤", to: "/orders/query", match: (path: string) => path.startsWith("/orders") },
  { labelKey: "nav.code", icon: "#", to: "/outlook-code", match: (path: string) => path === "/outlook-code" },
  { labelKey: "nav.about", icon: "ⓘ", to: "/about", match: (path: string) => path === "/about" },
]

export default function MobileNav() {
  const location = useLocation()
  const { t } = useLanguage()

  return (
    <nav className="fixed bottom-0 left-1/2 right-auto z-30 flex h-24 w-full max-w-[430px] -translate-x-1/2 items-start justify-around border-t border-[#dfe5ed] bg-white px-2 pt-[10px] md:hidden">
      {navItems.map((item) => {
        const active = item.match(location.pathname)
        return (
          <Link
            key={item.to}
            to={item.to}
            className={"flex h-[60px] min-w-0 flex-1 flex-col items-center justify-center rounded-[20px] text-center " + (active ? "bg-[#e8f2ff] text-[#0e4beb]" : "text-[#737d8f]")}
          >
            <span className="text-[20px] font-medium leading-[21px]">{item.icon}</span>
            <span className="mt-[5px] text-[12px] font-medium leading-[13px]">{t(item.labelKey)}</span>
          </Link>
        )
      })}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        <MobileHomeIndicator />
      </div>
    </nav>
  )
}
