import { randomUUID } from "node:crypto";
import { afterAll, beforeAll } from "vitest";
import type { StartedLocalStackContainer } from "@testcontainers/localstack";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedRedisContainer } from "@testcontainers/redis";
import { setIntegrationAvailability } from "./state";

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;
let localstack: StartedLocalStackContainer | undefined;

beforeAll(async () => {
  try {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    const { RedisContainer } = await import("@testcontainers/redis");
    const { LocalStackContainer } = await import("@testcontainers/localstack");
    const { S3Client, CreateBucketCommand } = await import("@aws-sdk/client-s3");

    postgres = await new PostgreSqlContainer()
      .withDatabase("storage_test")
      .withUsername("storage")
      .withPassword("storage")
      .start();

    redis = await new RedisContainer().start();

    localstack = await new LocalStackContainer().withServices("s3").start();

    const bucketName = `storage-test-${randomUUID().slice(0, 8)}`;
    const endpoint = localstack.getEndpointOverride("s3");
    const region = localstack.getRegion();
    const credentials = {
      accessKeyId: localstack.getAccessKeyId(),
      secretAccessKey: localstack.getSecretAccessKey(),
    } as const;

    const s3Client = new S3Client({
      endpoint,
      forcePathStyle: true,
      region,
      credentials,
    });
    await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));

    process.env.STORAGE_TEST_POSTGRES_URL = postgres.getConnectionUri();
    process.env.STORAGE_TEST_REDIS_URL = redis.getConnectionUrl();
    process.env.STORAGE_TEST_S3_ENDPOINT = endpoint;
    process.env.STORAGE_TEST_S3_REGION = region;
    process.env.STORAGE_TEST_S3_BUCKET = bucketName;
    process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
    process.env.AWS_REGION = region;

    setIntegrationAvailability({ ready: true });
  } catch (error) {
    setIntegrationAvailability({ ready: false, reason: "container-runtime-unavailable", error });
    postgres = undefined;
    redis = undefined;
    localstack = undefined;
  }
});

afterAll(async () => {
  await Promise.all([
    postgres?.stop().catch(() => undefined),
    redis?.stop().catch(() => undefined),
    localstack?.stop().catch(() => undefined),
  ]);
});

