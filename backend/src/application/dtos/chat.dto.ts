import { z } from 'zod';

export const SendMessageSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido').or(z.string().min(1)),
  content: z.string().min(1, 'El mensaje no puede estar vacío').max(1000, 'Máximo 1000 caracteres')
});

export const TypingIndicatorSchema = z.object({
  rideId: z.string().min(1),
  isTyping: z.boolean()
});

export type SendMessageDto = z.infer<typeof SendMessageSchema>;
export type TypingIndicatorDto = z.infer<typeof TypingIndicatorSchema>;
