<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Convenciones del proyecto (obligatorias)

## Red / API

- **`apiFetch` ya serializa el body**: pasa objetos (`body: payload`), NUNCA
  `body: JSON.stringify(payload)` — el doble stringify rompe el API con
  "is not valid JSON" (bug histórico en las actions de tacómetro).
- Server components/actions llaman al API con `apiServer` (`@/lib/api/server`,
  inyecta el JWT). Mutaciones = server actions en `actions.ts` que devuelven
  `ActionResult` y revalidan (`revalidateFlight`, `revalidatePath`).

## Fuentes únicas de UI (no duplicar)

- Estados de vuelo: `estado-vuelo.ts` + `estadoVueloStyle` (labels/colores).
- Formularios: componente `form-field`; etiquetas: `VtLabel`; vacíos:
  `empty-state`. No inventar variantes locales.
- **Tablas de LISTA**: `components/admin/data-table.tsx` (`DataTable`) —
  paginado 10/20/50/100, búsqueda rápida opcional y encabezado sticky. La
  página (server) arma filas-viewmodel SERIALIZABLES y un componente cliente
  delgado `<área>-table.tsx` define las columnas (ejemplar:
  `airports/airports-table.tsx`). Tablas de RESUMEN (matrices con totales,
  reportes) siguen con los primitivos de `ui/table`. Columnas con
  botones/menús llevan `noLink: true` si la fila tiene `rowHref`.
- Confirmación antes de TODO borrado/acción destructiva (Dialog + toast
  `sonner`). Regla permanente del cliente.
- Cotización de GRUPO (4-sep-2026): `types/grupos.ts` (1:1 con /v1/grupos),
  `lib/admin/grupos-ui.ts` (folioTexto "G-12", estados, semáforos vía
  estadoCobroSemaforo, `mensajeErrorGrupo` para TODOS los 409 estructurados),
  `app/admin/quotes/grupo/actions.ts` (server actions que nunca lanzan:
  `{ok,data}|{ok:false,error}`), `components/admin/grupos/**` (wizard,
  detalle, lista, badge `GrupoBadge`). El panel SOLO pinta: consolidado,
  totales, por persona, partición de cobros y montos derivados de extras
  vienen del API (la Σ local de una partición manual es solo ayuda visual).
  `ExtrasEditor` es el único editor de extras (desglose del cotizador);
  extras `origen='GRUPO'` se bloquean ("se edita desde el grupo").
  Cobros que son parte de un sobre (`cobro.cobro_grupo`) no se editan ni
  borran por vuelo; conciliación se enlaza al SOBRE (`cobro_grupo_id`).
  **Página única del grupo (5-sep-2026)**: `/admin/quotes/grupo/[id]` =
  `GrupoWorkspace` (cabecera + avisos + `GrupoForm lectura` a lo ancho +
  cobros + operación). `GrupoForm` en lectura pinta `grupo.consolidado`
  (no llama a /armar), valores como texto (`DatoLectura`), la tabla de
  aviones con menús va DENTRO de la sección «Aviones» (`avionesLectura`) y
  «Revisar» edita en el lugar (motivo, Guardar/Cancelar en `TotalBarGrupo`,
  `onGuardado` → lectura + `router.refresh()`). `/editar` solo redirige a
  `?revisar=1`. Sin cards duplicadas del detalle (consolidado, TUAS,
  itinerario, cargos, notas, toggles PDF viven solo en el form).
- **Cotización de UN avión** (alta `/admin/quotes/new` y página única
  `/admin/quotes/[id]`): ver la sección «Cotizador» más abajo — un solo
  `QuoteCalculator`, edición directa, vista previa real y candados.

## Cotizador (alta y página única de la cotización)

Rediseño aprobado por el cliente el 8-sep-2026 («el formulario es la hoja
1» + vista previa real + edición directa), fases F0–F3. Referencia de
negocio: `Diseño_Funcional_VuelaTour_v1.2.docx` y el motor v1.3 (el panel
SOLO pinta dinero que devuelve `POST /v1/quotes/calculate`).

### Un solo componente

- `components/admin/quotes/quote-calculator.tsx` = `QuoteCalculator`, el
  MISMO en el alta (`mode="create"`, `app/admin/quotes/new/page.tsx`) y en
  la página única (`mode="revise"`, `QuoteWorkspace` en
  `quote-workspace.tsx`, montada por `app/admin/quotes/[id]/page.tsx`).
  Catálogos de ambos: `lib/api/quote-catalogos-server.ts`.
- Flujo de alta: borrador `?d=` (base64url) → «Crear v1» → `createQuoteAction`
  (`client_request_id` uuid por intento) → `router.push('/admin/quotes/:id')`
  → la página única abre v1 editable.
- `/admin/quotes/[id]/revise` solo redirige al detalle (sin `?revisar=1`; el
  parámetro ya no significa nada y el workspace lo limpia de la URL).
  «Cotizar» / «Ajustar cotización» del detalle de vuelo enlazan al detalle.
- El cotizador de GRUPO (`components/admin/grupos/grupo-form/**`) es otro
  flujo y NO se toca desde aquí; los hijos abren esta pantalla con extras
  `GRUPO` bloqueados.

### Orden de la hoja 1 (el documento)

`SeccionId` en el orden del PDF, colapso con `hidden` (RHF siempre
montado, ids ancla vivos), avisos ámbar nunca se esconden (badge por
sección + auto-abre). El cuerpo de cada sección es `@container`: los grids
internos (cabecera `@2xl`, traslados `@xl`, itinerario+mapa `@3xl`) responden
al ancho REAL del documento, no del viewport (con aside/preview anclada la
columna es mucho más angosta que la ventana). La página única parte en dos
columnas desde `xl` (aside 24rem; 20rem en ≥1600 px con la preview anclada):

1. `cabecera` — cliente (alta: selector + frecuentes + «Nuevo cliente» +
   «Corregir nombre»; revisión: card fija Cliente · folio · vN), aeronave
   cotizada («El cliente ve el modelo: …»), tipo y fecha como texto.
2. `ruta` — ruta GRANDE derivada de los tramos VISIBLES (`puntosRuta`),
   `[N] pasajeros` (`#pasajeros-field`; deshabilitado con pax por tramo),
   capacidad, filas «TUA CUN: 4 × $25 = $100».
3. `traslados` — `FechaHoraCampo` inicial/final (pared Cancún; ISO solo al
   armar payload con `cancunInputToIso`).
4. `itinerario` — `QuoteLegsEditor variant="fila"` (`# | [CUN]→[HOL] | NM |
   Pax | 🗑`; la fila es `@container`: ≥28rem una línea, menos NM/Pax bajan
   con etiqueta), chips ferry/pernocta(+costo)/servicio/nota + a la derecha
   «PDF: fecha · 👁» (solo PDF), ruta
   rápida «CUN, HOL, CUN ⏎» (`RutaRapidaInput`), plantilla («Suele pedir»,
   ruta guardada, crear/guardar ruta), card azul RUTA OPERATIVA (revisión con
   itinerario operativo), mapa del panel a la derecha (solo tramos visibles).
5. `desglose` — etiquetas EXACTAS del PDF: «Servicio aéreo ⓘ» DERIVADO
   (= subtotal_vuelo + redondeo>0 + Σ COMISION_VENDEDOR, misma composición
   que `quotes-pdf.service`), `TuasFilas` por aeropuerto + switch «Se cobran
   TUAS», `ExtrasEditor variant="fila"`, «Comisión BillPocket (x%)»,
   «Viáticos por pernocta», «Descuento −[ ]», «Subtotal (sin IVA)», «IVA
   ([16] %)» (input en % → `iva_pct_override` fracción), «Total (USD)»,
   «Total MXN (T.C. [ ])» (`#tc-usd-mxn-field`).
6. `notas` — notas del cliente (se imprimen).

Derivados = texto, nunca input; su etiqueta enfoca al productor
(`focusTarifa`, `focusTarifaOverride`, `focusMetodoPago`, `focusBillPocket`,
`focusRedondeo`, `focusItinerario`, `focusTc`, `focusCobrable`). Bloqueada
(`bloqueadoRazon`): cada control se pinta como texto (`Dato`,
`TramosLectura`, `TuasFilas readOnly`, `ExtrasEditor readOnly`) con 🔒 por
sección.

### Bloque «Interno · no se imprime»

`SeccionCotizador variante="interno"` (ids `interno`, `externo`,
`operativa`, `detalle`), cerrado por defecto con memoria por usuario
`vt-cotizador-interno-v1` (nunca se abre solo salvo atajo/externo). Contiene
TODO lo que produce números sin imprimirse: tarifa Pública/Broker/
Personalizada + `$/hr — SOLO esta cotización` (`#tarifa-override-field`),
sobrevuelo, Cobrable pactado (`#cobrable-field`), comisión del vendedor
(Fija | Por hora, «→ impreso X = servicio + comisión»), método de pago
(`#metodo-pago-field`, ¿cuál? con OTRO), BillPocket % (`#billpocket-field`),
redondeo (`#redondeo-field`), cotización abierta, pase de abordar,
sub-bloques `SubBloque` (operador externo con costo+moneda y margen; ruta
operativa —solo alta—; Detalle del cálculo = `Preview` solo lectura +
`QuoteDesgloseCard`), notas internas (alta), toggles PDF tarifa/itinerario.
Ubicación: página única → PORTAL al aside del workspace (`internoSlot`,
callback ref, ≥1440 px); alta → columna propia sticky (≥1440 px sin la
preview anclada); si no, acordeón al pie del documento.

### Vista previa REAL de la hoja 1

- NUNCA una réplica en React del PDF: es el HTML del armador de pyservices
  vía `POST /v1/quotes/preview-html` (proxy `app/api/quotes/preview-html/
  route.ts`, JWT de sesión, `Cache-Control: no-store`; 404 del API →
  `code: PREVIEW_NO_DISPONIBLE` = aviso ámbar, no error; jamás bloquea
  guardar).
- Hook `hooks/use-quote-preview-html.ts` (`useQuotePreviewHtml`): payload =
  `armarCalcPayload` + presentación (`quote_id`, `cliente_id`, fechas de
  traslado, notas, `pdf_mostrar_*`, `escalas_pdf`, externo, `sucio`),
  ENCADENADO al breakdown fresco (mismo debounce de 350 ms), `AbortController`
  por request, caché LRU 20 por hash (`lib/admin/quote-preview-cache.ts`).
  Form limpio + `quote_id` → `sucio:false` (hoja del PDF guardado, una vez
  por versión). Estados: al día / actualizando (hoja atenuada) / sin vista
  previa (banda + reintentar) / faltan datos.
- Panel `quote-preview-pane.tsx`: iframe `sandbox=""` + `srcdoc`, 794 px
  escalados con ResizeObserver, `pointer-events:none`; `QuotePreviewDialog`
  = «Abrir en grande». Ubicación (D6): anclada a la derecha del documento
  solo en ≥1600 px (preferencia `vt-cotizador-preview-v1`, Anclar/Desanclar);
  si no, botón «Vista previa» (TotalBar y `QuoteActionsBar`) → diálogo;
  <1024 px pill «Formulario | Vista previa» (el form sigue montado con
  `hidden`). «Ver PDF real» / «Guardar y ver PDF» usan `abrirPdfCotizacion`
  (`lib/api/quotes-browser.ts`, fuente única con el botón PDF).
- FUENTE: el armador declara `'Helvetica Neue', Arial, sans-serif` sin
  `@font-face` → en pantalla se ve la fuente local del operador y en el PDF
  la sans del contenedor; el pie del panel lo avisa mientras el HTML no
  traiga `@font-face` (`htmlTraeFuente`). El iframe honra un `@font-face`
  con `data:` embebido: incrustarlo en pyservices (`_estilos_cuerpo`) los
  iguala sin tocar el panel.

### Edición directa y versiones

- No existe «Revisar»: el documento se abre EDITABLE si
  `candadoRevision(quote).canRevise` (fuente única
  `lib/admin/quote-revision.ts`, `RAZON_REVISION`); si no, lectura con 🔒,
  la razón en la TotalBar y «Copiar como nueva cotización» (prellena
  `/new?d=`). Cobrado bloquea en cualquier estado (D3; el API responde 409
  `COTIZACION_COBRADA` → banner rojo + liga a `#cobros-vuelo`).
- «Hay cambios» = diff SEMÁNTICO `resumirCambios(base, values, ctx)` (nunca
  `isDirty`; normaliza número/string/booleano; ignora `motivo`,
  `tarifa_personalizada`, `tipo`, `ruta_id`, `escalas_operacion`; textos
  «Pasajeros 4→6», «+Extra Handler $1,500», «Tramo 2 HOL→CUN eliminado»…;
  marca `tripulacion` en fechas/avión/pernocta). Sin diff: sin Guardar y
  CERO llamadas a `/calculate` (se pinta `calculo_snapshot`). Al primer
  cambio: «v2 → v3 ●», Descartar / Guardar → v3 (TotalBar, barra de
  acciones vía `EstadoEdicionCotizador`/`onEstadoEdicion`, save bar).
  Tests: `lib/admin/__tests__/quote-revision.test.ts` (`npm test` = vitest).
- Guardar = diálogo «Guardar vN»: chip `MOTIVOS_REVISION` obligatorio +
  texto libre (`motivo`, `#motivo-revision-field`); `armarMotivoRevision`
  antepone el resumen del diff (≤500, recorta el resumen, nunca el motivo);
  avisos «Se notificará a la tripulación» (CONFIRMADO/RESERVA con piloto) y
  «La tarifa cambió desde vN» (deriva del motor, calculada una sola vez) →
  `reviseQuoteAction` con `client_request_id` (uuid por intento; se renueva
  tras éxito/cancelar/409 de versión).
- CONFIRMADO/RESERVA con piloto: confirmación ÚNICA al primer intento de
  editar (captura de click/keydown; `data-guard-exempt` exime cabeceras,
  TotalBar y diálogos). CANCELADA: editable si no facturada, banda gris (no
  revive tramos ni notifica).
- No perder cambios: `useCambiosSinGuardar` (beforeunload + intercepción de
  links internos → «Salir sin guardar»); Descartar confirma y resetea a la
  base. `router.refresh()` NO resetea un form sucio; si cambió
  `cotizacion_version` con borrador vivo → banner «Alguien guardó la vN» con
  «Recargar conservando borrador» (serializa el form a `?d=`). Concurrencia =
  presencia + 409 optimista, sin lock (D6).
- D4: en el ALTA el ojito/fecha por tramo viven en el form
  (`escalas[].pdf_oculto`/`pdf_fecha`, `LegPdfLocal`) y viajan SOLO en el DTO
  de `POST /v1/quotes` (`armarCalcPayload` los descarta: nunca a
  `/calculate` ni a `/revise`). En revisión siguen los toggles del workspace
  (`tramoExtra`, PATCH por escala, solo tramos que coinciden con lo guardado).
- D5: si lo ÚNICO que cambió son notas del cliente o los toggles tarifa/
  itinerario (`soloPresentacion`, claves `CLAVES_PRESENTACION`), Guardar hace
  `PATCH /v1/quotes/:id/pdf-visibilidad` (`setQuotePdfPresentacionAction`,
  solo lo que cambió) SIN versión: badge «v2 · PDF ●», «Guardar PDF (sin
  versión)», el dinero sigue siendo el snapshot; 404 del API viejo → cae al
  diálogo «Guardar vN».
- «Ajuste rápido» (D2, F3): la card y `POST /:id/ajuste` ya no se usan desde
  el panel; el botón de la barra solo hace scroll+focus a `#pasajeros-field`
  (pasajeros y extras se editan en el documento y se guardan como versión).
  Métodos de pago: FUENTE ÚNICA `lib/admin/metodos-pago.ts`
  (`METODOS_PAGO`, `metodoPagoLabel`) en cotizador, cobro, reembolso,
  cobros del vuelo/cotización, grupo y el diff.

### Ids ancla, memoria y teclado

- Ids DOM que otros componentes/enlaces usan: `cobrable-field`,
  `tarifa-override-field`, `motivo-revision-field` (en el diálogo),
  `tc-usd-mxn-field`, `pasajeros-field`, `metodo-pago-field`,
  `billpocket-field`, `redondeo-field`, `tarifa-tipo-field`,
  `seccion-<id>`, `cobros-vuelo` (card de cobros del workspace).
- localStorage: `vt-cotizador-plegado-v2` (secciones del alta),
  `vt-cotizador-interno-v1` (`{abierto}`), `vt-cotizador-preview-v1`
  (anclaje de la preview).
- Teclado: Enter en la ruta rápida arma tramos; Ctrl/⌘+S guarda por el
  mismo camino que el botón primario (revisión: diálogo / presentación;
  alta: «Crear v1»); Esc cierra diálogos (Base UI: `DropdownMenuItem` usa
  `onClick`).
- Invariantes al tocar el cotizador: no renombrar campos RHF ni cambiar los
  payloads de `/calculate`, `/quotes` y `/revise`; el dinero SIEMPRE viene
  del API; `datetime-local` vía `cancunInputToIso`/`isoToCancunInput`; toda
  acción destructiva confirma; dejar `npx tsc --noEmit` en 0 y eslint limpio.

## Fechas

- `datetime-local` SIEMPRE vía `cancunInputToIso` / `isoToCancunInput`
  (`@/lib/datetime`) — nunca `slice()` ni Date crudo: la operación vive en
  hora Cancún (UTC−5) y el corte de mes se corrompe con UTC.
- Periodos por defecto: mes corriente en hora Cancún (ver
  `/admin/reportes/page.tsx` → `currentMonth()`).

## UX

- El cliente pidió UX simple para operadores no técnicos: flujos directos,
  leyendas explicativas (p. ej. procedencia de lecturas en taco-live), nada
  de opciones ambiguas. Si un flujo confunde, se corrige, no se documenta.
- La cotización comercial siempre es CUN→…→CUN; la ruta OPERATIVA del piloto
  es otra cosa (card azul de referencia en el cotizador, no se cotiza).

## Deploy

- Push a `main` = deploy automático en Vercel (autorizado sin preguntar).
- Verificar con `npx tsc --noEmit` + eslint sobre lo tocado antes de commit.
