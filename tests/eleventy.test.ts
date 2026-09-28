import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { createRequire } from "node:module"
import { join } from "node:path"
// @ts-ignore -- Eleventy ships without type declarations
import Eleventy from "@11ty/eleventy"
import pluginEsm from "../dist/index.mjs"

// Builds the real example site (examples/basic/index.njk) with real Eleventy and the
// BUILT plugin, against a local HTTP server standing in for api.shopsavvy.com. Asserts
// the requests the Data API receives and the HTML the shortcodes/filter/global data render.

const require = createRequire(import.meta.url)
const pluginCjs = require("../dist/index.js")

type Seen = { path: string; params: Record<string, string>; auth: string | null }
const seen: Seen[] = []
let api: ReturnType<typeof Bun.serve>
const apiKey = "ss_test_eleventy123"

const product = {
  title: "Sony WH-1000XM5 <Wireless>",
  shopsavvy: "abc123",
  images: ["https://example.com/xm5.jpg"],
  offers: [
    { id: "o2", retailer: "Best Buy", price: 299.99, currency: "USD", availability: "out", URL: "https://bestbuy.com/xm5" },
    { id: "o1", retailer: "Amazon", price: 279.99, currency: "USD", availability: "in", URL: "https://amazon.com/dp/B09XS7JWHH", condition: "new" },
  ],
}

beforeAll(() => {
  api = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      const params = Object.fromEntries(url.searchParams)
      seen.push({ path: url.pathname, params, auth: req.headers.get("authorization") })
      if (url.pathname === "/v1/products/offers") return Response.json({ success: true, data: [product] })
      if (url.pathname === "/v1/products/offers/history") {
        if (!params.start || !params.end) return Response.json({ success: false, error: "start/end required" }, { status: 400 })
        return Response.json({
          success: true,
          // The real shape: one entry PER PRODUCT, each offer carrying its own history,
          // newest first. `currency` is null on an archived point with none recorded
          // (the offer's currency applies), and eBay listings carry no history.
          data: [{
            title: "Sony WH-1000XM5",
            shopsavvy: "abc123",
            category: null,
            offers: [
              { id: "o1", retailer: "Amazon", currency: "USD", price: 299.99, seller: null, history: [
                { timestamp: "2026-01-02T10:00:00Z", price: 299.99, currency: "USD", availability: "in" },
                { timestamp: "2026-01-01T10:00:00Z", price: 349.99, currency: null },
              ] },
              { id: "o2", retailer: "Best Buy", currency: "USD", price: 279.99, seller: null, history: [
                { timestamp: "2026-01-03T12:00:00Z", price: 279.99, currency: "USD", availability: "in" },
                { timestamp: "2026-01-02T12:00:00Z", price: 289.99, currency: "USD", availability: "out" },
              ] },
              { id: "o3", retailer: "eBay", currency: "USD", price: 210, seller: "audio_reseller", condition: "used", history: [] },
            ],
          }],
        })
      }
      if (url.pathname === "/v1/deals") {
        return Response.json({
          success: true,
          deals: [{
            path: "/deals/xm5", title: "XM5 deal", url: "https://shopsavvy.com/deals/xm5",
            pricing: { current: 249.99, original: 399.99, currency: "USD" },
            retailer: { name: "Amazon" }, image: { url: "https://example.com/deal.jpg" },
            grade: { letter: "A", value: 95 }, votes: { upvotes: 1, downvotes: 0, score: 1 }, comment_count: 0, created_at: "2026-01-01T00:00:00Z",
          }],
          pagination: { total: 1, has_more: false, limit: 50, offset: 0 },
        })
      }
      return Response.json({ success: false, error: "not found" }, { status: 404 })
    },
  })
})

afterAll(() => api.stop(true))

async function buildExample(plugin: unknown) {
  seen.length = 0
  const elev = new Eleventy(join(import.meta.dir, "../examples/basic/index.njk"), join(import.meta.dir, "../examples/basic/_site"), {
    quietMode: true,
    configPath: false,
    config(eleventyConfig: any) {
      eleventyConfig.addPlugin(plugin, { apiKey, baseUrl: `http://127.0.0.1:${api.port}/v1` })
    },
  })
  const pages = await elev.toJSON()
  return pages[0].content as string
}

describe("eleventy-plugin-shopsavvy in a real Eleventy build", () => {
  test("require() returns the plugin function itself (Eleventy's CJS addPlugin contract)", () => {
    expect(typeof pluginCjs).toBe("function")
    expect(typeof pluginEsm).toBe("function")
  })

  test("renders the example page with the CJS build", async () => {
    const html = await buildExample(pluginCjs)
    expect(html).not.toContain("<!-- shopsavvy")

    // product card: title escaped, cheapest offer first, formatted in its currency
    expect(html).toContain('<h3 class="shopsavvy-card__name">Sony WH-1000XM5 &lt;Wireless&gt;</h3>')
    expect(html).toContain('<p class="shopsavvy-card__price">$279.99 <span class="shopsavvy-card__retailer">at Amazon</span></p>')
    expect(html).toContain('src="https://example.com/xm5.jpg"')

    // filter
    expect(html).toContain("The current best price is $279.99.")

    // table: availability "in"/"out" and offer links
    expect(html).toContain('<td><a href="https://amazon.com/dp/B09XS7JWHH" rel="noopener nofollow">Amazon</a></td><td>$279.99</td><td>new</td><td>Yes</td>')
    expect(html).toContain("<td>No</td>")

    // global data deals
    expect(html).toContain("<li>XM5 deal — $249.99 at Amazon</li>")

    // sparkline: daily lowest across retailers (349.99, 289.99, 279.99)
    expect(html).toContain('class="shopsavvy-sparkline"')
    expect(html).toContain("$279.99 – $349.99")
  })

  test("sends the Data API's real paths and params", async () => {
    await buildExample(pluginCjs)
    for (const s of seen) expect(s.auth).toBe(`Bearer ${apiKey}`)
    const offers = seen.filter((s) => s.path === "/v1/products/offers")
    expect(offers.length).toBeGreaterThan(0)
    for (const s of offers) expect(s.params.ids).toBe("012345678905")

    const history = seen.find((s) => s.path === "/v1/products/offers/history")!
    expect(history.params.ids).toBe("012345678905")
    expect(history.params.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(history.params.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect((Date.parse(history.params.end) - Date.parse(history.params.start)) / 86_400_000).toBe(180)

    const deals = seen.find((s) => s.path === "/v1/deals")!
    expect(deals.params).toEqual({ limit: "50", sort: "hot" })
  })

  test("renders the example page with the ESM build", async () => {
    const html = await buildExample(pluginEsm)
    expect(html).toContain("The current best price is $279.99.")
  })
})

describe("shopsavvyDeals shortcode", () => {
  test("renders deals with sale and original price, and rejects unsupported sorts", async () => {
    const elev = new Eleventy(join(import.meta.dir, "test-fixture-deals.njk"), join(import.meta.dir, "_site"), {
      quietMode: true,
      configPath: false,
      config(eleventyConfig: any) {
        eleventyConfig.addPlugin(pluginEsm, { apiKey, baseUrl: `http://127.0.0.1:${api.port}/v1` })
      },
    })
    seen.length = 0
    const [page] = await elev.toJSON()
    expect(page.content).toContain('<span class="shopsavvy-deal__sale">$249.99</span><span class="shopsavvy-deal__msrp">$399.99</span>')
    // (the other /v1/deals request in `seen` is the shopsavvyDeals global data: limit 50, sort hot)
    expect(seen.find((s) => s.path === "/v1/deals" && s.params.limit === "8")!.params).toEqual({ limit: "8", sort: "top-week", category: "electronics", grade: "A" })
    expect(page.content).toContain("<!-- shopsavvy: deals: sort must be one of: hot, new, top-hour, top-day, top-week -->")
  })
})
