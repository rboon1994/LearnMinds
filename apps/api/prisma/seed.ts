import { PrismaClient, TenantPackage } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // NavItems — upsert by href so re-running the seed keeps fields in sync
  // instead of createMany's skipDuplicates (href has no unique constraint to key off before this fix).
  const navItems: {
    name: string;
    href: string;
    icon: string;
    order: number;
    isSystem: boolean;
    isAdminNav: boolean;
    isAllDepts: boolean;
    isStudentVisible: boolean;
    packages: TenantPackage[];
    status: 'ACTIVE';
  }[] = [
    {
      name: 'Learn',
      href: '/learn',
      icon: 'book',
      order: 1,
      isSystem: true,
      isAdminNav: false,
      isAllDepts: true,
      isStudentVisible: true,
      packages: ['FREE', 'PRO', 'ENTERPRISE'],
      status: 'ACTIVE',
    },
    {
      name: 'Admin',
      href: '/admin',
      icon: 'cog',
      order: 2,
      isSystem: true,
      isAdminNav: true,
      isAllDepts: false,
      isStudentVisible: false,
      packages: ['FREE', 'PRO', 'ENTERPRISE'],
      status: 'ACTIVE',
    },
    {
      name: 'AI Agent',
      href: '/agents',
      icon: 'robot',
      order: 3,
      isSystem: true,
      isAdminNav: false,
      isAllDepts: true,
      isStudentVisible: true,
      packages: ['FREE', 'PRO', 'ENTERPRISE'],
      status: 'ACTIVE',
    },
    {
      name: 'AI Chat',
      href: '/ai-chat',
      icon: 'chat-bubble',
      order: 4,
      isSystem: true,
      isAdminNav: false,
      isAllDepts: true,
      isStudentVisible: true,
      packages: ['FREE', 'PRO', 'ENTERPRISE'],
      status: 'ACTIVE',
    },
    {
      name: 'Events',
      href: '/events',
      icon: 'calendar',
      order: 5,
      isSystem: true,
      isAdminNav: false,
      isAllDepts: true,
      isStudentVisible: true,
      packages: ['FREE', 'PRO', 'ENTERPRISE'],
      status: 'ACTIVE',
    },
  ];
  for (const item of navItems) {
    await prisma.navItem.upsert({
      where: { href: item.href },
      create: item,
      update: item,
    });
  }

  // AdminFeatures — upsert by key so re-running the seed keeps order/name in sync
  // instead of createMany's skipDuplicates silently ignoring existing rows.
  const adminFeatures: {
    name: string;
    key: string;
    description: string;
    order: number;
    isSystem: boolean;
    packages: TenantPackage[];
    status: 'ACTIVE';
  }[] = [
    {
      name: 'User Management',
      key: 'user-management',
      description: 'Manage tenant users',
      order: 1,
      isSystem: true,
      packages: ['FREE', 'PRO', 'ENTERPRISE'],
      status: 'ACTIVE',
    },
    {
      name: 'Department Management',
      key: 'department-management',
      description: 'Manage departments and assign nav items',
      order: 2,
      isSystem: true,
      packages: ['PRO', 'ENTERPRISE'],
      status: 'ACTIVE',
    },
    {
      name: 'Navigation Management',
      key: 'navigation-management',
      description: 'Control which nav items each package can see',
      order: 3,
      isSystem: true,
      packages: [],
      status: 'ACTIVE',
    },
    {
      name: 'Admin Feature Management',
      key: 'admin-feature-management',
      description: 'Control which admin features each package can access',
      order: 4,
      isSystem: true,
      packages: [],
      status: 'ACTIVE',
    },
    {
      name: 'Billing',
      key: 'billing',
      description: 'Manage subscription and billing',
      order: 5,
      isSystem: true,
      packages: ['PRO', 'ENTERPRISE'],
      status: 'ACTIVE',
    },
    {
      name: 'Course Management',
      key: 'course-management',
      description: 'Create and manage courses and lessons',
      order: 6,
      isSystem: true,
      packages: ['PRO', 'ENTERPRISE'],
      status: 'ACTIVE',
    },
    {
      name: 'Student Management',
      key: 'student-management',
      description: 'Bulk register student accounts',
      order: 7,
      isSystem: true,
      packages: [],
      status: 'ACTIVE',
    },
    {
      name: 'Enrollment Management',
      key: 'enrollment-management',
      description: 'Grant course series access to students and tenants',
      order: 8,
      isSystem: true,
      packages: [],
      status: 'ACTIVE',
    },
    {
      name: 'Speaker Management',
      key: 'speaker-management',
      description: 'Manage event speakers',
      order: 9,
      isSystem: true,
      packages: [],
      status: 'ACTIVE',
    },
    {
      name: 'AI Agent Management',
      key: 'ai-agent-management',
      description: 'Create and manage AI agents',
      order: 10,
      isSystem: true,
      packages: [],
      status: 'ACTIVE',
    },
    {
      name: 'Knowledge Base Management',
      key: 'knowledge-base-management',
      description: 'Manage reusable document knowledge bases for AI agents',
      order: 11,
      isSystem: true,
      packages: [],
      status: 'ACTIVE',
    },
    {
      name: 'Event Management',
      key: 'event-management',
      description: 'Manage events and sessions',
      order: 12,
      isSystem: true,
      // Same as speaker-management/knowledge-base-management: an empty packages array means
      // this tile always shows as "locked" for Role.ADMIN (no package unlocks it) while
      // AuthService.getAdminFeatures marks every feature 'available' for SUPER_ADMIN
      // regardless of packages — the actual API access control is EventsController's
      // @Roles(Role.SUPER_ADMIN), not this AdminFeatureGuard-style package gate.
      packages: [],
      status: 'ACTIVE',
    },
  ];
  for (const feature of adminFeatures) {
    await prisma.adminFeature.upsert({
      where: { key: feature.key },
      create: feature,
      update: feature,
    });
  }

  // EventCategory — starting set matching the enum values it replaced; SUPER_ADMIN can
  // rename/add/remove from here via the admin UI. No unique constraint on name (enforced
  // app-side, see EventCategoriesService), so this is create-if-none-exist, not an upsert.
  if ((await prisma.eventCategory.count()) === 0) {
    await prisma.eventCategory.createMany({
      data: [{ name: 'Sales' }, { name: 'Marketing' }, { name: 'Operation' }, { name: 'HR' }],
    });
  }

  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
