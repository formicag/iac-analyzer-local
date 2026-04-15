import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  path: '/socket.io/',
  pingInterval: 10000,
  pingTimeout: 5000,
})
export class AnalyzerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(AnalyzerGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitAnalysisProgress(data: {
    fileId: string;
    processedQuestions: number;
    totalQuestions: number;
    currentPillar: string;
    lensAlias?: string;
  }) {
    this.server.emit('analysisProgress', data);
  }

  emitAnalysisComplete(data: { fileId: string; lensAlias?: string }) {
    this.server.emit('analysisComplete', data);
  }

  emitAnalysisError(data: { fileId: string; error: string; lensAlias?: string }) {
    this.server.emit('analysisError', data);
  }

  emitImplementationProgress(data: {
    fileId: string;
    status: string;
    progress: number;
  }) {
    this.server.emit('implementationProgress', data);
  }
}
