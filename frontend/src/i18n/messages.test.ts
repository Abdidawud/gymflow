import { describe, expect, it } from "vitest";
import { am } from "./messages/am";
import { en } from "./messages/en";
import { getTranslator } from "./translator";

type Tree = { readonly [key: string]: string | Tree };

/** Flattens a catalog to "path" → message (plural forms as "path.one" / "path.other"). */
function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const tokens = (message: string) =>
  [...message.matchAll(/\{\w+\}|<\/?\w+>/g)].map((match) => match[0]).sort((a, b) => a.localeCompare(b));

const english = flatten(en as unknown as Tree);
const amharic = flatten(am as unknown as Tree);

describe("message catalogs", () => {
  it("translate every English message into Amharic", () => {
    expect([...amharic.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, message] of amharic) expect(message.trim(), key).not.toBe("");
  });

  it("keep the same placeholders and rich-text tags in both languages", () => {
    for (const [key, message] of english) {
      expect(tokens(amharic.get(key) ?? ""), key).toEqual(tokens(message));
    }
  });
});

describe("translator", () => {
  const amT = getTranslator("am");
  const enT = getTranslator("en");

  it("interpolates values and picks plural forms", () => {
    expect(enT.t("common.days", { count: 1 })).toBe("1 day");
    expect(enT.t("common.days", { count: 30 })).toBe("30 days");
    expect(amT.t("common.days", { count: 30 })).toBe("30 ቀናት");
    expect(enT.t("plans.editPlan", { name: "Monthly" })).toBe("Edit Monthly");
    expect(enT.t("common.validation.maxLength", { max: 1000 })).toBe("Use 1,000 characters or fewer.");
  });

  it("formats money, dates and plans consistently", () => {
    expect(enT.f.money("1500.00")).toBe("1,500.00 ETB");
    expect(amT.f.money("1500.00")).toBe("1,500.00 ብር");
    expect(enT.f.date("2026-10-07")).toBe("Oct 07, 2026");
    expect(amT.f.date("2026-10-07")).toMatch(/^\S+ 07, 2026$/);
    expect(enT.f.plan("Monthly", 30)).toBe("Monthly — 30 days");
    expect(enT.f.compact(12_500)).toBe("12.5k");
  });
});
