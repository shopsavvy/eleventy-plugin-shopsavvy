export interface ShopsavvyPluginOptions {
  /** ShopSavvy API key. Defaults to the SHOPSAVVY_API_KEY env var. */
  apiKey?: string
  /** Override the ShopSavvy API base URL. */
  baseUrl?: string
  /** How long (ms) identical API requests are served from memory during a build. Default 60000. */
  cacheTTL?: number
}

interface CachedResponse {
  data: unknown
  expiresAt: number
}

const DEFAULT_BASE_URL = "https://api.shopsavvy.com/v1"
const PLUGIN_VERSION = "0.1.0"

/** Deal sorts the Data API accepts on GET /deals. */
const DEAL_SORTS = ["hot", "new", "top-hour", "top-day", "top-week"] as const
export type DealSort = (typeof DEAL_SORTS)[number]

// ---- Data API response shapes (https://shopsavvy.com/data/documentation) ----

export interface ShopsavvyOffer {
  id?: string
  retailer?: string
  price?: number
  currency?: string
  /** "in" | "out"; absent when unknown. */
  availability?: string
  condition?: string
  URL?: string
  seller?: string
  timestamp?: string
}

export interface ShopsavvyProduct {
  title?: string
  shopsavvy?: string
  brand?: string
  images?: string[]
  offers?: ShopsavvyOffer[]
  [key: string]: unknown
}

export interface ShopsavvyDeal {
  path: string
  title: string
  pricing: { current: number; original?: number; currency: string }
  retailer: { name: string }
  url: string
  image?: { url: string }
  grade?: { letter: string; suffix?: string; value: number }
  [key: string]: unknown
}

interface OffersResponse {
  data?: ShopsavvyProduct[]
}

interface DealsResponse {
  deals?: ShopsavvyDeal[]
}

interface HistoryPoint {
  timestamp: string
  price: number
  currency?: string | null
}

interface HistoryResponse {
  data?: Array<ShopsavvyOffer & { history?: HistoryPoint[] }>
}

type ShopsavvyGet = <T>(path: string, params?: Record<string, string | number | undefined>) => Promise<T>

function createClient({ apiKey, baseUrl = DEFAULT_BASE_URL, cacheTTL = 60_000 }: {
  apiKey: string
  baseUrl?: string
  cacheTTL?: number
}): ShopsavvyGet {
  const cache = new Map<string, CachedResponse>()

  return async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") usp.append(k, String(v))
    }
    const url = `${baseUrl}${path}${usp.toString() ? `?${usp}` : ""}`
    const hit = cache.get(url)
    if (hit && hit.expiresAt > Date.now()) return hit.data as T

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": `eleventy-plugin-shopsavvy/${PLUGIN_VERSION}`,
      },
    })
    const json = (await res.json().catch(() => null)) as { error?: string } | null
    if (!res.ok) {
      throw new Error(`ShopSavvy ${res.status}: ${json?.error ?? res.statusText}`)
    }
    cache.set(url, { data: json, expiresAt: Date.now() + cacheTTL })
    return json as T
  }
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Format a price in its own currency. With no currency, show the bare number rather than guess one. */
function formatPrice(amount: number | undefined, currency?: string | null): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) return ""
  if (!currency) return amount.toFixed(2)
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function sortedOffers(offers: ShopsavvyOffer[]): ShopsavvyOffer[] {
  return offers
    .filter((o) => typeof o.price === "number" && o.price > 0)
    .sort((a, b) => (a.price as number) - (b.price as number))
}

function availabilityLabel(availability?: string): string {
  if (availability === "in") return "Yes"
  if (availability === "out") return "No"
  return "—"
}

function retailerLink(offer: ShopsavvyOffer): string {
  const name = escapeHtml(offer.retailer)
  return offer.URL ? `<a href="${escapeHtml(offer.URL)}" rel="noopener nofollow">${name}</a>` : name
}

function renderProductCard(product: ShopsavvyProduct, offers: ShopsavvyOffer[]): string {
  const cheapest = offers[0]
  const image = product.images?.[0]
  const offersHtml = offers
    .map((o) => `<li><span>${retailerLink(o)}</span><span>${escapeHtml(formatPrice(o.price, o.currency))}</span></li>`)
    .join("")
  return `<div class="shopsavvy-card">${
    image ? `<img class="shopsavvy-card__image" src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}" loading="lazy" />` : ""
  }<div class="shopsavvy-card__body"><h3 class="shopsavvy-card__name">${escapeHtml(product.title)}</h3>${
    cheapest
      ? `<p class="shopsavvy-card__price">${escapeHtml(formatPrice(cheapest.price, cheapest.currency))} <span class="shopsavvy-card__retailer">at ${escapeHtml(cheapest.retailer)}</span></p>`
      : ""
  }<ul class="shopsavvy-card__offers">${offersHtml}</ul><a class="shopsavvy-card__cta" href="https://shopsavvy.com" rel="noopener">Compare on ShopSavvy</a></div></div>`
}

function renderProductInline(product: ShopsavvyProduct, offers: ShopsavvyOffer[]): string {
  const cheapest = offers[0]
  return `<span class="shopsavvy-inline"><strong>${escapeHtml(product.title)}</strong>${
    cheapest
      ? ` — <span class="shopsavvy-inline__price">${escapeHtml(formatPrice(cheapest.price, cheapest.currency))} at ${escapeHtml(cheapest.retailer)}</span>`
      : ""
  }</span>`
}

function renderProductTable(product: ShopsavvyProduct, offers: ShopsavvyOffer[]): string {
  const rows = offers
    .map(
      (o) =>
        `<tr><td>${retailerLink(o)}</td><td>${escapeHtml(formatPrice(o.price, o.currency))}</td><td>${escapeHtml(o.condition || "new")}</td><td>${availabilityLabel(o.availability)}</td></tr>`,
    )
    .join("")
  return `<div class="shopsavvy-table-wrap"><p class="shopsavvy-table__title">${escapeHtml(product.title)}</p><table class="shopsavvy-table"><thead><tr><th>Retailer</th><th>Price</th><th>Condition</th><th>In stock</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

function renderDeals(deals: ShopsavvyDeal[]): string {
  const items = deals
    .map((d) => {
      const img = d.image?.url ? `<img src="${escapeHtml(d.image.url)}" alt="${escapeHtml(d.title)}" loading="lazy" />` : ""
      const original =
        d.pricing?.original && d.pricing.original > d.pricing.current
          ? `<span class="shopsavvy-deal__msrp">${escapeHtml(formatPrice(d.pricing.original, d.pricing.currency))}</span>`
          : ""
      return `<a class="shopsavvy-deal" href="${escapeHtml(d.url || "https://shopsavvy.com")}" rel="noopener">${img}<div class="shopsavvy-deal__body"><p class="shopsavvy-deal__name">${escapeHtml(d.title)}</p><p class="shopsavvy-deal__price"><span class="shopsavvy-deal__sale">${escapeHtml(formatPrice(d.pricing?.current, d.pricing?.currency))}</span>${original}</p><p class="shopsavvy-deal__retailer">${escapeHtml(d.retailer?.name)}</p></div></a>`
    })
    .join("")
  return `<div class="shopsavvy-deals-grid">${items}</div>`
}

/**
 * Lowest observed price per calendar day across every retailer's history, oldest
 * first. The Data API returns one history array per offer (retailer).
 */
function dailyLowestPrices(offers: NonNullable<HistoryResponse["data"]>): Array<{ day: string; price: number; currency?: string | null }> {
  const byDay = new Map<string, { price: number; currency?: string | null }>()
  for (const offer of offers) {
    for (const point of offer.history ?? []) {
      if (typeof point.price !== "number" || point.price <= 0 || !point.timestamp) continue
      const day = point.timestamp.slice(0, 10)
      const current = byDay.get(day)
      if (!current || point.price < current.price) {
        byDay.set(day, { price: point.price, currency: point.currency ?? offer.currency })
      }
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v }))
}

function renderSparkline(series: Array<{ price: number; currency?: string | null }>, width = 240, height = 60): string {
  if (series.length < 2) return ""
  const prices = series.map((p) => p.price)
  const currency = series[series.length - 1].currency
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
  return `<svg class="shopsavvy-sparkline" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="Price history sparkline" preserveAspectRatio="none" viewBox="0 0 ${width} ${height}"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${coords}" /></svg><span class="shopsavvy-sparkline__range">${escapeHtml(formatPrice(min, currency))} – ${escapeHtml(formatPrice(max, currency))}</span>`
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default function shopsavvy(eleventyConfig: any, options: ShopsavvyPluginOptions = {}): void {
  const apiKey = options.apiKey || process.env.SHOPSAVVY_API_KEY || ""
  const get = apiKey ? createClient({ apiKey, baseUrl: options.baseUrl, cacheTTL: options.cacheTTL }) : null

  if (!get) {
    console.warn("[eleventy-plugin-shopsavvy] No API key: set options.apiKey or SHOPSAVVY_API_KEY. ShopSavvy shortcodes will render nothing.")
  }

  // A failed lookup must not take the whole site build down, but it must be visible:
  // it is logged to the build output and left as an HTML comment where the embed goes.
  function failure(what: string, err: unknown): string {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[eleventy-plugin-shopsavvy] ${what}: ${message}`)
    return `<!-- shopsavvy: ${escapeHtml(what)}: ${escapeHtml(message)} -->`
  }

  function warnNoKey(): string {
    return "<!-- shopsavvy: missing API key (set options.apiKey or SHOPSAVVY_API_KEY) -->"
  }

  /** The product and its offers, cheapest first. One API call: /products/offers includes the product fields. */
  async function productWithOffers(identifier: string, retailer?: string): Promise<{ product: ShopsavvyProduct; offers: ShopsavvyOffer[] }> {
    const resp = await get!<OffersResponse>("/products/offers", { ids: identifier, retailer })
    const product = resp.data?.[0]
    if (!product) throw new Error(`no product found for "${identifier}"`)
    return { product, offers: sortedOffers(product.offers ?? []) }
  }

  eleventyConfig.addAsyncShortcode(
    "shopsavvyProduct",
    async (identifier: string, layout: "card" | "inline" | "table" = "card", retailer?: string, limit = 5) => {
      if (!get) return warnNoKey()
      try {
        const { product, offers } = await productWithOffers(identifier, retailer || undefined)
        const shown = offers.slice(0, limit)
        if (layout === "inline") return renderProductInline(product, shown)
        if (layout === "table") return renderProductTable(product, shown)
        return renderProductCard(product, shown)
      } catch (err) {
        return failure(`product ${identifier}`, err)
      }
    },
  )

  eleventyConfig.addAsyncShortcode(
    "shopsavvyDeals",
    async (category?: string, limit = 10, sort: DealSort = "hot", grade?: string) => {
      if (!get) return warnNoKey()
      try {
        if (!DEAL_SORTS.includes(sort)) {
          throw new Error(`sort must be one of: ${DEAL_SORTS.join(", ")}`)
        }
        const resp = await get<DealsResponse>("/deals", { limit, sort, category: category || undefined, grade: grade || undefined })
        return renderDeals(resp.deals ?? [])
      } catch (err) {
        return failure("deals", err)
      }
    },
  )

  eleventyConfig.addAsyncShortcode("shopsavvyPriceHistory", async (identifier: string, days = 90, width = 240, height = 60) => {
    if (!get) return warnNoKey()
    try {
      // The API takes an explicit YYYY-MM-DD range; `end` must be today or earlier.
      const end = new Date()
      const start = new Date(end.getTime() - days * 86_400_000)
      const resp = await get<HistoryResponse>("/products/offers/history", { ids: identifier, start: isoDay(start), end: isoDay(end) })
      return renderSparkline(dailyLowestPrices(resp.data ?? []), width, height)
    } catch (err) {
      return failure(`price history ${identifier}`, err)
    }
  })

  eleventyConfig.addAsyncFilter("shopsavvyPrice", async (identifier: string) => {
    if (!get) return ""
    try {
      const { offers } = await productWithOffers(identifier)
      const cheapest = offers[0]
      return cheapest ? formatPrice(cheapest.price, cheapest.currency) : ""
    } catch (err) {
      failure(`price ${identifier}`, err)
      return ""
    }
  })

  eleventyConfig.addGlobalData("shopsavvyDeals", async () => {
    if (!get) return []
    try {
      const resp = await get<DealsResponse>("/deals", { limit: 50, sort: "hot" })
      return resp.deals ?? []
    } catch (err) {
      failure("global shopsavvyDeals", err)
      return []
    }
  })
}
