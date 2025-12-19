import { Module } from '@nestjs/common';
import { TelegramModule } from './telegram/telegram.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { StorageModule } from './storage/storage.module';
import { HelperModule } from './helper/helper.module';

@Module({
  imports: [TelegramModule, AnalyticsModule, StorageModule, HelperModule],
})
export class AppModule {}
