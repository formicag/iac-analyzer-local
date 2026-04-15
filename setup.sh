#!/bin/bash
set -e

echo ""
echo "========================================="
echo "  IaC Analyzer Local - Setup"
echo "========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed."
  echo "Install it from https://nodejs.org/ (v18+)"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js v18+ required (found v$NODE_VERSION)"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# Check Ollama
if ! command -v ollama &> /dev/null; then
  echo ""
  echo "ERROR: Ollama is not installed."
  echo "Install it from https://ollama.com/download"
  exit 1
fi
echo "✓ Ollama installed"

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo ""
  echo "Starting Ollama..."
  ollama serve &
  sleep 3
fi
echo "✓ Ollama is running"

# Check required models
OLLAMA_MODEL=${OLLAMA_MODEL:-gemma4}
EMBED_MODEL=${OLLAMA_EMBED_MODEL:-nomic-embed-text}

if ! ollama list | grep -q "$OLLAMA_MODEL"; then
  echo ""
  echo "Pulling $OLLAMA_MODEL model (this may take a few minutes)..."
  ollama pull "$OLLAMA_MODEL"
fi
echo "✓ Model: $OLLAMA_MODEL"

if ! ollama list | grep -q "$EMBED_MODEL"; then
  echo ""
  echo "Pulling $EMBED_MODEL model..."
  ollama pull "$EMBED_MODEL"
fi
echo "✓ Embedding model: $EMBED_MODEL"

# Install dependencies
echo ""
echo "Installing dependencies..."
cd "$(dirname "$0")"

cd backend && npm install --silent && cd ..
cd frontend && npm install --silent && cd ..
echo "✓ Dependencies installed"

# Build frontend
echo ""
echo "Building frontend..."
cd frontend && npx vite build --silent 2>/dev/null || npx vite build && cd ..
echo "✓ Frontend built"

# Build backend
echo ""
echo "Building backend..."
cd backend && npx nest build && cd ..
echo "✓ Backend built"

# Run setup (download PDFs, embed into ChromaDB)
echo ""
echo "Setting up knowledge base..."
cd backend && node dist/setup.js && cd ..

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "  Start the app:  npm start"
echo "  Or:              cd backend && npm start"
echo ""
