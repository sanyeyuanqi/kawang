import api from "@/api/client"
import type { Announcement, ApiResponse, Category, PaginatedResponse, Product, ProductDetail, ShopConfig } from "@/types/common"

const productDetailRequests = new Map<string, Promise<ProductDetail>>()

export interface ProductListParams {
  category_id?: number
  q?: string
  after_id?: number
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

export async function getAnnouncements() {
  const res = await api.get<ApiResponse<Announcement[]>>("/announcements")
  return res.data.data ?? []
}

export async function getPinnedAnnouncement() {
  const res = await api.get<ApiResponse<Announcement | null>>("/announcements/pinned")
  return res.data.data ?? null
}

export async function getProducts(params: ProductListParams = {}, signal?: AbortSignal) {
  const res = await api.get<ApiResponse<PaginatedResponse<Product>>>("/products", { params, signal })
  return res.data.data ?? { items: [], total: 0, offset: params.offset ?? 0, limit: params.limit ?? 20, next_cursor: params.after_id ?? 0, has_more: false }
}

export async function getProductDetail(id: string | number) {
  const key = String(id)
  const existingRequest = productDetailRequests.get(key)
  if (existingRequest) return existingRequest

  const request = api
    .get<ApiResponse<ProductDetail>>(`/products/${id}`)
    .then(res => res.data.data as ProductDetail)
    .finally(() => productDetailRequests.delete(key))

  productDetailRequests.set(key, request)
  return request
}
