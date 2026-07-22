import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PrismaModule } from './prisma/prisma.module';
import { DepartmentsModule } from './departments/departments.module';
import { NavItemsModule } from './nav-items/nav-items.module';
import { AdminFeaturesModule } from './admin-features/admin-features.module';
import { CoursesModule } from './courses/courses.module';
import { StudentsModule } from './students/students.module';
import { TenantsModule } from './tenants/tenants.module';
import { CourseSeriesModule } from './course-series/course-series.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { SpeakersModule } from './speakers/speakers.module';
import { UsersModule } from './users/users.module';
import { AiAgentModelsModule } from './ai-agent-models/ai-agent-models.module';
import { AiAgentsModule } from './ai-agents/ai-agents.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { AgentChatModule } from './agent-chat/agent-chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    DepartmentsModule,
    NavItemsModule,
    AdminFeaturesModule,
    CoursesModule,
    StudentsModule,
    UsersModule,
    TenantsModule,
    CourseSeriesModule,
    EnrollmentsModule,
    SpeakersModule,
    AiAgentModelsModule,
    AiAgentsModule,
    KnowledgeBaseModule,
    AgentChatModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
