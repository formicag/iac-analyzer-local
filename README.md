# IaC Analyzer Local

**By [Colibri Digital](https://github.com/formicag)** — A fully local refactored version of the [AWS Well-Architected IaC Analyzer](https://github.com/aws-samples/well-architected-iac-analyzer).

Upload your Terraform, CloudFormation, or CDK templates and get automated Well-Architected Framework Reviews across all 6 pillars — entirely on your Mac, with no AWS account required.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/formicag/iac-analyzer-local.git
cd iac-analyzer-local

# 2. Pull models
ollama pull gemma4
ollama pull nomic-embed-text

# 3. Setup (installs deps, builds, downloads WAFR docs)
./setup.sh

# 4. Start
npm start
```

The app opens in your browser automatically.

## Prerequisites

- **Node.js** v18+ ([install](https://nodejs.org/))
- **Ollama** ([install](https://ollama.com/download))

## What It Does

- **WAFR Review**: Evaluates IaC templates against 308 AWS Well-Architected best practices
- **6 Pillars**: Security, Reliability, Performance Efficiency, Cost Optimization, Operational Excellence, Sustainability
- **Multiple Formats**: Terraform (.tf), CloudFormation (.yaml/.json), CDK, architecture diagrams (PNG/JPEG), PDFs, ZIP archives
- **RAG-Enhanced**: Embeds WAFR whitepapers into a local vector store for context-aware analysis
- **Interactive Chat**: Ask follow-up questions about your results
- **IaC Generation**: Get improved templates based on recommendations
- **CSV Export**: Export results for reporting
- **100% Local**: No data leaves your machine

## Architecture

This is a complete rewrite of the AWS version. Every cloud service replaced with a local equivalent:

| Component | AWS Original | Our Local Version |
|---|---|---|
| LLM | Bedrock (Claude) | Ollama + Gemma 4 |
| Embeddings | Titan (1024d) | nomic-embed-text (768d) |
| Knowledge Base | Bedrock KB + S3 Vectors | File-based vector store |
| Database | DynamoDB | SQLite |
| File Storage | S3 | Local filesystem |
| Auth | Cognito/OIDC | Removed |
| Hosting | ECS Fargate + ALB (3 containers) | Single NestJS process |

See the **About** page in the app for detailed rationale behind each choice.

## Configuration

```bash
OLLAMA_URL=http://localhost:11434   # Ollama server
OLLAMA_MODEL=gemma4                  # LLM model
OLLAMA_EMBED_MODEL=nomic-embed-text  # Embedding model
PORT=3000                            # Starting port (auto-increments)
BATCH_SIZE=1                         # Questions analyzed in parallel
```

## Project Structure

```
├── backend/              # NestJS API + WebSocket server
│   └── src/
│       ├── modules/
│       │   ├── analyzer/     # Core WAFR analysis engine
│       │   ├── storage/      # File upload + SQLite persistence
│       │   ├── ollama/       # Ollama LLM integration
│       │   ├── knowledge-base/ # Vector store for WAFR docs
│       │   └── database/     # SQLite service
│       └── prompts/          # LLM prompt templates
├── frontend/             # React + Cloudscape Design System
│   └── src/
│       ├── components/       # UI components
│       ├── services/         # API + WebSocket clients
│       └── hooks/            # Analysis state management
├── data/                 # WAFR best practices (308 practices)
├── test-fixtures/        # Sample IaC files for testing
├── setup.sh              # One-command installer
└── DESIGN.md             # Architecture specification
```

## Data Storage

All data lives in `~/.iac-analyzer/`:

```
~/.iac-analyzer/
├── data.db        # SQLite database
├── uploads/       # Uploaded files
├── chromadb/      # Vector embeddings (vectors.json)
└── wafr-docs/     # Downloaded WAFR whitepapers
```

## Test Fixtures

The `test-fixtures/` directory contains sample Terraform files with intentional issues:

- `sample-terraform.tf` — Basic infra with obvious security issues (open SSH, hardcoded passwords)
- `sample-cloudformation.yaml` — CloudFormation with similar security gaps
- `ecommerce-platform.tf` — E-commerce setup with subtle issues across all 6 pillars
- `data-pipeline.tf` — Analytics pipeline testing Cost/Sustainability/OpEx
- `microservices-cluster.tf` — ECS cluster testing Reliability/Performance/OpEx

## License

Based on [aws-samples/well-architected-iac-analyzer](https://github.com/aws-samples/well-architected-iac-analyzer) (MIT-0 License).
