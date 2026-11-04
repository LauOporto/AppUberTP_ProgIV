import http from 'http';
import app from './app.js';
import { config } from './config/environment.js';
import { container } from './infrastructure/di/container.js';
import { WebSocketGateway } from './infrastructure/websocket/SocketServer.js';
import { logger } from './infrastructure/logger/Logger.js';

async function bootstrap() {
  try {
    // 1. Inicializar contenedor y datos semilla (RT-01, RT-02)
    await container.initialize();
    logger.info('Semillas de datos inicializadas correctamente', 'Bootstrap');

    // 2. Crear servidor HTTP
    const server = http.createServer(app);

    // 3. Inicializar Gateway de WebSockets / SignalR (RT-04, REQ-05, REQ-06)
    const wsGateway = new WebSocketGateway(server, config.corsOrigin);
    logger.info('WebSocket Gateway activo y escuchando eventos', 'Bootstrap');

    // 4. Iniciar escucha en el puerto configurado
    server.listen(config.port, () => {
      logger.info(`🚀 Servidor backend ejecutándose en: http://localhost:${config.port}`, 'Bootstrap');
      logger.info(`📘 Documentación OpenAPI Scalar disponible en: http://localhost:${config.port}/docs`, 'Bootstrap');
      logger.info(`🩺 Endpoint de salud: http://localhost:${config.port}/health`, 'Bootstrap');
    });

    // Manejo de apagado graceful
    const gracefulShutdown = () => {
      logger.info('Señal de terminación recibida. Cerrando conexiones...', 'Shutdown');
      server.close(() => {
        logger.info('Servidor HTTP y WebSockets detenidos limpiamente.', 'Shutdown');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    return { server, wsGateway };
  } catch (error) {
    logger.error('Error fatal al iniciar la aplicación', error as Error, 'Bootstrap');
    process.exit(1);
  }
}

bootstrap();
