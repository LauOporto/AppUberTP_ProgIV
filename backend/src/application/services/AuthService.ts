import { IUserRepository } from '../../domain/interfaces/IUserRepository.js';
import { ITokenService, GeneratedTokens } from '../../domain/interfaces/ITokenService.js';
import { IPasswordHasher } from '../../domain/interfaces/IPasswordHasher.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../domain/errors/ProblemDetails.js';
import {
  RegisterPassengerDto,
  RegisterDriverDto,
  LoginDto,
  RefreshTokenDto
} from '../dtos/auth.dto.js';
import { User, UserProfileResponse } from '../../domain/entities/User.js';

export interface AuthResult {
  user: UserProfileResponse;
  tokens: GeneratedTokens;
}

export class AuthService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly passwordHasher: IPasswordHasher
  ) {}

  public async registerPassenger(dto: RegisterPassengerDto): Promise<AuthResult> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError(`El email '${dto.email}' ya se encuentra registrado`);
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);
    const user = await this.userRepository.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: 'PASSENGER',
      phone: dto.phone,
      ratingAverage: 5.0,
      totalTrips: 0
    });

    const tokens = this.tokenService.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    return {
      user: this.mapToProfile(user),
      tokens
    };
  }

  public async registerDriver(dto: RegisterDriverDto): Promise<AuthResult> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError(`El email '${dto.email}' ya se encuentra registrado`);
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);
    const user = await this.userRepository.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: 'DRIVER',
      phone: dto.phone,
      ratingAverage: 5.0,
      totalTrips: 0
    });

    await this.userRepository.createDriverProfile({
      userId: user.id,
      vehicleModel: dto.vehicleModel,
      vehiclePlate: dto.vehiclePlate,
      vehicleColor: dto.vehicleColor,
      licenseNumber: dto.licenseNumber,
      isOnline: true,
      isAvailable: true
    });

    const tokens = this.tokenService.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    return {
      user: this.mapToProfile(user),
      tokens
    };
  }

  public async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    const isMatch = await this.passwordHasher.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    const tokens = this.tokenService.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    return {
      user: this.mapToProfile(user),
      tokens
    };
  }

  public async refreshToken(dto: RefreshTokenDto): Promise<GeneratedTokens> {
    const payload = this.tokenService.verifyRefreshToken(dto.refreshToken);
    const user = await this.userRepository.findById(payload.userId);
    if (!user) {
      throw new UnauthorizedError('Usuario no encontrado');
    }

    return this.tokenService.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role
    });
  }

  public async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('Usuario no encontrado');
    }
    return this.mapToProfile(user);
  }

  private mapToProfile(user: User): UserProfileResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      ratingAverage: user.ratingAverage,
      totalTrips: user.totalTrips,
      createdAt: user.createdAt.toISOString()
    };
  }
}
