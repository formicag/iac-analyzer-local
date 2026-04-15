# Well-Architected IaC Analyzer - Local Edition

A fully local version of the [AWS Well-Architected IaC Analyzer](https://github.com/aws-samples/well-architected-iac-analyzer) that runs entirely on your Mac using Ollama. No AWS account required.

Upload your Terraform, CloudFormation, or CDK templates and get a full Well-Architected Framework Review with best practice analysis across all 6 pillars.

## Prerequisites

- **Node.js** v18+
- **Ollama** ([install](https://ollama.com/download))

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/formicag/iac-analyzer-local.git
cd iac-analyzer-local

# 2. Pull required Ollama models
ollama pull gemma4
ollama pull nomic-embed-text

# 3. Run setup (installs deps, builds, downloads WAFR docs)
./setup.sh

# 4. Start the app
npm start
```

The app opens automatically in your browser.

## What It Does

- **IaC Analysis**: Upload CloudFormation, Terraform, or CDK templates for automated WAFR review
- **6 Pillar Coverage**: Security, Reliability, Performance Efficiency, Cost Optimization, Operational Excellence, Sustainability
- **308 Best Practices**: Evaluates against the full Well-Architected best practices catalog
- **RAG-Enhanced**: Uses embedded WAFR whitepapers for context-aware analysis
- **Interactive Chat**: Ask follow-up questions about your analysis results
- **IaC Generation**: Generate improved templates based on recommendations
- **CSV Export**: Export analysis results for reporting
- **Architecture Diagrams**: Upload PNG/JPEG architecture diagrams for review
- **Multi-file Support**: Analyze ZIP archives or multiple files at once

## Architecture

Single NestJS process serving everything on one dynamically-assigned port:

| Component | Implementation |
|---|---|
| LLM | Ollama + Gemma 4 |
| Embeddings | Ollama + nomic-embed-text |
| Knowledge Base | File-based vector store with cosine similarity |
| Database | SQLite (better-sqlite3) |
| File Storage | Local filesystem (`~/.iac-analyzer/`) |
| Frontend | React + Cloudscape Design System |
| Real-time | Socket.io WebSocket |

## Configuration

Set environment variables before starting:

```bash
OLLAMA_URL=http://localhost:11434   # Ollama server URL
OLLAMA_MODEL=gemma4                  # LLM model
OLLAMA_EMBED_MODEL=nomic-embed-text  # Embedding model
PORT=3000                            # Starting port (auto-increments if busy)
BATCH_SIZE=3                         # Parallel analysis questions
```

## Data Storage

All data is stored locally in `~/.iac-analyzer/`:

```
~/.iac-analyzer/
├── data.db          # SQLite database
├── uploads/         # Uploaded files
├── chromadb/        # Vector embeddings
└── wafr-docs/       # Downloaded WAFR whitepapers
```

## License

Based on [aws-samples/well-architected-iac-analyzer](https://github.com/aws-samples/well-architected-iac-analyzer) (MIT-0 License).
