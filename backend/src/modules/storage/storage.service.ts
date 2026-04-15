import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.service';
import { DatabaseService } from '../database/database.service';
import { createHash } from 'crypto';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmSync } from 'fs';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly db: DatabaseService,
  ) {}

  createFileId(content: Buffer | string): string {
    return createHash('sha256')
      .update(typeof content === 'string' ? content : content)
      .digest('hex')
      .substring(0, 16);
  }

  async storeFile(
    fileName: string,
    fileType: string,
    content: Buffer,
    uploadMode: string = 'single_file',
  ): Promise<{ fileId: string }> {
    const fileId = this.createFileId(content);
    const fileDir = join(this.config.uploadsDir, fileId);
    mkdirSync(fileDir, { recursive: true });

    // Store original file
    writeFileSync(join(fileDir, 'original'), content);

    // Store metadata in filename
    writeFileSync(join(fileDir, 'metadata.json'), JSON.stringify({
      fileName,
      fileType,
      uploadMode,
      size: content.length,
    }));

    // Create work item in database
    this.db.createWorkItem({
      id: fileId,
      fileName,
      fileType,
      uploadMode,
    });

    this.logger.log(`Stored file: ${fileName} (${fileId})`);
    return { fileId };
  }

  async storeMultipleFiles(
    files: Array<{ originalname: string; mimetype: string; buffer: Buffer }>,
    uploadMode: string,
  ): Promise<{ fileId: string }> {
    // Combine all file content for a unique ID
    const combined = Buffer.concat(files.map(f => f.buffer));
    const fileId = this.createFileId(combined);
    const fileDir = join(this.config.uploadsDir, fileId);
    mkdirSync(fileDir, { recursive: true });

    if (uploadMode === 'pdf_file') {
      // Store each PDF separately
      const pdfData = files.map(f => ({
        filename: f.originalname,
        size: f.buffer.length,
      }));
      writeFileSync(join(fileDir, 'metadata.json'), JSON.stringify({
        fileName: files.map(f => f.originalname).join(', '),
        fileType: 'application/pdf-collection',
        uploadMode,
        files: pdfData,
      }));
      files.forEach((f, i) => {
        writeFileSync(join(fileDir, `pdf_${i}_${f.originalname}`), f.buffer);
      });
    } else {
      // Pack content into a single string for projects
      const packed = files.map(f =>
        `--- File: ${f.originalname} ---\n${f.buffer.toString('utf-8')}\n`
      ).join('\n');
      writeFileSync(join(fileDir, 'original'), Buffer.from(packed));
      writeFileSync(join(fileDir, 'packed'), packed);
      writeFileSync(join(fileDir, 'metadata.json'), JSON.stringify({
        fileName: files.map(f => f.originalname).join(', '),
        fileType: 'text/plain',
        uploadMode,
      }));
    }

    this.db.createWorkItem({
      id: fileId,
      fileName: files.map(f => f.originalname).join(', '),
      fileType: uploadMode === 'pdf_file' ? 'application/pdf' : 'text/plain',
      uploadMode,
    });

    return { fileId };
  }

  getFileContent(fileId: string): { data: Buffer; contentType: string; fileName: string } {
    const fileDir = join(this.config.uploadsDir, fileId);
    const metaPath = join(fileDir, 'metadata.json');

    if (!existsSync(metaPath)) {
      throw new Error(`File not found: ${fileId}`);
    }

    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const data = readFileSync(join(fileDir, 'original'));

    return { data, contentType: meta.fileType, fileName: meta.fileName };
  }

  getPdfFiles(fileId: string): Array<{ filename: string; buffer: Buffer; size: number }> {
    const fileDir = join(this.config.uploadsDir, fileId);
    const metaPath = join(fileDir, 'metadata.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const pdfs: Array<{ filename: string; buffer: Buffer; size: number }> = [];

    if (meta.files) {
      meta.files.forEach((f: any, i: number) => {
        const pdfPath = join(fileDir, `pdf_${i}_${f.filename}`);
        if (existsSync(pdfPath)) {
          pdfs.push({
            filename: f.filename,
            buffer: readFileSync(pdfPath),
            size: f.size,
          });
        }
      });
    }
    return pdfs;
  }

  getPackedContent(fileId: string): string {
    const packedPath = join(this.config.uploadsDir, fileId, 'packed');
    if (!existsSync(packedPath)) {
      throw new Error(`Packed content not found: ${fileId}`);
    }
    return readFileSync(packedPath, 'utf-8');
  }

  getWorkItem(fileId: string) {
    return this.db.getWorkItem(fileId);
  }

  getAllWorkItems() {
    return this.db.getAllWorkItems();
  }

  deleteFile(fileId: string) {
    const fileDir = join(this.config.uploadsDir, fileId);
    if (existsSync(fileDir)) {
      rmSync(fileDir, { recursive: true, force: true });
    }
    this.db.deleteWorkItem(fileId);
  }

  // Supporting documents
  storeSupportingDocument(fileId: string, docId: string, fileName: string, content: Buffer) {
    const docDir = join(this.config.uploadsDir, fileId, 'supporting');
    mkdirSync(docDir, { recursive: true });
    writeFileSync(join(docDir, docId), content);
    writeFileSync(join(docDir, `${docId}_meta.json`), JSON.stringify({
      fileName,
      size: content.length,
    }));
  }

  getSupportingDocument(fileId: string, docId: string): { data: Buffer; fileName: string; contentType: string } | null {
    const docPath = join(this.config.uploadsDir, fileId, 'supporting', docId);
    const metaPath = join(this.config.uploadsDir, fileId, 'supporting', `${docId}_meta.json`);

    if (!existsSync(docPath)) return null;

    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : { fileName: docId };
    const data = readFileSync(docPath);
    const ext = meta.fileName.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : ext === 'png' ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : 'text/plain';

    return { data, fileName: meta.fileName, contentType };
  }
}
