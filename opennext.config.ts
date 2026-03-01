import type { OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
    default: {
        // Override the default image optimization handler to prevent it from pulling
        // in resvg.wasm / sharp which cause deployment issues on Cloudflare Workers
        // (especially on Windows). Since we have unoptimized: true in next.config.ts
        // this handler won't be heavily used anyway.
        override: {
            wrapper: "cloudflare-node",
            converter: "edge",
        },
    },
    // We can also explicitly tell opennext to bundle without certain node exclusions if needed
    middleware: {
        external: true,
    },
    buildCommand: "npm run build",
};

export default config;
