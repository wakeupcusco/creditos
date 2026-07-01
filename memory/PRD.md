# Cartera de Créditos — PRD

## Original problem statement
El usuario tenía una plantilla HTML (`prestamos-app.html`) para gestionar créditos/préstamos que usaba `window.storage` (API inexistente) y por lo tanto no era funcional. Solicitó:
1. Hacerla funcional con **backend real + base de datos**.
2. Agregar mejoras: **exportar/importar JSON, reporte de cobranzas, validación de DNI/teléfono, cálculo automático de mora** por días de atraso.
3. Hacerla **responsive** y proponer una **imagen/logo** (nombre de la empresa queda por definir).

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`) + MongoDB (motor). Todos los endpoints con prefijo `/api`.
- **Frontend**: React 19 (`/app/frontend/src/App.js` + `App.css`), estilo original preservado (paleta verde `#146356`, tipografías Fraunces / Inter / IBM Plex Mono), 100% responsive con hamburguesa a partir de 780px.
- **Persistencia**: colecciones Mongo `clients`, `credits`, `config`.
- **Logo**: SVG inline (`BrandIcon`) con motivo de "monedas" en tonos brand/dorado.

## Core requirements
- Gestión de clientes con validación peruana (DNI 8 dígitos, teléfono 9 dígitos iniciando con 9).
- Gestión de créditos con cálculo automático de plan de cuotas (frecuencias: Diario / Semanal / Quincenal / Mensual).
- Registro de pagos con captura de método (Efectivo/Transferencia/Yape/Plin), operador y generación de recibo imprimible.
- Cálculo automático de mora por días de atraso según tasa configurable.
- Reporte de cobranzas por rango de fechas con desglose por método y operador, exportable a CSV.
- Backup/Restore JSON completo (fusionar o reemplazar).

## Personas
- **Cobrador / Operador**: registra pagos día a día, imprime recibos, ve cuotas vencidas y próximas.
- **Administrador**: crea clientes/créditos, ajusta configuración de empresa (nombre, RUC, moneda, tasa de mora), corre reportes y exporta backups.

## What's been implemented (2026-01-07)
- CRUD completo de clientes con validaciones inline (frontend + backend Pydantic).
- CRUD completo de créditos con generación automática de cuotas y preview en vivo.
- Registro de pagos + generación de recibo imprimible (formato original preservado).
- Sugerencia automática de mora por días de atraso (endpoint `/api/mora/preview` + botón "Sugerir" en el modal de pago).
- Reporte de cobranzas (`/api/reports/cobranzas`) con filtros de fecha, KPIs, desglose por método y operador, exportación CSV.
- Backup export/import JSON (modos merge y replace).
- Configuración editable de empresa (nombre, RUC, moneda, tasa de mora diaria).
- UI responsive completa: sidebar deslizable en móvil, grillas adaptativas, tablas con scroll horizontal.
- Testing pasado 100% (backend 23/23 pytest + flujos frontend críticos verificados por testing subagent).

## Backlog / Future
- **P1**: Autenticación (JWT) — actualmente todos los endpoints son públicos.
- **P1**: Recordatorios automáticos de cuotas por WhatsApp/SMS (Twilio) o Telegram.
- **P2**: Dashboard con gráficos temporales (Recharts) de cobranzas por semana/mes.
- **P2**: Historial/auditoría de cambios por cliente y crédito.
- **P2**: Múltiples usuarios/operadores con perfiles y permisos.
- **P3**: Modo oscuro.
- **P3**: PWA / soporte offline.

## Next tasks list
1. Definir nombre definitivo de la empresa y actualizarlo desde Configuración.
2. (Opcional) Añadir autenticación si se va a exponer públicamente.
3. (Opcional) Integrar Twilio/Telegram para recordatorios automatizados.
