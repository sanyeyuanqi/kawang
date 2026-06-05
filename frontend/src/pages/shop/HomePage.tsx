import { useCallback, useEffect, useRef, useState } from "react"
import CategoryIcon from "@/components/shop/CategoryIcon"
import HomeHero from "@/components/shop/HomeHero"
import MobilePhoneFrame from "@/components/shop/MobilePhoneFrame"
import ProductCard from "@/components/shop/ProductCard"
import { getCategories, getProducts } from "@/api/shop"
import type { Category, Product } from "@/types/common"
import { useLanguage } from "@/context/LanguageContext"

type HomeCategory = Pick<Category, "id" | "name" | "subtitle">

const categoryThemes = [
  ["#ebf2ff", "#0e4beb"],
  ["#f1eeff", "#6e46e3"],
  ["#e8faf4", "#08a678"],
  ["#fff6df", "#f09e1f"],
  ["#ffedeb", "#ec3c30"],
  ["#ebf2ff", "#0d91ed"],
]

const skeletonItems = Array.from({ length: 6 })
const productSkeletonItems = Array.from({ length: 6 })
const PAGE_SIZE = 12

function MobileHomeSkeleton() {
  return (
    <>
      <section className="mt-5">
        <div className="grid grid-cols-4 gap-[18px]">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="home-skeleton-panel h-[78px] animate-pulse rounded-[18px] border">
              <div className="home-skeleton-line mx-auto mt-5 h-4 w-10 rounded-full" />
              <div className="home-skeleton-line home-skeleton-line-soft mx-auto mt-3 h-3 w-8 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <div className="grid gap-5">
          {productSkeletonItems.map((_, index) => (
            <div key={index} className="home-skeleton-card grid min-h-[156px] grid-cols-[96px_1fr_72px] items-center gap-3 rounded-[20px] border px-4 py-4">
              <div className="home-skeleton-media size-[96px] animate-pulse rounded-[16px]" />
              <div className="min-w-0">
                <div className="home-skeleton-line h-5 w-28 animate-pulse rounded-full" />
                <div className="home-skeleton-line home-skeleton-line-soft mt-3 h-4 w-36 animate-pulse rounded-full" />
                <div className="home-skeleton-price mt-4 h-6 w-20 animate-pulse rounded-full" />
              </div>
              <div className="flex h-full flex-col items-end justify-between">
                <div className="home-skeleton-pill h-7 w-14 animate-pulse rounded-full" />
                <div className="home-skeleton-button h-11 w-[60px] animate-pulse rounded-[12px]" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function DesktopHomeSkeleton() {
  return (
    <div className="grid gap-[clamp(24px,1.8vw,40px)] lg:grid-cols-[clamp(190px,12vw,260px)_minmax(0,1fr)]">
      <aside className="hidden content-start gap-4 lg:grid lg:gap-[clamp(16px,1vw,24px)]">
        {skeletonItems.map((_, index) => (
          <div key={index} className="home-skeleton-panel min-h-[64px] animate-pulse rounded-[16px] border px-4 py-3">
            <div className="home-skeleton-line h-4 w-20 rounded-full" />
            <div className="home-skeleton-line home-skeleton-line-soft mt-3 h-3 w-24 rounded-full" />
          </div>
        ))}
      </aside>

      <section className="min-w-0">
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3 xl:gap-[clamp(18px,1.21vw,34px)]">
          {productSkeletonItems.map((_, index) => (
            <div key={index} className="home-skeleton-card min-h-[clamp(292px,16.2vw,372px)] rounded-[clamp(14px,0.85vw,24px)] border p-[clamp(16px,0.9vw,26px)]">
              <div className="home-skeleton-media h-[clamp(118px,7.25vw,178px)] w-full animate-pulse rounded-[clamp(12px,0.7vw,20px)]" />
              <div className="mt-2 flex gap-2">
                <div className="home-skeleton-pill h-6 w-16 animate-pulse rounded-full" />
                <div className="home-skeleton-stock h-6 w-14 animate-pulse rounded-full" />
                <div className="home-skeleton-button h-6 w-16 animate-pulse rounded-full" />
              </div>
              <div className="home-skeleton-line mt-[clamp(15px,0.99vw,28px)] h-5 w-36 animate-pulse rounded-full" />
              <div className="home-skeleton-line home-skeleton-line-soft mt-3 h-4 w-48 max-w-full animate-pulse rounded-full" />
              <div className="mt-[clamp(11px,0.7vw,20px)] flex items-center justify-between">
                <div className="home-skeleton-price h-6 w-20 animate-pulse rounded-full" />
                <div className="home-skeleton-pill h-7 w-16 animate-pulse rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function EmptyProductsState({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage()

  return (
    <div className={(compact ? "justify-center rounded-[20px] px-5 py-8" : "min-h-[clamp(560px,34vw,680px)] justify-start rounded-[24px] px-8 pb-12 pt-[clamp(52px,4vw,82px)]") + " flex flex-col items-center border border-dashed border-[#cfdced] bg-white/75 text-center shadow-[0_18px_42px_-28px_rgba(10,18,31,0.22)]"}>
      <h3 className={(compact ? "text-[18px]" : "text-[22px]") + " font-bold text-[#0e131e]"}>{t("home.emptyProductsTitle")}</h3>
      <p className={(compact ? "mt-2 text-[14px]" : "mt-3 text-[15px]") + " max-w-[360px] leading-6 text-[#6b7990]"}>
        {t("home.emptyProductsDesc")}
      </p>
    </div>
  )
}

export default function HomePage() {
  const { t } = useLanguage()
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [categories, setCategories] = useState<HomeCategory[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const desktopProductGridRef = useRef<HTMLDivElement | null>(null)
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const desktopLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const [desktopSidebarTop, setDesktopSidebarTop] = useState<number | null>(null)
  const primaryMobileCategoryIds = [1, 2, 3]
  const mobileCategories = [
    { id: 1, name: "VIP", subtitle: t("home.category.vip") },
    { id: 2, name: "GAME", subtitle: t("home.category.game") },
    { id: 3, name: "APP", subtitle: t("home.category.app") },
  ].filter(category => categories.some(item => item.id === category.id))
  const mobileCategoryItems = [...mobileCategories, { id: null, name: "ALL", subtitle: t("home.category.more") }]
  const hasMore = products.length < total

  useEffect(() => {
    let ignore = false

    getCategories()
      .then((categoryItems) => {
        if (ignore) return
        const nextCategories = categoryItems.map(category => ({ id: category.id, name: category.name, subtitle: category.subtitle }))
        setCategories(nextCategories)
        setSelectedCategory(current => current && !nextCategories.some(category => category.id === current) ? null : current)
      })
      .catch(() => {
        if (ignore) return
        setCategories([])
      })

    return () => {
      ignore = true
    }
  }, [])

  const loadProductsPage = useCallback(async (nextOffset: number, append = false) => {
    if (append) setIsLoadingMore(true)
    else setIsLoading(true)

    try {
      const productPage = await getProducts({
        category_id: selectedCategory ?? undefined,
        offset: nextOffset,
        limit: PAGE_SIZE,
      })
      setProducts(current => append ? [...current, ...productPage.items] : productPage.items)
      setTotal(productPage.total)
      setOffset(nextOffset + productPage.items.length)
    } catch {
      if (!append) {
        setProducts([])
        setTotal(0)
        setOffset(0)
      }
    } finally {
      if (append) setIsLoadingMore(false)
      else setIsLoading(false)
    }
  }, [selectedCategory])

  useEffect(() => {
    setProducts([])
    setTotal(0)
    setOffset(0)
    loadProductsPage(0)
  }, [loadProductsPage])

  useEffect(() => {
    const targets = [mobileLoadMoreRef.current, desktopLoadMoreRef.current].filter(Boolean) as HTMLDivElement[]
    if (targets.length === 0 || isLoading || isLoadingMore || !hasMore) return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting) && !isLoading && !isLoadingMore && hasMore) {
        loadProductsPage(offset, true)
      }
    }, { rootMargin: "360px 0px" })

    targets.forEach(target => observer.observe(target))
    return () => observer.disconnect()
  }, [hasMore, isLoading, isLoadingMore, loadProductsPage, offset])

  const getProductTheme = (product: Product) => {
    const categoryIndex = categories.findIndex(category => category.id === product.category_id || category.name === product.category_name)
    return categoryThemes[(categoryIndex >= 0 ? categoryIndex : 0) % categoryThemes.length] as [string, string]
  }

  const selectCategory = (categoryId: number | null) => {
    setSelectedCategory(categoryId)
    setCategoryPickerOpen(false)
  }

  useEffect(() => {
    if (isLoading) return

    const syncDesktopSidebarTop = () => {
      if (window.innerWidth < 1024) {
        setDesktopSidebarTop(null)
        return
      }

      const firstCard = desktopProductGridRef.current?.querySelector("a.product-card")
      const nextTop = firstCard?.getBoundingClientRect().top
      if (typeof nextTop === "number") {
        setDesktopSidebarTop(Math.round(nextTop))
      }
    }

    syncDesktopSidebarTop()
    const frame = window.requestAnimationFrame(syncDesktopSidebarTop)
    window.addEventListener("resize", syncDesktopSidebarTop)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", syncDesktopSidebarTop)
    }
  }, [products.length, isLoading])

  const isMobileMoreActive = categoryPickerOpen || selectedCategory === null || !primaryMobileCategoryIds.includes(selectedCategory)

  return (
    <>
    <MobilePhoneFrame contentClassName="px-6 pt-2 pb-32" showHomeIndicator={false}>
      <HomeHero />

      {isLoading ? (
        <MobileHomeSkeleton />
      ) : (
        <>
          <section className="mt-5">
            <div className="grid grid-cols-4 gap-[18px]">
              {mobileCategoryItems.map((category, index) => (
                <CategoryIcon
                  key={category.name}
                  category={category}
                  theme={categoryThemes[index % categoryThemes.length] as [string, string]}
                  active={category.id === null ? isMobileMoreActive : selectedCategory === category.id}
                  onClick={() => {
                    if (category.id === null) {
                      setCategoryPickerOpen(true)
                      return
                    }
                    selectCategory(category.id)
                  }}
                />
              ))}
            </div>
          </section>

          <section className="mt-5">
            <div className="grid gap-5">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} theme={getProductTheme(product)} />
              ))}
              {products.length === 0 && (
                <EmptyProductsState compact />
              )}
              {products.length > 0 && (
                <div ref={mobileLoadMoreRef} className="min-h-8 text-center text-[13px] text-[#6b7990]">
                  {isLoadingMore ? t("common.loading") : hasMore ? "" : t("已加载全部")}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </MobilePhoneFrame>

    {categoryPickerOpen && (
      <div className="fixed inset-y-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 md:hidden">
        <button
          type="button"
          aria-label={t("home.chooseCategory")}
          className="mobile-fade-in absolute inset-0 bg-[#0e131e]/35"
          onClick={() => setCategoryPickerOpen(false)}
        />
        <div className="mobile-sheet-in absolute bottom-0 left-0 right-0 rounded-t-[28px] border border-[#d6e2f0] bg-white px-6 pb-8 pt-4 shadow-[0_-22px_46px_-24px_rgba(10,18,31,0.35)]">
          <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-[#d4deeb]" />
          <div className="flex items-center justify-between">
            <h3 className="text-[20px] font-bold leading-none text-[#0e131e]">{t("home.chooseCategory")}</h3>
            <button type="button" className="rounded-full bg-[#eef5ff] px-4 py-2 text-[13px] font-semibold text-[#0e4beb]" onClick={() => selectCategory(null)}>
              {t("home.allProducts")}
            </button>
          </div>
          <div className="mt-4 max-h-[250px] snap-y snap-mandatory overflow-y-auto overscroll-contain pr-1">
            <button
              type="button"
              onClick={() => selectCategory(null)}
              className={"mb-3 flex h-[54px] w-full snap-center items-center justify-between rounded-[16px] border px-4 text-left transition " + (selectedCategory === null ? "border-[#0e4beb] bg-[#eef5ff] text-[#0e4beb]" : "border-[#dfe5ed] bg-[#f8fbff] text-[#0e131e]")}
            >
              <span className="text-[16px] font-bold">{t("home.allProducts")}</span>
              <span className="text-[13px] font-medium text-[#6b7990]">{t("home.showAllCategories")}</span>
            </button>
            {categories.map((category, index) => (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category.id)}
                className={"mb-3 flex h-[58px] w-full snap-center items-center justify-between rounded-[16px] border px-4 text-left transition " + (selectedCategory === category.id ? "border-[#0e4beb] bg-[#eef5ff]" : "border-[#dfe5ed] bg-white")}
              >
                <span>
                  <span className="block text-[17px] font-bold leading-[20px]" style={{ color: categoryThemes[index % categoryThemes.length][1] }}>{category.name}</span>
                  <span className="mt-1 block text-[12px] font-medium text-[#6b7990]">{category.subtitle}</span>
                </span>
                <span className={"h-2.5 w-2.5 rounded-full " + (selectedCategory === category.id ? "bg-[#0e4beb]" : "bg-[#d9e3f0]")} />
              </button>
            ))}
          </div>
        </div>
      </div>
    )}

    <div className="hidden pb-24 md:block md:pb-16">
      <button
        type="button"
        aria-label={t("home.chooseCategory")}
        aria-expanded={categoryPickerOpen}
        onClick={() => setCategoryPickerOpen(true)}
        className="fixed bottom-8 right-8 z-40 hidden size-14 items-center justify-center rounded-full border border-[#c8d7ea] bg-white text-[#0e4beb] shadow-[0_18px_40px_-18px_rgba(10,18,31,0.42)] transition hover:-translate-y-0.5 hover:border-[#0e4beb] hover:shadow-[0_22px_48px_-20px_rgba(10,18,31,0.52)] md:flex lg:hidden"
      >
        <span className="grid gap-1">
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
        </span>
      </button>

      {categoryPickerOpen && (
        <div className="fixed inset-0 z-50 hidden md:block lg:hidden">
          <button
            type="button"
            aria-label={t("home.chooseCategory")}
            className="absolute inset-0 bg-[#0e131e]/20 backdrop-blur-[1px]"
            onClick={() => setCategoryPickerOpen(false)}
          />
          <div className="absolute bottom-24 right-8 w-[min(360px,calc(100vw-48px))] overflow-hidden rounded-[18px] border border-[#d8e4f4] bg-white shadow-[0_24px_60px_-24px_rgba(10,18,31,0.42)]">
            <div className="flex items-center justify-between border-b border-[#edf2f8] px-5 py-4">
              <h3 className="text-[17px] font-bold leading-none text-[#0e131e]">{t("home.chooseCategory")}</h3>
              <button
                type="button"
                onClick={() => selectCategory(null)}
                className="rounded-full bg-[#eef5ff] px-3 py-1.5 text-[12px] font-semibold text-[#0e4beb]"
              >
                {t("home.allProducts")}
              </button>
            </div>
            <div className="max-h-[min(560px,calc(100vh-180px))] overflow-y-auto p-3">
              <button
                type="button"
                onClick={() => selectCategory(null)}
                className={"mb-2 flex min-h-[58px] w-full items-center justify-between gap-3 rounded-[14px] border px-4 text-left transition " + (selectedCategory === null ? "border-[#0e4beb] bg-[#f6f9ff]" : "border-[#dfe5ed] bg-white hover:border-[#b8c9e2]")}
              >
                <span className="min-w-0">
                  <span className={"block truncate text-[14px] font-bold leading-5 " + (selectedCategory === null ? "text-[#0e4beb]" : "text-[#0e131e]")}>{t("home.all")}</span>
                  <span className="block truncate text-[12px] leading-5 text-[#6b7990]">{t("home.allSubtitle")}</span>
                </span>
                <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + (selectedCategory === null ? "bg-[#0e4beb]" : "bg-[#d8e2ef]")} />
              </button>
              {categories.map((category) => {
                const active = selectedCategory === category.id
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => selectCategory(category.id)}
                    className={"mb-2 flex min-h-[58px] w-full items-center justify-between gap-3 rounded-[14px] border px-4 text-left transition " + (active ? "border-[#0e4beb] bg-[#f6f9ff]" : "border-[#dfe5ed] bg-white hover:border-[#b8c9e2]")}
                  >
                    <span className="min-w-0">
                      <span className={"block truncate text-[14px] font-bold leading-5 " + (active ? "text-[#0e4beb]" : "text-[#0e131e]")}>{category.name}</span>
                      <span className="block truncate text-[12px] leading-5 text-[#6b7990]">{category.subtitle}</span>
                    </span>
                    <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + (active ? "bg-[#0e4beb]" : "bg-[#d8e2ef]")} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <section className="figma-web-container px-6 pt-10 md:px-0 md:pt-[clamp(28px,1.8vw,48px)]">
        {isLoading ? (
          <DesktopHomeSkeleton />
        ) : (
        <div className="grid gap-[clamp(24px,1.8vw,40px)] lg:grid-cols-[clamp(190px,12vw,260px)_minmax(0,1fr)]">
          <div className="hidden min-w-0 lg:block">
          <aside
            className="category-sidebar-scroll fixed z-20 -mt-2 grid w-[clamp(190px,12vw,260px)] content-start gap-[clamp(16px,1vw,24px)] overflow-y-auto pb-2 pr-2 pt-2"
            style={{
              top: desktopSidebarTop ?? "calc(69px + clamp(28px, 1.8vw, 48px))",
              maxHeight: desktopSidebarTop ? `calc(100vh - ${desktopSidebarTop}px - 24px)` : "calc(100vh - 69px - clamp(28px, 1.8vw, 48px) - 24px)",
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={"category-filter-card group flex min-h-[64px] w-full min-w-0 items-center justify-between gap-3 rounded-[16px] border bg-white px-4 py-3 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#b8c9e2] hover:shadow-[0_18px_34px_-22px_rgba(10,18,31,0.32)] " + (selectedCategory === null ? "category-filter-card-active border-[#0e4beb] bg-[#f6f9ff] shadow-[0_16px_30px_-24px_rgba(14,75,235,0.5)]" : "border-[#dfe5ed]")}
              aria-pressed={selectedCategory === null}
            >
              <span className="min-w-0">
                <span className={"block truncate text-[15px] font-bold leading-5 " + (selectedCategory === null ? "text-[#0e4beb]" : "text-[#0e131e]")}>{t("home.all")}</span>
                <span className="mt-0.5 block truncate text-[12px] leading-5 text-[#6b7990]">{t("home.allSubtitle")}</span>
              </span>
              <span className={"h-2.5 w-2.5 shrink-0 rounded-full transition " + (selectedCategory === null ? "bg-[#0e4beb]" : "bg-[#d8e2ef] group-hover:bg-[#9fb5d1]")} />
            </button>
            {categories.map((category, index) => {
              const active = selectedCategory === category.id
              return (
                <button
                  key={`${category.name}-${index}`}
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
                  className={"category-filter-card group flex min-h-[64px] w-full min-w-0 items-center justify-between gap-3 rounded-[16px] border bg-white px-4 py-3 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#b8c9e2] hover:shadow-[0_18px_34px_-22px_rgba(10,18,31,0.32)] " + (active ? "category-filter-card-active border-[#0e4beb] bg-[#f6f9ff] shadow-[0_16px_30px_-24px_rgba(14,75,235,0.5)]" : "border-[#dfe5ed]")}
                  aria-pressed={active}
                >
                  <span className="min-w-0">
                    <span className={"block truncate text-[15px] font-bold leading-5 " + (active ? "text-[#0e4beb]" : "text-[#0e131e]")}>{category.name}</span>
                    <span className="mt-0.5 block truncate text-[12px] leading-5 text-[#6b7990]">{category.subtitle}</span>
                  </span>
                  <span className={"h-2.5 w-2.5 shrink-0 rounded-full transition " + (active ? "bg-[#0e4beb]" : "bg-[#d8e2ef] group-hover:bg-[#9fb5d1]")} />
                </button>
              )
            })}
          </aside>
          </div>

          <section className="min-w-0">
            <div ref={desktopProductGridRef} className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3 xl:gap-[clamp(18px,1.21vw,34px)]">
              {products.map((product) => {
                return (
                  <ProductCard key={product.id} product={product} theme={getProductTheme(product)} />
                )
              })}
              {products.length === 0 && (
                <div className="col-span-full">
                  <EmptyProductsState />
                </div>
              )}
              {products.length > 0 && (
                <div ref={desktopLoadMoreRef} className="col-span-full min-h-10 text-center text-[13px] text-[#6b7990]">
                  {isLoadingMore ? t("common.loading") : hasMore ? "" : t("已加载全部")}
                </div>
              )}
            </div>
          </section>
        </div>
        )}
      </section>
    </div>
    </>
  )
}
