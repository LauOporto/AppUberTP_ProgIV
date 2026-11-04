import { z } from 'zod';

export const RegisterPassengerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Formato de email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  phone: z.string().optional()
});

export const RegisterDriverSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Formato de email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  phone: z.string().min(6, 'El teléfono es requerido para conductores'),
  vehicleModel: z.string().min(2, 'Modelo del vehículo requerido (ej: Toyota Corolla)'),
  vehiclePlate: z.string().min(4, 'Patente del vehículo requerida'),
  vehicleColor: z.string().min(3, 'Color del vehículo requerido'),
  licenseNumber: z.string().min(5, 'Número de licencia de conducir requerido')
});

export const LoginSchema = z.object({
  email: z.string().email('Formato de email inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria')
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'El refreshToken es requerido')
});

export type RegisterPassengerDto = z.infer<typeof RegisterPassengerSchema>;
export type RegisterDriverDto = z.infer<typeof RegisterDriverSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
