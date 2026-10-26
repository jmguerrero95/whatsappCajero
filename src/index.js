'use strict';

const { loadEnv, PROJECT_ROOT } = require('./lib/load-env');
const path = require('path');

const envPath = loadEnv();

const express = require('express');
const { assertWhatsAppConfig } = require('./lib/whatsapp');

try {
  assertWhatsAppConfig();
} catch (error) {
  const expectedPath = path.join(PROJECT_ROOT, '.env');
  const envStatus = envPath
    ? `Archivo .env leído desde: ${envPath}`
    : `No se encontró el archivo .env esperado en: ${expectedPath}`;

  console.error(envStatus);
  throw error;
}

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '32kb' }));

app.use('/api', require('./routes/links'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((_req, res) => {
  res.status(404).json({ res: false, error: 'ruta no encontrada' });
});

app.listen(port, () => {
  console.log(`Server on port ${port}`);
});
