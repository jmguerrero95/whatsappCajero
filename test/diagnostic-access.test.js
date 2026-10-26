'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  authorizeOtpTest,
  isLoopbackAddress,
  secureEquals,
} = require('../src/lib/diagnostic-access');

test('reconoce direcciones locales comunes', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.10'), false);
});

test('compara la clave del endpoint de prueba', () => {
  assert.equal(secureEquals('clave', 'clave'), true);
  assert.equal(secureEquals('clave', 'otra'), false);
});

test('solo autoriza clave correcta desde localhost', () => {
  assert.deepEqual(
    authorizeOtpTest({
      configuredKey: 'clave-segura',
      receivedKey: 'clave-segura',
      remoteAddress: '127.0.0.1',
      localOnly: true,
    }),
    { ok: true }
  );

  assert.equal(
    authorizeOtpTest({
      configuredKey: 'clave-segura',
      receivedKey: 'incorrecta',
      remoteAddress: '127.0.0.1',
      localOnly: true,
    }).httpStatus,
    401
  );

  assert.equal(
    authorizeOtpTest({
      configuredKey: 'clave-segura',
      receivedKey: 'clave-segura',
      remoteAddress: '10.0.0.20',
      localOnly: true,
    }).httpStatus,
    403
  );
});
