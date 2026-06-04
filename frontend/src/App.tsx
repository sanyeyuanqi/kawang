import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "@/context/AuthContext"
import { LanguageProvider } from "@/context/LanguageContext"
import { ThemeProvider } from "@/context/ThemeContext"
import { ToastProvider } from "@/components/ui/Toast"
import { ProtectedRoute, AdminRoute } from "@/components/auth/ProtectedRoute"
import ShopLayout from "@/layouts/ShopLayout"
import AdminLayout from "@/layouts/AdminLayout"

import HomePage from "@/pages/shop/HomePage"
import LoginPage from "@/pages/shop/LoginPage"
import RegisterPage from "@/pages/shop/RegisterPage"
import ForgotPasswordPage from "@/pages/shop/ForgotPasswordPage"
import ProductDetailPage from "@/pages/shop/ProductDetailPage"
import PayPage from "@/pages/shop/PayPage"
import SuccessPage from "@/pages/shop/SuccessPage"
import OrderQueryPage from "@/pages/shop/OrderQueryPage"
import AboutPage from "@/pages/shop/AboutPage"
import AnnouncementsPage from "@/pages/shop/AnnouncementsPage"
import ProfilePage from "@/pages/shop/ProfilePage"

import DashboardPage from "@/pages/admin/DashboardPage"
import AdminProductsPage from "@/pages/admin/AdminProductsPage"
import AdminCategoriesPage from "@/pages/admin/AdminCategoriesPage"
import AdminCodeKeysPage from "@/pages/admin/AdminCodeKeysPage"
import AdminOrdersPage from "@/pages/admin/AdminOrdersPage"

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <ToastProvider>
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
            </ToastProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
