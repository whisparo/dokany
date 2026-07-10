// open-next.config.js
const { defineCloudflareConfig } = require("@opennextjs/cloudflare");

module.exports = defineCloudflareConfig({
  default: {
    override: {
      wrapper: "cloudflare-edge", // ← غيرتها لـ edge
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  edgeExternals: ["node:crypto", "node:stream", "node:buffer"],
});