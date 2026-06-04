import { expect, test } from "@playwright/test"

test("home page renders stable catalog without search", async ({ page }) => {
  await page.goto("/")

  const isMobile = (page.viewportSize()?.width || 0) < 768
  if (isMobile) {
    await expect(page.locator("div:visible").filter({ hasText: "VIP" }).first()).toBeVisible()
  } else {
    await expect(page.locator("h1:visible,h2:visible").filter({ hasText: "商品分类" }).first()).toBeVisible()
  }
  await expect(page.locator("a:visible,article:visible").filter({ hasText: "视频会员月卡" }).first()).toBeVisible()
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
