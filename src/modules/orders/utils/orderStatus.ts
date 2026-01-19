import type { OrderStatus } from '../types/orders';

export const ORDER_STATUS_STEPS = [
  'open',
  'locked',
  'confirmed',
  'preparing',
  'prepared',
  'delivered',
  'distributed',
  'finished',
] as const;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Brouillon',
  open: 'Ouverte',
  locked: 'Clôturée',
  confirmed: 'Confirmée',
  preparing: 'Préparation',
  prepared: 'Livraison',
  delivered: 'Livrée',
  distributed: 'Distribuée',
  finished: 'Terminée',
  cancelled: 'Annulée',
};

export const getOrderStatusLabel = (status?: OrderStatus | null) => {
  if (!status) return '';
  return ORDER_STATUS_LABELS[status] ?? status;
};

export const getOrderStatusProgress = (status?: OrderStatus | null) => {
  if (!status) return null;
  const stepIndex = ORDER_STATUS_STEPS.indexOf(status as (typeof ORDER_STATUS_STEPS)[number]);
  if (stepIndex < 0) return null;
  const step = stepIndex + 1;
  const total = ORDER_STATUS_STEPS.length;
  return { ratio: step / total, step, total };
};
