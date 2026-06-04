import { Outlet, useLocation } from "react-router-dom"
import MobileNav from "@/components/shop/MobileNav"
import TopNav from "@/components/shop/TopNav"

export default function ShopLayout() {
  const location = useLocation()
  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(location.pathname)
  const usesOwnMobileChrome = location.pathname === "/about"

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
      {!isAuthPage && <TopNav />}

      <main className={isAuthPage ? "min-h-screen" : "min-h-screen md:min-h-[calc(100vh-96px)]"}>
        <div key={location.pathname} className={isAuthPage ? "" : "animate-fade-in"}>
          <Outlet />
        </div>
      </main>

      {!isAuthPage && !usesOwnMobileChrome && <MobileNav />}
    </div>
  )
}
