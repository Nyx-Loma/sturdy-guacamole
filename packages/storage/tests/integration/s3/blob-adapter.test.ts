import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { S3BlobAdapter } from "../../../src/adapters/s3";
import type { StorageObjectReference } from "../../../src/types";
import { getIntegrationAvailability } from "../state";

function s3Config() {
  const endpoint = process.env.STORAGE_TEST_S3_ENDPOINT;
  const region = process.env.STORAGE_TEST_S3_REGION;
  const bucket = process.env.STORAGE_TEST_S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 test environment variables not set");
  }
  return {
    clientConfig: {
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey } as const,
      forcePathStyle: true,
    },
    bucket,
  };
}

const availability = getIntegrationAvailability();

describe.skipIf(!(availability?.ready ?? false))("S3BlobAdapter integration", () => {
  it("writes, reads and deletes blob with strong consistency", async () => {
    const adapter = new S3BlobAdapter(s3Config());
    await adapter.init();

    const namespace = "integration";
    const ref: StorageObjectReference = { namespace, id: randomUUID() };
    const payload = Buffer.from("hello-world");

    const written = await adapter.write(ref, payload, { contentType: "text/plain" }, { namespace, tenantId: "tenant" });
    expect(written.metadata.size).toEqual(payload.byteLength);
    expect(written.metadata.checksum).toHaveLength(64);
    expect(written.metadata.versionId).toBeTruthy();

    const read = await adapter.read(ref, { consistency: "strong" }, { namespace, tenantId: "tenant" });
    expect(read.payload.equals(payload)).toBe(true);
    expect(read.metadata.versionId).toEqual(written.metadata.versionId);
    expect(read.metadata.contentType).toEqual("text/plain");

    await adapter.delete(ref, {}, { namespace, tenantId: "tenant" });
    await expect(adapter.read(ref, { consistency: "strong" }, { namespace, tenantId: "tenant" })).rejects.toThrow(/NotFoundError/);

    await adapter.dispose();
  });
});

