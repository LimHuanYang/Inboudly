import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Cloudflare R2 storage. R2 is S3-compatible — we just point the SDK at the
 * R2 endpoint. Uploads happen via presigned URLs (browser-direct upload) to
 * avoid streaming through the API.
 */
@Injectable()
export class R2StorageService {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET ?? 'inboudly-media';
    this.publicUrl = process.env.R2_PUBLIC_URL ?? '';
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  async createPresignedUpload(key: string, contentType: string, expiresInSec = 600) {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: expiresInSec });
    return { uploadUrl: url, key, publicUrl: this.publicUrlFor(key) };
  }

  publicUrlFor(key: string) {
    return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
