# eleventy-plugin-shopsavvy

[Eleventy](https://www.11ty.dev/) plugin that adds shortcodes, a global data file, and a Liquid/Nunjucks filter for embedding **product cards, deal feeds, and price history** powered by the [ShopSavvy Data API](https://shopsavvy.com/data) — all resolved at build time.

[Documentation](https://shopsavvy.com/integrations/eleventy) · [Get an API key](https://shopsavvy.com/data) · [Other integrations](https://shopsavvy.com/integrations)

## Install

```bash
npm install eleventy-plugin-shopsavvy
```

Ships as dual ESM + CJS so it works with both 11ty 2.x (CJS) and 3.x (ESM). Requires Node 18+ (global `fetch`).

## Configure

```js
// eleventy.config.mjs (ESM, Eleventy 3)
import shopsavvy from "eleventy-plugin-shopsavvy"

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(shopsavvy, {
    apiKey: process.env.SHOPSAVVY_API_KEY, // optional: SHOPSAVVY_API_KEY is read by default
    cacheTTL: 60_000, // optional: reuse identical API responses for this long during a build
  })
}
```

```js
// .eleventy.js (CommonJS, Eleventy 2 or 3)
const shopsavvy = require("eleventy-plugin-shopsavvy")

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(shopsavvy)
}
```

If a lookup fails (unknown product, missing key, API error), the build keeps going: the error is logged to the build output and left as an HTML comment where the embed would have been.

## Shortcodes

### `{% shopsavvyProduct %}`

```liquid
{% shopsavvyProduct "012345678905" %}
{% shopsavvyProduct "B0DGHYDZSB", "inline" %}
{% shopsavvyProduct "012345678905", "table", "amazon.com", 10 %}
```

Args: `identifier, layout="card"|"inline"|"table", retailer?, limit=5`. `identifier` is a barcode/UPC/EAN/ISBN, ASIN, product URL, or model number; `retailer` is a domain (e.g. `amazon.com`). Offers are listed cheapest first.

### `{% shopsavvyDeals %}`

```liquid
{% shopsavvyDeals "electronics", 8, "hot", "A" %}
```

Args: `category?, limit=10, sort="hot"|"new"|"top-hour"|"top-day"|"top-week", grade?`.

### `{% shopsavvyPriceHistory %}`

```liquid
{% shopsavvyPriceHistory "012345678905", 180 %}
```

Args: `identifier, days=90, width=240, height=60`. Renders an inline SVG sparkline of the lowest price per day across retailers.

## Filter

```liquid
<p>The current best price is {{ "012345678905" | shopsavvyPrice }}.</p>
```

## Global data

`shopsavvyDeals` holds the 50 hottest deals (fetched once per build). Each deal has `title`, `url`, `pricing.current`, `pricing.original`, `pricing.currency`, `retailer.name`, `image.url`, and `grade`.

```njk
{# Nunjucks #}
{% for deal in shopsavvyDeals.slice(0, 5) %}
  <li>{{ deal.title }} — ${{ deal.pricing.current }} at {{ deal.retailer.name }}</li>
{% endfor %}
```

```liquid
{% comment %} Liquid {% endcomment %}
{% for deal in shopsavvyDeals limit: 5 %}
  <li>{{ deal.title }} — ${{ deal.pricing.current }} at {{ deal.retailer.name }}</li>
{% endfor %}
```

## Run the example

```bash
bun install && bun run build
cd examples/basic && SHOPSAVVY_API_KEY=ss_live_… npx @11ty/eleventy
```

## Test

```bash
./test.sh
```

## License

MIT — see [LICENSE](./LICENSE).
