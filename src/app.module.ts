import { Module } from '@nestjs/common';
import { TelegramModule } from './telegram/telegram.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [TelegramModule, AnalyticsModule, StorageModule],
})
export class AppModule {}
