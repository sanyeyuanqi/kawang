import { useEffect, useState } from "react"

import { shopInfoConfig } from "@/config/shopInfoConfig"

interface ShopContactConfig {
  customerWechat: string
  qrImageSrc: string
}

const defaultContactConfig: ShopContactConfig = {
  customerWechat: shopInfoConfig.storeInfo.contact.value,
  qrImageSrc: shopInfoConfig.storeInfo.contact.qrImageSrc,
}

export function useShopContactConfig() {
  const [contactConfig, setContactConfig] = useState<ShopContactConfig>(defaultContactConfig)

  useEffect(() => {
    let cancelled = false

    async function loadContactConfig() {
      try {
        const response = await fetch(`/shop-contact.json?t=${Date.now()}`, { cache: "no-store" })
        if (!response.ok) return
        const data = await response.json()
        if (cancelled) return

        setContactConfig({
          customerWechat: typeof data.customerWechat === "string" && data.customerWechat.trim()
            ? data.customerWechat.trim()
            : defaultContactConfig.customerWechat,
          qrImageSrc: typeof data.qrImageSrc === "string" ? data.qrImageSrc.trim() : "",
        })
      } catch {
        if (!cancelled) setContactConfig(defaultContactConfig)
      }
    }

    loadContactConfig()

    return () => {
      cancelled = true
    }
  }, [])

  return contactConfig
}
