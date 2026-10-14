import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LATEST_MIGRATION } from "../src/db/migrations";

describe("migrations", () => {
  it("readiness expects the newest migration file", () => {
    const files = readdirSync(resolve(import.meta.dirname, "../migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(LATEST_MIGRATION).toBe(files.at(-1)!.replace(/\.sql$/, ""));
  });
});
