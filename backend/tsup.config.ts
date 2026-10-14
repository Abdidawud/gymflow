import { defineConfig } from "tsup";

/** Bundles the API and CLI (including @gymflow/shared) into dist/ for production. */
export default defineConfig({
  entry: { server: "src/server.ts", cli: "src/cli.ts" },
  format: "esm",
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ["@gymflow/shared"],
  // Native or optional modules stay external and are installed with npm ci.
  external: ["sharp", "@node-rs/argon2", "pg-native"],
});
