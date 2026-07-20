import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { paginate } from '../common/paginate';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAiAgentDto } from './dto/create-ai-agent.dto';
import type { ListAiAgentsDto } from './dto/list-ai-agents.dto';
import type { UpdateAiAgentDto } from './dto/update-ai-agent.dto';

const INCLUDE = {
  model: true,
  series: true,
  creator: true,
} satisfies Prisma.AiAgentInclude;

type AiAgentWithRelations = Prisma.AiAgentGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class AiAgentsService {
  constructor(private prisma: PrismaService) {}

  // tenantId: null is explicit, not incidental — every AiAgent created through this SUPER_ADMIN-
  // only module today is global (see create() below). Filtering by it now, rather than relying
  // on "nothing tenant-scoped exists yet," means the day tenant-owned agents are introduced this
  // query won't silently keep returning them until someone remembers to add the filter — see
  // CLAUDE.md's Tenant Isolation Hard Rule.
  async findAll(query: ListAiAgentsDto) {
    const where: Prisma.AiAgentWhereInput = {
      tenantId: null,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const result = await paginate<
      AiAgentWithRelations,
      Prisma.AiAgentWhereInput
    >(
      this.prisma.aiAgent,
      {
        where,
        include: INCLUDE,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortDir ?? 'desc' },
      },
      { page: query.page, pageSize: query.pageSize },
    );
    return { ...result, data: result.data.map((a) => this.toResponse(a)) };
  }

  async findOne(id: string) {
    const agent = await this.prisma.aiAgent.findFirstOrThrow({
      where: { id, tenantId: null },
      include: INCLUDE,
    });
    return this.toResponse(agent);
  }

  async create(dto: CreateAiAgentDto) {
    const agent = await this.prisma.aiAgent.create({
      data: {
        name: dto.name,
        description: dto.description,
        systemPrompt: dto.systemPrompt,
        instructions: dto.instructions,
        thumbnail: dto.thumbnail,
        modelId: dto.modelId,
        seriesId: dto.seriesId ?? null,
        creatorId: dto.creatorId ?? null,
        tenantId: null,
      },
      include: INCLUDE,
    });
    return this.toResponse(agent);
  }

  async update(id: string, dto: UpdateAiAgentDto) {
    await this.prisma.aiAgent.findFirstOrThrow({
      where: { id, tenantId: null },
    });
    const agent = await this.prisma.aiAgent.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        systemPrompt: dto.systemPrompt,
        instructions: dto.instructions,
        thumbnail: dto.thumbnail,
        modelId: dto.modelId,
        seriesId: dto.seriesId,
        creatorId: dto.creatorId,
      },
      include: INCLUDE,
    });
    return this.toResponse(agent);
  }

  // Everyday soft toggle backing the StatusBadge click — never a real delete.
  async setStatus(id: string, status: 'DRAFT' | 'PUBLISHED') {
    await this.prisma.aiAgent.findFirstOrThrow({
      where: { id, tenantId: null },
    });
    const agent = await this.prisma.aiAgent.update({
      where: { id },
      data: { status },
      include: INCLUDE,
    });
    return this.toResponse(agent);
  }

  // Genuine hard delete — advanced cleanup path, distinct from setStatus above.
  async remove(id: string) {
    await this.prisma.aiAgent.findFirstOrThrow({
      where: { id, tenantId: null },
    });
    await this.prisma.aiAgent.delete({ where: { id } });
  }

  // The nested `model` relation carries Decimal price fields, which Prisma serializes as
  // padded strings (e.g. "2.500000") — convert to plain numbers here too, same reasoning
  // as AiAgentModelsService.toResponse, so the frontend never has to parse a Decimal string.
  private toResponse(agent: AiAgentWithRelations) {
    return {
      ...agent,
      model: {
        ...agent.model,
        inputTokenPrice: agent.model.inputTokenPrice.toNumber(),
        outputTokenPrice: agent.model.outputTokenPrice.toNumber(),
      },
    };
  }
}
