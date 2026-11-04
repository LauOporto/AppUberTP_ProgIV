import React from 'react';
import type { RideStatus } from '../../types';

interface BadgeProps {
  status: RideStatus;
}

export const StatusBadge: React.FC<BadgeProps> = ({ status }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'REQUESTED':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'ACCEPTED':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'DRIVER_ARRIVED':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'IN_PROGRESS':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'CANCELLED':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'REQUESTED': return 'Buscando Conductor';
      case 'ACCEPTED': return 'Conductor Asignado';
      case 'DRIVER_ARRIVED': return 'Conductor en Origen';
      case 'IN_PROGRESS': return 'Viaje en Curso';
      case 'COMPLETED': return 'Completado';
      case 'CANCELLED': return 'Cancelado';
      default: return status;
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getBadgeStyle()}`}
    >
      {getLabel()}
    </span>
  );
};
