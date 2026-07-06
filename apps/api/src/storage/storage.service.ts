import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class StorageService {
  readonly root = join(process.cwd(), 'uploads');

  // Multer disk storage already wrote the file under this.root; we just hand back
  // the relative key used to look it up later (and, post-deployment, the same key
  // becomes the GCS object name — this method is the only thing that changes then).
  save(diskPath: string): { key: string } {
    return { key: diskPath.slice(this.root.length + 1).replace(/\\/g, '/') };
  }

  resolvePath(key: string) {
    return join(this.root, key);
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolvePath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
