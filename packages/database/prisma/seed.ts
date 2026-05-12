import { PrismaClient, PlanTier, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Inboudly database...');

  // Create a demo tenant + workspace + owner
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'inboudly-demo' },
    update: {},
    create: {
      name: 'Inboudly Demo',
      slug: 'inboudly-demo',
      plan: PlanTier.AGENCY,
      billingEmail: 'demo@inboudly.com',
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: 'demo@inboudly.com' },
    update: {},
    create: {
      email: 'demo@inboudly.com',
      fullName: 'Demo Owner',
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'main' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Main Workspace',
      slug: 'main',
      timezone: 'Asia/Singapore',
      locale: 'en',
    },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: owner.id,
      role: UserRole.OWNER,
      acceptedAt: new Date(),
    },
  });

  await prisma.brandKit.upsert({
    where: { id: `${workspace.id}-default-kit` },
    update: {},
    create: {
      id: `${workspace.id}-default-kit`,
      workspaceId: workspace.id,
      name: 'Default Brand Kit',
      primaryColor: '#FF3D7F',
      secondaryColor: '#0D1B2A',
      accentColor: '#F5C518',
      isDefault: true,
    },
  });

  await prisma.brandVoice.upsert({
    where: { id: `${workspace.id}-default-voice` },
    update: {},
    create: {
      id: `${workspace.id}-default-voice`,
      workspaceId: workspace.id,
      name: 'Default Voice',
      toneTags: ['friendly', 'confident', 'concise'],
      perspective: 'we',
      emojiUsage: 'minimal',
      embeddingNamespace: `voice-${workspace.id}-default`,
      isDefault: true,
    },
  });

  console.log('✅ Seed complete');
  console.log(`   Tenant:    ${tenant.name} (${tenant.id})`);
  console.log(`   Workspace: ${workspace.name} (${workspace.id})`);
  console.log(`   Owner:     ${owner.email}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
