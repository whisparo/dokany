// open-next.config.js
module.exports = {
  default: {
    override: {
      wrapper: "cloudflare-node",   // ← Node.js runtime
      converter: "edge",            // ← Edge converter (يدعم RSC)
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  edgeExternals: ["node:crypto", "node:stream", "node:buffer"],
};