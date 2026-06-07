import { expect, test } from "@playwright/test"
import { loginAsAdmin } from "./helpers"

test("protected buyer success page redirects anonymous users to login", async ({ page }) => {
  await page.goto("/orders/KW-NOAUTH/success")

  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByRole("heading", { name: "登录账号" })).toBeVisible()
})

test("profile order list hides delivered codes and links to success detail", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "buyer-e2e-token")
    window.localStorage.setItem("auth_storage", "local")
  })

  await page.route("**/api/v1/users/me", async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: "success",
        data: {
          id: 7,
          username: "buyer-e2e",
          email: "buyer@example.com",
          phone: null,
          role: "buyer",
          is_active: true,
          created_at: "2026-06-06 10:00:00",
          updated_at: "2026-06-06 10:00:00",
        },
      },
    })
  })

  const profileOrders = Array.from({ length: 11 }, (_, index) => ({
    id: index + 1,
    order_no: `KWPROFILEPAID${String(index + 1).padStart(3, "0")}`,
    status: "paid",
    total_amount: "0.00",
    product_name: "视频会员月卡",
    quantity: index + 1,
    contact_info: "buyer@example.com",
    paid_at: "2026-06-06 18:12:10",
    created_at: "2026-06-06 18:10:00",
    codes: [
      { id: index * 2 + 1, code_value: `PROFILE-SECRET-${String(index + 1).padStart(3, "0")}-A` },
      { id: index * 2 + 2, code_value: `PROFILE-SECRET-${String(index + 1).padStart(3, "0")}-B` },
    ],
  }))

  await page.route("**/api/v1/orders/mine**", async (route) => {
    const url = new URL(route.request().url())
    const afterId = Number(url.searchParams.get("after_id") || 0)
    const afterCreatedAt = url.searchParams.get("after_created_at") || ""
    const limit = Number(url.searchParams.get("limit") || 10)
    const ordered = [...profileOrders].sort((a, b) => b.id - a.id)
    const items = ordered
      .filter(order => !afterCreatedAt || order.created_at < afterCreatedAt || (order.created_at === afterCreatedAt && order.id < afterId))
      .slice(0, Math.min(limit, 10))
    await route.fulfill({
      json: {
        code: 200,
        msg: "success",
        data: {
          records: items,
          items,
          count: items.length,
          prev_cursor: items[0]?.id || afterId,
          next_cursor: items[items.length - 1]?.id || afterId,
          before_cursor: items[0]?.id || afterId,
          after_cursor: items[items.length - 1]?.id || afterId,
          prev_cursor_created_at: items[0]?.created_at || afterCreatedAt,
          next_cursor_created_at: items[items.length - 1]?.created_at || afterCreatedAt,
          before_cursor_created_at: items[0]?.created_at || afterCreatedAt,
          after_cursor_created_at: items[items.length - 1]?.created_at || afterCreatedAt,
          has_more: profileOrders.some(order => order.created_at < (items[items.length - 1]?.created_at || afterCreatedAt) || (order.created_at === (items[items.length - 1]?.created_at || afterCreatedAt) && order.id < (items[items.length - 1]?.id || afterId))),
          limit: 10,
        },
      },
    })
  })

  await page.goto("/profile")
  await page.getByRole("button", { name: "我的订单 ›" }).click()

  await expect(page.getByText("KWPROFILEPAID011")).toBeVisible()
  await expect(page.getByText("KWPROFILEPAID001")).toHaveCount(0)
  await expect(page.getByText("PROFILE-SECRET-001-A")).toHaveCount(0)
  await expect(page.getByText("PROFILE-SECRET-001-B")).toHaveCount(0)
  await expect(page.getByRole("link", { name: "查看详情" })).toHaveCount(10)

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(page.getByText("KWPROFILEPAID001")).toBeVisible()
  await expect(page.getByText("已加载 11 条购买记录")).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(page.getByRole("link", { name: "查看详情" })).toHaveCount(11)

  const detailLink = page.getByRole("link", { name: "查看详情" }).first()
  await expect(detailLink).toBeVisible()
  await expect(detailLink).toHaveAttribute("href", "/orders/KWPROFILEPAID011/success")
})

test("admin can log in and open management modules", async ({ page }) => {
  await loginAsAdmin(page)

  const modules = [
    { path: "/admin/products", title: "商品管理" },
    { path: "/admin/categories", title: "分类管理" },
    { path: "/admin/code-keys", title: "卡密库存" },
    { path: "/admin/orders", title: "订单管理" },
  ]

  for (const module of modules) {
    await page.goto(module.path)
    await expect(page.getByRole("heading", { name: module.title })).toBeVisible()
  }
})
