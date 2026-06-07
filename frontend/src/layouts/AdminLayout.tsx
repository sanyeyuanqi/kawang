import { Outlet, Link, useLocation, useNavigate } from "react-router-dom"
import { Suspense, useState } from "react"
import { useAuth } from "@/hooks/useAuth"

const navItems = [
  { path: "/admin", label: "系统概览", icon: "□" },
  { path: "/admin/products", label: "商品管理", icon: "◇" },
  { path: "/admin/categories", label: "分类管理", icon: "▤" },
  { path: "/admin/code-keys", label: "卡密库存", icon: "▦" },
  { path: "/admin/orders", label: "订单管理", icon: "◎" },
  { path: "/admin/announcements", label: "公告管理", icon: "!" },
]

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin"
    return location.pathname.startsWith(path)
  }

  const handleLogout = async () => {
    await logout()
    navigate("/login", { replace: true })
  }

  return (
    <div className="admin-shell min-h-screen bg-[#f4f7fb] text-[#111827] md:flex">
      <aside className={"fixed inset-y-0 left-0 z-30 w-[300px] bg-[#101827] text-white shadow-xl transform transition-transform " + (sidebarOpen ? "translate-x-0" : "-translate-x-full") + " md:sticky md:top-0 md:h-screen md:translate-x-0 md:shrink-0"}>
        <div className="px-8 pb-8 pt-10">
          <Link to="/admin" className="block">
            <span className="block text-26 font-bold leading-tight">小野卡铺</span>
            <span className="mt-2 block text-14 text-white/50">个人卡网管理</span>
          </Link>
        </div>
        <nav className="space-y-2 px-5">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={"flex h-[52px] items-center gap-4 rounded-[18px] px-5 text-16 transition-colors " + (isActive(item.path) ? "bg-primary-500 text-white shadow-lg shadow-primary-900/25" : "text-white/60 hover:bg-white/10 hover:text-white")}
            >
              <span className={"grid h-8 w-8 place-items-center rounded-lg text-15 " + (isActive(item.path) ? "bg-white/20" : "bg-white/10")}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-8 left-5 right-5 space-y-3">
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-white/10 bg-white/10 px-4 text-15 font-medium text-white/80 transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/15 hover:text-white hover:shadow-[0_14px_34px_rgba(255,255,255,0.16)]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            返回主页
          </Link>
          <button onClick={handleLogout} className="flex h-12 w-full items-center justify-center rounded-[16px] border border-white/10 bg-white/10 px-4 text-15 text-white/70 transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/15 hover:text-white hover:shadow-[0_14px_34px_rgba(0,0,0,0.28)]">退出登录</button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-16 items-center bg-white/88 px-5 shadow-sm backdrop-blur md:hidden">
          <button className="mr-3 rounded-lg p-2 text-gray-700" onClick={() => setSidebarOpen(true)} aria-label="打开菜单">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-18 font-semibold">小野卡铺管理</h1>
        </header>
        <main className="mx-auto min-h-screen w-full max-w-none px-4 py-6 sm:px-6 md:px-8 md:py-10 2xl:px-10">
          <Suspense
            fallback={
              <div className="flex min-h-[calc(100vh-80px)] items-center justify-center text-14 text-[#8e99aa]">
                加载中...
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
