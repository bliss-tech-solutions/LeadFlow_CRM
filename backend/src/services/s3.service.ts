import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

function getS3Client() {
  if (
    !env.AWS_REGION ||
    !env.AWS_S3_BUCKET ||
    !env.AWS_ACCESS_KEY_ID ||
    !env.AWS_SECRET_ACCESS_KEY
  ) {
    throw new Error(
      "AWS S3 is not configured. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
    );
  }

  return new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

export async function createDocumentUploadUrl(
  key: string,
  contentType: string,
) {
  const client = getS3Client();

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: env.AWS_S3_PRESIGN_EXPIRES },
  );
}

export async function createDocumentDownloadUrl(key: string) {
  const client = getS3Client();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
    }),
    { expiresIn: env.AWS_S3_PRESIGN_EXPIRES },
  );
}

export async function deleteDocumentObject(key: string) {
  const client = getS3Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
    }),
  );
}
