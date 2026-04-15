import { Module } from '@nestjs/common';
import { AnalyzerService } from './analyzer.service';
import { AnalyzerController } from './analyzer.controller';
import { AnalyzerGateway } from './analyzer.gateway';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [AnalyzerController],
  providers: [AnalyzerService, AnalyzerGateway],
  exports: [AnalyzerService],
})
export class AnalyzerModule {}
