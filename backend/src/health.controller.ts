import { Controller, Get } from '@nestjs/common';
import { OllamaService } from './modules/ollama/ollama.service';

@Controller()
export class HealthController {
  constructor(private readonly ollamaService: OllamaService) {}

  @Get('health')
  async health() {
    const ollamaOk = await this.ollamaService.isAvailable();
    return {
      status: ollamaOk ? 'ok' : 'degraded',
      ollama: ollamaOk,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('config')
  getConfig() {
    return {
      auth: false,
      ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'gemma4',
      embeddingModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
    };
  }
}
