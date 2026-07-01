# Cartera de Créditos — PRD

## Original problem statement
El usuario tenía una plantilla HTML de gestión de créditos/préstamos que usaba `window.storage` (API inexistente). Pidió: (1) hacerla funcional con backend real + base de datos, (2) exportar/importar JSON, reporte de cobranzas, validación DNI/teléfono, cálculo automático de mora, (3) responsive. Iteración 2: sistema de perfiles admin/asesor, campo ocupación en clientes, panel de recordatorios de vencimientos.

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`) + MongoDB (motor). Auth JWT (Bearer). RBAC en `admin` / `asesor`.
- **Frontend**: React 19 (`/app/frontend/src/App.js` + `App.css`), responsive con hamburguesa <780px.
- **Persistencia**: colecciones `users`, `clients`, `credits`, `config`. Contraseñas con bcrypt.
- **Autenticación**: JWT HS256, 12h TTL, secreto en `JWT_SECRET`. Admin seedeado al arranque con `ADMIN_USERNAME`/`ADMIN_PASSWORD` (idempotente).

## Core requirements
- Login por usuario+contraseña.
- Perfiles admin/asesor con visibilidad diferenciada de créditos y funcionalidades.
- Sólo admin crea/edita asesores desde sección "Asesores".
- Créditos se autoasignan al asesor que los crea; admin puede reasignar.
- Clientes compartidos entre asesores; validaciones DNI (8 díg) y teléfono peruano (9 díg iniciando en 9), campo ocupación.
- Cobranzas: pago genera recibo con "Usuario" = nombre del asesor autenticado.
- Cálculo automático de mora por días de atraso (tasa configurable).
- Panel de Recordatorios: buckets Vencidas / Hoy / Mañana / Esta semana + botón "Marqué"; enlace WhatsApp por teléfono.
- Reporte de cobranzas por rango con filtro por asesor (admin), exportable CSV.
- Backup export/import JSON (admin).
- Configuración editable de empresa (admin).

## Personas
- **Administrador**: gestiona asesores, ve todos los créditos, configura empresa/mora, corre reportes globales, reasigna créditos.
- **Asesor (cobrador)**: ve solo sus créditos/cuotas, registra pagos, imprime recibos, gestiona sus recordatorios de cobranza.

## What's been implemented
### Iteration 1 (2026-01-07)
- CRUD clientes y créditos + generación automática de plan de cuotas.
- Pago + recibo imprimible.
- Mora automática por días de atraso.
- Reporte de cobranzas con export CSV.
- Backup/restore JSON.
- UI responsive completa.

### Iteration 2 (2026-01-07)
- Auth JWT + login screen + logout.
- Sistema RBAC admin/asesor con visibilidad diferenciada (asesor solo ve sus créditos).
- Sección "Asesores" (admin) con CRUD completo + activar/desactivar.
- Cambio de contraseña propio.
- Reasignación de créditos por admin.
- Campo `ocupacion` en clientes.
- Panel de Recordatorios con buckets y marcado.
- Enlace directo a WhatsApp (`wa.me/51<telefono>`) desde recordatorios.
- Filtro por asesor en Cobranzas y Recordatorios (admin).
- Testing: 31/31 backend PASS + flujos frontend críticos verificados.

### Iteration 3 (2026-01-07)
- **Ranking de asesores** (admin only): endpoint `/api/reports/ranking` con períodos mes/mes anterior/últimos 90 días/todo. UI con medallas 🥇🥈🥉, KPIs de total cobrado, mora recuperada, cuotas y asesores, y tabla con capital/interés/mora/puntuales/atrasadas/% puntualidad/créditos activos/cartera pendiente.
- **Créditos diarios lun-sáb**: la lógica de `add_interval` para frecuencia "Diario" ahora salta los domingos (weekday=6). Hint visual en el modal de nuevo crédito.
- **Cronograma imprimible con firma**: botón "Imprimir cronograma" en el detalle del crédito. Abre nueva ventana con datos completos del cliente, tabla de cuotas y dos áreas de firma (cliente y asesor).
- **Mora auto-aplicada + exonerable**: al abrir el modal de pago sobre una cuota vencida, la mora sugerida se pre-carga automáticamente. Editable manualmente, con botón rápido "Exonerar" que la pone en 0.
- Testing: **45/45 backend PASS**, frontend ~95% verificado.

## Backlog
- **P1**: Recordatorios automáticos por WhatsApp/Telegram (Twilio/Bot).
- **P1**: Rate-limit y lockout de brute-force en /auth/login.
- **P2**: Historial de auditoría por cliente y crédito.
- **P2**: Dashboard con gráficos temporales (Recharts).
- **P2**: Comisión/meta por asesor.
- **P3**: Modo oscuro, PWA offline.

## Next tasks list
1. Definir nombre definitivo de la empresa (editable en Configuración).
2. Crear los asesores reales del equipo desde la sección "Asesores".
3. Cambiar la contraseña del admin desde Configuración (admin123 es solo para el primer login).
4. (Opcional) Recordatorios automáticos por WhatsApp/Telegram.
