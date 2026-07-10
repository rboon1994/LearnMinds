-- RenameColumn (preserves existing data, unlike prisma's default drop+add diff)
ALTER TABLE "Course" RENAME COLUMN "coverImageUrl" TO "thumbnail";
