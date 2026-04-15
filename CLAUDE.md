# IaC Analyzer Local - Developer Guide

## Quick Reference

- **Backend**: NestJS 11 + TypeScript in `backend/`
- **Frontend**: React 19 + Vite + Cloudscape Design System in `frontend/`
- **Build backend**: `cd backend && npx nest build`
- **Build frontend**: `cd frontend && npx vite build`
- **Run dev**: `cd backend && BATCH_SIZE=1 npx nest start`
- **Data**: SQLite at `~/.iac-analyzer/data.db`, uploads at `~/.iac-analyzer/uploads/`

## Key Design Decisions

- Single NestJS process serves React static build + API + WebSocket on one dynamic port
- No auth — local tool only. CORS restricted to localhost origins.
- ChromaDB replaced with file-based vector store (JSON + cosine similarity) to avoid requiring a separate server
- Ollama replaces Bedrock — all LLM calls go through `OllamaService` via HTTP to localhost:11434
- Best practices JSON (308 entries, 57KB) bundled in `data/` and loaded at startup
- Prompts ported verbatim from AWS original with Gemma 4 optimization (JSON formatting reminder, lower temperature)
- `BATCH_SIZE=1` recommended for local inference to avoid Ollama contention

## Architecture

```
Request → NestJS → AnalyzerService → OllamaService → Ollama (Gemma 4)
                  → StorageService → SQLite + filesystem
                  → KnowledgeBaseService → vectors.json (cosine similarity)
                  → AnalyzerGateway → Socket.io → Browser
```

## Security Notes

- File uploads validated: 50MB max, allowed extensions only, filenames sanitized
- File IDs are hex-validated (16 char SHA256 prefix)
- SQLite uses parameterized queries throughout
- Content-Disposition headers sanitized
- CORS restricted to localhost only
- No `dangerouslySetInnerHTML` in frontend
