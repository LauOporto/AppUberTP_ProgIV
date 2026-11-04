import { SqliteUserRepository } from '../database/primary/SqliteUserRepository.js';
import { SqliteRideRepository } from '../database/primary/SqliteRideRepository.js';
import { RedisOrMemoryPresenceStore } from '../database/secondary/RedisOrMemoryPresenceStore.js';
import { JwtTokenService } from '../security/JwtTokenService.js';
import { BcryptPasswordHasher } from '../security/BcryptPasswordHasher.js';

import { AuthService } from '../../application/services/AuthService.js';
import { RideService } from '../../application/services/RideService.js';
import { DriverLocationService } from '../../application/services/DriverLocationService.js';
import { ChatService } from '../../application/services/ChatService.js';

import { dbContext } from '../database/primary/DatabaseClient.js';

class DependencyContainer {
  // Infraestructura (Proveedores de Datos y Seguridad)
  public readonly userRepository = new SqliteUserRepository();
  public readonly rideRepository = new SqliteRideRepository();
  public readonly presenceStore = new RedisOrMemoryPresenceStore();
  public readonly tokenService = new JwtTokenService();
  public readonly passwordHasher = new BcryptPasswordHasher();

  // Capa de Aplicación (Servicios de Dominio / Casos de Uso)
  public readonly authService: AuthService;
  public readonly rideService: RideService;
  public readonly driverLocationService: DriverLocationService;
  public readonly chatService: ChatService;

  constructor() {
    // Inyección explícita de dependencias (IoC / Dependency Injection)
    this.authService = new AuthService(
      this.userRepository,
      this.tokenService,
      this.passwordHasher
    );

    this.rideService = new RideService(
      this.rideRepository,
      this.userRepository,
      this.presenceStore
    );

    this.driverLocationService = new DriverLocationService(
      this.presenceStore,
      this.userRepository
    );

    this.chatService = new ChatService(this.rideRepository);
  }

  public async initialize(): Promise<void> {
    await dbContext.initializeSeedData();
  }
}

export const container = new DependencyContainer();
