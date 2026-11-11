import { Request, Response } from 'express';
import { container } from '../../infrastructure/di/container.js';
import { config } from '../../config/environment.js';

export class HealthController {
  public async getHealth(req: Request, res: Response): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const isSecondaryStoreAlive = await container.presenceStore.ping();

    const healthStatus = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: config.nodeEnv,
      providers: {
        primaryDatabase: {
          status: 'UP',
          type: 'Relational (SQLite / PostgreSQL)',
          usersCount: (await container.userRepository.findByEmail('pasajero@utn.edu.ar')) ? 'READY' : 'PENDING'
        },
        secondaryDataStore: {
          status: isSecondaryStoreAlive ? 'UP' : 'DOWN',
          type: 'Realtime / Cache (Redis / Memory)'
        }
      },
      system: {
        nodeVersion: process.version,
        rssMemoryMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024)
      }
    };

    res.status(200).json(healthStatus);
  }

  public getInfo(req: Request, res: Response): void {
    res.status(200).json({
      name: 'Uber-like Realtime & REST API',
      description: 'API del Trabajo Práctico Integrador - Programación IV (UTN FRRe)',
      version: '1.0.0',
      docsUrl: '/docs',
      openapiJson: '/openapi.json',
      openapiYaml: '/openapi.yaml',
      supportRoles: ['PASSENGER', 'DRIVER', 'ADMIN']
    });
  }
}

export const healthController = new HealthController();
