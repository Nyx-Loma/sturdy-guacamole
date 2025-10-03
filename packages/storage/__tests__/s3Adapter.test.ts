import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { S3BlobAdapter } from "../src/adapters/s3";
import { NotFoundError, TimeoutError, TransientAdapterError } from "../src/errors";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class FakeS3Client {
    send = sendMock;
    destroy = vi.fn();
  }
  class FakeCommand {}
  return {
    S3Client: FakeS3Client,
    PutObjectCommand: FakeCommand,
    GetObjectCommand: FakeCommand,
    DeleteObjectCommand: FakeCommand,
    HeadBucketCommand: FakeCommand,
    ListObjectsV2Command: FakeCommand,
  };
});

async function* iterableStream(data: Buffer) {
  yield data;
}

function createAdapter() {
  const adapter = new S3BlobAdapter({
    bucket: "test-bucket",
    clientConfig: { region: "us-east-1" },
  });
  const circuitBreaker = {
    shouldAllow: vi.fn().mockReturnValue(true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  };
  Object.assign(adapter as unknown as { circuitBreaker: typeof circuitBreaker }, { circuitBreaker });
  return adapter as S3BlobAdapter & { circuitBreaker: typeof circuitBreaker };
}

beforeEach(() => {
  sendMock.mockReset();
});

describe("S3BlobAdapter", () => {
  it("performs head bucket on init", async () => {
    const adapter = createAdapter();
    const executeSpy = vi.spyOn(adapter as unknown as { execute: typeof adapter["execute"] }, "execute").mockImplementation(async (_op, fn) => {
      await fn();
    });

    await adapter.init();

    expect(executeSpy).toHaveBeenCalledWith("head_bucket", expect.any(Function));
  });

  it("writes objects and returns metadata", async () => {
    sendMock.mockResolvedValueOnce({ VersionId: "v1" });
    const adapter = createAdapter();

    const result = await adapter.write({ namespace: "ns", id: "blob" }, Buffer.from("data"), { contentType: "text/plain" });

    expect(result.metadata.versionId).toBe("v1");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("reads objects and extracts metadata", async () => {
    const body = Readable.from(iterableStream(Buffer.from("payload")));
    sendMock.mockResolvedValueOnce({ Body: body, Metadata: { checksum: "abc", checksumAlgorithm: "sha256" }, ContentType: "text/plain", LastModified: new Date("2024-01-01T00:00:00Z") });

    const adapter = createAdapter();
    const object = await adapter.read({ namespace: "ns", id: "blob" }, {});

    expect(object.payload.toString()).toBe("payload");
    expect(object.metadata.checksum).toBe("abc");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("maps NoSuchKey to NotFoundError", async () => {
    sendMock.mockRejectedValue({ name: "NoSuchKey" });
    const adapter = createAdapter();

    await expect(adapter.read({ namespace: "ns", id: "missing" }, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps timeout errors to TimeoutError", async () => {
    sendMock.mockRejectedValue({ name: "TimeoutError" });
    const adapter = createAdapter();

    await expect(adapter.read({ namespace: "ns", id: "slow" }, {})).rejects.toBeInstanceOf(TimeoutError);
  });

  it("maps throttling to TransientAdapterError", async () => {
    sendMock.mockRejectedValue({ $retryable: { throttling: true } });
    const adapter = createAdapter();

    await expect(adapter.read({ namespace: "ns", id: "throttle" }, {})).rejects.toBeInstanceOf(TransientAdapterError);
  });

  it("lists objects and returns cursor", async () => {
    sendMock.mockResolvedValueOnce({
      Contents: [{ Key: "ns/id1", ETag: '"etag"' }],
      NextContinuationToken: "cursor",
    });

    const adapter = createAdapter();
    const result = await adapter.list({ namespace: "ns" });

    expect(result.objects[0].id).toBe("id1");
    expect(result.nextCursor).toBe("cursor");
  });
});


