import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readEnv } from "../config/env";

function client(region: string) {
  return new S3Client({ region });
}

export async function putPngPublicPrivate(args: {
  key: string;
  body: Buffer;
  bucket?: string;
}): Promise<void> {
  const env = readEnv();
  const bucket = args.bucket ?? env.s3BucketAssets;
  if (!bucket) throw new Error("S3_BUCKET_ASSETS is not configured");
  const s3 = client(env.region);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: args.key,
      Body: args.body,
      ContentType: "image/png",
      ServerSideEncryption: "AES256",
    }),
  );
}

export async function presignGetPng(args: {
  key: string;
  /** default 86400 */
  ttlSeconds?: number;
  bucket?: string;
}): Promise<string> {
  const env = readEnv();
  const bucket = args.bucket ?? env.s3BucketAssets;
  if (!bucket) throw new Error("S3_BUCKET_ASSETS is not configured");
  const s3 = client(env.region);
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: args.key });
  return getSignedUrl(s3, cmd, { expiresIn: args.ttlSeconds ?? 86400 });
}

export async function deleteQrObject(key: string, bucket?: string): Promise<void> {
  const env = readEnv();
  const b = bucket ?? env.s3BucketAssets;
  if (!b) throw new Error("S3_BUCKET_ASSETS is not configured");
  await client(env.region).send(new DeleteObjectCommand({ Bucket: b, Key: key }));
}

export async function presignGetObject(args: {
  key: string;
  ttlSeconds?: number;
  bucket?: string;
  responseContentType?: string;
}): Promise<string> {
  const env = readEnv();
  const bucket = args.bucket ?? env.s3BucketAssets;
  if (!bucket) throw new Error("S3_BUCKET_ASSETS is not configured");
  const s3 = client(env.region);
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: args.key,
    ResponseContentType: args.responseContentType,
  });
  return getSignedUrl(s3, cmd, { expiresIn: args.ttlSeconds ?? 3600 });
}

export async function presignPutObject(args: {
  key: string;
  contentType: string;
  ttlSeconds?: number;
  bucket?: string;
}): Promise<string> {
  const env = readEnv();
  const bucket = args.bucket ?? env.s3BucketAssets;
  if (!bucket) throw new Error("S3_BUCKET_ASSETS is not configured");
  const s3 = client(env.region);
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: args.key,
    ContentType: args.contentType,
    ServerSideEncryption: "AES256",
  });
  return getSignedUrl(s3, cmd, { expiresIn: args.ttlSeconds ?? 3600 });
}

export async function putObjectBuffer(args: {
  key: string;
  body: Buffer;
  contentType: string;
  bucket?: string;
}): Promise<void> {
  const env = readEnv();
  const bucket = args.bucket ?? env.s3BucketAssets;
  if (!bucket) throw new Error("S3_BUCKET_ASSETS is not configured");
  await client(env.region).send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      ServerSideEncryption: "AES256",
    }),
  );
}
