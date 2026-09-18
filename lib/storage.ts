import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Cloud object storage (AWS S3) under a single bucket, key-prefixed by
// subdir (e.g. "certificate-logos/<uuid>-name.png"). storagePath is the one
// identifier every caller deals in, regardless of subdir — it doubles as
// the S3 object key — so every call site across the app just passes it
// straight through, same as the local-disk version this replaces.
//
// S3_ENDPOINT is optional and only needed for an S3-compatible provider
// other than AWS (e.g. Cloudflare R2, MinIO for local testing) — leave it
// unset for real AWS S3.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} (see .env.example)`);
  }
  return value;
}

// Built lazily (not at module load) so importing this file never requires
// AWS env vars to be present — only actually calling one of the functions
// below does. Matters for `next build`, which imports every route module.
let cachedClient: S3Client | undefined;
function getClient(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: process.env.AWS_REGION || "ap-south-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined, // falls back to the default AWS credential chain (IAM role, etc.)
    });
  }
  return cachedClient;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  // The AWS SDK v3 Node runtime returns a Node Readable for Body.
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Uploads a file under subdir/ and returns its storagePath (e.g. "subdir/<uuid>-name.ext") plus the generated file name. */
export async function saveUploadedFile(subdir: string, originalName: string, bytes: Buffer): Promise<{ storagePath: string; fileName: string }> {
  const fileName = `${randomUUID()}-${safeFileName(originalName)}`;
  const storagePath = `${subdir}/${fileName}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: requireEnv("AWS_S3_BUCKET"),
      Key: storagePath,
      Body: bytes,
    })
  );

  return { storagePath, fileName };
}

export async function readUploadedFile(storagePath: string): Promise<Buffer> {
  const result = await getClient().send(
    new GetObjectCommand({ Bucket: requireEnv("AWS_S3_BUCKET"), Key: storagePath })
  );
  return streamToBuffer(result.Body);
}

export async function deleteUploadedFile(storagePath: string): Promise<void> {
  await getClient()
    .send(new DeleteObjectCommand({ Bucket: requireEnv("AWS_S3_BUCKET"), Key: storagePath }))
    .catch(() => {});
}
