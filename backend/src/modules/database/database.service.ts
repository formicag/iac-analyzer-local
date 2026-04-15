import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import Database from 'better-sqlite3';
import { AppConfigService } from '../../config/config.service';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private db: Database.Database;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private readonly config: AppConfigService) {}

  onModuleInit() {
    this.db = new Database(this.config.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.createTables();
    this.logger.log(`SQLite database initialized at ${this.config.dbPath}`);
  }

  private createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'local',
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        upload_mode TEXT DEFAULT 'single_file',
        upload_date TEXT NOT NULL,
        last_modified TEXT NOT NULL,
        analysis_status TEXT DEFAULT '{}',
        analysis_progress TEXT DEFAULT '{}',
        analysis_error TEXT DEFAULT '{}',
        has_chat_history INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS analysis_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_item_id TEXT NOT NULL,
        lens_alias TEXT DEFAULT 'wellarchitected',
        results TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_item_id TEXT NOT NULL,
        messages TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
      );
    `);
  }

  getDb(): Database.Database {
    return this.db;
  }

  // Work Items
  createWorkItem(item: {
    id: string;
    fileName: string;
    fileType: string;
    uploadMode?: string;
  }) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO work_items (id, file_name, file_type, upload_mode, upload_date, last_modified)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(item.id, item.fileName, item.fileType, item.uploadMode || 'single_file', now, now);
  }

  getWorkItem(id: string): any {
    const row = this.db.prepare('SELECT * FROM work_items WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      fileName: row.file_name,
      fileType: row.file_type,
      uploadMode: row.upload_mode,
      uploadDate: row.upload_date,
      lastModified: row.last_modified,
      analysisStatus: JSON.parse(row.analysis_status || '{}'),
      analysisProgress: JSON.parse(row.analysis_progress || '{}'),
      analysisError: JSON.parse(row.analysis_error || '{}'),
      hasChatHistory: !!row.has_chat_history,
    };
  }

  getAllWorkItems(): any[] {
    const rows = this.db.prepare('SELECT * FROM work_items ORDER BY last_modified DESC').all() as any[];
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      fileName: row.file_name,
      fileType: row.file_type,
      uploadMode: row.upload_mode,
      uploadDate: row.upload_date,
      lastModified: row.last_modified,
      analysisStatus: JSON.parse(row.analysis_status || '{}'),
      analysisProgress: JSON.parse(row.analysis_progress || '{}'),
      analysisError: JSON.parse(row.analysis_error || '{}'),
      hasChatHistory: !!row.has_chat_history,
    }));
  }

  updateWorkItemAnalysis(id: string, lensAlias: string, status: string, progress?: any, error?: string) {
    const item = this.getWorkItem(id);
    if (!item) return;

    const analysisStatus = { ...item.analysisStatus, [lensAlias]: status };
    const analysisProgress = { ...item.analysisProgress, ...(progress ? { [lensAlias]: progress } : {}) };
    const analysisError = { ...item.analysisError, ...(error ? { [lensAlias]: error } : {}) };

    this.db.prepare(`
      UPDATE work_items SET analysis_status = ?, analysis_progress = ?, analysis_error = ?, last_modified = ?
      WHERE id = ?
    `).run(
      JSON.stringify(analysisStatus),
      JSON.stringify(analysisProgress),
      JSON.stringify(analysisError),
      new Date().toISOString(),
      id,
    );
  }

  deleteWorkItem(id: string) {
    this.db.prepare('DELETE FROM work_items WHERE id = ?').run(id);
  }

  // Analysis Results
  saveAnalysisResults(workItemId: string, lensAlias: string, results: any[]) {
    // Delete existing results for this work item + lens
    this.db.prepare('DELETE FROM analysis_results WHERE work_item_id = ? AND lens_alias = ?')
      .run(workItemId, lensAlias);

    this.db.prepare(`
      INSERT INTO analysis_results (work_item_id, lens_alias, results, created_at)
      VALUES (?, ?, ?, ?)
    `).run(workItemId, lensAlias, JSON.stringify(results), new Date().toISOString());
  }

  getAnalysisResults(workItemId: string, lensAlias: string = 'wellarchitected'): any[] | null {
    const row = this.db.prepare(
      'SELECT results FROM analysis_results WHERE work_item_id = ? AND lens_alias = ?'
    ).get(workItemId, lensAlias) as any;
    return row ? JSON.parse(row.results) : null;
  }

  // Chat History
  saveChatHistory(workItemId: string, messages: any[]) {
    this.db.prepare('DELETE FROM chat_history WHERE work_item_id = ?').run(workItemId);
    this.db.prepare(`
      INSERT INTO chat_history (work_item_id, messages, updated_at)
      VALUES (?, ?, ?)
    `).run(workItemId, JSON.stringify(messages), new Date().toISOString());

    this.db.prepare('UPDATE work_items SET has_chat_history = 1 WHERE id = ?').run(workItemId);
  }

  getChatHistory(workItemId: string): any[] {
    const row = this.db.prepare(
      'SELECT messages FROM chat_history WHERE work_item_id = ?'
    ).get(workItemId) as any;
    return row ? JSON.parse(row.messages) : [];
  }
}
