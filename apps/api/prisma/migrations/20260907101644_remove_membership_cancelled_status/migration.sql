-- AlterEnum
BEGIN;
CREATE TYPE "MembershipStatus_new" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED');
ALTER TABLE "Membership" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Membership" ALTER COLUMN "status" TYPE "MembershipStatus_new" USING ("status"::text::"MembershipStatus_new");
ALTER TYPE "MembershipStatus" RENAME TO "MembershipStatus_old";
ALTER TYPE "MembershipStatus_new" RENAME TO "MembershipStatus";
DROP TYPE "MembershipStatus_old";
ALTER TABLE "Membership" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
