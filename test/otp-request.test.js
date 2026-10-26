'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateIncomingMessage } = require('../src/lib/otp-request');

test('valida el mismo contrato del cajero y extrae el OTP', () => {
  assert.deepEqual(
    validateIncomingMessage({
      numero: '+57 322 716 6736',
      mensaje: 'Tu codigo es 48327',
    }),
    {
      ok: true,
      tel: '573227166736',
      otp: '48327',
    }
  );
});

test('descarta solicitudes que no puedan producir un envio OTP', () => {
  assert.equal(
    validateIncomingMessage({ numero: '1234', mensaje: 'Codigo 48327' }).ok,
    false
  );
  assert.equal(
    validateIncomingMessage({
      numero: '+573227166736',
      mensaje: 'Sin codigo',
    }).ok,
    false
  );
});
