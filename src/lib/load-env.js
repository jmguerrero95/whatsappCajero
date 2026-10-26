'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Carga variables desde el .env ubicado en la raíz del proyecto,
 * independientemente de la carpeta desde la que se ejecute Node o PM2.
 * Se puede sobrescribir la ruta mediante ENV_FILE.
 *
 * No reemplaza variables del sistema que ya tengan un valor real.
 *
 * @param {string} [filePath]
 * @returns {string|null} Ruta cargada o null si no existe.
 */
function loadEnv(
  filePath = process.env.ENV_FILE
    ? path.resolve(process.env.ENV_FILE)
    : path.join(PROJECT_ROOT, '.env')
) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');

  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    // También acepta el formato: export VARIABLE=valor
    if (line.startsWith('export ')) {
      line = line.slice(7).trim();
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Si PM2 definió la variable como cadena vacía, permite cargarla desde .env.
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }

  return filePath;
}

module.exports = { loadEnv, PROJECT_ROOT };
