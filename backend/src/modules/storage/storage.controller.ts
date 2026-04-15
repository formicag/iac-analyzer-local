import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Res,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { StorageService } from './storage.service';
import { basename } from 'path';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total for multi-file

const ALLOWED_EXTENSIONS = new Set([
  '.tf', '.yaml', '.yml', '.json', '.template', '.cfn',
  '.ts', '.py', '.go', '.java', '.cs', '.js',
  '.txt', '.md', '.csv', '.hcl',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.pdf', '.zip',
]);

function sanitizeFilename(name: string): string {
  // Strip path components and control characters
  return basename(name).replace(/[^\w.\-() ]/g, '_').substring(0, 255);
}

function validateFile(file: Express.Multer.File) {
  if (file.size > MAX_FILE_SIZE) {
    throw new HttpException(
      `File too large: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(1)}MB, max 50MB)`,
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }

  const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new HttpException(
      `Unsupported file type: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }

    validateFile(file);
    const safeName = sanitizeFilename(file.originalname);

    const { fileId } = await this.storageService.storeFile(
      safeName,
      file.mimetype,
      file.buffer,
    );

    return {
      fileId,
      fileName: safeName,
      fileType: file.mimetype,
      size: file.size,
    };
  }

  @Post('upload-multiple')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: MAX_FILE_SIZE } }))
  async uploadMultipleFiles(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new HttpException('No files provided', HttpStatus.BAD_REQUEST);
    }

    // Validate each file and total size
    let totalSize = 0;
    for (const file of files) {
      validateFile(file);
      totalSize += file.size;
    }
    if (totalSize > MAX_TOTAL_SIZE) {
      throw new HttpException(
        `Total upload too large: ${(totalSize / 1024 / 1024).toFixed(1)}MB (max 200MB)`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    // Sanitize filenames
    const sanitizedFiles = files.map(f => ({
      ...f,
      originalname: sanitizeFilename(f.originalname),
    }));

    const allPdf = sanitizedFiles.every(f => f.mimetype === 'application/pdf');
    const uploadMode = allPdf ? 'pdf_file' : 'multiple_files';

    const { fileId } = await this.storageService.storeMultipleFiles(sanitizedFiles, uploadMode);

    return {
      fileId,
      fileName: sanitizedFiles.map(f => f.originalname).join(', '),
      uploadMode,
      fileCount: sanitizedFiles.length,
    };
  }

  @Get('files')
  async listFiles() {
    return this.storageService.getAllWorkItems();
  }

  @Get('files/:id')
  async getFile(@Param('id') id: string) {
    if (!/^[a-f0-9]{16}$/.test(id)) {
      throw new HttpException('Invalid file ID', HttpStatus.BAD_REQUEST);
    }
    const item = this.storageService.getWorkItem(id);
    if (!item) {
      throw new HttpException('File not found', HttpStatus.NOT_FOUND);
    }
    return item;
  }

  @Delete('files/:id')
  async deleteFile(@Param('id') id: string) {
    if (!/^[a-f0-9]{16}$/.test(id)) {
      throw new HttpException('Invalid file ID', HttpStatus.BAD_REQUEST);
    }
    this.storageService.deleteFile(id);
    return { success: true };
  }

  @Get('download/:id')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    if (!/^[a-f0-9]{16}$/.test(id)) {
      throw new HttpException('Invalid file ID', HttpStatus.BAD_REQUEST);
    }
    try {
      const { data, contentType, fileName } = this.storageService.getFileContent(id);
      const safeName = sanitizeFilename(fileName);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${safeName.replace(/"/g, '_')}"`);
      res.send(data);
    } catch {
      throw new HttpException('File not found', HttpStatus.NOT_FOUND);
    }
  }

  @Post('supporting-document/:fileId')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async uploadSupportingDocument(
    @Param('fileId') fileId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }
    if (!/^[a-f0-9]{16}$/.test(fileId)) {
      throw new HttpException('Invalid file ID', HttpStatus.BAD_REQUEST);
    }

    validateFile(file);
    const safeName = sanitizeFilename(file.originalname);
    const docId = `doc_${Date.now()}`;
    this.storageService.storeSupportingDocument(fileId, docId, safeName, file.buffer);

    return { documentId: docId, fileName: safeName };
  }
}
