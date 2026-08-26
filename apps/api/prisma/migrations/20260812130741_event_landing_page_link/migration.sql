/*
  Warnings:

  - You are about to drop the column `zoomLink` on the `EventSession` table. All the data in the column will be lost.
  - Added the required column `landingPageLink` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "landingPageLink" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "EventSession" DROP COLUMN "zoomLink",
ADD COLUMN     "landingPageLink" TEXT;
