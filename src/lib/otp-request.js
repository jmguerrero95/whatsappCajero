'use strict';

const {
  extractFiveDigitOtp,
  normalizeWhatsAppPhone,
} = require('./message-parser');

/**
 * Valida y transforma el mismo cuerpo JSON que envía el cajero.
 *
 * @param {unknown} body
 * @returns {{ok: true, tel: string, otp: string}|{ok: false, error: string}}
 */
function validateIncomingMessage(body) {
  const tel = normalizeWhatsAppPhone(body?.numero);
  const otp = extractFiveDigitOtp(body?.mensaje);

  if (!tel) {
    return {
      ok: false,
      error: 'numero invalido; debe incluir codigo de pais',
    };
  }

  if (!otp) {
    return {
      ok: false,
      error: 'el mensaje debe contener un unico codigo aislado de 5 digitos',
    };
  }

  return { ok: true, tel, otp };
}

module.exports = { validateIncomingMessage };
