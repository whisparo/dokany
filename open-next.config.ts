// open-next.config.ts
export default {
  default: {
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  edgeExternals: ["node:crypto", "node:stream", "node:buffer"],
  // ✅ middleware اتحذف نهائياً دلوقتي
};