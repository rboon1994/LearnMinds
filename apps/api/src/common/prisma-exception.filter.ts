import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';

// findFirstOrThrow/findUniqueOrThrow throw P2025 on a miss; a bad foreign key throws P2003; a
// unique-constraint clash throws P2002. Without this filter, Nest's default handler turns all of
// these into a raw 500 with an internal error body instead of a clean 4xx — the gap that mattered
// once agent-chat opened these lookups up to any authenticated role instead of SUPER_ADMIN-only.
const STATUS_BY_CODE: Record<string, { status: HttpStatus; message: string }> =
  {
    P2025: { status: HttpStatus.NOT_FOUND, message: 'Not found' },
    P2002: {
      status: HttpStatus.CONFLICT,
      message: 'A record with this value already exists',
    },
    P2003: {
      status: HttpStatus.BAD_REQUEST,
      message: 'Invalid reference to a related record',
    },
  };

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, message } = STATUS_BY_CODE[exception.code] ?? {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
    response.status(status).json({ statusCode: status, message });
  }
}
