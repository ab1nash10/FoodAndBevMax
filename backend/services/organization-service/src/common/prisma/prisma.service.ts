import { createPrismaAdapter, hospitalScopeExtension } from '@aahar/auth';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: createPrismaAdapter() });

    // Reads on hospital-scoped models are narrowed to the requesting user's locations, so a
    // service cannot accidentally return another location's rows by omitting a filter.
    return this.$extends(hospitalScopeExtension) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
