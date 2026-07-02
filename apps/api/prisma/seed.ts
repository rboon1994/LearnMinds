import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // NavItems
  await prisma.navItem.createMany({
    data: [
      {
        name: 'Learn',
        href: '/learn',
        icon: 'book',
        order: 1,
        isSystem: true,
        isAdminNav: false,
        isAllDepts: true,
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
        packages: ['FREE', 'PRO', 'ENTERPRISE'],
        status: 'ACTIVE',
      },
    ],
    skipDuplicates: true,
  });

  // AdminFeatures
  await prisma.adminFeature.createMany({
    data: [
      {
        name: 'User Management',
        key: 'user-management',
        description: 'Manage tenant users',
        isSystem: true,
        packages: ['FREE', 'PRO', 'ENTERPRISE'],
        status: 'ACTIVE',
      },
      {
        name: 'Department Management',
        key: 'department-management',
        description: 'Manage departments and assign nav items',
        isSystem: true,
        packages: ['PRO', 'ENTERPRISE'],
        status: 'ACTIVE',
      },
      {
        name: 'Nav Management',
        key: 'nav-management',
        description: 'Control which nav items each package can see',
        isSystem: true,
        packages: [],
        status: 'ACTIVE',
      },
      {
        name: 'Admin Feature Management',
        key: 'admin-feature-management',
        description: 'Control which admin features each package can access',
        isSystem: true,
        packages: [],
        status: 'ACTIVE',
      },
      {
        name: 'Billing',
        key: 'billing',
        description: 'Manage subscription and billing',
        isSystem: true,
        packages: ['PRO', 'ENTERPRISE'],
        status: 'ACTIVE',
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seed complete');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
