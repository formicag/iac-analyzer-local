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

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }

    const { fileId } = await this.storageService.storeFile(
      file.originalname,
      file.mimetype,
      file.buffer,
    );

    return {
      fileId,
      fileName: file.originalname,
      fileType: file.mimetype,
      size: file.size,
    };
  }

  @Post('upload-multiple')
  @UseInterceptors(FilesInterceptor('files', 20, {}))
  async uploadMultipleFiles(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new HttpException('No files provided', HttpStatus.BAD_REQUEST);
    }

    // Determine upload mode based on file types
    const allPdf = files.every(f => f.mimetype === 'application/pdf');
    const uploadMode = allPdf ? 'pdf_file' : 'multiple_files';

    const { fileId } = await this.storageService.storeMultipleFiles(files, uploadMode);

    return {
      fileId,
      fileName: files.map(f => f.originalname).join(', '),
      uploadMode,
      fileCount: files.length,
    };
  }

  @Get('files')
  async listFiles() {
    return this.storageService.getAllWorkItems();
  }

  @Get('files/:id')
  async getFile(@Param('id') id: string) {
    const item = this.storageService.getWorkItem(id);
    if (!item) {
      throw new HttpException('File not found', HttpStatus.NOT_FOUND);
    }
    return item;
  }

  @Delete('files/:id')
  async deleteFile(@Param('id') id: string) {
    this.storageService.deleteFile(id);
    return { success: true };
  }

  @Get('download/:id')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    try {
      const { data, contentType, fileName } = this.storageService.getFileContent(id);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(data);
    } catch {
      throw new HttpException('File not found', HttpStatus.NOT_FOUND);
    }
  }

  @Post('supporting-document/:fileId')
  @UseInterceptors(FileInterceptor('file', {}))
  async uploadSupportingDocument(
    @Param('fileId') fileId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }

    const docId = `doc_${Date.now()}`;
    this.storageService.storeSupportingDocument(fileId, docId, file.originalname, file.buffer);

    return { documentId: docId, fileName: file.originalname };
  }
}
