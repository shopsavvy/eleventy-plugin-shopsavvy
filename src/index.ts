export interface ShopsavvyPluginOptions {
  apiKey?: string
  baseUrl?: string
  cacheTTL?: number
}

interface CachedResponse {
  data: unknown
  expiresAt: number
}

const DEFAULT_BASE_URL = "https://api.shopsavvy.com/v1"

class Client {
  private cache = new Map<string, CachedResponse>()
  constructor(
    private apiKey: string,
    private baseUrl: string = DEFAULT_BASE_URL,
    private cacheTTL: number = 60_000,
  ) {}

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const key = path + JSON.stringify(params)
    const hit = this.cache.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.data as T

    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) usp.append(k, String(v))
    }
    const url = `${this.baseUrl}${path}${usp.toString() ? `?${usp}` : ""}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "User-Agent": "eleventy-plugin-shopsavvy/0.1.0",
      },
    })
    if (!res.ok) throw new Error(`ShopSavvy: ${res.status} ${res.statusText}`)
    const json = (await res.json()) as T
    this.cache.set(key, { data: json, expiresAt: Date.now() + this.cacheTTL })
    return json
  }
}

interface ProductResponse {
  data: Array<{ name?: string; image?: string; [key: string]: unknown }>
}

interface OffersResponse {
  data: Array<{ retailer?: string; price?: number; condition?: string; availability?: boolean; url?: string }>
}

interface DealsResponse {
  data: Array<{ name?: string; image?: string; price?: number; strikethrough?: number; retailer?: string; url?: string }>
}

interface HistoryResponse {
  data: Array<{ date?: string; price?: number }>
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderProductCard(product: ProductResponse, offers: OffersResponse["data"]): string {
  const item = product.data[0] || {}
  const cheapest = [...offers].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0]
  const offersHtml = offers
    .map((o) => `<li><span>${escapeHtml(o.retailer)}</span><span>$${escapeHtml(o.price)}</span></li>`)
    .join("")
  return `<div class="shopsavvy-card">${
    item.image ? `<img class="shopsavvy-card__image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" />` : ""
  }<div class="shopsavvy-card__body"><h3 class="shopsavvy-card__name">${escapeHtml(item.name)}</h3>${
    cheapest ? `<p class="shopsavvy-card__price">$${escapeHtml(cheapest.price)} <span class="shopsavvy-card__retailer">at ${escapeHtml(cheapest.retailer)}</span></p>` : ""
  }<ul class="shopsavvy-card__offers">${offersHtml}</ul><a class="shopsavvy-card__cta" href="https://shopsavvy.com" rel="noopener">Compare on ShopSavvy</a></div></div>`
}

function renderProductInline(product: ProductResponse, offers: OffersResponse["data"]): string {
  const item = product.data[0] || {}
  const cheapest = [...offers].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0]
  return `<span class="shopsavvy-inline"><strong>${escapeHtml(item.name)}</strong>${
    cheapest ? ` — <span class="shopsavvy-inline__price">$${escapeHtml(cheapest.price)} at ${escapeHtml(cheapest.retailer)}</span>` : ""
  }</span>`
}

function renderProductTable(product: ProductResponse, offers: OffersResponse["data"]): string {
  const item = product.data[0] || {}
  const rows = offers
    .map(
      (o) =>
        `<tr><td>${escapeHtml(o.retailer)}</td><td>$${escapeHtml(o.price)}</td><td>${escapeHtml(o.condition || "new")}</td><td>${o.availability ? "Yes" : "—"}</td></tr>`,
    )
    .join("")
  return `<div class="shopsavvy-table-wrap"><p class="shopsavvy-table__title">${escapeHtml(item.name)}</p><table class="shopsavvy-table"><thead><tr><th>Retailer</th><th>Price</th><th>Condition</th><th>In stock</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

function renderDeals(deals: DealsResponse["data"]): string {
  const items = deals
    .map((d) => {
      const img = d.image ? `<img src="${escapeHtml(d.image)}" alt="${escapeHtml(d.name)}" loading="lazy" />` : ""
      const msrp = d.strikethrough ? `<span class="shopsavvy-deal__msrp">$${escapeHtml(d.strikethrough)}</span>` : ""
      return `<a class="shopsavvy-deal" href="${escapeHtml(d.url || "https://shopsavvy.com")}" rel="noopener">${img}<div class="shopsavvy-deal__body"><p class="shopsavvy-deal__name">${escapeHtml(d.name)}</p><p class="shopsavvy-deal__price"><span class="shopsavvy-deal__sale">$${escapeHtml(d.price)}</span>${msrp}</p><p class="shopsavvy-deal__retailer">${escapeHtml(d.retailer)}</p></div></a>`
    })
    .join("")
  return `<div class="shopsavvy-deals-grid">${items}</div>`
}

function renderSparkline(history: HistoryResponse["data"], width = 240, height = 60): string {
  const prices = history.map((p) => p.price ?? 0).filter((n) => n > 0)
  if (prices.length < 2) return ""
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const coords = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * width
      const y = height - ((p - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return `<svg class="shopsavvy-sparkline" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="Price history sparkline" preserveAspectRatio="none" viewBox="0 0 ${width} ${height}"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${coords}" /></svg><span class="shopsavvy-sparkline__range">$${min} – $${max}</span>`
}

export default function shopsavvy(eleventyConfig: any, options: ShopsavvyPluginOptions = {}): void {
  const apiKey = options.apiKey || process.env.SHOPSAVVY_API_KEY || ""
  const client = apiKey ? new Client(apiKey, options.baseUrl, options.cacheTTL) : null

  function warnNoKey(): string {
    return "<!-- shopsavvy: missing API key (set options.apiKey or SHOPSAVVY_API_KEY) -->"
  }

  eleventyConfig.addAsyncShortcode(
    "shopsavvyProduct",
    async (identifier: string, layout: "card" | "inline" | "table" = "card", retailer?: string, limit = 5) => {
      if (!client) return warnNoKey()
      try {
        const product = await client.get<ProductResponse>("/products/details", { id: identifier })
        const offersResp = await client.get<OffersResponse>("/products/offers", { id: identifier, retailer })
        const offers = (offersResp.data || []).slice(0, limit)
        if (layout === "inline") return renderProductInline(product, offers)
        if (layout === "table") return renderProductTable(product, offers)
        return renderProductCard(product, offers)
      } catch (err) {
        return `<!-- shopsavvy: ${(err as Error).message} -->`
      }
    },
  )

  eleventyConfig.addAsyncShortcode(
    "shopsavvyDeals",
    async (category?: string, limit = 10, sort: "price" | "discount" | "trending" = "trending", grade?: string) => {
      if (!client) return warnNoKey()
      try {
        const params: Record<string, string | number | undefined> = { limit, sort, category }
        if (grade) params.min_grade = grade
        const deals = await client.get<DealsResponse>("/deals", params)
        return renderDeals(deals.data || [])
      } catch (err) {
        return `<!-- shopsavvy-deals: ${(err as Error).message} -->`
      }
    },
  )

  eleventyConfig.addAsyncShortcode("shopsavvyPriceHistory", async (identifier: string, days = 90, width = 240, height = 60) => {
    if (!client) return warnNoKey()
    try {
      const history = await client.get<HistoryResponse>("/products/history", { id: identifier, days })
      return renderSparkline(history.data || [], width, height)
    } catch (err) {
      return `<!-- shopsavvy-price-history: ${(err as Error).message} -->`
    }
  })

  eleventyConfig.addAsyncFilter("shopsavvyPrice", async (identifier: string) => {
    if (!client) return ""
    try {
      const offers = await client.get<OffersResponse>("/products/offers", { id: identifier })
      const cheapest = [...(offers.data || [])].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0]
      return cheapest ? `$${cheapest.price}` : ""
    } catch {
      return ""
    }
  })

  eleventyConfig.addGlobalData("shopsavvyDeals", async () => {
    if (!client) return []
    try {
      const deals = await client.get<DealsResponse>("/deals", { limit: 50, sort: "trending" })
      return deals.data || []
    } catch {
      return []
    }
  })
}
