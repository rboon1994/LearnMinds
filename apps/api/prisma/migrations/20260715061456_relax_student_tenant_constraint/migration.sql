-- Students are intentionally tenant-less (see Student model comment in schema.prisma), but
-- chk_superadmin_tenant required every non-SUPER_ADMIN user to have a tenantId, so creating a
-- Student always violated the constraint. Carve out the same tenantId-IS-NULL exception for STUDENT.
ALTER TABLE "User" DROP CONSTRAINT "chk_superadmin_tenant";

ALTER TABLE "User" ADD CONSTRAINT "chk_superadmin_tenant"
  CHECK ((role IN ('SUPER_ADMIN', 'STUDENT') AND "tenantId" IS NULL)
      OR (role NOT IN ('SUPER_ADMIN', 'STUDENT') AND "tenantId" IS NOT NULL));
