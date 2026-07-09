import type { OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
  default: {
    override: {
      // ✅ أهم نقطة: استخدم cloudflare-node عشان يدعم الـ Node.js APIs المطلوبة
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      // ✅ مؤقتاً dummy، هتعدلهم لما تحتاج تخزين فعلي (Redis، KV، إلخ)
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  // ✅ استثناءات الـ Edge
  edgeExternals: ["node:crypto", "node:stream", "node:buffer"],
  // ✅ إعدادات الميدل وير
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  // ✅ خلينا نحدد مجلد الإخراج بشكل صريح (اختياري لكن مفيد)
  outputDirectory: ".open-next",
};

export default config;