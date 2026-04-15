import { Controller, Post, Get, Body, Param, Res, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AnalyzerService } from './analyzer.service';
import { FileUploadMode, IaCTemplateType } from '../../shared/dto/analysis.dto';

@Controller('analyzer')
export class AnalyzerController {
  constructor(private readonly analyzerService: AnalyzerService) {}

  @Post('analyze')
  async analyze(
    @Body()
    body: {
      fileId: string;
      selectedPillars: string[];
      uploadMode?: string;
    },
  ) {
    if (!body.fileId || !body.selectedPillars?.length) {
      throw new HttpException('fileId and selectedPillars are required', HttpStatus.BAD_REQUEST);
    }

    const uploadMode = (body.uploadMode as FileUploadMode) || FileUploadMode.SINGLE_FILE;

    // Run analysis asynchronously
    this.analyzerService.analyze(body.fileId, body.selectedPillars, uploadMode);

    return { status: 'started', fileId: body.fileId };
  }

  @Post('cancel')
  cancel() {
    this.analyzerService.cancelAnalysis();
    return { status: 'cancelled' };
  }

  @Post('chat')
  async chat(@Body() body: { fileId: string; message: string }) {
    if (!body.fileId || !body.message) {
      throw new HttpException('fileId and message are required', HttpStatus.BAD_REQUEST);
    }

    const response = await this.analyzerService.chat(body.fileId, body.message);
    return { response };
  }

  @Post('details')
  async details(@Body() body: { fileId: string; item: any }) {
    if (!body.fileId || !body.item) {
      throw new HttpException('fileId and item are required', HttpStatus.BAD_REQUEST);
    }

    const response = await this.analyzerService.getDetails(body.fileId, body.item);
    return { response };
  }

  @Post('generate-iac')
  async generateIaC(
    @Body() body: { fileId: string; templateType: string },
  ) {
    if (!body.fileId) {
      throw new HttpException('fileId is required', HttpStatus.BAD_REQUEST);
    }

    const templateType = (body.templateType as IaCTemplateType) || IaCTemplateType.TERRAFORM;
    const response = await this.analyzerService.generateIaC(body.fileId, templateType);
    return { template: response };
  }

  @Get('export-csv/:id')
  async exportCsv(@Param('id') id: string, @Res() res: Response) {
    try {
      const csv = await this.analyzerService.exportCsv(id);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analysis_${id}.csv"`);
      res.send(csv);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }
}
