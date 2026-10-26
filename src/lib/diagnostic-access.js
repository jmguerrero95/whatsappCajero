'use strict';

const crypto = require('crypto');

function isLoopbackAddress(address) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '');
}

function secureEquals(valueA, valueB) {
  const a = Buffer.from(String(valueA || ''), 'utf8');
  const b = Buffer.from(String(valueB || ''), 'utf8');

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

/**
 * Evalúa el acceso al endpoint de prueba sin depender de Express.
 *
 * @returns {{ok: true}|{ok: false, httpStatus: number, status: string, error: string}}
 */
function authorizeOtpTest({
  configuredKey,
  receivedKey,
  remoteAddress,
  localOnly = true,
}) {
  const expectedKey = String(configuredKey || '').trim();

  if (!expectedKey) {
    return {
      ok: false,
      httpStatus: 503,
      status: 'test_endpoint_disabled',
      error: 'configure OTP_TEST_API_KEY en .env para habilitar este endpoint',
    };
  }

  if (localOnly && !isLoopbackAddress(remoteAddress)) {
    return {
      ok: false,
      httpStatus: 403,
      status: 'forbidden',
      error: 'el endpoint de prueba solo acepta conexiones locales',
    };
  }

  if (!secureEquals(receivedKey, expectedKey)) {
    return {
      ok: false,
      httpStatus: 401,
      status: 'unauthorized',
      error: 'X-OTP-Test-Key invalida o ausente',
    };
  }

  return { ok: true };
}

module.exports = {
  authorizeOtpTest,
  isLoopbackAddress,
  secureEquals,
};
