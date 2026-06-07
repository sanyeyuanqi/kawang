import { expect, test } from "@playwright/test"

test("home page renders stable catalog without search", async ({ page }) => {
  await page.goto("/")

  const isMobile = (page.viewportSize()?.width || 0) < 768
  if (isMobile) {
    await expect(page.locator("div:visible").filter({ hasText: "VIP" }).first()).toBeVisible()
  } else {
    await expect(page.locator('button:visible').filter({ hasText: "全部" }).first()).toBeVisible()
  }
  await expect(page.locator("a:visible,article:visible").filter({ hasText: "视频会员月卡" }).first()).toBeVisible()
  await expect(page.locator("a.product-card:visible").filter({ hasText: "自动发卡" })).toHaveCount(0)
  await expect(page.locator("a.product-card:visible").filter({ hasText: "缺货" })).toHaveCount(0)
  await expect(page.getByPlaceholder("搜索商品")).toHaveCount(0)
})

test("about page renders shop information and service entry", async ({ page }) => {
  await page.goto("/about")

  const isMobile = (page.viewportSize()?.width || 0) < 768
  await expect(page.getByRole("heading", { name: isMobile ? "小野卡铺" : "关于小野卡铺" }).first()).toBeVisible()
  await expect(page.getByRole("heading", { name: "店铺信息" })).toBeVisible()
  if (isMobile) {
    await expect(page.getByRole("heading", { name: "联系方式" })).toBeVisible()
  } else {
    await expect(page.getByRole("heading", { name: "经营与服务" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "购买说明" })).toBeVisible()
  }
})

test("product detail page shows purchase controls", async ({ page }) => {
  await page.goto("/products/1")

  await expect(page.locator("h1:visible").filter({ hasText: "视频会员月卡" }).first()).toBeVisible()
  await expect(page.locator("h2:visible").filter({ hasText: "购买数量" }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /购买|立即|支付/ }).first()).toBeVisible()
})

test("order query hides delivered codes and links paid orders to success detail", async ({ page }) => {
  await page.route("**/api/v1/orders/query", async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: "success",
        data: {
          items: [
            {
              order_no: "KWQUERYPAID001",
              status: "paid",
              total_amount: "0.00",
              product_name: "视频会员月卡",
              quantity: 2,
              contact_info: "query-e2e",
              paid_at: "2026-06-06 17:52:38",
              created_at: "2026-06-06 17:51:00",
              codes: [
                { id: 1, code_value: "SECRET-CODE-001" },
                { id: 2, code_value: "SECRET-CODE-002" },
              ],
            },
          ],
          total: 1,
          offset: 0,
          limit: 10,
        },
      },
    })
  })

  await page.goto("/orders/query")
  await page.locator('input[placeholder="联系方式 / 订单号"]:visible').fill("KWQUERYPAID001")
  await page.locator('button:visible').filter({ hasText: "查询订单" }).click()

  await expect(page.getByText("SECRET-CODE-001")).toHaveCount(0)
  await expect(page.getByText("SECRET-CODE-002")).toHaveCount(0)
  const detailLink = page.getByRole("link", { name: "查看详情" }).first()
  await expect(detailLink).toBeVisible()
  await expect(detailLink).toHaveAttribute("href", "/orders/KWQUERYPAID001/success")
})
