import { Suspense, lazy } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "@/context/AuthContext"
import { LanguageProvider } from "@/context/LanguageContext"
import { ThemeProvider } from "@/context/ThemeContext"
import { ToastProvider } from "@/components/ui/Toast"
import { ProtectedRoute, AdminRoute } from "@/components/auth/ProtectedRoute"
import ShopLayout from "@/layouts/ShopLayout"
import AdminLayout from "@/layouts/AdminLayout"

const HomePage = lazy(() => import("@/pages/shop/HomePage"))
const LoginPage = lazy(() => import("@/pages/shop/LoginPage"))
const RegisterPage = lazy(() => import("@/pages/shop/RegisterPage"))
const ForgotPasswordPage = lazy(() => import("@/pages/shop/ForgotPasswordPage"))
const ProductDetailPage = lazy(() => import("@/pages/shop/ProductDetailPage"))
const PayPage = lazy(() => import("@/pages/shop/PayPage"))
const SuccessPage = lazy(() => import("@/pages/shop/SuccessPage"))
const OrderQueryPage = lazy(() => import("@/pages/shop/OrderQueryPage"))
const AboutPage = lazy(() => import("@/pages/shop/AboutPage"))
const AnnouncementsPage = lazy(() => import("@/pages/shop/AnnouncementsPage"))
const ProfilePage = lazy(() => import("@/pages/shop/ProfilePage"))

const DashboardPage = lazy(() => import("@/pages/admin/DashboardPage"))
const AdminProductsPage = lazy(() => import("@/pages/admin/AdminProductsPage"))
const AdminCategoriesPage = lazy(() => import("@/pages/admin/AdminCategoriesPage"))
const AdminCodeKeysPage = lazy(() => import("@/pages/admin/AdminCodeKeysPage"))
const AdminOrdersPage = lazy(() => import("@/pages/admin/AdminOrdersPage"))

function RouteFallback() {
  return (
    <div className="flex min-h-[50svh] items-center justify-center text-[14px] text-[#6b7990]">
      加载中...
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <ToastProvider>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route element={<ShopLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/products/:id" element={<ProductDetailPage />} />
                    <Route path="/orders/:orderNo/pay" element={<PayPage />} />
                    <Route path="/orders/query" element={<OrderQueryPage />} />
                    <Route path="/announcements" element={<AnnouncementsPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route element={<ProtectedRoute />}>
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/orders/:orderNo/success" element={<SuccessPage />} />
                    </Route>
                  </Route>

                  <Route path="/admin/login" element={<Navigate to="/login?redirect=%2Fadmin" replace />} />
                  <Route element={<AdminRoute />}>
                    <Route element={<AdminLayout />}>
                      <Route path="/admin" element={<DashboardPage />} />
                      <Route path="/admin/products" element={<AdminProductsPage />} />
                      <Route path="/admin/categories" element={<AdminCategoriesPage />} />
                      <Route path="/admin/code-keys" element={<AdminCodeKeysPage />} />
                      <Route path="/admin/orders" element={<AdminOrdersPage />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<HomePage />} />
                </Routes>
              </Suspense>
            </ToastProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
