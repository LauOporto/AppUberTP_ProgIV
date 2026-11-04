import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../../src/application/services/AuthService.js';
import { SqliteUserRepository } from '../../src/infrastructure/database/primary/SqliteUserRepository.js';
import { JwtTokenService } from '../../src/infrastructure/security/JwtTokenService.js';
import { BcryptPasswordHasher } from '../../src/infrastructure/security/BcryptPasswordHasher.js';
import { dbContext } from '../../src/infrastructure/database/primary/DatabaseClient.js';

describe('AuthService (Unit Tests - RT-06)', () => {
  let authService: AuthService;
  let userRepo: SqliteUserRepository;
  let tokenService: JwtTokenService;
  let passwordHasher: BcryptPasswordHasher;

  beforeEach(async () => {
    await dbContext.initializeSeedData();
    userRepo = new SqliteUserRepository();
    tokenService = new JwtTokenService();
    passwordHasher = new BcryptPasswordHasher();
    authService = new AuthService(userRepo, tokenService, passwordHasher);
  });

  it('debe registrar un nuevo pasajero con contraseña hasheada y devolver tokens JWT', async () => {
    const email = `test.passenger.${Date.now()}@example.com`;
    const result = await authService.registerPassenger({
      name: 'Pasajero Test',
      email,
      password: 'SecurePassword123!',
      phone: '+54 362 4112233'
    });

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(email);
    expect(result.user.role).toBe('PASSENGER');
    expect(result.tokens.accessToken).toBeDefined();
    expect(result.tokens.refreshToken).toBeDefined();
  });

  it('debe impedir el registro duplicado del mismo correo electrónico (ConflictError)', async () => {
    await expect(
      authService.registerPassenger({
        name: 'Carlos Duplicado',
        email: 'pasajero@utn.edu.ar', // Email ya existente en el seed
        password: 'Password123!'
      })
    ).rejects.toThrow('ya se encuentra registrado');
  });

  it('debe autenticar exitosamente un usuario con credenciales correctas', async () => {
    const result = await authService.login({
      email: 'pasajero@utn.edu.ar',
      password: 'Password123!'
    });

    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.user.role).toBe('PASSENGER');
  });

  it('debe rechazar autenticación con credenciales erróneas', async () => {
    await expect(
      authService.login({
        email: 'pasajero@utn.edu.ar',
        password: 'ClaveIncorrecta'
      })
    ).rejects.toThrow('Credenciales');
  });
});
