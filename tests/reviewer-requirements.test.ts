import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CaedralApi } from "../credentials/CaedralApi.credentials";
import { Caedral } from "../nodes/Caedral/Caedral.node";
import { CaedralChatModel } from "../nodes/CaedralChatModel/CaedralChatModel.node";
import { CaedralEmbeddings } from "../nodes/CaedralEmbeddings/CaedralEmbeddings.node";
import { CaedralTrigger } from "../nodes/CaedralTrigger/CaedralTrigger.node";
import pkg from "../package.json";

const EXPRESSION =
  'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>';

const OBSOLETE_IDS = [
  "caedral-base",
  "caedral-titan",
  "caedral-olympus",
  "caedral-primordial",
];

function collectDefaults(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectDefaults(entry, found);
    return found;
  }
  if (value && typeof value === "object") {
    const record = value as { default?: unknown; options?: unknown };
    if ("default" in record) found.push(record.default);
    if (record.options) collectDefaults(record.options, found);
  }
  return found;
}

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walkFiles(full, files);
    } else if (/\.(ts|js|json)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("n8n reviewer requirements", () => {
  it("keeps the official dynamic-options expression description as a string literal", () => {
    const nodes = [
      new Caedral(),
      new CaedralChatModel(),
      new CaedralEmbeddings(),
    ];
    for (const node of nodes) {
      const descriptions = node.description.properties
        .filter((property) => property.type === "options" && property.typeOptions?.loadOptionsMethod)
        .map((property) => property.description);
      expect(descriptions.length).toBeGreaterThan(0);
      expect(descriptions.every((description) => description === EXPRESSION)).toBe(true);
    }
  });

  it("uses a singular Model resource display name", () => {
    const resource = new Caedral().description.properties.find((property) => property.name === "resource");
    const optionNames = (resource?.options ?? []) as Array<{ name: string; value: string }>;
    expect(optionNames.some((option) => option.name === "Model" && option.value === "models")).toBe(true);
    expect(optionNames.some((option) => option.name === "Video" && option.value === "video")).toBe(true);
  });

  it("does not register a standalone reranker node", () => {
    expect(pkg.n8n.nodes.some((entry) => entry.toLowerCase().includes("rerank"))).toBe(false);
    expect(pkg.n8n.nodes).toHaveLength(4);
  });

  it("does not use obsolete branded IDs as production defaults", () => {
    const defaults = [
      ...collectDefaults(new Caedral().description.properties),
      ...collectDefaults(new CaedralChatModel().description.properties),
      ...collectDefaults(new CaedralEmbeddings().description.properties),
    ].map((value) => String(value));
    for (const id of OBSOLETE_IDS) {
      expect(defaults).not.toContain(id);
    }
  });

  it("keeps node and credential icons colocated without parent-path traversal", () => {
    const nodes = [
      new Caedral(),
      new CaedralChatModel(),
      new CaedralEmbeddings(),
      new CaedralTrigger(),
    ];
    for (const node of nodes) {
      const icon = node.description.icon as { light?: string; dark?: string };
      expect(icon.light).toBe("file:caedral.svg");
      expect(icon.dark).toBe("file:caedral.dark.svg");
      expect(icon.light).not.toContain("..");
      expect(icon.dark).not.toContain("..");
    }
    const credential = new CaedralApi();
    expect(credential.icon.light).toBe("file:caedral.svg");
    expect(credential.icon.dark).toBe("file:caedral.dark.svg");
    expect(credential.test.request.timeout).toBe(15_000);
  });

  it("keeps the trigger from advertising itself as an AI tool", () => {
    expect(new CaedralTrigger().description.usableAsTool).toBe(false);
  });
});

describe("no obsolete production model IDs in source", () => {
  it("does not expose branded chat tiers in nodes, credentials, or shared constants", () => {
    const roots = [
      join(__dirname, "../nodes"),
      join(__dirname, "../credentials"),
      join(__dirname, "../shared"),
    ];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walkFiles(root)) {
        const text = readFileSync(file, "utf8");
        for (const id of OBSOLETE_IDS) {
          if (text.includes(id)) hits.push(`${file}: ${id}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
