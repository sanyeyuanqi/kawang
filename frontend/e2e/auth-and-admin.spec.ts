import { expect, test } from "@playwright/test"
import { loginAsAdmin } from "./helpers"

test("protected buyer success page redirects anonymous users to login", async ({ page }) => {
  await page.goto("/orders/KW-NOAUTH/success")

  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByRole("heading", { name: "登录账号" })).toBeVisible()
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
