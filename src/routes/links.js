'use strict';

const crypto = require('crypto');
const { Router } = require('express');
const { sendOtp, serializeMetaError } = require('../lib/whatsapp');
const { validateIncomingMessage } = require('../lib/otp-request');
const { authorizeOtpTest } = require('../lib/diagnostic-access');

const router = Router();

let sending = false;
const queue = [];

function maskPhone(phone) {
  return phone.length <= 4 ? '****' : `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
}

function requireOtpTestAccess(req, res, next) {
  const localOnly =
    (process.env.OTP_TEST_LOCAL_ONLY || 'true').trim().toLowerCase() !== 'false';

  const access = authorizeOtpTest({
    configuredKey: process.env.OTP_TEST_API_KEY,
    receivedKey: req.get('x-otp-test-key'),
    remoteAddress: req.socket?.remoteAddress,
    localOnly,
  });

  if (!access.ok) {
    return res.status(access.httpStatus).json({
      res: false,
      status: access.status,
      error: access.error,
    });
  }

  return next();
}

async function processQueue() {
  if (sending || queue.length === 0) {
    return;
  }

  sending = true;
  const job = queue.shift();

  try {
    const result = await sendOtp(job.tel, job.otp);
    console.log(
      `[WHATSAPP] OTP aceptado por Meta para ${maskPhone(job.tel)}. message_id=${result.messageId}`
    );
  } catch (error) {
    const details = serializeMetaError(error);
    const message = [
      details.message,
      details.httpStatus ? `http=${details.httpStatus}` : null,
      details.metaCode ? `meta_code=${details.metaCode}` : null,
      details.metaSubcode ? `meta_subcode=${details.metaSubcode}` : null,
      details.fbtraceId ? `fbtrace_id=${details.fbtraceId}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    console.error(
      `[WHATSAPP] Falló el envío a ${maskPhone(job.tel)}: ${message}`
    );
  } finally {
    sending = false;
    setImmediate(processQueue);
  }
}

router.post('/enviarMensaje', (req, res) => {
  const validation = validateIncomingMessage(req.body);

  if (!validation.ok) {
    return res.status(200).json({
      res: false,
      status: 'discarded',
      error: validation.error,
    });
  }

  queue.push({ tel: validation.tel, otp: validation.otp });
  setImmediate(processQueue);

  return res.status(200).json({
    res: true,
    status: 'accepted',
  });
});

/**
 * Prueba síncrona y real de todo el flujo:
 * valida el mismo cuerpo enviado por el cajero, extrae el OTP y espera la
 * respuesta de Meta para devolver el resultado directamente al curl.
 */
router.post('/probarEnvioOtp', requireOtpTestAccess, async (req, res) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const validation = validateIncomingMessage(req.body);

  if (!validation.ok) {
    return res.status(422).json({
      res: false,
      status: 'discarded',
      requestId,
      stage: 'validation',
      error: validation.error,
    });
  }

  console.log(
    `[WHATSAPP TEST] ${requestId} iniciando envío real a ${maskPhone(validation.tel)}`
  );

  try {
    const result = await sendOtp(validation.tel, validation.otp);
    const durationMs = Date.now() - startedAt;

    console.log(
      `[WHATSAPP TEST] ${requestId} aceptado por Meta en ${durationMs} ms. message_id=${result.messageId}`
    );

    return res.status(200).json({
      res: true,
      status: 'meta_accepted',
      requestId,
      stage: 'meta',
      realSend: true,
      normalizedPhone: validation.tel,
      extractedOtp: validation.otp,
      durationMs,
      meta: {
        messageId: result.messageId,
        waId: result.waId,
      },
      note: 'Meta acepto la solicitud; esto no confirma por si solo la entrega al telefono.',
    });
  } catch (error) {
    const details = serializeMetaError(error);
    const durationMs = Date.now() - startedAt;
    const statusCode = details.timeout ? 504 : 502;

    console.error(
      `[WHATSAPP TEST] ${requestId} fallo en ${durationMs} ms: ${details.message}`
    );

    return res.status(statusCode).json({
      res: false,
      status: 'meta_error',
      requestId,
      stage: 'meta',
      realSend: true,
      normalizedPhone: validation.tel,
      extractedOtp: validation.otp,
      durationMs,
      error: details,
    });
  }
});

module.exports = router;
