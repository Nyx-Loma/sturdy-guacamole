import { describe, it, expect, vi, beforeEach } from "vitest";
import { createConsoleStorageLogger, isStorageLogger } from "../src/observability/logs";

describe("observability logs", () => {
  const original = { ...console } as unknown as Console;

  beforeEach(() => {
    console.debug = vi.fn();
    console.info = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  it("createConsoleStorageLogger emits structured calls", () => {
    const logger = createConsoleStorageLogger();
    const fields = { op: "get_blob", namespace: "ns", adapter: "blob", durationMs: 12, requestId: "r1" };
    logger.debug(fields);
    logger.info(fields);
    logger.warn(fields);
    logger.error(fields);

    expect(console.debug).toHaveBeenCalledWith("storage", expect.objectContaining(fields));
    expect(console.info).toHaveBeenCalledWith("storage", expect.objectContaining(fields));
    expect(console.warn).toHaveBeenCalledWith("storage", expect.objectContaining(fields));
    expect(console.error).toHaveBeenCalledWith("storage", expect.objectContaining(fields));
  });

  it("isStorageLogger type guard returns true for logger shape", () => {
    const logger = createConsoleStorageLogger();
    expect(isStorageLogger(logger)).toBe(true);
    expect(isStorageLogger({})).toBe(false);
  });
});



