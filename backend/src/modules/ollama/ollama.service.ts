import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 encoded images
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
}

interface OllamaEmbedResponse {
  embeddings: number[][];
}

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  constructor(private readonly config: AppConfigService) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.ollamaUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.config.ollamaUrl}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json() as any;
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  async chat(
    messages: OllamaMessage[],
    options?: { temperature?: number; numCtx?: number },
  ): Promise<string> {
    const body: any = {
      model: this.config.ollamaModel,
      messages,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_ctx: options?.numCtx ?? 32768,
      },
    };

    this.logger.debug(`Calling Ollama chat with model ${this.config.ollamaModel}`);

    const res = await fetch(`${this.config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600000), // 10 min timeout for large prompts
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama chat failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    return data.message.content;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const body = {
      model: this.config.ollamaEmbedModel,
      input: texts,
    };

    const res = await fetch(`${this.config.ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama embed failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OllamaEmbedResponse;
    return data.embeddings;
  }

  async embedSingle(text: string): Promise<number[]> {
    const results = await this.embed([text]);
    return results[0];
  }
}
