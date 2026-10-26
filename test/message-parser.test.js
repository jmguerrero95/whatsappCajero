'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractFiveDigitOtp,
  normalizeWhatsAppPhone,
} = require('../src/lib/message-parser');

test('extrae un unico OTP aislado de 5 digitos', () => {
  assert.equal(extractFiveDigitOtp('Tu codigo es 48327.'), '48327');
  assert.equal(extractFiveDigitOtp('Usa (01234) para continuar'), '01234');
});

test('descarta codigos con longitud diferente o dentro de numeros largos', () => {
  assert.equal(extractFiveDigitOtp('Codigo 1234'), null);
  assert.equal(extractFiveDigitOtp('Codigo 123456'), null);
  assert.equal(extractFiveDigitOtp('Telefono 573001234567'), null);
});

test('descarta mensajes ambiguos con mas de un candidato', () => {
  assert.equal(extractFiveDigitOtp('Anterior 12345, nuevo 67890'), null);
});

test('normaliza numeros internacionales habituales', () => {
  assert.equal(normalizeWhatsAppPhone('+57 322 716 6736'), '573227166736');
  assert.equal(normalizeWhatsAppPhone('00573227166736'), '573227166736');
});

test('rechaza numeros invalidos', () => {
  assert.equal(normalizeWhatsAppPhone('cajero 573227166736'), null);
  assert.equal(normalizeWhatsAppPhone('1234'), null);
});
