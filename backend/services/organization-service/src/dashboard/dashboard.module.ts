import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { GrnsModule } from '../grns/grns.module';
import { HospitalsModule } from '../hospitals/hospitals.module';
import { ItemsModule } from '../items/items.module';
import { KitchenItemsModule } from '../kitchen-items/kitchen-items.module';
import { KitchenProductionsModule } from '../kitchen-productions/kitchen-productions.module';
import { KitchensModule } from '../kitchens/kitchens.module';
import { RestaurantMenusModule } from '../restaurant-menus/restaurant-menus.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { StoreItemsModule } from '../store-items/store-items.module';
import { StoresModule } from '../stores/stores.module';
import { TransfersModule } from '../transfers/transfers.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  imports: [
    EmployeesModule,
    GrnsModule,
    HospitalsModule,
    ItemsModule,
    KitchenItemsModule,
    KitchenProductionsModule,
    KitchensModule,
    RestaurantMenusModule,
    RestaurantsModule,
    StoreItemsModule,
    StoresModule,
    TransfersModule,
  ],
  providers: [DashboardService],
})
export class DashboardModule {}
