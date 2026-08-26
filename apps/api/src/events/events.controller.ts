import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { EventsAdminQueryDto } from './dto/events-admin-query.dto';
import { EventsQueryDto } from './dto/events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { EventsService } from './events.service';

type AuthReq = { user: { userId: string; role: Role } };
type OptionalAuthReq = { user?: { userId: string; role: Role } };

// Mixed-access controller (public browsing + Super-Admin-only management) — guards are applied
// per-method, not at class level, since a class-level RolesGuard would crash on `req.user.role`
// for the @Public() routes below (no JWT is parsed for those at all, so req.user is undefined).
@Controller('events')
export class EventsController {
  constructor(private svc: EventsService) {}

  // @Public() keeps the global JwtAuthGuard from blocking; OptionalJwtAuthGuard then does the
  // actual (non-blocking) token parsing so a SUPER_ADMIN caller also sees Draft events here —
  // everyone else (including a valid but non-SUPER_ADMIN token) sees PUBLISHED only.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findPublished(
    @Query() query: EventsQueryDto,
    @Request() req: OptionalAuthReq,
  ) {
    return this.svc.findPublished(query, req.user);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  findAllForAdmin(@Query() query: EventsAdminQueryDto) {
    return this.svc.findAllForAdmin(query);
  }

  @Get('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  findOneForAdmin(@Param('id') id: string) {
    return this.svc.findOneForAdmin(id);
  }

  @Patch('sessions/:sessionId')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  updateSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.svc.updateSession(sessionId, dto);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  deleteSession(@Param('sessionId') sessionId: string) {
    return this.svc.deleteSession(sessionId);
  }

  // Generic `:id` route must be declared after the literal `admin`/`admin/:id` routes above —
  // Nest/Express matches GET routes in declaration order, and `:id` would otherwise greedily
  // swallow `/events/admin` as id="admin".
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOnePublished(@Param('id') id: string, @Request() req: OptionalAuthReq) {
    return this.svc.findOnePublished(id, req.user);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  createEvent(@Body() dto: CreateEventDto, @Request() req: AuthReq) {
    return this.svc.createEvent(dto, req.user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  updateEvent(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.svc.updateEvent(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  deleteEvent(@Param('id') id: string) {
    return this.svc.deleteEvent(id);
  }

  @Post(':id/sessions')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  createSession(@Param('id') eventId: string, @Body() dto: CreateSessionDto) {
    return this.svc.createSession(eventId, dto);
  }
}
