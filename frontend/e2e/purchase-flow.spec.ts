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
