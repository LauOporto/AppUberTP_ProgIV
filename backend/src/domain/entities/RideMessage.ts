import { UserRole } from './User.js';

export interface RideMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: UserRole;
  content: string;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
}
