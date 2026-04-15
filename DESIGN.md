# Well-Architected IaC Analyzer - Local Edition

## Design Specification

### Overview

A fully local version of the AWS Well-Architected IaC Analyzer that runs on Mac without any AWS account. Replaces all AWS services with local equivalents while preserving the full Cloudscape web UI and analysis functionality.

### Architecture

```
Single NestJS Process (dynamic port)
├── Static file server (built React frontend)
├── REST API (/api/*)
├── WebSocket gateway (socket.io, same port)
├── SQLite database (~/.iac-analyzer/data.db)
├── Local filesystem (~/.iac-analyzer/uploads/)
└── ChromaDB client (embedded, ~/.iac-analyzer/chromadb/)

External dependency: Ollama (user's existing install)
  └── Model: gemma4 (or gemma4 when available)
  └── Embeddings: nomic-embed-text
```

### Component Replacement Map

| AWS Service | Local Replacement | Implementation |
|---|---|---|
| Bedrock (Claude) | Ollama + Gemma | HTTP calls to localhost:11434/api/chat |
| Bedrock KB + S3 Vectors | ChromaDB (embedded) | chromadb npm package, persistent storage |
| Bedrock embeddings (Titan) | Ollama nomic-embed-text | localhost:11434/api/embed |
| DynamoDB | SQLite | better-sqlite3, single file |
| S3 | Local filesystem | Node.js fs, ~/.iac-analyzer/uploads/ |
| Cognito/OIDC | Removed | No auth needed |
| ECS Fargate + ALB | Single NestJS process | Serves everything on one dynamic port |
| Well-Architected API | Deferred (stretch goal) | Optional AWS credential entry |

### Data Model (SQLite)

```sql
-- Work items (replaces DynamoDB)
CREATE TABLE work_items (
  id TEXT PRIMARY KEY,           -- SHA256 of file content
  user_id TEXT DEFAULT 'local',  -- Always 'local' (no auth)
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  upload_mode TEXT DEFAULT 'single_file',
  upload_date TEXT NOT NULL,
  last_modified TEXT NOT NULL,
  analysis_status TEXT DEFAULT '{}',   -- JSON: {lensAlias: status}
  analysis_progress TEXT DEFAULT '{}', -- JSON: {lensAlias: {processed, total}}
  analysis_error TEXT DEFAULT '{}',    -- JSON: {lensAlias: error}
  has_chat_history INTEGER DEFAULT 0
);

-- Analysis results (replaces S3 JSON files)
CREATE TABLE analysis_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id TEXT NOT NULL,
  lens_alias TEXT DEFAULT 'wellarchitected',
  results TEXT NOT NULL,          -- JSON array of AnalysisResult
  created_at TEXT NOT NULL,
  FOREIGN KEY (work_item_id) REFERENCES work_items(id)
);

-- Chat history
CREATE TABLE chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id TEXT NOT NULL,
  messages TEXT NOT NULL,          -- JSON array of chat messages
  updated_at TEXT NOT NULL,
  FOREIGN KEY (work_item_id) REFERENCES work_items(id)
);
```

### File Storage Layout

```
~/.iac-analyzer/
├── data.db                        -- SQLite database
├── chromadb/                      -- ChromaDB persistent store
├── uploads/                       -- Uploaded files
│   └── {fileId}/
│       ├── original               -- Original uploaded file
│       ├── packed                  -- Packed content (for ZIPs)
│       └── supporting/            -- Supporting documents
│           └── {docId}
└── wafr-docs/                     -- Downloaded WAFR whitepapers
    ├── pdfs/                      -- Raw PDFs
    └── chunks/                    -- Pre-processed chunks (JSON)
```

### RAG Pipeline

1. **Setup phase** (first run via setup.sh):
   - Download 22 WAFR pillar whitepapers from AWS (public URLs)
   - Extract text from PDFs using pdf-parse
   - Chunk text: parent=2000 chars, child=800 chars, overlap=60 chars
   - Generate embeddings via Ollama nomic-embed-text (768d)
   - Store in ChromaDB with metadata (pillar, source, page)

2. **Query phase** (during analysis):
   - For each WAFR question + best practices, build query
   - Embed query via nomic-embed-text
   - Search ChromaDB for top-k relevant chunks (k=5)
   - Format as knowledge base context for the analysis prompt

### Best Practices Data

The `wellarchitected_best_practices.json` file (57KB, 308 practices) is bundled directly. During analysis:
- Filter by selected pillars
- Group by question
- Inject into prompts as `<best_practices_json>`

### LLM Integration (Ollama)

All calls go through a single `OllamaService`:

```typescript
class OllamaService {
  // Chat completion (replaces Bedrock ConverseCommand)
  async chat(systemPrompt: string, messages: Message[], options?: ChatOptions): Promise<string>
  
  // Embeddings (replaces Titan embeddings)
  async embed(text: string): Promise<number[]>
  
  // Health check
  async isAvailable(): Promise<boolean>
  
  // List available models
  async listModels(): Promise<string[]>
}
```

- Model: gemma4 (27b or 12b depending on user's hardware)
- Temperature: 0.7
- Context window: 32k tokens
- Embeddings: nomic-embed-text (768 dimensions)

### API Endpoints

Preserved from original (minus auth/WAFR):

```
POST   /api/storage/upload          -- Upload IaC file
POST   /api/storage/upload-multiple -- Upload multiple files
GET    /api/storage/files           -- List work items
GET    /api/storage/files/:id       -- Get work item
DELETE /api/storage/files/:id       -- Delete work item
GET    /api/storage/download/:id    -- Download file

POST   /api/analyzer/analyze        -- Start analysis
POST   /api/analyzer/cancel         -- Cancel analysis
POST   /api/analyzer/chat           -- Chat with results
POST   /api/analyzer/details        -- Get detailed analysis
POST   /api/analyzer/generate-iac   -- Generate IaC template

GET    /api/analyzer/export-csv/:id -- Export results as CSV

GET    /api/health                  -- Health check
GET    /api/config                  -- App configuration

WebSocket: /socket.io/
  Events: analysisProgress, implementationProgress, error
```

### Frontend Modifications

- Remove AuthContext, UserMenu, login flows
- Remove WAFR workload management UI (deferred)
- Remove lens selector (hardcode wellarchitected lens)
- Update API service to use dynamic base URL (same origin)
- Keep all Cloudscape components, analysis UI, chat, file upload
- Add "Settings" panel for Ollama URL configuration
- Show Ollama connection status in header

### Dynamic Port Strategy

```typescript
// Server startup
const server = app.listen(0); // OS picks available port
const port = server.address().port;
console.log(`Server running at http://localhost:${port}`);
// Open browser automatically
```

### Setup Script (setup.sh)

```bash
#!/bin/bash
# 1. Check prerequisites (node, ollama)
# 2. Check Ollama models (gemma4, nomic-embed-text)
# 3. npm install
# 4. Download WAFR PDFs (if not already downloaded)
# 5. Chunk and embed PDFs into ChromaDB (if not already done)
# 6. Build frontend
# 7. Start server (dynamic port, open browser)
```

### Error Handling

- Ollama not running: Clear error message with install instructions
- Model not pulled: Prompt to pull required models
- Port conflicts: Automatic dynamic port selection
- Large files: Same limits as original (500MB extract, 20MB single file)
- LLM timeout: 120s timeout with retry (no exponential backoff needed locally)
