import { describe, it, expect, beforeAll } from 'vitest';
import { RideService } from '../../src/application/services/RideService.js';
import { SqliteUserRepository } from '../../src/infrastructure/database/primary/SqliteUserRepository.js';
import { SqliteRideRepository } from '../../src/infrastructure/database/primary/SqliteRideRepository.js';
import { RedisOrMemoryPresenceStore } from '../../src/infrastructure/database/secondary/RedisOrMemoryPresenceStore.js';
import { dbContext } from '../../src/infrastructure/database/primary/DatabaseClient.js';
import { NaiveLocationLog } from '../../src/infrastructure/location/NaiveLocationLog.js';

/**
 * DEMOSTRACIÓN de la condición de carrera del `RideService.acceptRide` LEGADO.
 *
 * `acceptRide` hace: leer el viaje → verificar status === 'REQUESTED' → escribir.
 * Entre cada `await`, el event loop atiende a los otros 49 pedidos, así que TODOS leen
 * el viaje en REQUESTED antes de que alguno escriba. Que Node tenga un solo hilo no lo evita.
 *
 * El test está marcado con `it.fails`: AFIRMA el comportamiento correcto (exactamente 1 éxito)
 * y vitest lo da por bueno MIENTRAS FALLE. Cuando se implemente la asignación transaccional
 * (PC-02) este archivo se reemplaza por el test definitivo de PC-04 contra PostgreSQL.
 */
describe('Carrera en la aceptación de viajes (scaffold legado, antes de PC-02)', () => {
  const DRIVERS = 50;
  let rideService: RideService;
  let userRepo: SqliteUserRepository;
  let rideRepo: SqliteRideRepository;
  let rideId: string;
  let driverIds: string[];

  beforeAll(async () => {
    await dbContext.initializeSeedData();
    userRepo = new SqliteUserRepository();
    rideRepo = new SqliteRideRepository();
    rideService = new RideService(rideRepo, userRepo, new RedisOrMemoryPresenceStore(), new NaiveLocationLog());

    const passenger = await userRepo.create({
      name: 'Pasajero carrera',
      email: `carrera.pasajero.${Date.now()}@test.local`,
      passwordHash: 'no-importa',
      role: 'PASSENGER',
      ratingAverage: 5,
      totalTrips: 0
    });

    driverIds = [];
    for (let i = 0; i < DRIVERS; i++) {
      const driver = await userRepo.create({
        name: `Chofer ${i}`,
        email: `carrera.chofer.${i}.${Date.now()}@test.local`,
        passwordHash: 'no-importa',
        role: 'DRIVER',
        ratingAverage: 5,
        totalTrips: 0
      });
      await userRepo.createDriverProfile({
        userId: driver.id,
        vehicleModel: 'Auto de prueba',
        vehiclePlate: `TEST${i}`,
        vehicleColor: 'Gris',
        licenseNumber: `LIC-${i}`,
        isOnline: true,
        isAvailable: true
      });
      driverIds.push(driver.id);
    }

    const ride = await rideService.requestRide(passenger.id, {
      originAddress: 'UTN FRRe',
      originLocation: { latitude: -27.4514, longitude: -58.9866 },
      destinationAddress: 'Plaza 25 de Mayo',
      destinationLocation: { latitude: -27.4511, longitude: -58.9868 }
    });
    rideId = ride.id;
  });

  it.fails(`con ${DRIVERS} aceptaciones simultáneas debería haber exactamente 1 éxito`, async () => {
    const results = await Promise.allSettled(driverIds.map(driverId => rideService.acceptRide(driverId, rideId)));

    const successes = results.filter(r => r.status === 'fulfilled').length;
    const driversMarkedBusy = (
      await Promise.all(driverIds.map(id => userRepo.findDriverProfileByUserId(id)))
    ).filter(profile => profile && !profile.isAvailable).length;

    console.log(
      `[carrera legada] aceptaciones exitosas: ${successes}/${DRIVERS} · choferes marcados ocupados: ${driversMarkedBusy}`
    );

    expect(successes).toBe(1);
    expect(driversMarkedBusy).toBe(1);
  });
});
