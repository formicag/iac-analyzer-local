import { Module } from '@nestjs/common';
import { AnalyzerModule } from './modules/analyzer/analyzer.module';
import { StorageModule } from './modules/storage/storage.module';
import { OllamaModule } from './modules/ollama/ollama.module';
import { DatabaseModule } from './modules/database/database.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    OllamaModule,
    KnowledgeBaseModule,
    StorageModule,
    AnalyzerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
