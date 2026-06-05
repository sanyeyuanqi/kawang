export interface ApiResponse<T = unknown> { code: number; msg: string; data: T | null }

export interface PaginatedResponse<T> { items: T[]; total: number; offset: number; limit: number }

export interface PaginationParams { offset?: number; limit?: number }

export interface ShopConfig {
  shop_name: string; shop_slogan: string; avatar_text: string
  contact_wechat: string; contact_qq: string; is_open: boolean
}

export interface Category {
  id: number; name: string; subtitle: string; sort_order: number; is_active: boolean
}

export interface Product {
  id: number; category_id: number; name: string; description: string
  cover_image: string | null; price: string; sort_order: number
  available_stock: number; sold_count: number; is_on_sale: boolean; category_name?: string
}

export interface ProductDetail extends Product { stock_count?: number; category_name: string }

export interface OrderResult {
  order_no: string; status: string; total_amount: string; product_name: string
  quantity: number; contact_info: string
  codes: { id: number; code_value: string }[]
  paid_at: string | null; created_at: string
}

export interface User {
  id: number
  username: string
  phone?: string | null
  email: string
  role: "buyer" | "admin"
  is_active?: boolean
  created_at?: string | null
  updated_at?: string | null
}
