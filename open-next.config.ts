// open-next.config.js
const { defineCloudflareConfig } = require("@opennextjs/cloudflare");

module.exports = defineCloudflareConfig({
  default: {
    override: {
      wrapper: "cloudflare-node", // ← نرجع لـ node عشان RSC
      converter: "node",          // ← node بدل edge
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  edgeExternals: ["node:crypto", "node:stream", "node:buffer"],
});