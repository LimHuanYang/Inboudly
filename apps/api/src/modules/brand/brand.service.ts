import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BrandService {
  constructor(private prisma: PrismaService) {}

  // -------- Brand Kit --------
  listKits(workspaceId: string) {
    return this.prisma.brandKit.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  }

  createKit(workspaceId: string, data: {
    name: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    logoUrl?: string;
  }) {
    return this.prisma.brandKit.create({ data: { workspaceId, ...data } });
  }

  updateKit(id: string, data: Partial<{
    name: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    logoUrl: string;
    isDefault: boolean;
  }>) {
    return this.prisma.brandKit.update({ where: { id }, data });
  }

  // -------- Brand Voice --------
  listVoices(workspaceId: string) {
    return this.prisma.brandVoice.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createVoice(workspaceId: string, data: {
    name: string;
    toneTags?: string[];
    perspective?: string;
    emojiUsage?: string;
    glossary?: Record<string, unknown>;
    bannedWords?: string[];
    styleNotes?: string;
  }) {
    return this.prisma.brandVoice.create({
      data: {
        workspaceId,
        ...data,
        embeddingNamespace: `voice-${workspaceId}-${Date.now()}`,
      },
    });
  }

  updateVoice(id: string, data: Record<string, unknown>) {
    return this.prisma.brandVoice.update({ where: { id }, data });
  }
}
