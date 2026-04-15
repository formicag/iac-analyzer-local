import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { OllamaService } from '../ollama/ollama.service';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface StoredDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata: { pillar: string; source: string; chunkIndex: number };
}

@Injectable()
export class KnowledgeBaseService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private documents: StoredDocument[] = [];
  private readonly storePath: string;

  constructor(
    private readonly config: AppConfigService,
    private readonly ollamaService: OllamaService,
  ) {
    this.storePath = join(this.config.chromaDir, 'vectors.json');
  }

  async onModuleInit() {
    try {
      await this.loadFromDisk();
    } catch (error) {
      this.logger.warn(`Knowledge base load deferred: ${error.message}`);
    }
  }

  private async loadFromDisk() {
    if (existsSync(this.storePath)) {
      const data = JSON.parse(readFileSync(this.storePath, 'utf-8'));
      this.documents = data;
      this.logger.log(`Loaded ${this.documents.length} documents from disk`);
    }
  }

  private saveToDisk() {
    mkdirSync(this.config.chromaDir, { recursive: true });
    writeFileSync(this.storePath, JSON.stringify(this.documents));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  async isReady(): Promise<boolean> {
    return this.documents.length > 0;
  }

  async addDocuments(
    ids: string[],
    documents: string[],
    metadatas: any[],
  ): Promise<void> {
    // Embed documents in batches of 10
    const batchSize = 10;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const batchDocs = documents.slice(i, i + batchSize);
      const batchMeta = metadatas.slice(i, i + batchSize);

      const embeddings = await this.ollamaService.embed(batchDocs);

      for (let j = 0; j < batchIds.length; j++) {
        this.documents.push({
          id: batchIds[j],
          text: batchDocs[j],
          embedding: embeddings[j],
          metadata: batchMeta[j],
        });
      }

      this.logger.log(`Embedded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`);
    }

    this.saveToDisk();
  }

  async query(queryText: string, nResults: number = 5, pillar?: string): Promise<string[]> {
    if (this.documents.length === 0) {
      return [];
    }

    try {
      const queryEmbedding = await this.ollamaService.embedSingle(queryText);

      // Filter by pillar if specified
      let candidates = this.documents;
      if (pillar) {
        const pillarDocs = candidates.filter(d => d.metadata.pillar === pillar);
        // Fall back to all docs if no pillar match
        if (pillarDocs.length > 0) candidates = pillarDocs;
      }

      // Calculate similarities
      const scored = candidates.map(doc => ({
        doc,
        score: this.cosineSimilarity(queryEmbedding, doc.embedding),
      }));

      // Sort by similarity (descending) and take top N
      scored.sort((a, b) => b.score - a.score);
      const topResults = scored.slice(0, nResults);

      return topResults.map(r => r.doc.text);
    } catch (error) {
      this.logger.error(`Query failed: ${error.message}`);
      return [];
    }
  }

  async getDocumentCount(): Promise<number> {
    return this.documents.length;
  }
}
