# E2E — Check-in, cola de etiquetas e impresión

Guía manual para validar el flujo MVP: evento con `print_labels_enabled`, participante con QR, scanner, cola de trabajos y **Print Bridge** (emparejado o modo dev JWT).

## Prerrequisitos

- API desplegada (SAM) con tablas `TABLE_PRINT_JOBS`, `TABLE_PRINTER_STATIONS`, bucket S3 para `labels/*`.
- Cognito: usuario staff/tenant con token en el dashboard (`kv_token` en localStorage).
- Dashboard Next.js configurado con `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_KV_TENANT_ID`.
- Mac o Linux con CUPS (`lp`, `lpstat`) para el Print Bridge (opcional solo para revisar API sin papel).

## 1. Crear o abrir evento

1. Entra al dashboard → detalle del evento.
2. Pestaña **Configuración**:
   - Activa **Imprimir etiqueta al escanear** (`print_labels_enabled`).
   - Ajusta **QR habilitado** si envías emails con QR.
   - Guardado vía **PATCH `/events/:id`** (cada cambio se envía en caliente desde la UI).

## 2. Participante con QR

- Registra/importa participantes como ya hagan hoy en el tenant.
- Asegura que exista un código QR válido (email con QR / token en Dynamo según tu flujo).

## 3. Scanner (dashboard)

1. Pestaña **Scanner**.
2. Indica email del operador (se guarda en `kv_operator_email`).
3. **Activar cámara** y escanear el QR.
4. Tras primer check-in con éxito, la API debe **encolar una etiqueta** si `print_labels_enabled` es verdadero y S3/tablas están configuradas.
5. **Reprint etiqueta**: con un participante en pantalla válido, pulsa para llamar **`POST /print-jobs/test-print`** (dashboard usa JWT).

Métricas en scanner: pendientes de check-in, etiquetas impresas/fallidas, estado del puente (latido reciente).

## 4. Emparejar Print Bridge (recomendado)

1. En **Configuración → Emparejar Print Bridge**, pulsa **Generar código de emparejamiento**  
   (`POST /printer-stations/pair-code` con JWT → código de 6 dígitos ~10 min).
2. Abre **Print Bridge** (Electron).
3. Pantalla **Emparejar**:
   - Pega la **misma URL base de API** que usa el dashboard.
   - Código numérico.
   - Opcional: nombre del dispositivo.
4. Tras éxito, la app guarda `station_token` en `localStorage` y muestra el panel principal.
5. **Detectar impresoras**, elige una en el desplegable.
6. Pulsa **Iniciar polling**:
   - `GET /station/jobs` + `POST /station/jobs/:id/claim` + descarga PDF + `lp` + `complete` o `fail`.
7. Latido cada **30s**: `POST /printer-stations/heartbeat` con header **`x-station-token`**.

## 5. Modo desarrollo JWT (sin emparejar)

Útil solo en entorno controlado:

```bash
cd packages/print-bridge
PRINT_BRIDGE_API_URL="https://...amazonaws.com" \
PRINT_BRIDGE_TOKEN="<JWT Cognito>" \
PRINT_BRIDGE_EVENT_ID="<uuid-evento>" \
PRINT_BRIDGE_STATION_ID="" \
npx electron src/main.cjs
```

La app usará rutas **`/print-jobs`** autenticadas con Bearer en lugar de `/station/jobs`.

## 6. Verificación rápida en API

- **PATCH evento**: `PATCH /events/{event_id}` con `{"print_labels_enabled":true}` etc.
- **Cola JWT**: `GET /print-jobs?event_id=...` con Bearer.
- **Estación**: `GET /station/jobs` con `x-station-token`.

## Troubleshooting

| Problema | Qué revisar |
|----------|-------------|
| No aparece trabajo en cola | `TABLE_PRINT_JOBS`, S3 bucket, logs `print_job_enqueue_error`, `print_labels_enabled`. |
| Claim 409 | Otro proceso reclamó primero — normal; siguiente ciclo del poll. |
| PDF no descarga | Presignatura S3/políticas en bucket `labels/*`, key en el job. |
| `lp` falla | CUPS instalado, impresora seleccionada, permisos. |
| Heartbeat rechazado | Código caducado o estación borrada — genera nuevo código o reempareja. |
| CORS desde Bridge | Preflight permite `x-station-token` en API HTTP API CORS del template SAM. |

## 7. Comandos locales de compilación estática

```bash
npm run typecheck -w api
npm run typecheck -w @klients-voice/dashboard
sam validate -t packages/api/sam-template.yaml
```
