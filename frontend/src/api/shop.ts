import api from "@/api/client"
import type { ApiResponse, Category, PaginatedResponse, Product, ProductDetail, ShopConfig } from "@/types/common"

export interface ProductListParams {
  category_id?: number
  q?: string
  offset?: number
  limit?: number
}

export async function getShop() {
  const res = await api.get<ApiResponse<ShopConfig>>("/shop")
  return res.data.data
}

export async function getCategories() {
  const res = await api.get<ApiResponse<Category[]>>("/categories")
  return res.data.data ?? []
}

export async function getProducts(params: ProductListParams = {}, signal?: AbortSignal) {
  const res = await api.get<ApiResponse<PaginatedResponse<Product>>>("/products", { params, signal })
  return res.data.data ?? { items: [], total: 0, offset: params.offset ?? 0, limit: params.limit ?? 20 }
}

export async function getProductDetail(id: string | number) {
  const res = await api.get<ApiResponse<ProductDetail>>(`/products/${id}`)
  return res.data.data
}
