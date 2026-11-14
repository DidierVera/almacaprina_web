// Spanish labels for the admin UI, keyed by the English values stored in the database.

export const STATUS_FLOW = ['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];

export const STATUS = {
  received: { label: 'Recibido', tone: 'info' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  preparing: { label: 'En preparación', tone: 'warning' },
  out_for_delivery: { label: 'En camino', tone: 'warning' },
  delivered: { label: 'Entregado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

/** Label for the button that moves an order to the given status. */
export const ADVANCE_LABEL = {
  confirmed: 'Marcar como confirmado',
  preparing: 'Marcar en preparación',
  out_for_delivery: 'Marcar en camino',
  delivered: 'Marcar como entregado',
};

export const PAYMENT_STATUS = {
  pending: { label: 'Pendiente', tone: 'neutral' },
  under_review: { label: 'En revisión', tone: 'warning' },
  paid: { label: 'Pagado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
};

export const PAYMENT_METHOD = {
  transfer: 'Transferencia',
  cash_on_delivery: 'Contraentrega',
  online: 'Pago en línea',
};

/** Badge data for the payment column: cash on delivery shows its method until it is collected. */
export function paymentBadge(order) {
  if (order.payment_method === 'cash_on_delivery' && order.payment_status === 'pending') {
    return { label: 'Contraentrega', tone: 'neutral' };
  }
  return PAYMENT_STATUS[order.payment_status] ?? { label: order.payment_status, tone: 'neutral' };
}

export const CATEGORY_OPTIONS = [
  { id: 'cheese', label: 'Quesos' },
  { id: 'dairy', label: 'Lácteos' },
  { id: 'care', label: 'Cuidado' },
  { id: 'other', label: 'De la finca' },
];

export const WEEKDAYS = [ // display order Monday → Sunday; `day` is JS getDay() (0 = Sunday)
  { day: 1, label: 'Lun' }, { day: 2, label: 'Mar' }, { day: 3, label: 'Mié' }, { day: 4, label: 'Jue' },
  { day: 5, label: 'Vie' }, { day: 6, label: 'Sáb' }, { day: 0, label: 'Dom' },
];
