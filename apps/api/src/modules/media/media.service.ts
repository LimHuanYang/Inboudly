import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { R2StorageService } from './r2-storage.service';
import { MediaType, MediaSource } from '@inboudly/database';
import { randomBytes } from 'crypto';

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService, private r2: R2StorageService) {}

  async createUploadUrl(workspaceId: string, filename: string, mimeType: string) {
    const ext = filename.split('.').pop() ?? 'bin';
    const key = `workspaces/${workspaceId}/uploads/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
    return this.r2.createPresignedUpload(key, mimeType);
  }

  async register(params: {
    workspaceId: string;
    type: MediaType;
    source?: MediaSource;
    url: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    durationSec?: number;
    aiPrompt?: string;
    aiModel?: string;
  }) {
    return this.prisma.mediaAsset.create({
      data: {
        workspaceId: params.workspaceId,
        type: params.type,
        source: params.source ?? MediaSource.UPLOAD,
        url: params.url,
        filename: params.filename,
        mimeType: params.mimeType,
        sizeBytes: BigInt(params.sizeBytes),
        width: params.width,
        height: params.height,
        durationSec: params.durationSec,
        aiPrompt: params.aiPrompt,
        aiModel: params.aiModel,
      },
    });
  }

  list(workspaceId: string, type?: MediaType) {
    return this.prisma.mediaAsset.findMany({
      where: { workspaceId, ...(type && { type }) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
