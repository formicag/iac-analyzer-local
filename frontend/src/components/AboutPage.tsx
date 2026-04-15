import {
  Container,
  Header,
  SpaceBetween,
  Box,
  ColumnLayout,
  Table,
  Link,
  Button,
  ContentLayout,
  Alert,
} from '@cloudscape-design/components';

interface AboutPageProps {
  onClose: () => void;
}

export function AboutPage({ onClose }: AboutPageProps) {
  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="A Colibri Digital refactored version of the AWS Well-Architected IaC Analyzer"
          actions={<Button onClick={onClose}>Back to Analyzer</Button>}
        >
          About IaC Analyzer Local
        </Header>
      }
    >
      <SpaceBetween size="l">
        {/* What it does */}
        <Container header={<Header variant="h2">What This App Does</Header>}>
          <SpaceBetween size="s">
            <Box>
              This tool performs automated <strong>Well-Architected Framework Reviews (WAFR)</strong> on your
              Infrastructure as Code templates. Upload your Terraform, CloudFormation, or CDK files and get
              an instant analysis against AWS's 308 best practices across all 6 pillars.
            </Box>
            <Box>
              Everything runs <strong>100% locally on your Mac</strong>. No AWS account needed.
              No data leaves your machine. The analysis is powered by Ollama running Gemma 4 locally.
            </Box>
          </SpaceBetween>
        </Container>

        {/* How to use */}
        <Container header={<Header variant="h2">How to Use</Header>}>
          <SpaceBetween size="s">
            <Box variant="h4">1. Upload your IaC file</Box>
            <Box>
              Click the upload area and select a Terraform (.tf), CloudFormation (.yaml/.json),
              or CDK file. You can also upload ZIP archives with multiple files, architecture
              diagrams (PNG/JPEG), or PDF documentation.
            </Box>
            <Box variant="h4">2. Select pillars to review</Box>
            <Box>
              Choose which Well-Architected pillars to evaluate: Security, Reliability, Performance
              Efficiency, Cost Optimization, Operational Excellence, and/or Sustainability.
              Selecting fewer pillars makes the analysis faster.
            </Box>
            <Box variant="h4">3. Run analysis</Box>
            <Box>
              Click Analyze. The app sends each WAFR question to Gemma 4 with your IaC file
              and the relevant best practices. Progress is shown in real-time via WebSocket.
              Analysis typically takes 2-4 minutes per pillar.
            </Box>
            <Box variant="h4">4. Review results</Box>
            <Box>
              Results show which best practices are applied, which are not, and specific
              recommendations for improvement. Use the Chat feature to ask follow-up questions
              about the analysis. Export results as CSV for reporting.
            </Box>
          </SpaceBetween>
        </Container>

        {/* Architecture comparison */}
        <Container header={<Header variant="h2">Architecture: AWS vs Local</Header>}>
          <SpaceBetween size="m">
            <Box>
              This app is a complete rewrite of the{' '}
              <Link
                href="https://github.com/aws-samples/well-architected-iac-analyzer"
                external
              >
                aws-samples/well-architected-iac-analyzer
              </Link>{' '}
              by Colibri Digital. Every AWS service dependency has been replaced with a local
              equivalent that runs on your machine with zero cloud costs.
            </Box>
            <Table
              columnDefinitions={[
                { id: 'component', header: 'Component', cell: (item: any) => <strong>{item.component}</strong> },
                { id: 'aws', header: 'AWS Original', cell: (item: any) => item.aws },
                { id: 'local', header: 'Our Local Version', cell: (item: any) => item.local },
                { id: 'why', header: 'Why We Chose This', cell: (item: any) => item.why },
              ]}
              items={[
                {
                  component: 'LLM',
                  aws: 'Amazon Bedrock (Claude)',
                  local: 'Ollama + Gemma 4',
                  why: 'Free, runs locally, no API key needed. Gemma 4 (12B) provides strong reasoning for IaC analysis.',
                },
                {
                  component: 'Embeddings',
                  aws: 'Amazon Titan Embeddings (1024d)',
                  local: 'Ollama + nomic-embed-text (768d)',
                  why: 'Best open-source embedding model for its size. Fast local inference, good retrieval quality.',
                },
                {
                  component: 'Knowledge Base',
                  aws: 'Bedrock Knowledge Base + S3 Vectors',
                  local: 'File-based vector store (JSON)',
                  why: 'Zero dependencies. Cosine similarity search over ~2000 WAFR document chunks. No external server needed.',
                },
                {
                  component: 'Database',
                  aws: 'Amazon DynamoDB',
                  local: 'SQLite (better-sqlite3)',
                  why: 'Single file, zero config, no server. Perfect for local-only apps. WAL mode for concurrent reads.',
                },
                {
                  component: 'File Storage',
                  aws: 'Amazon S3',
                  local: 'Local filesystem (~/.iac-analyzer/)',
                  why: 'Simple, fast, no network latency. Files stay on your machine.',
                },
                {
                  component: 'Authentication',
                  aws: 'Amazon Cognito / OIDC',
                  local: 'Removed',
                  why: 'Not needed for a local tool. Removes complexity and login friction.',
                },
                {
                  component: 'Hosting',
                  aws: 'ECS Fargate + ALB + Nginx (3 containers)',
                  local: 'Single NestJS process',
                  why: 'One process serves the React UI, API, and WebSocket on a single dynamic port. No Docker required.',
                },
                {
                  component: 'Real-time Updates',
                  aws: 'Socket.io via ALB',
                  local: 'Socket.io (same process)',
                  why: 'Identical protocol, simpler routing. Progress updates stream directly to the browser.',
                },
                {
                  component: 'WAFR Best Practices',
                  aws: 'DynamoDB table + Well-Architected API',
                  local: 'Bundled JSON file (57KB)',
                  why: '308 best practices, 57 questions, 6 pillars. Injected directly into prompts — no API call needed.',
                },
              ]}
              variant="container"
            />
          </SpaceBetween>
        </Container>

        {/* Technical details */}
        <Container header={<Header variant="h2">Technical Details</Header>}>
          <ColumnLayout columns={2}>
            <SpaceBetween size="s">
              <Box variant="h4">Frontend</Box>
              <Box>React 19 + TypeScript + Vite</Box>
              <Box>AWS Cloudscape Design System 3.0</Box>
              <Box>Socket.io for real-time progress</Box>
            </SpaceBetween>
            <SpaceBetween size="s">
              <Box variant="h4">Backend</Box>
              <Box>NestJS 11 + TypeScript</Box>
              <Box>SQLite via better-sqlite3</Box>
              <Box>Ollama HTTP API integration</Box>
            </SpaceBetween>
          </ColumnLayout>
        </Container>

        {/* Credits */}
        <Container header={<Header variant="h2">Credits</Header>}>
          <SpaceBetween size="s">
            <Box>
              Refactored by <strong>Colibri Digital</strong> from the original{' '}
              <Link
                href="https://github.com/aws-samples/well-architected-iac-analyzer"
                external
              >
                AWS Samples project
              </Link>{' '}
              (MIT-0 License).
            </Box>
            <Box>
              Source code:{' '}
              <Link
                href="https://github.com/formicag/iac-analyzer-local"
                external
              >
                github.com/formicag/iac-analyzer-local
              </Link>
            </Box>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
