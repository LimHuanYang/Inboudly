import { api } from './api-client';
import { PLATFORM_SPECS, SocialPlatform } from '@inboudly/shared/platforms';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UploadedAsset {
  id: string;
  url: string;
  type: 'IMAGE' | 'VIDEO';
  filename: string;
}

// ---------------------------------------------------------------------------
// Global caps (conservative per-type fallback)
// ---------------------------------------------------------------------------

const GLOBAL_IMAGE_MAX_BYTES = 32 * 1024 * 1024;  // 32 MB
const GLOBAL_VIDEO_MAX_BYTES = 300 * 1024 * 1024; // 300 MB

// ---------------------------------------------------------------------------
// extractMediaMeta
// ---------------------------------------------------------------------------

export function extractMediaMeta(
  file: File,
): Promise<{
  type: 'IMAGE' | 'VIDEO';
  width?: number;
  height?: number;
  durationSec?: number;
}> {
  if (file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ type: 'IMAGE', width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image metadata.'));
      };
      img.src = url;
    });
  }

  if (file.type.startsWith('video/')) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          type: 'VIDEO',
          width: video.videoWidth,
          height: video.videoHeight,
          durationSec: Number.isFinite(video.duration) ? video.duration : undefined,
        });
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video metadata.'));
      };
      video.src = url;
    });
  }

  return Promise.reject(new Error('Only image or video files are supported.'));
}

// ---------------------------------------------------------------------------
// validateBasic
// ---------------------------------------------------------------------------

export function validateBasic(file: File): { ok: boolean; error?: string } {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    return { ok: false, error: 'Only image or video files are supported.' };
  }

  if (file.type.startsWith('image/') && file.size > GLOBAL_IMAGE_MAX_BYTES) {
    const actualMb = (file.size / 1024 / 1024).toFixed(0);
    return {
      ok: false,
      error: `Image exceeds the global limit of 32 MB (file is ${actualMb} MB).`,
    };
  }

  if (file.type.startsWith('video/') && file.size > GLOBAL_VIDEO_MAX_BYTES) {
    const actualMb = (file.size / 1024 / 1024).toFixed(0);
    return {
      ok: false,
      error: `Video exceeds the global limit of 300 MB (file is ${actualMb} MB).`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// validateForPlatform
// ---------------------------------------------------------------------------

export function validateForPlatform(
  file: File,
  meta: { type: 'IMAGE' | 'VIDEO'; durationSec?: number },
  platform: SocialPlatform,
): { ok: boolean; error?: string } {
  const spec = PLATFORM_SPECS[platform];

  if (meta.type === 'IMAGE') {
    if (!spec.supportsImage) {
      return {
        ok: false,
        error: `${spec.displayName} does not support image uploads.`,
      };
    }

    const maxBytes = spec.maxImageSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const actualMb = (file.size / 1024 / 1024).toFixed(0);
      return {
        ok: false,
        error: `Image exceeds ${spec.displayName}'s limit of ${spec.maxImageSizeMb} MB (file is ${actualMb} MB).`,
      };
    }
  }

  if (meta.type === 'VIDEO') {
    if (!spec.supportsVideo) {
      return {
        ok: false,
        error: `${spec.displayName} does not support video uploads.`,
      };
    }

    const maxBytes = spec.maxVideoSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const actualMb = (file.size / 1024 / 1024).toFixed(0);
      return {
        ok: false,
        error: `Video exceeds ${spec.displayName}'s size limit of ${spec.maxVideoSizeMb} MB (file is ${actualMb} MB).`,
      };
    }

    if (
      meta.durationSec !== undefined &&
      meta.durationSec > spec.maxVideoDurationSec
    ) {
      const actualSec = Math.round(meta.durationSec);
      return {
        ok: false,
        error: `Video exceeds ${spec.displayName}'s duration limit of ${spec.maxVideoDurationSec}s (clip is ${actualSec}s).`,
      };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// uploadFile
// ---------------------------------------------------------------------------

export async function uploadFile(opts: {
  workspaceId: string;
  file: File;
  onProgress?: (pct: number) => void;
}): Promise<UploadedAsset> {
  const { workspaceId, file, onProgress } = opts;

  const meta = await extractMediaMeta(file);

  // 1. Get presigned upload URL from our API
  const { uploadUrl, key: _key, publicUrl } = await api.post<{
    uploadUrl: string;
    key: string;
    publicUrl: string;
  }>('/media/upload-url', {
    workspaceId,
    filename: file.name,
    mimeType: file.type,
  });

  // 2. PUT raw file bytes directly to Cloudflare R2 (no bearer token)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 upload failed with status ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
      }
    };

    xhr.onerror = () => reject(new Error('R2 upload network error.'));
    xhr.send(file);
  });

  // 3. Register the asset with our API
  const asset = await api.post<UploadedAsset>('/media', {
    workspaceId,
    type: meta.type,
    source: 'UPLOAD',
    url: publicUrl,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    ...(meta.width !== undefined && { width: meta.width }),
    ...(meta.height !== undefined && { height: meta.height }),
    ...(meta.durationSec !== undefined && { durationSec: meta.durationSec }),
  });

  return asset;
}
