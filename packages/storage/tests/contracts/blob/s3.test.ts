import { afterAll, afterEach, beforeAll, describe, it, expect } from "vitest";
import { S3BlobAdapter } from "../../../src/adapters/s3";
import { createTestStorageClient } from "../../support/inMemoryAdapters";

const bucket = process.env.S3_BUCKET;
const endpoint = process.env.S3_ENDPOINT;

const skip = !bucket;

describe.skipIf(skip)("S3 blob adapter contract", () => {
  const runPrefix = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adapter = new S3BlobAdapter({
    bucket: bucket!,
    clientConfig: endpoint
      ? {
          endpoint,
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
          },
        }
      : {},
  });

  const { client, context } = createTestStorageClient({ namespace: `s3-contract-${runPrefix}`, blobAdapter: adapter });

  beforeAll(async () => {
    await adapter.init();
  });

  afterEach(async () => {
    const list = await client.listBlobs({ namespace: context.namespace, prefix: "" }, context);
    for (const obj of list.objects) {
      await client.deleteBlob({ namespace: context.namespace, id: obj.id }, {}, context);
    }
  });

  afterAll(async () => {
    if (adapter.dispose) await adapter.dispose();
  });

  it("writes and reads blobs", async () => {
    const ref = { id: `obj-${Date.now()}`, namespace: context.namespace };
    const payload = Buffer.from("hello-s3");

    await client.writeBlob(ref, payload, { contentType: "text/plain" }, context);
    const result = await client.readBlob(ref, {}, context);

    expect(result.payload.toString()).toEqual(payload.toString());
  });
});


