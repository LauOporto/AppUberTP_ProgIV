import bcrypt from 'bcryptjs';
import { IPasswordHasher } from '../../domain/interfaces/IPasswordHasher.js';

export class BcryptPasswordHasher implements IPasswordHasher {
  /** Factor de costo declarado por configuración (BCRYPT_COST, por defecto 12). */
  constructor(private readonly saltRounds: number) {}

  public async hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, this.saltRounds);
  }

  public async compare(plainText: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plainText, hashed);
  }
}
