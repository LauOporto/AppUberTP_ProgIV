import { IRideRepository } from '../../domain/interfaces/IRideRepository.js';
import { RideMessage } from '../../domain/entities/RideMessage.js';
import { UserRole } from '../../domain/entities/User.js';
import { SendMessageDto } from '../dtos/chat.dto.js';
import { ForbiddenError, NotFoundError } from '../../domain/errors/ProblemDetails.js';

export class ChatService {
  constructor(private readonly rideRepository: IRideRepository) {}

  public async sendMessage(
    userId: string,
    role: UserRole,
    dto: SendMessageDto
  ): Promise<RideMessage> {
    const ride = await this.rideRepository.findById(dto.rideId);
    if (!ride) {
      throw new NotFoundError('El viaje asociado al chat no existe');
    }

    if (ride.passengerId !== userId && ride.driverId !== userId) {
      throw new ForbiddenError('No formas parte de este viaje para enviar mensajes');
    }

    return this.rideRepository.addMessage({
      rideId: dto.rideId,
      senderId: userId,
      senderRole: role,
      content: dto.content,
      isRead: false,
      readAt: null
    });
  }

  public async getRideMessages(userId: string, rideId: string): Promise<RideMessage[]> {
    const ride = await this.rideRepository.findById(rideId);
    if (!ride) {
      throw new NotFoundError('El viaje no existe');
    }

    if (ride.passengerId !== userId && ride.driverId !== userId) {
      throw new ForbiddenError('No tienes acceso al chat de este viaje');
    }

    return this.rideRepository.getMessagesByRideId(rideId);
  }

  public async markMessagesAsRead(userId: string, rideId: string): Promise<void> {
    await this.rideRepository.markMessagesAsRead(rideId, userId);
  }
}
