import { expect, test } from "@playwright/test"
import { loginAsAdmin } from "./helpers"

async function expectNoBodyHorizontalOverflow(page: import("@playwright/test").Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
  expect(hasOverflow).toBe(false)
}

test("buyer routes keep responsive page bounds", async ({ page }) => {
  const routes = [
    { path: "/", heading: "商品分类" },
    { path: "/login", heading: "登录账号" },
    { path: "/register", heading: "注册账号" },
    { path: "/forgot-password", heading: "重置密码" },
    { path: "/orders/query", heading: /订单查询|查询订单/ },
    { path: "/about", heading: /关于|关于小野卡铺/ },
    { path: "/products/1", heading: "购买数量" },
  ]

  for (const route of routes) {
    await page.goto(route.path)
    if (route.path === "/") {
      await expect(page.locator("a:visible,article:visible").filter({ hasText: "视频会员月卡" }).first()).toBeVisible()
    } else if (route.path === "/orders/query") {
      await expect(page.getByRole("button", { name: "查询订单" }).first()).toBeVisible()
    } else if (route.path === "/about") {
      await expect(page.getByRole("heading", { name: /小野卡铺|关于小野卡铺/ }).first()).toBeVisible()
    } else {
      await expect(page.locator("h1:visible, h2:visible").filter({ hasText: route.heading }).first()).toBeVisible()
    }
    await expectNoBodyHorizontalOverflow(page)
  }
})

test("admin routes keep responsive page bounds after login", async ({ page }) => {
  await loginAsAdmin(page)

  const routes = [
    { path: "/admin", title: "系统概览" },
    { path: "/admin/products", title: "商品管理" },
    { path: "/admin/categories", title: "分类管理" },
    { path: "/admin/code-keys", title: "卡密库存" },
    { path: "/admin/orders", title: "订单管理" },
  ]

  for (const route of routes) {
    await page.goto(route.path)
    await expect(page.getByRole("heading", { name: route.title })).toBeVisible()
    await expectNoBodyHorizontalOverflow(page)
  }
})
