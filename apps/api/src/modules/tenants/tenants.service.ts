import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async getById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { aiCredits: true, subscriptions: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async getBySlug(slug: string) {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }

  async updateBranding(id: string, branding: Record<string, unknown>) {
    return this.prisma.tenant.update({ where: { id }, data: { branding } });
  }
}
