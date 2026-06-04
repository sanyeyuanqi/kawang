import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>
  if (!isAuthenticated) return <Navigate to={"/login?redirect=" + encodeURIComponent(location.pathname + location.search)} replace />
  return <Outlet />
}

export function AdminRoute() {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>
  if (!isAuthenticated) return <Navigate to={"/login?redirect=" + encodeURIComponent(location.pathname + location.search)} replace />
  if (user?.role !== "admin") return <Navigate to="/" replace />

  return <Outlet />
}
