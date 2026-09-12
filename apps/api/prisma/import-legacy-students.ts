// One-off migration: import legacy student accounts exported from the old system.
// Usage (from apps/api): ts-node prisma/import-legacy-students.ts <path-to-json>
//
// Input JSON is an array of { fullName, email, passwordHash, mustChangePassword: "Yes"|"No" }.
// passwordHash is reused as-is (already bcrypt) — bcrypt.compare works regardless of the
// cost factor baked into the hash, so no rehashing is needed.
import { readFileSync } from 'fs';
import { PrismaClient, Role, Status } from '@prisma/client';

const prisma = new PrismaClient();

type LegacyRow = {
  fullName: string;
  email: string;
  phoneCountryCode?: string | null;
  phoneNo?: string | null;
  passwordHash: string;
  mustChangePassword: string;
};

type ImportResult = { email: string; status: 'created' | 'skipped'; reason?: string };

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('Usage: ts-node prisma/import-legacy-students.ts <path-to-json>');
    process.exit(1);
  }
  const rows: LegacyRow[] = JSON.parse(readFileSync(jsonPath, 'utf-8'));

  const results: ImportResult[] = [];

  // Sequential, not Promise.all, so a duplicate email appearing twice in the file is
  // correctly skipped on its second occurrence — same reasoning as StudentsService.bulkRegister.
  for (const row of rows) {
    const existing = await prisma.user.findUnique({ where: { email: row.email } });
    if (existing) {
      results.push({ email: row.email, status: 'skipped', reason: 'Email already registered' });
      continue;
    }

    const mustChangePassword = row.mustChangePassword.trim().toLowerCase() === 'yes';

    await prisma.$transaction(async (tx) => {
      const student = await tx.student.create({ data: {} });
      await tx.user.create({
        data: {
          fullName: row.fullName,
          email: row.email,
          phoneCountryCode: row.phoneCountryCode ?? undefined,
          phoneNo: row.phoneNo ?? undefined,
          password: row.passwordHash,
          role: Role.STUDENT,
          studentId: student.id,
          mustChangePassword,
          status: mustChangePassword ? Status.INACTIVE : Status.ACTIVE,
        },
      });
    });
    results.push({ email: row.email, status: 'created' });
  }

  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r) => r.status === 'skipped');
  console.log(`Created: ${created}, Skipped: ${skipped.length}`);
  if (skipped.length > 0) {
    console.log('Skipped rows:', JSON.stringify(skipped, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
