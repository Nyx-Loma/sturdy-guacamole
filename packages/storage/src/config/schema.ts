import { z } from "zod";

const AdapterDefinitionSchema = z
  .object({
    namespaces: z.union([z.string(), z.array(z.string())]),
    adapter: z.any().optional(),
    factory: z.any().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((value) => value.adapter || value.factory, {
    message: "Adapter definition must include adapter or factory",
  });

const StorageConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    defaultNamespace: z.string().min(1).optional(),
    blobAdapters: z.array(AdapterDefinitionSchema).optional(),
    recordAdapters: z.array(AdapterDefinitionSchema).optional(),
    streamAdapters: z.array(AdapterDefinitionSchema).optional(),
    cache: z
      .object({
        enabled: z.boolean().default(true),
        maxItems: z.number().int().positive().optional(),
        maxBytes: z.number().int().positive().optional(),
        ttlSeconds: z.number().int().nonnegative().optional(),
        provider: z.string().optional(),
        providerConfig: z.record(z.unknown()).optional(),
      })
      .default({ enabled: true }),
    observability: z
      .object({
        metrics: z.boolean().optional(),
        traces: z.boolean().optional(),
        logs: z.boolean().optional(),
        emitter: z.string().optional(),
      })
      .default({}),
    consistency: z
      .object({
        stalenessBudgetMs: z.number().int().nonnegative().default(100),
      })
      .default({ stalenessBudgetMs: 100 }),
    featureFlags: z.record(z.boolean()).optional(),
  })
  .passthrough();

export type ParsedStorageConfig = z.infer<typeof StorageConfigSchema>;

export function parseConfig(input: unknown): ParsedStorageConfig {
  const cfg = StorageConfigSchema.parse(input);
  if (cfg.schemaVersion !== 1) {
    throw new Error("CONFIG_SCHEMA_MISMATCH");
  }
  return cfg;
}

