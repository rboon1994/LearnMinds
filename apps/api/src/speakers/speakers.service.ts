import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate } from '../common/paginate';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSpeakerDto } from './dto/create-speaker.dto';
import type { SpeakersQueryDto } from './dto/speakers-query.dto';

@Injectable()
export class SpeakersService {
  constructor(private prisma: PrismaService) {}

  findAll(query: SpeakersQueryDto) {
    return paginate<Prisma.SpeakerGetPayload<object>, Prisma.SpeakerWhereInput>(
      this.prisma.speaker,
      {
        where: query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {},
        orderBy: { name: 'asc' },
      },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  findOne(id: string) {
    return this.prisma.speaker.findFirstOrThrow({ where: { id } });
  }

  create(dto: CreateSpeakerDto) {
    return this.prisma.speaker.create({ data: dto });
  }

  async update(id: string, dto: Partial<CreateSpeakerDto>) {
    await this.findOne(id);
    return this.prisma.speaker.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.prisma.speaker.delete({ where: { id } });
  }
}
