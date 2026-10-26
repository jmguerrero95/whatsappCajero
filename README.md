# Adaptador OTP para WhatsApp Cloud API (Meta)

Servicio Node.js/Express que conserva el contrato del sistema/cajero anterior y reemplaza la automatización no oficial de WhatsApp Web por **WhatsApp Cloud API oficial de Meta**.

El servicio recibe un número de teléfono y un texto libre, busca **un único código OTP aislado de exactamente 5 dígitos**, descarta cualquier mensaje que no cumpla esa condición y, cuando es válido, envía el código mediante una **plantilla oficial de autenticación** de WhatsApp.

> **Estado de esta versión:** la integración productiva usa Cloud API. Ya no depende de `whatsapp-web.js`, Puppeteer, Chromium, QR, `LocalAuth` ni sesiones de WhatsApp Web.

---

## 1. Objetivo y contexto

El sistema que origina los mensajes (por ejemplo, un cajero) ya enviaba solicitudes con este contrato:

```json
{
  "numero": "+573208246257",
  "mensaje": "Tu codigo de verificacion es 48327"
}
```

El objetivo de este adaptador es **no obligar a modificar ese sistema origen**.

El texto original ya no se envía libremente por WhatsApp. El servicio solo lo utiliza para localizar el OTP y posteriormente llama a Meta con una plantilla aprobada.

Flujo:

```text
Sistema/Cajero
    |
    | POST /api/enviarMensaje
    | { numero, mensaje }
    v
Servicio Node.js
    |
    |-- valida el numero
    |-- busca exactamente 1 OTP aislado de 5 digitos
    |-- si no cumple: descarta
    |-- si cumple: normaliza numero y extrae OTP
    v
WhatsApp Cloud API de Meta
    |
    | plantilla AUTHENTICATION
    | nombre: verificacion (configurable)
    | idioma: es_CO (configurable)
    v
WhatsApp del destinatario
```

---

## 2. Qué hace y qué NO hace

### Hace

- Mantiene `POST /api/enviarMensaje` como endpoint principal.
- Acepta `numero` y `mensaje`.
- Extrae un único OTP de 5 dígitos.
- Normaliza números internacionales al formato requerido por Cloud API: solo dígitos, con código de país y sin `+`.
- Envía el OTP mediante una plantilla oficial de autenticación.
- Coloca el OTP en el cuerpo y en el botón de copiar código de la plantilla.
- Mantiene una cola simple en memoria para procesar los envíos uno a uno.
- Oculta casi todo el teléfono en logs productivos.
- Expone `/health` para comprobar que el proceso HTTP está vivo.
- Incluye un endpoint de diagnóstico real que espera la respuesta de Meta.
- Incluye pruebas unitarias con `node --test`.

### No hace

- No genera el OTP. El OTP llega dentro del mensaje del sistema origen.
- No valida si un OTP es correcto para una operación bancaria/comercial. Solo lo transporta.
- No administra plantillas de Meta.
- No administra la cuenta de WhatsApp Business.
- No recibe webhooks de entrega.
- No confirma `delivered` o `read`.
- No persiste la cola en base de datos/Redis.
- No reintenta automáticamente un envío fallido.
- No autentica actualmente `/api/enviarMensaje`.

Estas últimas limitaciones son importantes si se adapta el servicio para un entorno de mayor criticidad o volumen.

---

## 3. Requisitos técnicos

- Node.js **18 o superior**.
- npm.
- Acceso HTTPS saliente a `graph.facebook.com`.
- Una cuenta de WhatsApp Business Platform/Cloud API productiva correctamente configurada en Meta.
- Una plantilla de autenticación aprobada.
- Un `Phone Number ID` productivo.
- Un token de usuario del sistema con permiso de mensajería.

La única dependencia de runtime del proyecto es Express. Node 18+ aporta `fetch` global, utilizado para llamar a Graph API.

---

## 4. Estructura del proyecto

```text
whatsapp/
├── .env                    # credenciales reales; NO versionar
├── .env.example            # ejemplo sin secretos
├── .gitignore
├── package.json
├── package-lock.json
├── request.http            # ejemplos de llamadas HTTP
├── README.md
├── src/
│   ├── index.js
│   ├── lib/
│   │   ├── diagnostic-access.js
│   │   ├── load-env.js
│   │   ├── message-parser.js
│   │   ├── otp-request.js
│   │   └── whatsapp.js
│   └── routes/
│       └── links.js
└── test/
    ├── diagnostic-access.test.js
    ├── message-parser.test.js
    ├── otp-request.test.js
    └── whatsapp.test.js
```

---

# PARTE A — CONFIGURACIÓN EN META/FACEBOOK

## 5. Conceptos que hay que distinguir

Meta utiliza varios objetos diferentes. Confundirlos es una de las causas más comunes de errores.

### Página de Facebook

Es la presencia pública de la empresa. **No es la cuenta técnica de WhatsApp ni el portafolio empresarial**.

### Portafolio empresarial (Business Portfolio)

Es el contenedor administrativo de la empresa. Allí deben quedar los activos del cliente: personas, página, aplicación, cuenta de WhatsApp, etc.

El cliente debe conservar el control del portafolio. El desarrollador puede trabajar como persona/colaborador con permisos suficientes, sin apropiarse de los activos.

### Aplicación de Meta

Aplicación creada en Meta for Developers y asociada al portafolio empresarial. Contiene el producto WhatsApp y es la aplicación para la que se genera el token técnico.

### WABA

`WhatsApp Business Account` o cuenta de WhatsApp Business Platform. Puede contener uno o más números empresariales.

### Phone Number ID

Identificador interno de Meta para el número remitente.

**No es:**

- el número visible `+57...`;
- el WABA ID;
- el token de acceso.

La API de envío usa este ID en la URL:

```text
POST https://graph.facebook.com/{VERSION}/{PHONE_NUMBER_ID}/messages
```

### Access Token

Credencial usada en el header:

```text
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
```

Nunca debe colocarse como parte de la URL ni confundirse con `PHONE_NUMBER_ID`.

---

## 6. Preparación del portafolio empresarial

Si se configura la solución desde cero:

1. El cliente debe tener una cuenta personal de Facebook que administre su negocio.
2. Entrar a Meta Business Suite.
3. Comprobar si ya existe un portafolio empresarial de la empresa.
4. Si existe, reutilizarlo. Evitar crear portafolios duplicados.
5. Verificar que el cliente tenga **control total**.
6. Verificar que la página de Facebook correcta pertenezca o esté correctamente asociada al portafolio.
7. Agregar al desarrollador con los permisos necesarios para realizar la integración.
8. Activar autenticación en dos pasos para administradores.

No es recomendable que el desarrollador sea el único administrador ni que los activos queden bajo una cuenta personal del desarrollador.

---

## 7. Verificación empresarial

Para producción, mantener los datos reales y consistentes de la empresa:

- razón social;
- NIT/registro equivalente;
- dirección;
- teléfono;
- correo empresarial;
- sitio web;
- documentación legal que Meta solicite.

La interfaz y los requisitos pueden cambiar. Si Meta presenta el flujo de verificación empresarial, debe realizarlo el propietario/representante o una persona autorizada del cliente.

---

## 8. Crear la aplicación en Meta for Developers

1. Iniciar sesión en Meta for Developers con un perfil autorizado en el portafolio.
2. Crear una aplicación orientada a empresa/WhatsApp.
3. Asociarla al **portafolio empresarial del cliente**.
4. Añadir/configurar el producto **WhatsApp**.
5. Confirmar que la aplicación queda vinculada al negocio correcto.

Evitar crear la aplicación bajo un negocio personal o un portafolio distinto al propietario de la WABA.

---

## 9. Crear o seleccionar la WABA productiva

Dentro de la configuración de WhatsApp:

1. Crear o seleccionar la cuenta de WhatsApp Business productiva.
2. No confundirla con `Test WhatsApp Business Account`.
3. Verificar que la WABA productiva pertenezca al portafolio correcto.

La cuenta de prueba de Meta sirve para pruebas iniciales. **No debe recibir la tarjeta del cliente ni utilizarse como cuenta productiva.**

---

## 10. Registrar y verificar el número

Para el número productivo:

1. Añadir el número empresarial a WhatsApp Manager/Cloud API.
2. Comprobar que la empresa puede recibir SMS o llamada de verificación.
3. Completar la verificación del número.
4. Configurar la verificación en dos pasos cuando Meta lo solicite.
5. Solicitar/configurar el nombre visible de la empresa.
6. Esperar aprobación cuando corresponda.

Meta documenta que un número debe ser verificado y registrado para poder utilizarse con Cloud API.

---

## 11. Método de pago

El método de pago debe pertenecer al cliente y asociarse a la **WABA productiva**, no a la cuenta de prueba.

Una ruta típica en Business Suite es:

```text
Meta Business Suite
→ Facturación / Pagos
→ Cuentas
→ Cuentas de WhatsApp Business
→ seleccionar WABA productiva
→ Añadir método de pago
```

La interfaz puede cambiar de nombre, pero el criterio es siempre el mismo: seleccionar la cuenta de WhatsApp Business **productiva**.

El desarrollador no necesita conocer la tarjeta. El cliente puede ingresarla directamente mientras comparte pantalla.

---

## 12. Crear la plantilla de autenticación OTP

En WhatsApp Manager:

```text
WhatsApp Manager
→ Plantillas de mensajes
→ Crear plantilla
→ Categoría: Autenticación
```

Esta solución espera una plantilla OTP con botón **Copiar código**.

Configuración usada actualmente:

```text
Nombre técnico: verificacion
Categoría: Autenticación
Idioma: Spanish (COL) / es_CO
OTP: variable {{1}}
Botón: Copiar código
```

### Importante: texto de la plantilla de autenticación

Las plantillas `AUTHENTICATION` están deliberadamente estandarizadas por Meta. No ofrecen la misma libertad de edición de una plantilla Utility o Marketing. El propósito es que el mensaje sea inequívocamente un código de autenticación.

No cambiar a una categoría diferente solo para obtener texto personalizado si el caso de uso real sigue siendo OTP.

---

## 13. Crear el usuario del sistema y token productivo

Para producción, no usar el token temporal del panel de `Getting Started`.

Crear un usuario del sistema en el portafolio empresarial:

```text
Configuración empresarial
→ Usuarios
→ Usuarios del sistema
→ Agregar
```

Ejemplo de nombre:

```text
WhatsApp OTP Backend
```

### Asignaciones necesarias

Al usuario del sistema hay que asignarle **dos activos**, no solo la aplicación:

```text
Usuario del sistema
├── Aplicación de Meta
└── Cuenta de WhatsApp Business productiva (WABA)
```

Si se asigna únicamente la aplicación, el token puede existir pero no tener acceso al `Phone Number ID` productivo.

### Permisos

Para este proyecto, el permiso esencial de envío es:

```text
whatsapp_business_messaging
```

`whatsapp_business_management` puede añadirse si el mismo token debe consultar o administrar activos de WhatsApp, pero el servicio actual solo necesita enviar mensajes.

Después de asignar los activos:

1. Generar un token para la aplicación correcta.
2. Seleccionar `whatsapp_business_messaging`.
3. Guardar el token de forma segura.
4. Nunca subirlo a Git.
5. Si el token se expone en logs, capturas o chats, regenerarlo.

La documentación oficial de Meta indica que Cloud API admite tokens de usuario y de usuario del sistema; para integraciones de servidor se recomienda el token de usuario del sistema.

---

## 14. Obtener el Phone Number ID

En WhatsApp Manager, seleccionar el número productivo. Debe aparecer un valor similar a:

```text
Identificador del número de teléfono: 1234567890123456
```

Ese valor se coloca en:

```env
WHATSAPP_PHONE_NUMBER_ID=1234567890123456
```

No colocar:

```env
WHATSAPP_PHONE_NUMBER_ID=+573237644831   # INCORRECTO
WHATSAPP_PHONE_NUMBER_ID=EAAG...         # INCORRECTO: esto sería un token
```

---

# PARTE B — CONFIGURACIÓN DEL SERVICIO

## 15. Instalación

```bash
cd whatsapp
npm install
```

Comprobar versión de Node:

```bash
node -v
```

Debe ser Node 18 o superior.

---

## 16. Archivo `.env`

Copiar el ejemplo:

```bash
cp .env.example .env
```

Configuración mínima:

```env
PORT=3000

WHATSAPP_ACCESS_TOKEN=EAAG_REEMPLAZAR_POR_TOKEN_REAL
WHATSAPP_PHONE_NUMBER_ID=REEMPLAZAR_POR_PHONE_NUMBER_ID
WHATSAPP_TEMPLATE_NAME=verificacion
WHATSAPP_TEMPLATE_LANGUAGE=es_CO

META_GRAPH_API_VERSION=v25.0
META_REQUEST_TIMEOUT_MS=15000
```

### Variables obligatorias para el envío

| Variable | Uso |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | token de usuario del sistema |
| `WHATSAPP_PHONE_NUMBER_ID` | ID interno del número productivo |
| `WHATSAPP_TEMPLATE_NAME` | nombre técnico exacto de la plantilla |
| `WHATSAPP_TEMPLATE_LANGUAGE` | código exacto del idioma aprobado |

### Variables opcionales

| Variable | Valor por defecto | Uso |
|---|---:|---|
| `PORT` | `3000` | puerto HTTP |
| `META_GRAPH_API_VERSION` | `v25.0` | versión de Graph API |
| `META_REQUEST_TIMEOUT_MS` | `15000` | timeout de cada solicitud a Meta |

### Diagnóstico opcional

El código incluido en este ZIP protege `/api/probarEnvioOtp` con una clave y, por defecto, solo permite localhost:

```env
OTP_TEST_API_KEY=GENERAR_UNA_CLAVE_LARGA
OTP_TEST_LOCAL_ONLY=true
```

Generar una clave:

```bash
openssl rand -hex 32
```

> El endpoint de diagnóstico debe eliminarse o mantenerse estrictamente restringido cuando termine la puesta en producción.

---

## 17. Cómo carga `.env`

`src/lib/load-env.js` busca el archivo `.env` en la **raíz real del proyecto**, no en la carpeta desde donde se ejecutó Node.

Estructura esperada:

```text
whatsapp/
├── .env
├── package.json
└── src/
```

También se puede especificar una ruta distinta:

```bash
ENV_FILE=/ruta/privada/whatsapp.env node src/index.js
```

### Precedencia importante

Si una variable ya existe en el entorno del proceso, el cargador **no la reemplaza** con la del `.env`.

Esto es especialmente importante con PM2. Una variable antigua guardada en PM2 puede prevalecer sobre el `.env` recién modificado.

---

## 18. Arranque

Desarrollo/ejecución directa:

```bash
npm start
```

Salida esperada:

```text
Server on port 3000
```

Health check:

```bash
curl http://127.0.0.1:3000/health
```

Respuesta:

```json
{
  "status": "ok"
}
```

---

## 19. Ejecución con PM2

Ejemplo:

```bash
pm2 start src/index.js --name whatsapp-otp
pm2 save
```

Ver logs:

```bash
pm2 logs whatsapp-otp
```

Reiniciar después de modificar `.env`:

```bash
pm2 restart whatsapp-otp
```

### Si PM2 sigue usando valores viejos

Puede ocurrir si el proceso fue creado con variables de entorno explícitas. Como el cargador conserva variables ya existentes, PM2 puede ganar sobre `.env`.

Diagnóstico:

```bash
pm2 env <ID_DEL_PROCESO>
```

Solución limpia:

```bash
pm2 delete whatsapp-otp
cd /ruta/del/proyecto/whatsapp
pm2 start src/index.js --name whatsapp-otp
pm2 save
```

Evitar definir las mismas credenciales simultáneamente en `.env`, shell y configuración PM2 salvo que exista una política clara de precedencia.

---

# PARTE C — FUNCIONAMIENTO DEL CÓDIGO

## 20. Endpoint productivo

```http
POST /api/enviarMensaje
Content-Type: application/json
```

Ejemplo:

```json
{
  "numero": "+573208246257",
  "mensaje": "Tu codigo de verificacion es 48327"
}
```

Respuesta válida:

```json
{
  "res": true,
  "status": "accepted"
}
```

### Qué significa `accepted`

Significa únicamente:

1. el JSON fue válido;
2. el número pudo normalizarse;
3. se encontró exactamente un OTP válido;
4. el trabajo fue agregado a la cola local.

**No significa que Meta lo haya aceptado todavía y tampoco significa que el teléfono lo haya recibido.**

El envío real ocurre en segundo plano mediante `processQueue()`.

---

## 21. Regla exacta del OTP

`src/lib/message-parser.js` busca exactamente **un código aislado de 5 dígitos**.

Aceptados:

```text
Tu código es 48327
Código: 12345.
Usa (82910) para continuar
```

Descartados:

```text
Código 1234
Código 123456
No existe código
Código 12345 y después 67890
ABC12
```

Un número de 5 dígitos dentro de un número más largo tampoco se considera OTP.

Si hay dos candidatos, se devuelve `null` deliberadamente para no adivinar cuál enviar.

---

## 22. Normalización del teléfono

Ejemplos válidos:

```text
+57 320 824 6257
+57 (320) 824-6257
573208246257
00573208246257
```

Internamente quedan como:

```text
573208246257
```

Reglas:

- solo números internacionales;
- máximo E.164 de 15 dígitos;
- no se permite que empiece por `0` después de normalizar;
- se elimina `+`, espacios, paréntesis, puntos y guiones;
- prefijo `00` se elimina.

El sistema origen debe suministrar el **código de país**. El adaptador no adivina el país.

---

## 23. Mensajes descartados

Cuando número u OTP no cumplen las reglas:

```json
{
  "res": false,
  "status": "discarded",
  "error": "el mensaje debe contener un unico codigo aislado de 5 digitos"
}
```

Actualmente se responde HTTP `200` para conservar compatibilidad con el comportamiento del sistema origen.

Esto puede cambiarse en una integración nueva si el consumidor está preparado para manejar `4xx`.

---

## 24. Cola local

`src/routes/links.js` contiene:

```js
let sending = false;
const queue = [];
```

Los mensajes se procesan secuencialmente.

### Ventajas

- implementación simple;
- evita disparar muchos envíos simultáneos;
- suficiente para volumen bajo/moderado y un único proceso.

### Limitaciones críticas

- la cola está en RAM;
- se pierde si Node/PM2/servidor se reinicia;
- no existe reintento persistente;
- múltiples instancias Node tendrían colas independientes;
- no tiene límite máximo de longitud.

Para una evolución de alta disponibilidad se recomienda reemplazarla por Redis + BullMQ, RabbitMQ, SQS o un mecanismo equivalente.

---

## 25. Payload enviado a Meta

El servicio construye un payload conceptualmente equivalente a:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "573208246257",
  "type": "template",
  "template": {
    "name": "verificacion",
    "language": {
      "code": "es_CO"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          {
            "type": "text",
            "text": "48327"
          }
        ]
      },
      {
        "type": "button",
        "sub_type": "url",
        "index": "0",
        "parameters": [
          {
            "type": "text",
            "text": "48327"
          }
        ]
      }
    ]
  }
}
```

El mismo OTP aparece en cuerpo y botón porque la plantilla de autenticación con **Copiar código** requiere parametrizar ambos componentes.

La llamada se realiza a:

```text
https://graph.facebook.com/{META_GRAPH_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages
```

con:

```text
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
Content-Type: application/json
```

---

## 26. Respuesta de Meta

Cuando Meta acepta el mensaje devuelve un identificador `wamid...`.

Ejemplo conceptual:

```json
{
  "messages": [
    {
      "id": "wamid...."
    }
  ]
}
```

El servicio registra:

```text
[WHATSAPP] OTP aceptado por Meta para ********6257. message_id=wamid...
```

### Importante

`wamid` significa **Meta aceptó la solicitud**, no necesariamente que el teléfono ya recibió el mensaje.

Para conocer estados `sent`, `delivered`, `read` o `failed` se debe implementar webhook. Este proyecto no lo implementa actualmente porque el alcance original era únicamente reemplazar el envío no oficial.

---

# PARTE D — ENDPOINT DE DIAGNÓSTICO

## 27. `/api/probarEnvioOtp`

Endpoint destinado a pruebas controladas desde el propio servidor.

A diferencia de `/api/enviarMensaje`, este endpoint **espera la respuesta real de Meta** y devuelve el error detallado al `curl`.

En esta copia del proyecto está protegido por:

- `OTP_TEST_API_KEY`;
- restricción a localhost por defecto.

Configurar:

```env
OTP_TEST_API_KEY=CLAVE_LARGA
OTP_TEST_LOCAL_ONLY=true
```

Probar desde el servidor:

```bash
curl -i -X POST http://127.0.0.1:3000/api/probarEnvioOtp \
  -H 'Content-Type: application/json' \
  -H 'X-OTP-Test-Key: CLAVE_LARGA' \
  -d '{"numero":"573208246257","mensaje":"Tu codigo de verificacion es 48327"}'
```

Respuesta exitosa típica:

```json
{
  "res": true,
  "status": "meta_accepted",
  "stage": "meta",
  "realSend": true,
  "normalizedPhone": "573208246257",
  "extractedOtp": "48327",
  "meta": {
    "messageId": "wamid...",
    "waId": "573208246257"
  }
}
```

Este endpoint revela el OTP en su respuesta y debe considerarse **herramienta temporal de diagnóstico**, no funcionalidad pública.

### Eliminarlo después de terminar las pruebas

Eliminar de `src/routes/links.js`:

- middleware `requireOtpTestAccess`;
- ruta `router.post('/probarEnvioOtp', ...)`;
- imports exclusivos del diagnóstico.

Después pueden eliminarse también:

```text
src/lib/diagnostic-access.js
test/diagnostic-access.test.js
```

Y las variables:

```text
OTP_TEST_API_KEY
OTP_TEST_LOCAL_ONLY
```

---

# PARTE E — PRUEBAS

## 28. Ejecutar tests

```bash
npm test
```

La versión documentada cuenta con 13 pruebas automatizadas para:

- direcciones loopback;
- autenticación del endpoint de diagnóstico;
- extracción de OTP;
- rechazo de códigos de longitud incorrecta;
- rechazo de mensajes ambiguos;
- normalización de números;
- validación del contrato del cajero;
- construcción de la plantilla;
- URL con Phone Number ID;
- lectura del `wamid`;
- serialización de errores de Meta.

Las pruebas de `sendOtp` simulan `fetch`; `npm test` **no envía mensajes reales**.

Para prueba real usar `/api/probarEnvioOtp`.

---

# PARTE F — SOLUCIÓN DE PROBLEMAS

## 29. Error al iniciar: faltan variables obligatorias

Ejemplo:

```text
Faltan variables obligatorias de WhatsApp: WHATSAPP_ACCESS_TOKEN, ...
```

Comprobar:

```bash
ls -la
```

Debe existir exactamente:

```text
.env
```

No:

```text
.env.txt
```

El `.env` debe estar en la raíz del proyecto, junto a `package.json`.

El arranque indica la ruta esperada cuando falta el archivo.

### PM2 sigue leyendo variables viejas

Si `.env` está correcto pero el comportamiento no cambia, revisar variables almacenadas por PM2.

Recrear el proceso:

```bash
pm2 delete whatsapp-otp
cd /ruta/del/proyecto/whatsapp
pm2 start src/index.js --name whatsapp-otp
pm2 save
```

---

## 30. Error Meta 100 / subcode 33 y el Object ID comienza por `EAA...`

Ejemplo:

```text
Unsupported post request. Object with ID 'EAAG...' does not exist...
```

### Causa

El token fue colocado accidentalmente en:

```env
WHATSAPP_PHONE_NUMBER_ID=
```

### Corrección

```env
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=1234567890123456
```

El `PHONE_NUMBER_ID` debe ser numérico.

---

## 31. Error Meta 100 / subcode 33 con Phone Number ID numérico correcto

Ejemplo:

```text
Unsupported post request. Object with ID '1234567890123456' does not exist,
cannot be loaded due to missing permissions...
```

Si el ID existe en WhatsApp Manager, la causa más probable es **permisos/asignación del token**.

Revisar:

```text
Usuario del sistema
├── Aplicación correcta
└── WABA productiva correcta
```

Después de asignar ambos activos, generar **un token nuevo** con:

```text
whatsapp_business_messaging
```

No asumir que agregar la aplicación al usuario del sistema automáticamente le concede acceso a la WABA.

### Prueba directa del acceso al Phone Number ID

```bash
set -a
. ./.env
set +a

curl -sS \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
  "https://graph.facebook.com/${META_GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name"
```

Si funciona debe devolver información del número.

---

## 32. Meta acepta pero el mensaje no llega

Si `/api/probarEnvioOtp` devuelve:

```text
status=meta_accepted
messageId=wamid...
```

la solicitud llegó correctamente a Meta.

Revisar entonces:

1. estado/calidad de la plantilla;
2. destinatario y país;
3. restricciones de la cuenta;
4. facturación;
5. límites de mensajería;
6. estado del número en WhatsApp Manager;
7. logs/diagnóstico de Meta.

Sin webhook, este proyecto no puede distinguir automáticamente entre `sent`, `delivered` y un fallo posterior.

---

## 33. Error de plantilla no encontrada o idioma incorrecto

Comprobar exactamente:

```env
WHATSAPP_TEMPLATE_NAME=verificacion
WHATSAPP_TEMPLATE_LANGUAGE=es_CO
```

El nombre debe ser el **nombre técnico** de la plantilla, no el texto visible.

El idioma debe coincidir con la traducción aprobada. `Spanish (COL)` corresponde en esta integración a `es_CO`.

Verificar también que la plantilla pertenezca a la **misma WABA** que contiene el número usado por `WHATSAPP_PHONE_NUMBER_ID`.

---

## 34. Error relacionado con método de pago

Comprobar que la tarjeta esté agregada a la WABA productiva.

No agregarla a:

```text
Test WhatsApp Business Account
```

si el número real pertenece a otra WABA.

---

## 35. Token inválido o expirado

Síntomas habituales:

- OAuthException;
- sesión/token expirado;
- permisos faltantes;
- llamadas que funcionaban con el token temporal y después dejan de hacerlo.

Corrección:

1. usar usuario del sistema;
2. asignar app + WABA;
3. generar token para la aplicación correcta;
4. conceder `whatsapp_business_messaging`;
5. actualizar `.env`;
6. reiniciar Node/PM2.

Si un token fue expuesto públicamente, generar otro y dejar de utilizar el anterior.

---

## 36. `fetch is not defined`

El proyecto depende del `fetch` nativo de Node.

Comprobar:

```bash
node -v
```

Usar Node 18 o superior.

---

## 37. Timeout a Meta

Valor por defecto:

```env
META_REQUEST_TIMEOUT_MS=15000
```

Si el servidor no puede salir a Internet o existe un problema de red, `sendOtp()` abortará la llamada y devolverá un error de timeout.

Comprobar conectividad:

```bash
curl -I https://graph.facebook.com
```

No aumentar el timeout indefinidamente para ocultar problemas de red.

---

# PARTE G — SEGURIDAD Y PRODUCCIÓN

## 38. Proteger `/api/enviarMensaje`

Actualmente el endpoint productivo **no tiene autenticación propia**.

Si el servicio es accesible desde Internet, cualquier tercero que conozca la URL podría intentar usarlo para generar envíos.

Para producción, aplicar al menos una de estas estrategias:

- publicar el puerto únicamente en red privada;
- firewall con allowlist de IP del cajero;
- reverse proxy con autenticación;
- API key interna;
- firma HMAC entre sistemas;
- mTLS si la infraestructura lo justifica.

No confundir esta autenticación interna con el token de Meta. El token de Meta nunca debe enviarse al cajero.

---

## 39. Secretos

Nunca versionar:

```text
.env
WHATSAPP_ACCESS_TOKEN
```

El `.gitignore` debe mantener `.env` excluido.

No imprimir el token en logs.

No enviar el token en capturas o canales no seguros.

---

## 40. Logs

El endpoint productivo no imprime el OTP durante el flujo normal.

El número se enmascara dejando solamente los últimos cuatro dígitos.

El endpoint de diagnóstico sí devuelve `extractedOtp` para facilitar pruebas. Por eso debe eliminarse o restringirse cuando ya no sea necesario.

---

## 41. Cola persistente y reintentos

Para una instalación crítica, el siguiente cambio recomendado es reemplazar la cola en memoria.

Arquitectura sugerida:

```text
Cajero
  ↓
API Node
  ↓
Redis/BullMQ
  ↓
Worker WhatsApp
  ↓
Meta
```

Ventajas:

- mensajes pendientes sobreviven reinicios;
- reintentos controlados;
- backoff;
- observabilidad;
- múltiples workers;
- dead-letter queue;
- límites de concurrencia.

No reintentar indiscriminadamente todos los errores de Meta. Diferenciar errores temporales de errores de validación, plantilla, permisos o destinatario.

---

## 42. Webhooks de entrega (mejora opcional)

El alcance actual termina cuando Meta acepta la solicitud.

Para saber el resultado real de entrega, implementar un webhook HTTPS y suscribir el campo `messages` de WhatsApp.

Flujo futuro:

```text
sendOtp()
  ↓
Meta devuelve wamid
  ↓
guardar wamid
  ↓
Meta → webhook
  ↓
sent / delivered / read / failed
```

Esto requiere adicionalmente:

- URL HTTPS pública;
- verify token propio;
- App Secret para verificar firmas;
- persistencia de estados.

No es obligatorio para que el envío actual funcione.

---

# PARTE H — ADAPTAR EL PROYECTO

## 43. Cambiar la plantilla

Si se crea otra plantilla compatible con el mismo esquema de autenticación:

```env
WHATSAPP_TEMPLATE_NAME=nueva_plantilla
WHATSAPP_TEMPLATE_LANGUAGE=es_CO
```

Si cambia la estructura de componentes de la plantilla, modificar:

```text
src/lib/whatsapp.js
→ buildOtpTemplatePayload()
```

---

## 44. Cambiar OTP de 5 a 6 dígitos

Actualmente la longitud está definida en más de un lugar deliberadamente para validar tanto entrada como salida.

Modificar:

### `src/lib/message-parser.js`

Cambiar el patrón de 5 a 6 dígitos.

### `src/lib/whatsapp.js`

Cambiar:

```js
/^\d{5}$/
```

por:

```js
/^\d{6}$/
```

### Tests

Actualizar:

```text
test/message-parser.test.js
test/otp-request.test.js
test/whatsapp.test.js
```

Después:

```bash
npm test
```

No hacer solo el cambio de regex y omitir las pruebas, porque se perdería la garantía de extremo a extremo.

---

## 45. Permitir texto libre además de OTP

No hacerlo reutilizando automáticamente la plantilla de autenticación.

Las plantillas de autenticación están destinadas a códigos OTP. Para mensajes de otro tipo debe utilizarse la categoría/plantilla adecuada y adaptar `buildOtpTemplatePayload()` o crear otro servicio de envío.

Recomendación:

```text
sendOtp()
sendUtilityTemplate()
sendMarketingTemplate()
```

como funciones separadas, en vez de convertir `sendOtp()` en un método genérico difícil de auditar.

---

## 46. Cambiar el contrato de entrada

Actualmente se conserva compatibilidad con:

```json
{
  "numero": "...",
  "mensaje": "...48327..."
}
```

En una nueva integración sería más limpio recibir directamente:

```json
{
  "numero": "573208246257",
  "otp": "48327"
}
```

En ese caso se podría eliminar la extracción del texto y simplificar:

```text
src/lib/message-parser.js
src/lib/otp-request.js
```

Pero no se hizo en esta versión para evitar modificar el cajero existente.

---

## 47. Escalar a varios números/remitentes

Actualmente hay un único:

```env
WHATSAPP_PHONE_NUMBER_ID=
```

Para varias marcas/números se recomienda no seleccionar el remitente directamente a partir de datos arbitrarios del request. Mantener un mapa controlado por configuración:

```text
marca_a → PHONE_NUMBER_ID_A
marca_b → PHONE_NUMBER_ID_B
```

Cada número debe pertenecer a una WABA a la que el token tenga acceso.

---

# PARTE I — MIGRACIÓN DESDE LA SOLUCIÓN ANTIGUA

## 48. Componentes eliminados

La implementación anterior dependía de automatizar WhatsApp Web. Esta solución ya no requiere:

```text
whatsapp-web.js
puppeteer
chromium
qrcode-terminal
LocalAuth
QR de sesión
sesión persistida de WhatsApp Web
webVersion fijada manualmente
```

Tampoco necesita mantener un teléfono/navegador web enlazado para que el servidor siga enviando.

---

## 49. Ventajas de Cloud API frente a WhatsApp Web automatizado

- API oficial.
- No hay QR periódico.
- No hay Chromium en servidor.
- Menor consumo de CPU/RAM/disco.
- No depende del DOM/protocolo interno de WhatsApp Web.
- Identificadores de mensaje oficiales (`wamid`).
- Posibilidad de webhooks de estado.
- Gestión empresarial de permisos.
- Facturación directamente bajo la empresa propietaria.

---

# PARTE J — CHECKLIST DE PUESTA EN PRODUCCIÓN

## 50. Meta

- [ ] Portafolio empresarial correcto.
- [ ] Cliente conserva control total.
- [ ] Aplicación asociada al portafolio correcto.
- [ ] WABA productiva correcta.
- [ ] Número real verificado/registrado.
- [ ] Nombre visible aprobado.
- [ ] Verificación en dos pasos configurada cuando corresponda.
- [ ] Método de pago agregado a la WABA productiva.
- [ ] Plantilla `AUTHENTICATION` activa.
- [ ] Nombre técnico exacto conocido.
- [ ] Idioma exacto conocido.
- [ ] Usuario del sistema creado.
- [ ] Aplicación asignada al usuario del sistema.
- [ ] WABA asignada al usuario del sistema.
- [ ] Token de usuario del sistema generado.
- [ ] `whatsapp_business_messaging` concedido.

## 51. Servidor

- [ ] Node 18+.
- [ ] `npm install` completado.
- [ ] `.env` en la raíz.
- [ ] Token correcto.
- [ ] Phone Number ID correcto.
- [ ] Plantilla/idioma correctos.
- [ ] `npm test` PASS.
- [ ] `/health` responde.
- [ ] prueba real desde servidor PASS.
- [ ] PM2 reiniciado con configuración correcta.
- [ ] `/api/enviarMensaje` protegido a nivel de red/aplicación.
- [ ] endpoint de diagnóstico eliminado o restringido.

## 52. Prueba funcional mínima

Probar:

1. mensaje con un único OTP de 5 dígitos → debe enviarse;
2. 4 dígitos → debe descartarse;
3. 6 dígitos → debe descartarse;
4. sin OTP → debe descartarse;
5. dos OTP de 5 dígitos → debe descartarse;
6. teléfono con `+`, espacios y guiones → debe normalizarse;
7. reinicio de PM2 → nuevo envío debe funcionar;
8. token/WABA/Phone ID incorrectos → diagnóstico debe devolver error de Meta claramente.

---

# PARTE K — REFERENCIA RÁPIDA

## 53. Variables productivas mínimas

```env
PORT=3000
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_TEMPLATE_NAME=verificacion
WHATSAPP_TEMPLATE_LANGUAGE=es_CO
META_GRAPH_API_VERSION=v25.0
META_REQUEST_TIMEOUT_MS=15000
```

## 54. Arrancar

```bash
npm install
npm test
npm start
```

## 55. Health

```bash
curl http://127.0.0.1:3000/health
```

## 56. Envío productivo

```bash
curl -i -X POST http://127.0.0.1:3000/api/enviarMensaje \
  -H 'Content-Type: application/json' \
  -d '{"numero":"573208246257","mensaje":"Tu codigo de verificacion es 48327"}'
```

## 57. Diagnóstico real contra Meta

```bash
curl -i -X POST http://127.0.0.1:3000/api/probarEnvioOtp \
  -H 'Content-Type: application/json' \
  -H 'X-OTP-Test-Key: TU_CLAVE' \
  -d '{"numero":"573208246257","mensaje":"Tu codigo de verificacion es 48327"}'
```

---

# 58. Documentación oficial recomendada

Meta mantiene colecciones oficiales de WhatsApp Business Platform en Postman. Son útiles porque muestran solicitudes reales y variables de Cloud API.

- WhatsApp Business Platform — workspace oficial de Meta:  
  https://www.postman.com/meta/whatsapp-business-platform/overview

- WhatsApp Cloud API — documentación/colección oficial:  
  https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api

- Ejemplo oficial de plantilla de autenticación con botón Copy Code:  
  https://www.postman.com/meta/whatsapp-business-platform/request/qzriq9r/create-authentication-template-w-otp-copy-code-button

La interfaz web de Meta Business Suite/WhatsApp Manager cambia con frecuencia. Si una ruta visual no coincide exactamente con este README, buscar el mismo **activo/concepto** (portafolio, WABA, Phone Number ID, System User, Payment Settings) antes de crear recursos duplicados.

---

# 59. Resumen para el siguiente desarrollador

Este proyecto **no es un bot general de WhatsApp**. Es un adaptador pequeño y deliberadamente limitado:

```text
mensaje legado del cajero
→ extraer 1 OTP de 5 dígitos
→ descartar todo lo demás
→ plantilla oficial AUTHENTICATION
→ WhatsApp Cloud API
```

Si se necesita ampliar el alcance, hacerlo creando nuevos flujos explícitos, sin relajar silenciosamente las reglas de OTP existentes.

Antes de modificar el comportamiento:

```bash
npm test
```

Después del cambio:

```bash
npm test
```

Y si se modifican credenciales, plantilla o permisos de Meta, realizar además una prueba real controlada mediante el endpoint de diagnóstico antes de habilitar tráfico productivo.
