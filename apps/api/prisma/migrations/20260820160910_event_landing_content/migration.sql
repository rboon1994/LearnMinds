-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "landingContent" JSONB NOT NULL DEFAULT '{"hero":{"name":"","title":"","credentials":[],"photoUrl":""},"course":{"title":"","subtitle":"","days":[]},"testimonials":[],"gallery":[]}',
ALTER COLUMN "landingPageLink" DROP NOT NULL;
