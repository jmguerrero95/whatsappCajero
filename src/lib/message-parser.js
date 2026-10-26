'use strict';

/**
 * Extrae un único código aislado de exactamente 5 dígitos.
 *
 * No considera como OTP un fragmento dentro de números más largos.
 * Si el mensaje contiene cero o más de un candidato, devuelve null para
 * evitar enviar un código ambiguo.
 *
 * @param {unknown} message
 * @returns {string|null}
 */
function extractFiveDigitOtp(message) {
  if (typeof message !== 'string' || message.trim() === '') {
    return null;
  }

  const matches = [];
  const pattern = /(^|\D)(\d{5})(?!\d)/g;
  let match;

  while ((match = pattern.exec(message)) !== null) {
    matches.push(match[2]);

    if (matches.length > 1) {
      return null;
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

/**
 * Normaliza un teléfono al formato que espera WhatsApp Cloud API:
 * código de país + número, solo dígitos y sin el signo +.
 *
 * @param {unknown} phone
 * @returns {string|null}
 */
function normalizeWhatsAppPhone(phone) {
  if (typeof phone !== 'string' && typeof phone !== 'number') {
    return null;
  }

  let value = String(phone).trim();

  if (value === '') {
    return null;
  }

  // Permite formatos habituales, por ejemplo: +57 (300) 123-4567.
  if (!/^\+?[0-9\s().-]+$/.test(value)) {
    return null;
  }

  value = value.replace(/\D/g, '');

  // Convierte prefijo internacional 00... a su forma E.164 sin +.
  if (value.startsWith('00')) {
    value = value.slice(2);
  }

  // E.164 admite hasta 15 dígitos y no comienza por 0.
  if (!/^[1-9]\d{7,14}$/.test(value)) {
    return null;
  }

  return value;
}

module.exports = {
  extractFiveDigitOtp,
  normalizeWhatsAppPhone,
};
