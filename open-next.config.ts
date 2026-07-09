// open-next.config.ts

export default {
  default: {
    override: {
      wrapper: "cloudflare-edge", // أو cloudflare-node
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  edgeExternals: ["node:crypto", "node:stream", "node:buffer"],
  middleware: {
    external: true, // ✅ لازم تكون true عشان يشتغل مع Pages
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
};