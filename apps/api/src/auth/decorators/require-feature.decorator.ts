import { SetMetadata } from '@nestjs/common';

export const RequireFeature = (key: string) => SetMetadata('feature', key);
