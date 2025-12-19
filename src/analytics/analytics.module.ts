import { StorageModule } from './../storage/storage.module';
import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { HelperModule } from 'src/helper/helper.module';

@Module({
  imports : [HelperModule, StorageModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService]
})
export class AnalyticsModule {}
