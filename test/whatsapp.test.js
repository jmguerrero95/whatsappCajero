'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOtpTemplatePayload,
  sendOtp,
  serializeMetaError,
} = require('../src/lib/whatsapp');

function configureEnv() {
  process.env.WHATSAPP_ACCESS_TOKEN = 'token-de-prueba';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
  process.env.WHATSAPP_TEMPLATE_NAME = 'verificacion';
  process.env.WHATSAPP_TEMPLATE_LANGUAGE = 'es_CO';
  process.env.META_GRAPH_API_VERSION = 'v25.0';
  process.env.META_REQUEST_TIMEOUT_MS = '1000';
}

test('construye la plantilla OTP con cuerpo y boton de copiar', () => {
  configureEnv();
  const payload = buildOtpTemplatePayload('573227166736', '48327');

  assert.equal(payload.to, '573227166736');
  assert.equal(payload.template.name, 'verificacion');
  assert.equal(payload.template.language.code, 'es_CO');
  assert.equal(payload.template.components[0].parameters[0].text, '48327');
  assert.equal(payload.template.components[1].sub_type, 'url');
  assert.equal(payload.template.components[1].parameters[0].text, '48327');
});

test('envia al Phone Number ID productivo y devuelve el wamid', async () => {
  configureEnv();
  const originalFetch = global.fetch;
  let captured;

  global.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(
      JSON.stringify({
        contacts: [{ wa_id: '573227166736' }],
        messages: [{ id: 'wamid.prueba' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    const result = await sendOtp('573227166736', '48327');
    assert.equal(result.messageId, 'wamid.prueba');
    assert.equal(result.waId, '573227166736');
    assert.equal(
      captured.url,
      'https://graph.facebook.com/v25.0/123456789/messages'
    );
    assert.equal(
      captured.options.headers.Authorization,
      'Bearer token-de-prueba'
    );
  } finally {
    global.fetch = originalFetch;
  }
});


test('conserva los detalles utiles cuando Meta rechaza el envio', async () => {
  configureEnv();
  const originalFetch = global.fetch;

  global.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: 'Template name does not exist in the translation',
          type: 'OAuthException',
          code: 132001,
          error_subcode: 2494073,
          fbtrace_id: 'TRACE123',
        },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );

  try {
    await assert.rejects(
      () => sendOtp('573227166736', '48327'),
      (error) => {
        const details = serializeMetaError(error);
        assert.equal(details.httpStatus, 400);
        assert.equal(details.metaCode, 132001);
        assert.equal(details.metaSubcode, 2494073);
        assert.equal(details.fbtraceId, 'TRACE123');
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
