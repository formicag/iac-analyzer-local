import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { OllamaService, OllamaMessage } from '../ollama/ollama.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { AnalyzerGateway } from './analyzer.gateway';
import { AnalysisResult, QuestionGroup } from '../../shared/interfaces/analysis.interface';
import { FileUploadMode, IaCTemplateType } from '../../shared/dto/analysis.dto';
import * as Prompts from '../../prompts';
import { readFileSync } from 'fs';
import { join } from 'path';

interface WellArchitectedBestPractice {
  Pillar: string;
  Question: string;
  'Best Practice': string;
}

interface ModelResponse {
  bestPractices: Array<{
    name: string;
    relevant: boolean;
    applied: boolean;
    reasonApplied?: string;
    reasonNotApplied?: string;
    recommendations?: string;
  }>;
}

@Injectable()
export class AnalyzerService {
  private readonly logger = new Logger(AnalyzerService.name);
  private bestPracticesData: WellArchitectedBestPractice[] | null = null;
  private cancelRequested = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly ollamaService: OllamaService,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly db: DatabaseService,
    private readonly storageService: StorageService,
    private readonly gateway: AnalyzerGateway,
  ) {}

  private loadBestPractices(): WellArchitectedBestPractice[] {
    if (this.bestPracticesData) return this.bestPracticesData;

    const dataPath = join(__dirname, '..', '..', '..', '..', 'data', 'wellarchitected_best_practices.json');
    this.bestPracticesData = JSON.parse(readFileSync(dataPath, 'utf-8'));
    this.logger.log(`Loaded ${this.bestPracticesData.length} best practices`);
    return this.bestPracticesData;
  }

  private groupByQuestion(
    bestPractices: WellArchitectedBestPractice[],
    selectedPillars: string[],
  ): QuestionGroup[] {
    const filtered = bestPractices.filter(bp =>
      selectedPillars.some(p => bp.Pillar.toLowerCase().includes(p.toLowerCase())),
    );

    const grouped = new Map<string, QuestionGroup>();
    for (const bp of filtered) {
      const key = `${bp.Pillar}::${bp.Question}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          pillar: bp.Pillar,
          title: bp.Question,
          questionId: key.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 32),
          bestPractices: [],
          bestPracticeIds: [],
        });
      }
      const group = grouped.get(key)!;
      group.bestPractices.push(bp['Best Practice']);
      group.bestPracticeIds.push(
        bp['Best Practice'].replace(/[^a-zA-Z0-9]/g, '_').substring(0, 32),
      );
    }

    return Array.from(grouped.values());
  }

  private cleanJsonString(text: string): string {
    // Extract JSON from <json_response> tags if present
    const jsonMatch = text.match(/<json_response>([\s\S]*?)<\/json_response>/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }

    // Try to find JSON object directly
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0];
    }

    return text;
  }

  private async analyzeQuestion(
    fileContent: string,
    question: QuestionGroup,
    kbContexts: string[],
    fileType: string,
    uploadMode: FileUploadMode,
  ): Promise<AnalysisResult> {
    // Build system prompt based on upload mode
    let systemPrompt: string;
    let userPrompt: string;

    const isImage = fileType.startsWith('image/');

    if (isImage) {
      systemPrompt = Prompts.buildImageSystemPrompt(question);
      userPrompt = Prompts.buildImagePrompt(question, kbContexts);
    } else if (uploadMode === FileUploadMode.MULTIPLE_FILES || uploadMode === FileUploadMode.ZIP_FILE) {
      systemPrompt = Prompts.buildProjectSystemPrompt(question);
      userPrompt = Prompts.buildProjectPrompt(question, kbContexts, undefined, undefined, fileContent);
    } else if (uploadMode === FileUploadMode.PDF_FILE) {
      systemPrompt = Prompts.buildPdfSystemPrompt(question);
      userPrompt = Prompts.buildPrompt(question, kbContexts, undefined, undefined, fileContent);
    } else {
      systemPrompt = Prompts.buildSystemPrompt(question);
      userPrompt = Prompts.buildPrompt(question, kbContexts, undefined, undefined, fileContent);
    }

    // Gemma 4 optimization: add explicit JSON formatting reminder
    const gemmaJsonReminder = `

CRITICAL OUTPUT RULES:
- You MUST respond ONLY with a JSON object wrapped in <json_response> tags.
- Do NOT include any text before or after the <json_response> tags.
- Ensure the JSON is valid - properly escape quotes and special characters.
- Every best practice in the list MUST appear in your response, do not skip any.`;

    const optimizedSystemPrompt = systemPrompt + gemmaJsonReminder;

    const messages: OllamaMessage[] = [
      { role: 'system', content: optimizedSystemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Retry up to 3 times for valid JSON
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.ollamaService.chat(messages);
        const cleaned = this.cleanJsonString(response);
        const parsed: ModelResponse = JSON.parse(cleaned);

        return {
          pillar: question.pillar,
          question: question.title,
          questionId: question.questionId,
          bestPractices: parsed.bestPractices.map((bp, i) => ({
            id: question.bestPracticeIds[i] || `bp_${i}`,
            name: bp.name,
            relevant: bp.relevant !== false,
            applied: bp.applied || false,
            reasonApplied: bp.reasonApplied,
            reasonNotApplied: bp.reasonNotApplied,
            recommendations: bp.recommendations,
          })),
        };
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Analysis attempt ${attempt + 1} failed for "${question.title}": ${error.message}`,
        );
        if (error instanceof SyntaxError) {
          // JSON parse error, retry
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error('Analysis failed');
  }

  cancelAnalysis() {
    this.cancelRequested = true;
  }

  async analyze(
    fileId: string,
    selectedPillars: string[],
    uploadMode: FileUploadMode = FileUploadMode.SINGLE_FILE,
  ): Promise<{ results: AnalysisResult[]; isCancelled: boolean; error?: string }> {
    this.cancelRequested = false;
    const results: AnalysisResult[] = [];
    const lensAlias = 'wellarchitected';

    try {
      // Update status to IN_PROGRESS
      this.db.updateWorkItemAnalysis(fileId, lensAlias, 'IN_PROGRESS');

      // Get file content
      let fileContent: string;
      const workItem = this.storageService.getWorkItem(fileId);
      if (!workItem) throw new Error('Work item not found');

      if (uploadMode === FileUploadMode.PDF_FILE) {
        // For PDFs, concatenate text content (simplified - in production would use pdf-parse)
        const pdfs = this.storageService.getPdfFiles(fileId);
        fileContent = pdfs.map(p => `[PDF: ${p.filename}]\n${p.buffer.toString('utf-8').substring(0, 50000)}`).join('\n\n');
      } else if (uploadMode === FileUploadMode.MULTIPLE_FILES || uploadMode === FileUploadMode.ZIP_FILE) {
        fileContent = this.storageService.getPackedContent(fileId);
      } else {
        const { data } = this.storageService.getFileContent(fileId);
        fileContent = data.toString('utf-8');
      }

      // Load and group best practices
      const allBestPractices = this.loadBestPractices();
      const questions = this.groupByQuestion(allBestPractices, selectedPillars);
      const totalQuestions = questions.length;

      this.logger.log(`Starting analysis: ${totalQuestions} questions across ${selectedPillars.join(', ')}`);

      // Process in batches
      const batchSize = this.config.batchSize;
      let processed = 0;

      for (let i = 0; i < questions.length; i += batchSize) {
        if (this.cancelRequested) {
          this.db.updateWorkItemAnalysis(fileId, lensAlias, 'CANCELLED');
          return { results, isCancelled: true };
        }

        const batch = questions.slice(i, i + batchSize);

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (question) => {
            // Query knowledge base for context
            let kbContexts: string[] = [];
            try {
              kbContexts = await this.knowledgeBase.query(
                `${question.pillar} ${question.title} ${question.bestPractices.join(' ')}`,
                5,
                question.pillar,
              );
            } catch (error) {
              this.logger.warn(`KB query failed for ${question.title}, proceeding without context`);
            }

            return this.analyzeQuestion(fileContent, question, kbContexts, workItem.fileType, uploadMode);
          }),
        );

        results.push(...batchResults);
        processed += batch.length;

        // Emit progress
        this.gateway.emitAnalysisProgress({
          fileId,
          processedQuestions: processed,
          totalQuestions,
          currentPillar: batch[batch.length - 1].pillar,
          lensAlias,
        });

        // Save intermediate results
        this.db.saveAnalysisResults(fileId, lensAlias, results);
        this.db.updateWorkItemAnalysis(fileId, lensAlias, 'IN_PROGRESS', {
          processed,
          total: totalQuestions,
        });
      }

      // Mark as completed
      this.db.updateWorkItemAnalysis(fileId, lensAlias, 'COMPLETED');
      this.db.saveAnalysisResults(fileId, lensAlias, results);
      this.gateway.emitAnalysisComplete({ fileId, lensAlias });

      this.logger.log(`Analysis complete: ${results.length} questions analyzed`);
      return { results, isCancelled: false };
    } catch (error) {
      this.logger.error(`Analysis failed: ${error.message}`);
      this.db.updateWorkItemAnalysis(fileId, lensAlias, 'FAILED', undefined, error.message);
      this.gateway.emitAnalysisError({ fileId, error: error.message, lensAlias });
      return { results, isCancelled: false, error: error.message };
    }
  }

  async chat(fileId: string, message: string): Promise<string> {
    const lensAlias = 'wellarchitected';

    // Get analysis results
    const analysisResults = this.db.getAnalysisResults(fileId, lensAlias);
    if (!analysisResults || analysisResults.length === 0) {
      throw new Error('No analysis results found. Please run analysis first.');
    }

    const workItem = this.storageService.getWorkItem(fileId);
    if (!workItem) throw new Error('Work item not found');

    // Get file content
    let fileContent = '';
    try {
      const { data } = this.storageService.getFileContent(fileId);
      fileContent = data.toString('utf-8');
      if (fileContent.length > 500000) {
        fileContent = fileContent.substring(0, 500000) + '\n... [TRUNCATED]';
      }
    } catch {
      // Content not available, proceed with just analysis results
    }

    // Build chat system prompt
    const systemPrompt = Prompts.buildChatSystemPrompt(
      workItem.uploadMode as FileUploadMode || FileUploadMode.SINGLE_FILE,
      analysisResults,
      workItem.fileType,
    );

    // Get chat history
    let chatHistory = this.db.getChatHistory(fileId);

    // Build messages
    const messages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add recent chat history
    const recentHistory = chatHistory.slice(-20);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    // Add file content + user message
    const userContent = fileContent
      ? `FILE CONTENT:\n\`\`\`\n${fileContent}\n\`\`\`\n\nUSER QUESTION: ${message}`
      : message;

    messages.push({ role: 'user', content: userContent });

    // Call Ollama
    const response = await this.ollamaService.chat(messages);

    // Save to chat history
    chatHistory.push(
      { id: `user-${Date.now()}`, content: message, timestamp: new Date().toISOString(), isUser: true },
      { id: `assistant-${Date.now()}`, content: response, timestamp: new Date().toISOString(), isUser: false },
    );
    this.db.saveChatHistory(fileId, chatHistory);

    return response;
  }

  async getDetails(fileId: string, item: any): Promise<string> {
    const workItem = this.storageService.getWorkItem(fileId);
    if (!workItem) throw new Error('Work item not found');

    let fileContent = '';
    try {
      const { data } = this.storageService.getFileContent(fileId);
      fileContent = data.toString('utf-8');
    } catch {}

    const systemPrompt = Prompts.buildDetailsSystemPrompt();

    const userPrompt = `
<iac_document_or_project>
${fileContent}
</iac_document_or_project>

<bp_recommendation_analysis>
${JSON.stringify(item, null, 2)}
</bp_recommendation_analysis>`;

    const messages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    return this.ollamaService.chat(messages);
  }

  async generateIaC(fileId: string, templateType: IaCTemplateType): Promise<string> {
    const workItem = this.storageService.getWorkItem(fileId);
    if (!workItem) throw new Error('Work item not found');

    const analysisResults = this.db.getAnalysisResults(fileId);

    const systemPrompt = Prompts.buildIacGenerationSystemPrompt(templateType);

    let fileContent = '';
    try {
      const { data } = this.storageService.getFileContent(fileId);
      fileContent = data.toString('utf-8');
    } catch {}

    const userPrompt = `Based on the following architecture and analysis results, generate a ${templateType}:

<architecture>
${fileContent}
</architecture>

<analysis_results>
${JSON.stringify(analysisResults, null, 2)}
</analysis_results>`;

    const messages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // May need multiple calls for large templates
    let fullResponse = '';
    let isComplete = false;

    while (!isComplete) {
      const response = await this.ollamaService.chat(messages);
      fullResponse += response;

      if (response.includes('<end_of_iac_document_generation>')) {
        isComplete = true;
        fullResponse = fullResponse.replace('<end_of_iac_document_generation>', '').trim();
      } else if (response.includes('<message_truncated>')) {
        fullResponse = fullResponse.replace('<message_truncated>', '');
        messages.push({ role: 'assistant', content: response });
        messages.push({ role: 'user', content: 'Please continue generating the template from where you left off.' });
      } else {
        isComplete = true;
      }
    }

    return fullResponse;
  }

  async exportCsv(fileId: string): Promise<string> {
    const results = this.db.getAnalysisResults(fileId);
    if (!results) throw new Error('No analysis results found');

    const header = 'Pillar,Question,Best Practice,Relevant,Applied,Reason Applied,Reason Not Applied,Recommendations\n';
    const rows = results.flatMap((r: AnalysisResult) =>
      r.bestPractices.map(bp => {
        const escape = (s?: string) => s ? `"${s.replace(/"/g, '""')}"` : '';
        return [
          escape(r.pillar),
          escape(r.question),
          escape(bp.name),
          bp.relevant,
          bp.applied,
          escape(bp.reasonApplied),
          escape(bp.reasonNotApplied),
          escape(bp.recommendations),
        ].join(',');
      }),
    );

    return header + rows.join('\n');
  }
}
