import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

export async function loginAsAdmin(page: Page) {
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "change-me-admin-password"
  await page.goto("/login?redirect=%2Fadmin")
  const form = page.locator("form:visible").last()
  await form.locator('input[name="account"]').fill("sanye")
  await form.locator('input[name="password"]').fill(adminPassword)
  await form.getByRole("button", { name: /^登录$/ }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole("heading", { name: "系统概览" })).toBeVisible()
}
