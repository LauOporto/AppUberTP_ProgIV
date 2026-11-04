import { z } from 'zod';

const CoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

export const EstimateFareSchema = z.object({
  originLocation: CoordinatesSchema,
  destinationLocation: CoordinatesSchema
});

export const CreateRideSchema = z.object({
  originAddress: z.string().min(3, 'Dirección de origen requerida'),
  originLocation: CoordinatesSchema,
  destinationAddress: z.string().min(3, 'Dirección de destino requerida'),
  destinationLocation: CoordinatesSchema
});

export const UpdateRideStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  cancellationReason: z.string().optional()
});

export const RidePaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10)
});

export type EstimateFareDto = z.infer<typeof EstimateFareSchema>;
export type CreateRideDto = z.infer<typeof CreateRideSchema>;
export type UpdateRideStatusDto = z.infer<typeof UpdateRideStatusSchema>;
export type RidePaginationQueryDto = z.infer<typeof RidePaginationQuerySchema>;
