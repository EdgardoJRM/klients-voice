# Klients Events

SaaS multi-tenant for **workshops / webinars / in-person**: ClickFunnels → API → DynamoDB → **confirmation calls** (ElevenLabs + Twilio), plus **QR check-in**, **SES email**, and (roadmap) materials & label printing — all scoped by **`tenant_id`**.

## Monorepo

- **`packages/api`**: TypeScript Lambda (`sam-template.yaml`), handlers, DynamoDB services, ElevenLabs/Twilio helpers.
- **`packages/dashboard`**: Next.js 14 (App Router) + Tailwind UI premium minimal.

```bash
npm install
npm run build:api       # typecheck Lambda package
npm run build:dashboard
```

### API (SAM)

Desde `packages/api`:

```bash
sam build -t sam-template.yaml
sam deploy --guided    # primera vez (usa samconfig.toml)
sam deploy             # siguiente
```

**Salidas útiles**: `HttpApiUrl`, `CognitoUserPoolId`, `CognitoUserPoolClientId`, `RetryQueueUrl`, `AssetsBucketName`, `EmailLogsTableName`.

Tras deploy, establece variables en Lambda (**consola AWS** → cada función) y el parámetro SAM `SesFromEmail` (identity verificado en SES):

| Variable | Descripción |
|----------|-------------|
| `TABLE_EMAIL_LOGS` | Inyectado por SAM (`EmailLogsTable`). Auditoría de correos SES. |
| `S3_BUCKET_ASSETS` | Inyectado por SAM (`AssetsBucket`). QR y futuros materiales/etiquetas (privado). |
| `SES_FROM_EMAIL` | Inyectado vía parámetro `SesFromEmail` (p. ej. `events@tu-dominio.com`). Déjalo vacío para omitir envío en dev/sandbox sin identity. |
| `CLICKFUNNELS_WEBHOOK_SECRET` | Opcional: token compartido; header `x-klients-signature` debe coincidir. |
| `ELEVENLABS_WEBHOOK_SECRET` | Opcional: firma HMAC (simple) en header `elevenlabs-signature`. |
| `ELEVENLABS_API_KEY` | Dev local / si no usas Secrets Manager. |
| `SECRET_ELEVENLABS_ARN` | Producción: JSON `{"apiKey":"..."}` o string plano. |
| `SQS_RETRY_QUEUE_URL` | Solo funciones privada + retry consumer (SAM ya inyecta en private). |

`PublicApiFunction` incluye Dynamo (incl. email logs), S3 prefijo `qr-codes/` y SES para el webhook ClickFunnels; no incluye cola ni secretos ElevenLabs (salvo Dynamo + webhooks).

### Endpoints HTTP

- `POST /webhooks/clickfunnels/{tenant_slug}` — público  
- `POST /webhooks/elevenlabs/post-call` — público  
- `POST /scanner/validate` — JWT (check-in por QR en Dynamo)
- `POST /events/{event_id}/participants/{participant_id}/resend-qr` — JWT
- `POST /events/{event_id}/participants/{participant_id}/material-access` — body `{ "unlocked": boolean }`, JWT
- `POST|GET /tenants`, `POST|GET /events`, `GET /events/{id}/participants`, `GET /events/{id}/analytics`, `GET /analytics/{tenant_id}`, `POST /calls/start`, `POST /calls/retry` — **JWT Cognito**

### DynamoDB — GSIs esperados

Nombres alineados con el código (`SlugIndex`, `TenantDateIndex`, `EventIndex`, `EventEmailIndex`, `EventPhoneIndex`, `QrTokenIndex`, `TenantParticipantIndex`, … en calls/agents/notifications también `ParticipantIndex`, `ConversationIndex`, `TenantCallIndex`, `TenantAgentIndex`, `TenantPhoneIndex`, `TenantEmailIndex`, `TenantProviderIndex`). Para correos SES: tabla `EmailLogs` con índice `TenantCreatedIndex`.

### Seeds (dev)

Con credenciales AWS y tablas conocidas:

```bash
cd packages/api
TABLE_TENANTS=... TABLE_EVENTS=... node scripts/seed/seed-sample.mjs
```

### Eventos de prueba

JSON en [`packages/api/test/events/`](packages/api/test/events/) para `sam local invoke` o Postman:

- ClickFunnels webinar / presencial  
- Start calls  
- Post-call ElevenLabs: confirmed, cancelled, no_answer, voicemail, needs_human_followup *(más iniciación failure en docs ElevenLabs)*

### Prompt del agente

Plantilla recomendada: [`packages/api/docs/agent-prompt-template.md`](packages/api/docs/agent-prompt-template.md)

### Dashboard

`packages/dashboard`: copia `.env.example` a `.env.local`, define `NEXT_PUBLIC_API_URL` (URL del HTTP API sin slash final).  
Para vistas autenticadas en local, tras login en Cognito guarda el **access token / id token** en `localStorage` como **`kv_token`** y asigna `NEXT_PUBLIC_KV_TENANT_ID`.

### Checklists integración

**ClickFunnels**

1. Crea tenant y anota `tenant_slug`.  
2. Webhook: `POST https://{api}/webhooks/clickfunnels/{tenant_slug}`.  
3. Campos: `full_name`, `email`, `phone`, `event_id`, `event_title`, `event_type`, `event_date`, `event_time`, `webinar_url` (si aplica), `consent_voice=true`.  
4. Configura header `x-klients-signature` igual al secreto configurado en Lambda (opcional pero recomendado).

**ElevenLabs**

1. Agente conversacional + teléfono Twilio enlazado (IDs en tabla `Agents` / `PhoneNumbers`).  
2. Webhook post-call → `POST https://{api}/webhooks/elevenlabs/post-call`.  
3. `POST /calls/start` con `participant_id/event_id/tenant_id` incluidos vía dynamic variables automáticas.

## Licencia

Uso privado — Klients Voice.
