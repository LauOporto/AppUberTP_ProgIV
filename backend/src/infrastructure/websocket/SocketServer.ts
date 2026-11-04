import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { container } from '../di/container.js';
import { logger } from '../logger/Logger.js';
import { Coordinates } from '../../domain/entities/Ride.js';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email: string;
    role: 'PASSENGER' | 'DRIVER' | 'ADMIN';
  };
}

export class WebSocketGateway {
  private io: Server;

  constructor(httpServer: HttpServer, corsOrigin: string) {
    this.io = new Server(httpServer, {
      cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST']
      }
    });

    this.setupAuthMiddleware();
    this.setupEventHandlers();
  }

  private setupAuthMiddleware(): void {
    // RT-04: Autenticación por JWT en el handshake del WebSocket
    this.io.use((socket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Autenticación requerida para conectar al WebSocket'));
      }

      try {
        const payload = container.tokenService.verifyAccessToken(token);
        socket.data = {
          userId: payload.userId,
          email: payload.email,
          role: payload.role
        };
        next();
      } catch {
        return next(new Error('Token JWT no válido o expirado'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', async (socket: AuthenticatedSocket) => {
      const { userId, role } = socket.data;

      // RT-02: Registrar presencia en el segundo proveedor
      await container.presenceStore.setUserOnline(userId, socket.id);
      logger.info(`[WebSocket] Conectado: ${userId} (${role}) - Socket ${socket.id}`, 'WebSocketGateway');

      // Si es conductor, unirlo al canal general de conductores
      if (role === 'DRIVER') {
        socket.join('drivers_pool');
      }

      // 1. Unirse a la sala de un viaje en curso
      socket.on('ride:join_room', (rideId: string) => {
        socket.join(`ride:${rideId}`);
        logger.debug(`Usuario ${userId} ingresó a la sala de viaje: ride:${rideId}`);
      });

      // 2. Transmisión de ubicación del conductor en tiempo real (REQ-07, RT-02)
      socket.on('driver:location_update', async (data: { location: Coordinates; rideId?: string }) => {
        if (role !== 'DRIVER') return;

        await container.driverLocationService.updateLocation(userId, data.location);

        // Si está en viaje, notificar al pasajero en la sala
        if (data.rideId) {
          this.io.to(`ride:${data.rideId}`).emit('driver:location_changed', {
            driverId: userId,
            location: data.location
          });
        }
      });

      // 3. Indicador de escritura en chat en tiempo real (REQ-07)
      socket.on('chat:typing', (data: { rideId: string; isTyping: boolean }) => {
        socket.to(`ride:${data.rideId}`).emit('chat:user_typing', {
          userId,
          isTyping: data.isTyping
        });
      });

      // 4. Envío de mensaje en chat en vivo (REQ-05, REQ-08)
      socket.on('chat:send_message', async (data: { rideId: string; content: string }) => {
        try {
          const message = await container.chatService.sendMessage(userId, role, {
            rideId: data.rideId,
            content: data.content
          });

          // Difundir mensaje a ambos participantes de la sala del viaje
          this.io.to(`ride:${data.rideId}`).emit('chat:new_message', message);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Error al enviar mensaje';
          socket.emit('chat:error', { message: errorMsg });
        }
      });

      // 5. Acuse de lectura / Visto (REQ-08, REQ-09)
      socket.on('chat:read_receipt', async (data: { rideId: string }) => {
        await container.chatService.markMessagesAsRead(userId, data.rideId);
        socket.to(`ride:${data.rideId}`).emit('chat:messages_read', {
          readerId: userId,
          rideId: data.rideId,
          readAt: new Date().toISOString()
        });
      });

      // Desconexión
      socket.on('disconnect', async () => {
        await container.presenceStore.setUserOffline(userId);
        logger.info(`[WebSocket] Desconectado: ${userId}`, 'WebSocketGateway');
      });
    });
  }

  // Métodos públicos para notificaciones del servidor
  public notifyNewRideRequest(ride: unknown): void {
    this.io.to('drivers_pool').emit('ride:new_request', ride);
  }

  public notifyRideStatusUpdate(rideId: string, status: string, payload?: unknown): void {
    this.io.to(`ride:${rideId}`).emit('ride:status_changed', { status, payload });
  }

  public getIo(): Server {
    return this.io;
  }
}
