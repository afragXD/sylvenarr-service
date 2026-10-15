import { prisma } from '../../shared/db';
import type { AppModel } from './model';

export abstract class AppService {
  static async healthcheck(): Promise<AppModel.healthcheckResponse> {
    const startTime = Date.now();
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    let dbResponseTime = 0;
    try {
      const dbStartTime = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbResponseTime = Date.now() - dbStartTime;
      dbStatus = 'connected';
    } catch (error) {
      console.error('Database healthcheck failed:', error);
      dbResponseTime = Date.now() - startTime;
    }
    const uptimeSeconds = process.uptime();
    const uptimeMinutes = uptimeSeconds / 60;
    const uptimeHours = uptimeMinutes / 60;
    const uptimeDays = uptimeHours / 24;
    const uptimeFormatted = `${uptimeDays} days. ${uptimeHours.toString().padStart(2, '0')}:${uptimeMinutes
      .toString()
      .padStart(2, '0')}`;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.version || 'unknown',
      uptime: uptimeFormatted,
      database: {
        status: dbStatus,
        responseTime: dbResponseTime,
      },
    };
  }
}
