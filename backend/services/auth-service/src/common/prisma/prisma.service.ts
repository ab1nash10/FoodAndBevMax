import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { countPrismaQueries, createPrismaAdapter, prismaQueryLogOptions } from '@aahar/auth';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: createPrismaAdapter(), ...prismaQueryLogOptions() });
    countPrismaQueries(this);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
