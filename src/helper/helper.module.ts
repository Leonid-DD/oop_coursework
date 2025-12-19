import { Module } from '@nestjs/common';
import { HelperService } from './helper.service';
import { AnalyticsService } from 'src/analytics/analytics.service';

@Module({
  providers: [HelperService],
  exports: [HelperService]
})
export class HelperModule {}
