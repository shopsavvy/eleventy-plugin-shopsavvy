# eleventy-plugin-shopsavvy

[Eleventy](https://www.11ty.dev/) plugin that adds shortcodes, a global data file, and a Liquid/Nunjucks filter for embedding **product cards, deal feeds, and price history** powered by the [ShopSavvy Data API](https://shopsavvy.com/data) — all resolved at build time.

[Documentation](https://shopsavvy.com/integrations/eleventy) · [Get an API key](https://shopsavvy.com/data) · [Other integrations](https://shopsavvy.com/integrations)

## Install

```bash
npm install eleventy-plugin-shopsavvy
```

Ships as dual ESM + CJS so it works with both 11ty 2.x (CJS) and 3.x (ESM).

## Configure

```js
// .eleventy.js (CJS) or eleventy.config.mjs (ESM)
const shopsavvy = require("eleventy-plugin-shopsavvy")

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(shopsavvy.default || shopsavvy, {
    apiKey: process.env.SHOPSAVVY_API_KEY,
    cacheTTL: 60_000, // optional
  })
}
```

## Shortcodes

### `{% shopsavvyProduct %}`

```liquid
{% shopsavvyProduct "012345678905" %}
{% shopsavvyProduct "B0DGHYDZSB", "inline" %}
{% shopsavvyProduct "012345678905", "table", "amazon", 10 %}
```

Args: `identifier, layout="card"|"inline"|"table", retailer?, limit=5`.

### `{% shopsavvyDeals %}`

```liquid
{% shopsavvyDeals "electronics", 8, "trending", "A" %}
```

Args: `category?, limit=10, sort="trending"|"price"|"discount", grade?`.

### `{% shopsavvyPriceHistory %}`

```liquid
{% shopsavvyPriceHistory "012345678905", 180 %}
```

Args: `identifier, days=90, width=240, height=60`. Renders an inline SVG sparkline.

## Filter

```liquid
<p>The current best price is {{ "012345678905" | shopsavvyPrice }}.</p>
```

## Global data

```liquid
{% for deal in shopsavvyDeals | slice(0, 5) %}
  <li>{{ deal.name }} — ${{ deal.price }} at {{ deal.retailer }}</li>
{% endfor %}
```

## Run the example

```bash
SHOPSAVVY_API_KEY=ss_live_… bun install && bun run build
cd examples/basic && npx @11ty/eleventy
```

## Test

```bash
./test.sh
```

## License

MIT — see [LICENSE](./LICENSE).
