// Customer-facing error copy (Spanish). Code and the database raise stable English error
// codes (e.g. 'EMPTY_ORDER'); this is the only place that maps them to user-visible text.
const ERROR_MESSAGES = {
  STORE_NOT_CONFIGURED: 'La tienda aún no está configurada.',
  INVALID_NAME: 'Escribe tu nombre.',
  INVALID_PHONE: 'Escribe un celular válido.',
  INVALID_EMAIL: 'El correo no es válido.',
  INVALID_ADDRESS: 'Escribe tu dirección y barrio.',
  EMPTY_ORDER: 'El pedido está vacío o es demasiado grande.',
  INVALID_QUANTITY: 'Una cantidad no es válida.',
  PRODUCT_UNAVAILABLE: 'Un producto de tu pedido ya no está disponible.',
  PAYMENT_UNAVAILABLE: 'Ese método de pago no está disponible.',
  PROOF_REQUIRED: 'Adjunta el comprobante de la transferencia.',
  LOCATION_REQUIRED: 'Marca tu ubicación en el mapa.',
  OUT_OF_COVERAGE: 'Tu dirección queda fuera de la zona de entrega.',
  NO_DELIVERY_DATE: 'No hay fechas de entrega disponibles por ahora.',
  TOO_MANY_ORDERS: 'Demasiados pedidos seguidos. Escríbenos por WhatsApp.',
  UPLOAD_FAILED: 'No pudimos subir el comprobante. Revisa que sea una imagen o PDF de máximo 5 MB.',
  UNKNOWN: 'No pudimos enviar tu pedido. Inténtalo de nuevo.',
};

export function errorMessage(err) {
  return ERROR_MESSAGES[err?.message] ?? ERROR_MESSAGES.UNKNOWN;
}
