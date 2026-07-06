import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { diskStorage } from 'multer';

const uploadsRoot = join(process.cwd(), 'uploads');

// One multer disk-storage config per upload kind (videos/files) so each gets its own
// subdirectory; used directly in @UseInterceptors(FileInterceptor('file', { storage: ... })).
export function multerDiskStorage(subdir: string) {
  const dir = join(uploadsRoot, subdir);
  return diskStorage({
    destination: (_req, _file, cb) => {
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  });
}
