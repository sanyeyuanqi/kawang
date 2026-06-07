export const shopInfoConfig = {
  brand: {
    name: "小野卡铺",
    iconText: "卡",
    subtitle: "个人自动发卡小店",
    description: "会员卡券、游戏充值、软件授权等虚拟商品，付款后自动发卡。",
  },
  aboutHero: {
    title: "关于小野卡铺",
    description: "个人自动发卡小店，提供会员卡券、游戏充值、软件授权等虚拟商品，付款后自动发卡。",
    badge: "24 小时自动发卡",
    slogan: "自动发卡 · 自助查询 · 售后在线",
  },
  storeInfo: {
    operations: {
      title: "经营与服务",
      items: [
        { label: "营业状态：", value: "自动发卡中" },
        { label: "服务时间：", value: "全天自助下单" },
        { label: "订单查询：", value: "凭联系方式或订单号查询" },
      ],
    },
    contact: {
      title: "联系方式",
      label: "客服微信：",
      value: "ylj3194584108",
      helpText: "扫码添加客服，或凭下单联系方式查询订单",
      qrCaption: "二维码",
      qrImageSrc: "/images/customer-qr.png",
    },
    purchase: {
      title: "购买说明",
      items: [
        "1. 无需登录，选择商品后填写联系方式并完成支付",
        "2. 系统自动发放卡密，可在订单查询页找回",
        "3. 如遇使用问题，可添加客服协助处理",
      ],
    },
  },
  serviceCta: {
    title: "虚拟商品自动发卡服务",
    description: "会员卡券、游戏充值、软件授权等商品持续上新，支持免登录下单与订单查询。",
    actionText: "查询订单",
  },
} as const
