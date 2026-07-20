import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AiAgentModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AiAgentModelsQueryDto } from './dto/ai-agent-models-query.dto';
import type { CreateAiAgentModelDto } from './dto/create-ai-agent-model.dto';
import type { UpdateAiAgentModelDto } from './dto/update-ai-agent-model.dto';

@Injectable()
export class AiAgentModelsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: AiAgentModelsQueryDto = {}) {
    const { status, includeId } = query;
    // includeId is undefined on the Create-Agent call — `{ id: undefined }` inside an `OR`
    // array is treated by Prisma as `{}` (match-anything), which would silently cancel the
    // status filter, so the id clause is only added when includeId is actually present.
    const where: Prisma.AiAgentModelWhereInput = status
      ? includeId
        ? { OR: [{ status }, { id: includeId }] }
        : { status }
      : {};
    const models = await this.prisma.aiAgentModel.findMany({
      where,
      orderBy: { displayName: 'asc' },
    });
    return models.map((m) => this.toResponse(m));
  }

  async findOne(id: string) {
    const model = await this.prisma.aiAgentModel.findUniqueOrThrow({
      where: { id },
    });
    return this.toResponse(model);
  }

  async create(dto: CreateAiAgentModelDto) {
    await this.assertModelIdAvailable(dto.modelId);
    const isFirstModel = (await this.prisma.aiAgentModel.count()) === 0;
    const data = {
      modelId: dto.modelId,
      displayName: dto.displayName,
      maxTokenLimit: dto.maxTokenLimit,
      inputTokenPrice: dto.inputTokenPrice,
      outputTokenPrice: dto.outputTokenPrice,
      temperature: dto.temperature ?? 0.7,
      status: isFirstModel ? 'ACTIVE' : (dto.status ?? 'ACTIVE'),
      isDefault: isFirstModel,
    } as const;
    try {
      const model = await this.prisma.aiAgentModel.create({ data });
      return this.toResponse(model);
    } catch (err) {
      // The count()-then-create isFirstModel check isn't atomic — a concurrent request can
      // also read count() === 0 and race to become default. The DB-level partial unique index
      // on isDefault is the real guard; if it rejects us, someone else already won that race,
      // so retry once as a non-default model instead of surfacing a confusing 500.
      if (
        isFirstModel &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const model = await this.prisma.aiAgentModel.create({
          data: { ...data, status: dto.status ?? 'ACTIVE', isDefault: false },
        });
        return this.toResponse(model);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateAiAgentModelDto) {
    const existing = await this.prisma.aiAgentModel.findUniqueOrThrow({
      where: { id },
    });
    if (dto.modelId) {
      await this.assertModelIdAvailable(dto.modelId, id);
    }
    if (dto.status === 'INACTIVE' && existing.isDefault) {
      throw new BadRequestException(
        'Cannot deactivate the default model — assign another model as default first',
      );
    }
    const model = await this.prisma.aiAgentModel.update({
      where: { id },
      data: {
        modelId: dto.modelId,
        displayName: dto.displayName,
        maxTokenLimit: dto.maxTokenLimit,
        inputTokenPrice: dto.inputTokenPrice,
        outputTokenPrice: dto.outputTokenPrice,
        temperature: dto.temperature,
        status: dto.status,
      },
    });
    return this.toResponse(model);
  }

  async setDefault(id: string) {
    await this.prisma.aiAgentModel.findUniqueOrThrow({ where: { id } });
    await this.prisma.$transaction([
      this.prisma.aiAgentModel.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false },
      }),
      this.prisma.aiAgentModel.update({
        where: { id },
        data: { isDefault: true, status: 'ACTIVE' },
      }),
    ]);
    return this.findOne(id);
  }

  async delete(id: string) {
    const existing = await this.prisma.aiAgentModel.findUniqueOrThrow({
      where: { id },
    });
    if (existing.isDefault) {
      throw new BadRequestException(
        'Cannot delete the default model — assign another model as default first',
      );
    }
    const count = await this.prisma.aiAgent.count({ where: { modelId: id } });
    if (count > 0) {
      throw new ConflictException(
        `${count} agent(s) still reference this model — reassign them first`,
      );
    }
    await this.prisma.aiAgentModel.delete({ where: { id } });
  }

  private async assertModelIdAvailable(modelId: string, excludeId?: string) {
    const existing = await this.prisma.aiAgentModel.findFirst({
      where: { modelId: { equals: modelId, mode: 'insensitive' } },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('A model with this Model ID already exists');
    }
  }

  // Prisma serializes Decimal as a string (e.g. "0.150000") — convert to a plain number once
  // here so the frontend never has to parse a padded string into a number input.
  private toResponse(model: AiAgentModel) {
    return {
      ...model,
      inputTokenPrice: model.inputTokenPrice.toNumber(),
      outputTokenPrice: model.outputTokenPrice.toNumber(),
    };
  }
}
