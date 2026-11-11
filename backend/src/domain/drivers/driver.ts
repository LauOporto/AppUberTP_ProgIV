export type DriverApprovalStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED';

/** OFFLINE: no recibe ofertas · AVAILABLE: puede recibir y aceptar · BUSY: tiene un viaje activo. */
export type DriverAvailability = 'OFFLINE' | 'AVAILABLE' | 'BUSY';

export interface Driver {
  userId: string;
  approvalStatus: DriverApprovalStatus;
  availability: DriverAvailability;
}
