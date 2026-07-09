import type { OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
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
  // ✅ middleware من غير override عشان النوع يرضى
  middleware: {
    external: false, // خليه داخلي عشان البناء يعدي
  },
};

export default config;