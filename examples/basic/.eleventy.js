const shopsavvy = require("eleventy-plugin-shopsavvy")

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(shopsavvy.default || shopsavvy, {
    apiKey: process.env.SHOPSAVVY_API_KEY,
  })
  return {
    dir: { input: ".", output: "_site" },
  }
}
