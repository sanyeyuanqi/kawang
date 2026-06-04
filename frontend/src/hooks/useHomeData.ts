import { useEffect, useMemo, useState } from "react"
import { getCategories, getProducts, getShop } from "@/api/shop"
import { useLanguage } from "@/context/LanguageContext"
import type { Category, Product, ShopConfig } from "@/types/common"

interface HomeDataState {
  categories: Category[]
  products: Product[]
  shop: ShopConfig | null
  loading: boolean
  error: string
}

export function useHomeData(query: string) {
  const { st } = useLanguage()
  const [state, setState] = useState<HomeDataState>({
    categories: [],
    products: [],
    shop: null,
    loading: true,
    error: "",
  })

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: "" }))

    Promise.all([getShop(), getCategories(), getProducts({ limit: 8, q: query || undefined })])
      .then(([shop, categories, products]) => {
        if (cancelled) return
        setState({
          shop,
          categories,
          products: products.items,
          loading: false,
          error: "",
        })
      })
      .catch(() => {
        if (cancelled) return
        setState((prev) => ({ ...prev, loading: false, error: st("首页数据加载失败") }))
      })

    return () => {
      cancelled = true
    }
  }, [query, st])

  return useMemo(() => state, [state])
}
