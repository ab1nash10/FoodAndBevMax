import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  imports: [CommonModule],
  providers: [RoomsService],
})
export class RoomsModule {}
