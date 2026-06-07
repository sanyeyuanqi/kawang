import { Outlet, useLocation } from "react-router-dom"
import { Suspense } from "react"
import MobileNav from "@/components/shop/MobileNav"
import TopNav from "@/components/shop/TopNav"

export default function ShopLayout() {
  const location = useLocation()
  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(location.pathname)
  const usesOwnMobileChrome = location.pathname === "/about"

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
      <TopNav />

      <main className="min-h-screen md:min-h-[calc(100dvh-clamp(54px,3.38vw,96px))]">
        <div key={location.pathname} className={isAuthPage ? "" : "animate-fade-in"}>
          <Suspense
            fallback={
              <div className="flex min-h-[50svh] items-center justify-center text-[14px] text-[#6b7990]">
                加载中...
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>

      {!isAuthPage && !usesOwnMobileChrome && <MobileNav />}
    </div>
  )
}
