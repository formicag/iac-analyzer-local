import axios, { AxiosError } from 'axios';
import { AnalysisResult, RiskSummary, RiskSummaryResponse, IaCTemplateType, FileUploadMode, LensMetadata } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 0,
});

const handleError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message: string }>;
    if (axiosError.message.includes('Network Error') || !axiosError.response) {
      return new Error(
        'NETWORK_INTERRUPTION: Network connection was interrupted. ' +
        'Your analysis may still be running. Check the side panel for results.'
      );
    }
    return new Error(
      axiosError.response?.data?.message || axiosError.message || 'An unexpected error occurred'
    );
  }
  return new Error('An unexpected error occurred');
};

export const analyzerApi = {
  async getLensMetadata(): Promise<LensMetadata[]> {
    return [{
      lensAlias: 'wellarchitected',
      lensName: 'Well-Architected Framework',
      lensDescription: 'AWS Well-Architected Framework',
      lensPillars: {
        'costOptimization': 'Cost Optimization',
        'operationalExcellence': 'Operational Excellence',
        'performance': 'Performance Efficiency',
        'reliability': 'Reliability',
        'security': 'Security',
        'sustainability': 'Sustainability',
      },
      pdfUrl: '',
      uploadDate: new Date().toISOString(),
    }];
  },

  async associateLenses(_workloadId: string, _lensAliasArn?: string): Promise<void> {},

  async analyze(
    fileId: string,
    _workloadId: string,
    selectedPillars: string[],
    uploadMode?: FileUploadMode,
    _supportingDocumentId?: string,
    _supportingDocumentDescription?: string,
    _lensAliasArn?: string,
    _lensName?: string,
    _lensPillars?: Record<string, string> | null,
    _isTempWorkload?: boolean,
    _outputLanguage?: string,
  ): Promise<{ results: AnalysisResult[]; isCancelled: boolean; error?: string; fileId?: string }> {
    try {
      const response = await api.post('/analyzer/analyze', {
        fileId,
        selectedPillars,
        uploadMode,
      });
      return response.data;
    } catch (error) {
      throw handleError(error);
    }
  },

  async cancelAnalysis(): Promise<void> {
    try {
      await api.post('/analyzer/cancel');
    } catch (error) {
      throw handleError(error);
    }
  },

  async updateWorkload(
    _workloadId: string,
    _questionId: string,
    _selectedChoices: string[],
    _notApplicableChoiceIds?: string[],
    _notSelectedChoices?: string[],
    _lensAliasArn?: string,
  ) {
    return {};
  },

  async updateWorkItem(_fileId: string, _updates: any): Promise<void> {},

  async getRiskSummary(_workloadId: string, _lensAliasArn?: string): Promise<RiskSummaryResponse> {
    return { summaries: [], region: 'local' };
  },

  async createMilestone(_workloadId: string, _milestoneName: string) {
    return {};
  },

  async generateReport(_workloadId: string, _lensAliasArn?: string): Promise<string> {
    return '';
  },

  async generateRecommendations(results: AnalysisResult[]): Promise<string> {
    const header = 'Pillar,Question,Best Practice,Relevant,Applied,Recommendations\n';
    const rows = results.flatMap(r =>
      r.bestPractices.map(bp =>
        [r.pillar, r.question, bp.name, bp.relevant, bp.applied, bp.recommendations || ''].map(
          v => `"${String(v).replace(/"/g, '""')}"`
        ).join(',')
      )
    );
    return header + rows.join('\n');
  },

  async createWorkload(_isTemp?: boolean, _lensAliasArn?: string): Promise<string> {
    return 'local-workload';
  },

  async deleteWorkload(_workloadId: string): Promise<void> {},

  async generateIacDocument(
    fileId: string,
    _recommendations: AnalysisResult[],
    templateType: IaCTemplateType,
    _lensAliasArn?: string,
    _lensName?: string,
    _outputLanguage?: string,
  ): Promise<{ content: string; isCancelled: boolean; error?: string }> {
    try {
      const response = await api.post('/analyzer/generate-iac', {
        fileId,
        templateType: templateType.toString(),
      });
      return { content: response.data.template, isCancelled: false };
    } catch (error) {
      return {
        content: '',
        isCancelled: false,
        error: error instanceof Error ? error.message : 'Failed to generate IaC document',
      };
    }
  },

  async getMoreDetails(
    selectedItems: any[],
    fileId: string,
    _templateType?: IaCTemplateType,
    _lensAliasArn?: string,
    _lensName?: string,
    _outputLanguage?: string,
  ): Promise<{ content: string; error?: string }> {
    try {
      const response = await api.post('/analyzer/details', {
        fileId,
        item: selectedItems[0],
      });
      return { content: response.data.response };
    } catch (error) {
      return {
        content: '',
        error: error instanceof Error ? error.message : 'Failed to get detailed analysis',
      };
    }
  },

  async cancelIaCGeneration(): Promise<void> {},

  async storeAnalysisResults(_fileId: string, _results: AnalysisResult[]): Promise<void> {},

  async sendChatMessage(
    fileId: string,
    message: string,
    _lensName?: string,
    _lensAliasArn?: string,
  ): Promise<{ content: string }> {
    try {
      const response = await api.post('/analyzer/chat', {
        fileId,
        message,
      });
      return { content: response.data.response };
    } catch (error) {
      throw handleError(error);
    }
  },

  async listWorkloads(): Promise<any[]> {
    return [];
  },
};
