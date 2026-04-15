import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as net from 'net';

async function findAvailablePort(startPort = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // Port in use, try next
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS: only allow localhost origins
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
  });

  // API prefix
  app.setGlobalPrefix('api', {
    exclude: ['/'],
  });

  // Serve static frontend build
  const frontendPath = join(__dirname, '..', '..', 'frontend', 'dist');
  app.useStaticAssets(frontendPath);

  // SPA fallback - serve index.html for any non-API route
  app.use((req: any, res: any, next: any) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      res.sendFile(join(frontendPath, 'index.html'), (err: any) => {
        if (err) next();
      });
    } else {
      next();
    }
  });

  const port = await findAvailablePort(
    parseInt(process.env.PORT || '3000', 10),
  );
  await app.listen(port);

  console.log(`\n  IaC Analyzer Local is running at:\n`);
  console.log(`  http://localhost:${port}\n`);

  // Auto-open browser (non-blocking)
  try {
    const open = (await import('open')).default;
    await open(`http://localhost:${port}`);
  } catch {
    // Ignore if open fails
  }
}

bootstrap();
