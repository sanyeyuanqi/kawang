import { expect, test } from "@playwright/test"

test("buyer can create an order and see payment QR modal with mocked API", async ({ page }) => {
  await page.route("**/api/v1/products/1", async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: "success",
        data: {
          id: 1,
          category_id: 1,
          category_name: "视频会员",
          name: "视频会员月卡",
          description: "自动发卡，可在订单查询页找回。",
          cover_image: null,
          price: "18.80",
          sort_order: 1,
          available_stock: 8,
          is_on_sale: true,
        },
      },
    })
  })

  await page.route("**/api/v1/orders", async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: "success",
        data: {
          order_no: "E2EORDER001",
          total_amount: "18.80",
          pay_info: {
            pay_type: 1,
            qr_content: "mock-pay://E2EORDER001",
            qr_url: "mock-pay://E2EORDER001",
          },
        },
      },
    })
  })

  await page.route("**/api/v1/orders/E2EORDER001/result", async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: "success",
        data: {
          order_no: "E2EORDER001",
          status: "pending",
        },
      },
    })
  })

  await page.goto("/products/1")
  await page.getByPlaceholder("填写手机号 / 微信 / QQ，无需注册登录").fill("wechat-e2e")
  await page.getByRole("button", { name: "立即购买" }).click()

  await expect(page.getByRole("heading", { name: "扫码完成支付" })).toBeVisible()
  await expect(page.getByText("订单号：E2EORDER001")).toBeVisible()
  await expect(page.getByText("等待支付确认中...")).toBeVisible()
})

test("paid order shows delivery details and supports copying codes", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])

  await page.route("**/api/v1/orders/E2EPAID001/result", async (route) => {
    await route.fulfill({
      json: {
        code: 200,
        msg: "success",
        data: {
          order_no: "E2EPAID001",
          status: "paid",
          total_amount: "112.80",
          product_name: "视频会员月卡",
          quantity: 6,
          contact_info: "wechat-e2e",
          paid_at: "2026-06-06 12:30:00",
          created_at: "2026-06-06 12:29:00",
          codes: Array.from({ length: 6 }, (_, index) => ({
            id: index + 1,
            code_value: `VIP-MONTH-8K29-XP7${index + 1}`,
          })),
        },
      },
    })
  })

  await page.goto("/orders/E2EPAID001/success")

  if (testInfo.project.name.includes("desktop")) {
    await expect(page.getByRole("heading", { name: "视频会员月卡" })).toBeVisible()
    await expect(page.getByText("¥112.80")).toBeVisible()
    await expect(page.getByText("卡密 6：VIP-MONTH-8K29-XP76")).toBeVisible()
  } else {
    const mobileShell = page.locator(".success-mobile-shell")
    await expect(mobileShell.getByRole("heading", { name: "支付成功" })).toBeVisible()
    await expect(mobileShell.getByText("VIP-MONTH-8K29-XP76", { exact: true })).toBeVisible()
  }

  const copyOne = page.getByRole("button", { name: "复制", exact: true })
  await expect(copyOne).toHaveCount(6)
  await copyOne.nth(0).click()
  await expect(page.getByRole("button", { name: "已复制" })).toBeVisible()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("VIP-MONTH-8K29-XP71")

  await page.getByRole("button", { name: "全部复制" }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("VIP-MONTH-8K29-XP76")
})
