// Rollback for import-legacy-students.ts — deletes exactly the rows that script created.
// Usage (from apps/api): ts-node prisma/rollback-legacy-students.ts <path-to-json>
//
// Matches by email against the same input file used for the import, and only touches
// role: STUDENT rows — never a blanket time-based delete. If a row has other data attached
// (enrollments, memberships, etc.) the delete will fail with a foreign-key error and is
// reported as 'failed' rather than force-cascaded.
import { readFileSync } from 'fs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

type LegacyRow = { email: string };

type RollbackResult = { email: string; status: 'deleted' | 'not-found' | 'failed'; reason?: string };

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('Usage: ts-node prisma/rollback-legacy-students.ts <path-to-json>');
    process.exit(1);
  }
  const rows: LegacyRow[] = JSON.parse(readFileSync(jsonPath, 'utf-8'));

  const results: RollbackResult[] = [];

  for (const row of rows) {
    const user = await prisma.user.findUnique({ where: { email: row.email } });
    if (!user || user.role !== Role.STUDENT) {
      results.push({ email: row.email, status: 'not-found' });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.delete({ where: { id: user.id } });
        if (user.studentId) {
          await tx.student.delete({ where: { id: user.studentId } });
        }
      });
      results.push({ email: row.email, status: 'deleted' });
    } catch (e) {
      results.push({ email: row.email, status: 'failed', reason: (e as Error).message });
    }
  }

  const deleted = results.filter((r) => r.status === 'deleted').length;
  const notFound = results.filter((r) => r.status === 'not-found').length;
  const failed = results.filter((r) => r.status === 'failed');
  console.log(`Deleted: ${deleted}, Not found: ${notFound}, Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log('Failed rows:', JSON.stringify(failed, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
