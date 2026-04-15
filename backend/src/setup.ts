/**
 * Setup script: Downloads WAFR whitepapers, chunks text, and embeds into ChromaDB.
 * Run once before first use: npx ts-node src/setup.ts
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// WAFR whitepaper URLs (public AWS documentation PDFs)
const WAFR_PDFS = [
  { name: 'wellarchitected-framework', url: 'https://docs.aws.amazon.com/pdfs/wellarchitected/latest/framework/wellarchitected-framework.pdf' },
  { name: 'security-pillar', url: 'https://docs.aws.amazon.com/pdfs/wellarchitected/latest/security-pillar/wellarchitected-security-pillar.pdf' },
  { name: 'reliability-pillar', url: 'https://docs.aws.amazon.com/pdfs/wellarchitected/latest/reliability-pillar/wellarchitected-reliability-pillar.pdf' },
  { name: 'performance-pillar', url: 'https://docs.aws.amazon.com/pdfs/wellarchitected/latest/performance-efficiency-pillar/wellarchitected-performance-efficiency-pillar.pdf' },
  { name: 'cost-optimization-pillar', url: 'https://docs.aws.amazon.com/pdfs/wellarchitected/latest/cost-optimization-pillar/wellarchitected-cost-optimization-pillar.pdf' },
  { name: 'operational-excellence-pillar', url: 'https://docs.aws.amazon.com/pdfs/wellarchitected/latest/operational-excellence-pillar/wellarchitected-operational-excellence-pillar.pdf' },
  { name: 'sustainability-pillar', url: 'https://docs.aws.amazon.com/pdfs/wellarchitected/latest/sustainability-pillar/wellarchitected-sustainability-pillar.pdf' },
];

// Map PDF names to pillar names for metadata
const PILLAR_MAP: Record<string, string> = {
  'wellarchitected-framework': 'General',
  'security-pillar': 'Security',
  'reliability-pillar': 'Reliability',
  'performance-pillar': 'Performance Efficiency',
  'cost-optimization-pillar': 'Cost Optimization',
  'operational-excellence-pillar': 'Operational Excellence',
  'sustainability-pillar': 'Sustainability',
};

const DATA_DIR = process.env.DATA_DIR || join(homedir(), '.iac-analyzer');
const PDF_DIR = join(DATA_DIR, 'wafr-docs', 'pdfs');
const CHUNKS_DIR = join(DATA_DIR, 'wafr-docs', 'chunks');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

function chunkText(text: string, chunkSize: number = 800, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.substring(start, end).trim();
    if (chunk.length > 50) { // Skip very small chunks
      chunks.push(chunk);
    }
    start = end - overlap;
  }

  return chunks;
}

async function downloadPdfs() {
  mkdirSync(PDF_DIR, { recursive: true });

  for (const pdf of WAFR_PDFS) {
    const pdfPath = join(PDF_DIR, `${pdf.name}.pdf`);
    if (existsSync(pdfPath)) {
      console.log(`  Already downloaded: ${pdf.name}`);
      continue;
    }

    console.log(`  Downloading: ${pdf.name}...`);
    try {
      const response = await fetch(pdf.url, {
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        console.warn(`  Warning: Failed to download ${pdf.name} (${response.status})`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(pdfPath, buffer);
      console.log(`  Downloaded: ${pdf.name} (${(buffer.length / 1024).toFixed(0)}KB)`);
    } catch (error: any) {
      console.warn(`  Warning: Failed to download ${pdf.name}: ${error.message}`);
    }
  }
}

async function extractAndChunkPdfs() {
  mkdirSync(CHUNKS_DIR, { recursive: true });

  const chunksFile = join(CHUNKS_DIR, 'all_chunks.json');
  if (existsSync(chunksFile)) {
    console.log('  Chunks already extracted');
    return JSON.parse(readFileSync(chunksFile, 'utf-8'));
  }

  // Dynamic import pdf-parse (CommonJS)
  const pdfParse = (await import('pdf-parse')).default;

  const allChunks: Array<{ id: string; text: string; metadata: { pillar: string; source: string; chunkIndex: number } }> = [];
  let chunkId = 0;

  for (const pdf of WAFR_PDFS) {
    const pdfPath = join(PDF_DIR, `${pdf.name}.pdf`);
    if (!existsSync(pdfPath)) {
      console.log(`  Skipping ${pdf.name} (not downloaded)`);
      continue;
    }

    console.log(`  Extracting text from: ${pdf.name}...`);
    try {
      const dataBuffer = readFileSync(pdfPath);
      const data = await pdfParse(dataBuffer);
      const text = data.text;

      const chunks = chunkText(text);
      const pillar = PILLAR_MAP[pdf.name] || 'General';

      for (let i = 0; i < chunks.length; i++) {
        allChunks.push({
          id: `chunk_${chunkId++}`,
          text: chunks[i],
          metadata: {
            pillar,
            source: pdf.name,
            chunkIndex: i,
          },
        });
      }

      console.log(`  Extracted ${chunks.length} chunks from ${pdf.name}`);
    } catch (error: any) {
      console.warn(`  Warning: Failed to extract ${pdf.name}: ${error.message}`);
    }
  }

  writeFileSync(chunksFile, JSON.stringify(allChunks));
  console.log(`  Total chunks: ${allChunks.length}`);
  return allChunks;
}

async function embedChunks(chunks: Array<{ id: string; text: string; metadata: any }>) {
  const VECTOR_DIR = join(DATA_DIR, 'chromadb');
  mkdirSync(VECTOR_DIR, { recursive: true });

  const vectorsPath = join(VECTOR_DIR, 'vectors.json');
  if (existsSync(vectorsPath)) {
    console.log('  Vectors already embedded');
    return;
  }

  console.log(`  Embedding ${chunks.length} chunks...`);

  const documents: Array<{ id: string; text: string; embedding: number[]; metadata: any }> = [];

  // Embed in batches
  const batchSize = 10;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.text);

    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      throw new Error(`Embedding failed: ${await res.text()}`);
    }

    const data = await res.json() as { embeddings: number[][] };

    for (let j = 0; j < batch.length; j++) {
      documents.push({
        id: batch[j].id,
        text: batch[j].text,
        embedding: data.embeddings[j],
        metadata: batch[j].metadata,
      });
    }

    const progress = Math.min(100, Math.round(((i + batch.length) / chunks.length) * 100));
    process.stdout.write(`\r  Progress: ${progress}% (${i + batch.length}/${chunks.length})`);
  }

  console.log('');
  writeFileSync(vectorsPath, JSON.stringify(documents));
  console.log(`  Saved ${documents.length} embedded vectors to disk`);
}

async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) throw new Error('Ollama not responding');

    const data = await res.json() as { models: Array<{ name: string }> };
    const models = data.models.map((m: any) => m.name);

    console.log('  Ollama is running');
    console.log(`  Available models: ${models.join(', ')}`);

    const mainModel = process.env.OLLAMA_MODEL || 'gemma4';
    const hasMainModel = models.some((m: string) => m.startsWith(mainModel));
    const hasEmbedModel = models.some((m: string) => m.startsWith(EMBED_MODEL));

    if (!hasMainModel) {
      console.log(`\n  WARNING: Model '${mainModel}' not found. Pull it with:`);
      console.log(`  ollama pull ${mainModel}`);
    }
    if (!hasEmbedModel) {
      console.log(`\n  WARNING: Embedding model '${EMBED_MODEL}' not found. Pull it with:`);
      console.log(`  ollama pull ${EMBED_MODEL}`);
    }

    return hasMainModel && hasEmbedModel;
  } catch {
    console.error('  ERROR: Ollama is not running. Start it with: ollama serve');
    return false;
  }
}

async function main() {
  console.log('\n=== IaC Analyzer Local Setup ===\n');

  console.log('1. Checking Ollama...');
  const ollamaReady = await checkOllama();

  if (!ollamaReady) {
    console.log('\n  Please ensure Ollama is running with required models before setup.');
    console.log('  Required models: gemma4, nomic-embed-text');
    console.log('  Run: ollama pull gemma4 && ollama pull nomic-embed-text\n');
    process.exit(1);
  }

  console.log('\n2. Downloading WAFR whitepapers...');
  await downloadPdfs();

  console.log('\n3. Extracting and chunking PDFs...');
  const chunks = await extractAndChunkPdfs();

  if (chunks && chunks.length > 0) {
    console.log('\n4. Embedding chunks into ChromaDB...');
    await embedChunks(chunks);
  } else {
    console.log('\n4. No chunks to embed (PDFs may not have downloaded)');
    console.log('  The app will still work but without WAFR knowledge base context.');
  }

  console.log('\n=== Setup Complete! ===');
  console.log('\nRun the app with: npm start\n');
}

main().catch(error => {
  console.error('Setup failed:', error);
  process.exit(1);
});
