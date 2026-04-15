import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

@Injectable()
export class AppConfigService {
  readonly dataDir: string;
  readonly uploadsDir: string;
  readonly dbPath: string;
  readonly chromaDir: string;
  readonly wafrDocsDir: string;
  readonly ollamaUrl: string;
  readonly ollamaModel: string;
  readonly ollamaEmbedModel: string;
  readonly batchSize: number;

  constructor() {
    this.dataDir = process.env.DATA_DIR || join(homedir(), '.iac-analyzer');
    this.uploadsDir = join(this.dataDir, 'uploads');
    this.dbPath = join(this.dataDir, 'data.db');
    this.chromaDir = join(this.dataDir, 'chromadb');
    this.wafrDocsDir = join(this.dataDir, 'wafr-docs');

    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_MODEL || 'gemma4';
    this.ollamaEmbedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
    this.batchSize = parseInt(process.env.BATCH_SIZE || '3', 10);

    // Ensure directories exist
    for (const dir of [this.dataDir, this.uploadsDir, this.chromaDir, this.wafrDocsDir]) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
