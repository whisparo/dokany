import type { OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
  default: {
    runtime: "edge",
  },
  middleware: {
    runtime: "edge",
  }
};

export default config;