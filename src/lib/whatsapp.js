'use strict';

const REQUIRED_ENV = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_TEMPLATE_NAME',
  'WHATSAPP_TEMPLATE_LANGUAGE',
];

function assertWhatsAppConfig() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables obligatorias de WhatsApp: ${missing.join(', ')}`
    );
  }

  const graphVersion = getGraphApiVersion();
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error(
      'META_GRAPH_API_VERSION debe tener formato vXX.X, por ejemplo v25.0'
    );
  }
}

function getGraphApiVersion() {
  return (process.env.META_GRAPH_API_VERSION || 'v25.0').trim();
}

function getRequestTimeoutMs() {
  const value = Number(process.env.META_REQUEST_TIMEOUT_MS || 15000);
  return Number.isFinite(value) && value > 0 ? value : 15000;
}

function buildOtpTemplatePayload(to, otp) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: process.env.WHATSAPP_TEMPLATE_NAME.trim(),
      language: {
        code: process.env.WHATSAPP_TEMPLATE_LANGUAGE.trim(),
      },
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: otp,
            },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            {
              type: 'text',
              text: otp,
            },
          ],
        },
      ],
    },
  };
}

async function parseResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text.slice(0, 500) };
  }
}

class MetaWhatsAppError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MetaWhatsAppError';
    this.httpStatus = details.httpStatus;
    this.metaCode = details.metaCode;
    this.metaSubcode = details.metaSubcode;
    this.metaType = details.metaType;
    this.metaUserTitle = details.metaUserTitle;
    this.metaUserMessage = details.metaUserMessage;
    this.fbtraceId = details.fbtraceId;
    this.isTimeout = Boolean(details.isTimeout);
  }
}

function serializeMetaError(error) {
  return {
    message: error?.message || 'Error desconocido al contactar a Meta',
    httpStatus: error?.httpStatus || null,
    metaCode: error?.metaCode || null,
    metaSubcode: error?.metaSubcode || null,
    metaType: error?.metaType || null,
    metaUserTitle: error?.metaUserTitle || null,
    metaUserMessage: error?.metaUserMessage || null,
    fbtraceId: error?.fbtraceId || null,
    timeout: Boolean(error?.isTimeout),
  };
}

/**
 * Envía un OTP con la plantilla oficial de autenticación de Meta.
 *
 * @param {string} to Número normalizado, con código de país y solo dígitos.
 * @param {string} otp Código de exactamente 5 dígitos.
 * @returns {Promise<{messageId: string, waId: string|null}>}
 */
async function sendOtp(to, otp) {
  assertWhatsAppConfig();

  if (!/^\d{5}$/.test(otp)) {
    throw new Error('El OTP debe contener exactamente 5 dígitos');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getRequestTimeoutMs());

  const url = new URL(
    `${getGraphApiVersion()}/${process.env.WHATSAPP_PHONE_NUMBER_ID.trim()}/messages`,
    'https://graph.facebook.com/'
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildOtpTemplatePayload(to, otp)),
      signal: controller.signal,
    });

    const body = await parseResponseBody(response);

    if (!response.ok) {
      const metaError = body?.error;
      throw new MetaWhatsAppError(
        metaError?.message || `Meta respondió HTTP ${response.status}`,
        {
          httpStatus: response.status,
          metaCode: metaError?.code,
          metaSubcode: metaError?.error_subcode,
          metaType: metaError?.type,
          metaUserTitle: metaError?.error_user_title,
          metaUserMessage: metaError?.error_user_msg,
          fbtraceId: metaError?.fbtrace_id,
        }
      );
    }

    const messageId = body?.messages?.[0]?.id;
    if (!messageId) {
      throw new MetaWhatsAppError(
        'Meta aceptó la solicitud, pero no devolvió el identificador del mensaje',
        { httpStatus: response.status }
      );
    }

    return {
      messageId,
      waId: body?.contacts?.[0]?.wa_id || null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new MetaWhatsAppError(
        'Tiempo de espera agotado al contactar a Meta',
        { isTimeout: true }
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  assertWhatsAppConfig,
  buildOtpTemplatePayload,
  sendOtp,
  serializeMetaError,
  MetaWhatsAppError,
};
