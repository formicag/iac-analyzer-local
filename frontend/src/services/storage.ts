import { WorkItem, WorkItemResponse } from '../types';
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/storage',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const storageApi = {
  async uploadSupportingDocument(formData: FormData): Promise<{ fileId: string }> {
    try {
      const fileId = formData.get('fileId') as string;
      const response = await api.post(`/supporting-document/${fileId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to upload supporting document');
    }
  },

  async downloadSupportingDocument(_fileId: string, _mainFileId: string, _fileName: string, _lensAlias?: string): Promise<void> {
    // Simplified for local mode
  },

  async uploadFiles(formData: FormData): Promise<{ fileId: string; tokenCount?: number; exceedsTokenLimit?: boolean }> {
    try {
      // Check if it's a single file or multiple
      const files = formData.getAll('files');
      if (files.length === 1) {
        // Single file upload
        const singleFormData = new FormData();
        singleFormData.append('file', files[0]);
        const response = await api.post('/upload', singleFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return { fileId: response.data.fileId };
      } else {
        // Multiple files
        const response = await api.post('/upload-multiple', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return { fileId: response.data.fileId };
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to upload files');
    }
  },

  async listWorkItems(): Promise<WorkItem[]> {
    try {
      const response = await api.get('/files');
      // Map our backend format to frontend WorkItem format
      return response.data.map((item: any) => ({
        userId: item.userId || 'local',
        fileId: item.id,
        fileName: item.fileName,
        fileType: item.fileType,
        uploadDate: item.uploadDate,
        s3Prefix: '',
        lastModified: item.lastModified,
        uploadMode: item.uploadMode,
        hasChatHistory: item.hasChatHistory,
        analysisStatus: item.analysisStatus || {},
        analysisProgress: item.analysisProgress || {},
        analysisError: item.analysisError || {},
      }));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to list work items');
    }
  },

  async getWorkItem(fileId: string, _lensAliasArn?: string): Promise<WorkItemResponse> {
    try {
      const response = await api.get(`/files/${fileId}`);
      const item = response.data;
      return {
        workItem: {
          userId: item.userId || 'local',
          fileId: item.id,
          fileName: item.fileName,
          fileType: item.fileType,
          uploadDate: item.uploadDate,
          s3Prefix: '',
          lastModified: item.lastModified,
          uploadMode: item.uploadMode,
          hasChatHistory: item.hasChatHistory,
          analysisStatus: item.analysisStatus || {},
          analysisProgress: item.analysisProgress || {},
          analysisError: item.analysisError || {},
        },
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get work item');
    }
  },

  async deleteWorkItem(fileId: string): Promise<void> {
    try {
      await api.delete(`/files/${fileId}`);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete work item');
    }
  },

  async downloadOriginalContent(fileId: string, fileName: string): Promise<void> {
    try {
      const response = await api.get(`/download/${fileId}`, { responseType: 'arraybuffer' });
      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to download content');
    }
  },

  async getChatHistory(_fileId: string): Promise<any[]> {
    return [];
  },

  async storeChatHistory(_fileId: string, _messages: any[]): Promise<void> {},

  async downloadChatHistory(_fileId: string, _fileName: string): Promise<void> {},

  async deleteChatHistory(_fileId: string): Promise<void> {},

  async getAnalysisResults(fileId: string, _lensAlias: string): Promise<any> {
    try {
      const response = await api.get(`/files/${fileId}`);
      return response.data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get analysis results');
    }
  },

  async getIaCDocument(_fileId: string, _extension: string, _lensAlias: string): Promise<string> {
    return '';
  }
};
