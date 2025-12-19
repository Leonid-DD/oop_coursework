import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { StorageModule } from 'src/storage/storage.module';
import { AnalyticsModule } from 'src/analytics/analytics.module';
import { HelperModule } from 'src/helper/helper.module';

@Module({
  imports: [StorageModule, AnalyticsModule, HelperModule],
  providers: [TelegramService],
})
export class TelegramModule {}
