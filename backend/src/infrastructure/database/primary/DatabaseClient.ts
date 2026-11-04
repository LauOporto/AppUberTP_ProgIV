import { User } from '../../../domain/entities/User.js';
import { DriverProfile } from '../../../domain/entities/DriverProfile.js';
import { Ride } from '../../../domain/entities/Ride.js';
import { RideMessage } from '../../../domain/entities/RideMessage.js';
import bcrypt from 'bcryptjs';

/**
 * Proveedor de Datos 1 (RT-02: Base de Datos Transaccional Principal)
 * Repositorio en memoria persistente / estructurado listo para SQLite/PostgreSQL.
 * Incluye semillas reproducibles (Seed Data) conforme a RT-02 y RNF-04.
 */
class DatabaseContext {
  public users: Map<string, User> = new Map();
  public driverProfiles: Map<string, DriverProfile> = new Map();
  public rides: Map<string, Ride> = new Map();
  public messages: Map<string, RideMessage> = new Map();
  private isInitialized = false;

  public async initializeSeedData(): Promise<void> {
    if (this.isInitialized) return;

    const defaultPasswordHash = await bcrypt.hash('Password123!', 10);
    const now = new Date();

    // 1. Pasajero Semilla
    const passengerId = '11111111-1111-1111-1111-111111111111';
    const passenger: User = {
      id: passengerId,
      name: 'Carlos Pasajero Demo',
      email: 'pasajero@utn.edu.ar',
      passwordHash: defaultPasswordHash,
      role: 'PASSENGER',
      phone: '+54 362 4001122',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      ratingAverage: 4.9,
      totalTrips: 12,
      createdAt: now,
      updatedAt: now
    };
    this.users.set(passenger.id, passenger);

    // 2. Conductor Semilla
    const driverId = '22222222-2222-2222-2222-222222222222';
    const driver: User = {
      id: driverId,
      name: 'Laura Conductora Demo',
      email: 'conductor@utn.edu.ar',
      passwordHash: defaultPasswordHash,
      role: 'DRIVER',
      phone: '+54 362 4998877',
      avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=150&q=80',
      ratingAverage: 5.0,
      totalTrips: 45,
      createdAt: now,
      updatedAt: now
    };
    this.users.set(driver.id, driver);

    // Perfil del Conductor Semilla
    const driverProfile: DriverProfile = {
      id: 'profile-driver-1',
      userId: driverId,
      vehicleModel: 'Toyota Corolla 2023',
      vehiclePlate: 'AF 123 CD',
      vehicleColor: 'Gris Plata',
      licenseNumber: 'B1-99887766',
      isOnline: true,
      isAvailable: true,
      currentLocation: {
        latitude: -27.4514, // Resistencia, Chaco (UTN FRRe vicinity)
        longitude: -58.9866
      },
      lastLocationUpdate: now,
      createdAt: now,
      updatedAt: now
    };
    this.driverProfiles.set(driverProfile.userId, driverProfile);

    // 3. Administrador Semilla
    const adminId = '33333333-3333-3333-3333-333333333333';
    const admin: User = {
      id: adminId,
      name: 'Admin Sistema',
      email: 'admin@utn.edu.ar',
      passwordHash: defaultPasswordHash,
      role: 'ADMIN',
      phone: '+54 362 4111222',
      ratingAverage: 5.0,
      totalTrips: 0,
      createdAt: now,
      updatedAt: now
    };
    this.users.set(admin.id, admin);

    // 4. Viaje Semilla en Historial
    const completedRideId = 'ride-sample-completed-1';
    const completedRide: Ride = {
      id: completedRideId,
      passengerId,
      driverId,
      status: 'COMPLETED',
      originAddress: 'Av. French 414, Resistencia (UTN FRRe)',
      originLocation: { latitude: -27.4514, longitude: -58.9866 },
      destinationAddress: 'Plaza 25 de Mayo, Resistencia',
      destinationLocation: { latitude: -27.4511, longitude: -58.9868 },
      estimatedDistanceKm: 2.8,
      estimatedDurationMin: 10,
      fareAmount: 2500,
      requestedAt: new Date(Date.now() - 3600000 * 24),
      acceptedAt: new Date(Date.now() - 3600000 * 24 + 120000),
      startedAt: new Date(Date.now() - 3600000 * 24 + 300000),
      completedAt: new Date(Date.now() - 3600000 * 24 + 900000),
      createdAt: new Date(Date.now() - 3600000 * 24),
      updatedAt: new Date(Date.now() - 3600000 * 24 + 900000)
    };
    this.rides.set(completedRide.id, completedRide);

    this.isInitialized = true;
  }
}

export const dbContext = new DatabaseContext();
