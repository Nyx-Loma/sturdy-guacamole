import { describe, it, expect } from "vitest";
import { parseConfig } from "../src/config/schema";

describe("config schema", () => {
  it("parses minimal valid config with defaults", () => {
    const cfg = parseConfig({ schemaVersion: 1 });
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.cache?.enabled).toBe(true);
    expect(cfg.consistency?.stalenessBudgetMs).toBe(100);
  });

  it("throws on schema version mismatch", () => {
    expect(() => parseConfig({ schemaVersion: 2 })).toThrow();
  });

  it("accepts adapter definitions via adapter or factory", () => {
    const cfg = parseConfig({
      schemaVersion: 1,
      blobAdapters: [
        { namespaces: "ns1", adapter: { kind: "blob", init() {}, async write() { throw new Error("noop"); }, async read() { throw new Error("noop"); }, async delete() {}, async list() { return { objects: [] }; }, async dispose() {}, async healthCheck() { return { healthy: true }; } } as any },
        { namespaces: ["ns2"], factory: () => ({ kind: "blob" }) as any },
      ],
    });
    expect(cfg.blobAdapters?.length).toBe(2);
  });
});


