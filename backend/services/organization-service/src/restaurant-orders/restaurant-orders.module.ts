import { Module } from '@nestjs/common';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RestaurantOrdersController } from './restaurant-orders.controller';
import { RestaurantOrdersService } from './restaurant-orders.service';

@Module({
  controllers: [RestaurantOrdersController],
  providers: [AuditLogService, PrismaService, RestaurantOrdersService],
})
export class RestaurantOrdersModule {}
