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

## PDF del panel (proxy, NUNCA `blob:`) — 11-sep-2026

- Bug del cliente: el PDF de una cotización se abría con
  `URL.createObjectURL(await res.blob())` + `window.open`. El visor de Chrome
  lo pintaba en una URL `blob:` (se veía como `…vercel.app/<uuid>`) y al
  pulsar **Descargar** volvía a pedir ese blob → «Check internet connection».
- REGLA: todo PDF que se VEA en el visor se sirve por una URL real de un
  proxy en `app/api/**` (cookie de sesión, sin token en el cliente) con
  `Content-Type: application/pdf`, `Content-Disposition` y `Content-Length`.
  Blob solo para descarga directa con `<a download>`; `descargarDelApi(...,
  {openInTab:true})` NO se usa para PDF.
- Fuente única del proxy: `lib/api/pdf-proxy.ts` (`proxyPdfDelApi`,
  `errorPdf`, `esNavegacion`, `pidioDescarga`, `esUuid`) + helpers puros de
  cabecera en `lib/pdf-http.ts` (conserva el `filename` que manda el API,
  `filename*` con acentos). Errores: JSON `{message, code}` para `fetch` y
  una página HTML en es-MX cuando es una navegación (401/403/404/409/502).
  `Cache-Control: no-store` a propósito: un toggle del PDF no crea versión,
  así que nunca se sirve un PDF viejo.
- Fuente única de las URLs: `lib/admin/pdf-urls.ts` — `rutaPdfCotizacion`,
  `rutaPdfInternoCotizacion`, `rutaPdfGrupo`, `rutaReciboCobro`,
  `rutaReciboSobreGrupo`, `rutaReciboDeCobro` (parte de un sobre ⇒ recibo del
  SOBRE), `rutaPdfReparto`. `{descargar:true}` agrega `?descargar=1` y el
  proxy responde `attachment` (el botón «Descargar» es un `<a download>`).
  Tests: `lib/__tests__/pdf-http.test.ts`, `lib/admin/__tests__/pdf-urls.test.ts`.
- Rutas vivas: `/api/quotes/[id]/pdf` (cliente), `/api/quotes/[id]/pdf-interno`,
  `/api/grupos/[id]/pdf`, `/api/flights/cobros/[id]/recibo`,
  `/api/grupos/cobros/[id]/recibo`, `/api/profit-sharing/pdf`. Todas GET
  (POST alias donde el API usa POST) y todas `inline` por defecto.
- **`export const maxDuration = 60`** en TODAS ellas (obligatorio): el render
  vive en pyservices y tarda decenas de segundos. Antes el navegador hablaba
  directo con el API y no había límite; ahora pasa por una función de Vercel
  y sin `maxDuration` el PDF se cortaría con 504. 60 s es el tope que admiten
  todos los planes — si algún PDF nuevo tarda más, se sube aquí, nunca en el
  cliente. Toda ruta de PDF nueva nace con esta línea.
- Test del proxy: `lib/api/__tests__/pdf-proxy.test.ts` (Content-Type,
  inline/attachment, `Content-Length` exacto, `no-store`, el JWT viaja al API
  y no al navegador, 401 sin llamar al API, errores del API legibles).
- `abrirPdfCotizacion` / `abrirPdfEnPestana` (`lib/api/quotes-browser.ts`)
  solo abren la URL; lanzan si el navegador bloqueó la pestaña (toast). Los
  recibos de cobro se abren con un `<a target="_blank">` a su proxy.
- PENDIENTE conocido: la vista previa del CFDI (`emitir-factura-button.tsx`)
  sigue con blob porque el API la genera con un POST con cuerpo.

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
  `quote-workspace.tsx`, montada por `app/admin/quotes/[id]/page.tsx`:
  cabecera + avisos + cotizador a lo ancho (hoja + panel interno) y, DEBAJO
  de la hoja, cobros, historial y operación — sin aside ni portal).
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

### La hoja 1 ES el formulario (ensamble form-as-document, 8-sep-2026)

- `QuoteCalculator` ya NO pinta tarjetas/secciones de formulario: renderiza
  `<QuoteSheet>` (la hoja 1 editable, `components/admin/quotes/quote-sheet.tsx`)
  al centro sobre el fondo del shell (papel claro 794 px, sombra, escala al
  ancho del contenedor) y `<QuoteInternalPanel>` a la derecha. Arriba una
  barra de ESTADO fija (`TotalBar`, roja): total con IVA del breakdown,
  cliente · folio · vN, «Ver PDF real» / «Guardar y ver PDF», Descartar /
  Guardar → vN (o «Crear v1» en el alta) y chips de avisos (capacidad,
  ancla CUN, millas en 0, costo externo MXN sin T.C.). Debajo de la hoja, la
  save bar (Crear v1 / Guardar → vN con el resumen del diff).
- Todo lo que se IMPRIME se edita en su lugar en la hoja (cliente, aeronave
  = modelo, pasajeros, traslados, itinerario + mapa, desglose, notas) con
  inputs invisibles en reposo; el cotizador conserva intactos el estado RHF,
  el debounce + AbortController de `/calculate`, `resumirCambios`, «v2 → v3
  ●», el diálogo «Guardar vN», candados, confirmación única, beforeunload,
  409, `?d=` y los ids ancla. Contrato hoja ⇄ cotizador: `valores` (subconjunto
  RHF que se imprime) + `onCambio(campo, valor)` → `setValue(campo, valor,
  {shouldDirty:true})` (+ cliente broker ⇒ tarifa BROKER); `documento`,
  `catalogos`, `tramosPdf` (revisión: `oculto`/`fechaPdf` con la regla de
  coincidencia + `margen` = toggles del workspace; alta: `onOcultoChange`/
  `onFechaPdfChange` sobre `escalas[].pdf_oculto`/`pdf_fecha`),
  `pasajerosPorTramo`, `mapaSvg` (con form limpio: `extraerMapaSvgDeHtml`
  de la hoja del PDF guardado), `totalRespaldo`, `grupo`, `clienteExtra`
  (alta: «+ nuevo cliente» · «corregir nombre» en la línea del cliente),
  `onAbrirInterno(destino)` (`'tarifa' | 'cobrable' | 'sobrevuelo'`).
- Tarifa y horas NO se editan en la hoja (feedback 9-sep-2026: «¿dónde se
  ajusta la hora volada por tramo y la tarifa por hora?»): la hoja solo las
  SEÑALA con croma de edición y `onAbrirInterno` (el cotizador abre el panel
  interno si está cerrado —misma memoria— y, en un efecto cuando el panel ya
  está pintado, hace scroll+focus al ancla; la marca «1.20 h» NO va exenta
  del guard de CONFIRMADO/RESERVA porque su popover edita):
  «· ajustar» en la línea de «Servicio aéreo» (con «h × $/hr» delante cuando
  el toggle de tarifa está apagado), «1.20 h» por tramo en el margen del
  itinerario (abre el ⋯: fila «Tiempo estimado» + «Pactar horas» →
  cobrable) y en el panel la tabla «Horas por tramo» (solo lectura, desde
  `breakdown.tramos`; `tramoCalculado` exige mismo índice Y mismos
  extremos porque el breakdown va un debounce atrás). El motor NO tiene
  override de horas por tramo: se cambian las millas del tramo o se pacta
  el total (Cobrable pactado / Sobrevuelo).
- Lectura bloqueada (`bloqueadoRazon`): la hoja se pinta como texto (sin
  inputs), 🔒 + razón en la barra de estado y «Copiar como nueva cotización».

### Panel «Interno · no se imprime» (`quote-internal-panel.tsx`)

`QuoteInternalPanel`: panel lateral DERECHO colapsable (botón «Interno» en
el borde, vertical en ≥xl; cerrado por defecto con memoria por usuario
`vt-cotizador-interno-v1`, estado en el cotizador — se abre solo al prender
«cubierto por externo»), con banda «Interno · no se imprime». Contiene TODO
lo que produce números sin imprimirse (código movido del cotizador):
avisos ámbar (nunca se esconden; el botón cerrado muestra el conteo),
cliente frecuente + «+ Nuevo cliente» (alta), «Poner todo en $0» (cliente
interno), plantilla de ruta («Suele pedir», ruta guardada, crear/guardar
como nueva ruta), card azul RUTA OPERATIVA del vuelo (revisión con
itinerario operativo, «Cotizar con estos tramos» con confirmación), Tarifa y
horas (Pública/Broker/Personalizada `#tarifa-tipo-field`, `$/hr — SOLO esta
cotización` `#tarifa-override-field`, sobrevuelo, Cobrable pactado
`#cobrable-field`), comisión del vendedor (Fija | Por hora, «→ impreso»),
Cobro (método `#metodo-pago-field` + ¿cuál? con OTRO, BillPocket %
`#billpocket-field`, redondeo `#redondeo-field`, switch «Se cobran TUAS»,
cotización abierta, pase de abordar), sub-bloques `SubBloque` (operador
externo con modelo/matrícula/costo+moneda y margen; ruta operativa —solo
alta—; Detalle del cálculo = `Preview` solo lectura + `QuoteDesgloseCard`),
notas internas, toggles del PDF (tarifa/hr, itinerario) + leyenda de los
toggles por tramo. El panel NO calcula dinero: pinta `values` + `breakdown`
y escribe con `setValue`/`register` del cotizador. Tipos del form en
`quote-form-types.ts` (los re-exporta el cotizador).

### Hoja del PDF guardado (mapa) y PDF real

- La hoja editable ES la vista previa: `quote-preview-pane.tsx`, el anclaje
  (`vt-cotizador-preview-v1`), el pill «Formulario | Vista previa» y
  `useMediaQuery` se retiraron. `useQuotePreviewHtml` sigue vivo solo para
  pedir, con el form LIMPIO (`sucio:false`, una vez por versión, caché LRU),
  la hoja del PDF guardado y reutilizar su MAPA en la hoja (en lectura es la
  única fuente del mapa); con cambios la hoja pide el mapa en vivo a
  `/api/quotes/mapa-svg`.
- «Ver PDF real» / «Guardar y ver PDF» (barra de estado) usan
  `abrirPdfCotizacion` (`lib/api/quotes-browser.ts`, fuente única con el
  botón PDF de la barra de acciones): abre `/api/quotes/:id/pdf` en una
  pestaña — NUNCA un blob (ver «PDF del panel»). La barra de acciones pinta
  «PDF» (ver) + un `<a download>` a `?descargar=1`, y «PDF interno» abre
  `/api/quotes/:id/pdf-interno`.

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
- Respuesta y candados de `revise` (API 0.0.6, invariante 14 — el cotizador
  valida el avión como `assign` cuando lo CAMBIA): `avisos[]` se pinta tras
  guardar con el `toastAvisos` de siempre (`lib/admin/avisos.ts`); el rechazo
  se clasifica con `decidirErrorRevise` (`lib/admin/quote-revise-errores.ts`,
  PURO + test, porque taller y squawk también son 409): `SQUAWK_ALTA_SIN_RESOLVER`
  abre el MISMO `SquawkAltaDialog` de vuelos (detección pura en
  `lib/admin/squawk-alta.ts`) y al confirmar reintenta con
  `aceptar_discrepancia_alta` y el MISMO `client_request_id`;
  `AERONAVE_EN_TALLER` YA NO lo emite el API (11-sep-2026, ver «Avión en
  taller» más abajo): si llega, es un backend sin desplegar y va a un banner
  ÁMBAR que pide actualizar el API — nunca «elige otro avión».
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
  (`METODOS_PAGO` con `facturable`, `metodoPagoLabel`, `METODOS_CON_CUENTA`
  = a qué cuenta llegó/salió, `cuentaSugeridaPorMetodo`,
  `PAYWISE_COMISION_PCT_DEFAULT`) en cotizador, cobro, reembolso, cobros del
  vuelo/cotización, grupo, meta del vuelo y el diff. PAYWISE (9-sep-2026):
  link/pasarela de oficina, sin IVA por defecto (como BillPocket), cuenta
  «Paywise», comisión sugerida 8.857 % (config `paywise_comision_pct` vía
  `lib/api/paywise-config-server.ts`) que el estado de cuenta de Paywise
  sustituye por la real al conciliar. Test: `__tests__/metodos-pago.test.ts`.

### Cobros junto al total (9-sep-2026)

- En revisión, `QuoteWorkspace` pasa `cobro` (`CobroTotalBar`: cobrado,
  saldo = `pendienteCobro`, semáforo = `estadoCobroSemaforo`, `onRegistrar`)
  a `QuoteCalculator` → `TotalBar` pinta «Cobrado $X · Saldo $Y» + «Registrar
  cobro» (ADMIN/COORDINADOR/FACTURACION, no en SOLICITUD; nunca en el alta).
  El botón abre el MISMO `CobroFormSheet` del detalle del vuelo (montado en
  el workspace) y `router.refresh()` rehidrata cobros y candado.
- `QuoteCobrosCard` (#cobros-vuelo) se pinta SIEMPRE debajo de la hoja
  (0 cobros = «Sin cobros registrados» + botón); la página trae el snapshot
  en todo estado (best-effort). Nada de cobros dentro del papel.

## Aeronave cotizada vs utilizada (11-sep-2026)

- Fuente única: `lib/admin/avion-cotizado.ts` → `aeronavesDeCotizacion(quote,
  catalogo)` devuelve `{cotizada, utilizada, difieren}` y lo pinta la card
  «Operación» de `quote-workspace.tsx`. COTIZADA = solo el MODELO del
  snapshot (con ese se pactó el precio; es lo único que ve el cliente);
  UTILIZADA = `matrícula · modelo` del avión asignado HOY (vista interna).
- El API manda `aeronave_cotizada` / `aeronave_utilizada` / `aeronaves_
  utilizadas` en la RAÍZ de `GET /v1/quotes/:id` y del snapshot del vuelo —
  **no** dentro de `calculo_snapshot`. El helper lee la raíz primero y solo
  después cae a `calculo_snapshot`, `aeronave_operativa`,
  `modelos_cotizados` y el catálogo por `aeronave_id`: `aeronave_utilizada`
  también resuelve el avión del primer tramo vivo cuando el vuelo no lo
  tiene en la cabecera (ahí `aeronave_operativa` viene null).
- `difieren` (pinta ámbar) se decide por **ID** cuando llegan las dos fichas
  — misma regla del API: dos aviones distintos pueden compartir modelo, así
  que comparar el texto diría «es el mismo». Sin ids se compara el modelo
  utilizado contra el CONJUNTO de modelos cotizados (una cotización puede
  rotar de avión por tramo y `modelos_cotizados` trae varios). Sin datos:
  false — no se inventan alertas.
- El PDF del CLIENTE enseña SOLO el avión COTIZADO — desde el 12-sep-2026
  también su FICHA (fotos, modelo, asientos, velocidad, motores,
  características y la sublínea de matrícula del VGV), que el API arma con el
  avión del snapshot y ya no con `vuelo.aeronave_id`. El PDF INTERNO sí pinta
  las dos líneas y marca «Distinto al cotizado» en ámbar.

## La cotización es INDEPENDIENTE de la operación (12-sep-2026)

- Pedido del cliente (folio #298): «al realizar un ajuste en el vuelo
  operativo (cambio de avión) terminó afectando a la cotización; esto no debe
  ser así: se cotiza con un avión y se vuela con otro por distintos motivos,
  pero la cotización no debe verse afectada por cambios en el vuelo
  operativo». Bug: el cotizador rehidrataba `aeronave_id` desde
  `q.aeronave_id` (= `vuelo.aeronave_id`, el OPERATIVO) → el motor
  recalculaba con la tarifa del avión operativo, la hoja imprimía SU modelo y
  al Guardar → vN el precio pactado quedaba cambiado.
- Avión **COTIZADO** = `aeronave_cotizada` (raíz de `GET /v1/quotes/:id`) o,
  en su defecto, `calculo_snapshot.aeronave`: con él se pactó el precio.
  Avión **OPERATIVO** = `vuelo.aeronave_id` / los tramos. Fuente única de
  ambos en el panel: `lib/admin/avion-cotizado.ts`.
- **R1 — hidratación**: el cotizador arranca SIEMPRE con el cotizado,
  `aeronaveInicialDeCotizacion(quote, defaultAircraftId, aircraft)` =
  `aeronave_cotizada.id → calculo_snapshot.aeronave.id → aeronave_id → default`
  (sin snapshot todavía no hay nada pactado; el default solo evita el 400 del
  motor en snapshots legados sin id y externos). Externos igual: la
  referencia de tarifa del snapshot. Ningún flujo del panel puede mandar el
  avión operativo como referencia de tarifa.
- El TERCER argumento (el catálogo ACTIVO del selector) NO es opcional en la
  práctica: `POST /v1/quotes/calculate` responde **400 «Aeronave inactiva»**,
  así que arrancar con un avión cotizado ya dado de baja dejaría la cotización
  imposible de abrir. Se salta al operativo/default y el cotizador lo dice en
  ámbar con `avisoAvionCotizadoNoSeleccionable` (nunca se recalcula un precio
  en silencio). Si algún día el catálogo del cotizador incluyera inactivos,
  este salto deja de dispararse solo.
- «Sin cambio de avión» (pinta `modelos_cotizados` del API en la hoja y en
  «Cotizado en: …») se mide con `esAeronaveCotizada(quote, values.aeronave_id)`
  — contra el COTIZADO, nunca contra `vuelo.aeronave_id`. Cambiar el selector
  a otro avión SÍ es deliberado: el API lo trata como cambio de avión (mueve
  el vuelo y sus tramos vivos, squawk ALTA confirma).
- **R5 — textos**: junto al selector de la hoja va una nota TENUE
  «Opera en N990GG (Seneca V)» (`fraseOperaEn`, `documento.operaEn`,
  `data-cot-ui` ⇒ fuera del PDF y fuera de lectura) cuando el avión utilizado
  difiere del elegido; nunca cambia el selector sola. El diálogo del primer
  cambio con tripulación ya no dice «esta cotización tiene tripulación
  asignada»: `textoConfirmarEdicionCotizacion` explica la separación y en qué
  avión opera hoy el vuelo.
- Dónde se pinta cada uno: la LISTA `/admin/quotes` y la hoja/PDF del cliente
  muestran el COTIZADO (la lista cae al avión del vuelo solo si el cotizado ya
  no está en el catálogo activo); la card «Operación», el PDF interno y la
  nota tenue de la hoja son los únicos que enseñan el UTILIZADO.
- La card «Operación» del workspace y el PDF interno siguen mostrando
  cotizada vs utilizada (`aeronavesDeCotizacion`). Tests:
  `lib/admin/__tests__/avion-cotizado.test.ts` (caso #298 completo) y
  `components/admin/quotes/__tests__/quote-sheet.test.tsx` («Opera en …»).
- EXCEPCIÓN conocida: el cotizador de GRUPO (`grupo-form/types.ts`) hidrata
  cada hijo con `a.aeronave?.id ?? a.aeronave_cotizada_id` A PROPÓSITO — ahí
  la tabla «Aviones» ASIGNA el avión del hijo (recotiza al reemplazarlo) y el
  API avisa con `precio_desactualizado` cuando vuela en otro distinto al
  cotizado. No cambiar sin decidir antes el contrato del grupo con el API.

## Avión en taller: ADVERTENCIA, NUNCA CANDADO (11-sep-2026)

- Pedido del cliente: «al cotizar debe poder elegirse un avión aunque esté
  en taller (son cotizaciones a futuro), y aunque no lo fueran debe dejarte;
  la advertencia está bien pero con eso es suficiente, no debe limitarte; lo
  mismo para el vuelo». Aplica a cotización (create / revise / grupo) y a
  vuelo (assign, assign por tramo, reserva, reassign-aircraft, combinar,
  revertir externo).
- Contrato con el API: **ya no responde 409 `AERONAVE_EN_TALLER`** en ningún
  camino — guarda y agrega el texto a `avisos: string[]` (campo ADITIVO,
  siempre presente aunque vacío). `GET /aircraft` sigue exponiendo
  `en_taller` y es lo único que el panel usa: la MARCA del selector.
- FUENTE ÚNICA del texto en el panel: `lib/admin/aviso-taller.ts`
  (`avisoAeronaveEnTaller` = texto exacto del contrato con el API y la app;
  `notaAeronaveEnTaller` = el MISMO aviso en el momento de ELEGIR el avión,
  cuando todavía no se guardó nada; `chipAeronaveEnTaller` para la TotalBar;
  `MARCA_EN_TALLER` y `descripcionAeronave(partes, enTaller)` para la
  descripción de las opciones). Test: `__tests__/aviso-taller.test.ts`
  (incluye el guard de que ningún texto diga «no se puede» / «no
  disponible»). Si el texto cambia, cambia en los tres repos.
- Regla de UI (toda pantalla con selector de avión): la opción se MARCA
  «En taller» en ámbar (`description` + `descriptionClassName`) y **nunca**
  se filtra ni se pone `disabled`; al elegirla aparece `<NotaTaller>`
  (`components/admin/nota-taller.tsx`, ámbar, informativa — sin modal, sin
  confirm, sin rojo) y el botón de guardar sigue habilitado. Los `avisos[]`
  que devuelva el API se pintan con `toastAvisos` (o, en el grupo, en la
  lista ámbar de la fila del avión). En el ARMADOR del grupo el aviso de
  taller del API se filtra de la fila cuando ya se pinta `<NotaTaller>`: el
  del API viene en pasado («se guardó») y dentro de un formulario abierto
  todavía no se guardó nada — un solo mensaje, y en el tiempo verbal correcto. Cubierto hoy: cotizador
  (`quote-calculator` + `quote-sheet`), grupo (`aviones-editor`,
  `grupo-reemplazar-avion-dialog`), y vuelo (`flight-assign-sheet`,
  `escala-assign-sheet`, `flight-danger-actions`, `cubrir-externo-dialog`,
  `reserva-form-sheet`). Un selector de avión NUEVO nace con esta regla.
- Compatibilidad (sin promover): `decidirErrorRevise` conserva el caso
  `taller` y `mensajeErrorGrupo` el código `AERONAVE_EN_TALLER` por si se
  habla con un API sin desplegar, pero su texto ya NO limita al operador —
  dice que hay que actualizar el API, y se pinta ÁMBAR (antes era un banner
  rojo «No se puede guardar… elige otro avión», retirado).
- Lo que NO cambió: el **squawk ALTA** sigue siendo candado (409
  estructurado + `aceptar_discrepancia_alta` + aviso al mecánico) y los
  documentos vencidos siguen solo avisando.

## Cobro del vuelo: UNA card (11-sep-2026)

- `components/admin/flights/cobros-card.tsx` (`CobrosCard`, ancla `#cobros`)
  es la ÚNICA card de cobro del detalle del vuelo: cabecera con «Registrar
  cobro» / «Registrar reembolso», resumen **Monto total · Cobrado ·
  Pendiente · Estado** (badges `CobroEstadoBadge` + Facturado/Sin factura) y
  DEBAJO la lista de cobros. La card «Cobro» suelta de
  `app/admin/flights/[id]/page.tsx` se eliminó: repetía los mismos números.
- Los totales NO se calculan en el componente: la página pasa
  `montoTotalUsd`, `cobradoUsd` (= `total_cobrado` del snapshot =
  cobrosEnUsd), `pendingUsd`/`redondeoUsd` (`pendienteCobro`,
  `diferenciaRedondeo`) y `estadoCobro` (`estadoCobroSemaforo`).
- MÉTODO: la lista pinta el método REAL de cada cobro
  (`cobro.metodo_cobro`) — ÚNICA fuente de «con qué se pagó» (también del
  recibo y de la conciliación). `vuelo.metodo_cobro` NO es el de ningún
  cobro: es SIEMPRE la intención pactada al cotizar (decide el IVA del
  desglose v1.3) y el API NUNCA la reescribe (invariante 15 del API,
  11-sep-2026). «Cómo se cobró al final» lo DERIVA el API de los cobros y
  viaja solo lectura en el snapshot: `metodo_cobro_final` (método del último
  abono positivo cuando el vuelo quedó liquidado; null antes) y
  `metodo_cobro_final_difiere`. La card pinta «Previsto en la cotización: …»
  siempre que exista y, debajo, «Liquidado con: …» cuando llega
  `metodo_cobro_final` (con «(distinto al previsto)» en ámbar si difiere).
  El cotizador («Método de pago previsto») y `grupo-form` lo llaman previsto
  porque ahí se EDITA la intención, y con cobros el documento está bloqueado
  por `candadoRevision`. Facturas («Por cobrar · previsto …») solo lo pinta
  en vuelos sin cobrar, que es cuando de verdad es previsto.
- El recibo de cada cobro es un `<a target="_blank">` al proxy
  (`rutaReciboDeCobro`): se ve en una pestaña y desde ahí se descarga.

## Conciliación Paywise (9-sep-2026)

- Cuenta bancaria con `tipo` BANCO | PASARELA (Paywise = PASARELA): el
  estado de cuenta de Paywise se importa en esa cuenta con el mismo
  `ImportDialog`; formato `paywise` trae bruto/comisión/neto (`monto` = NETO).
  Si el parser no lo reconoce y la cuenta es pasarela, se abre el mapeo
  manual de columnas (`mapeo` de `POST /v1/conciliacion/parse`, encabezados
  de `columnas`).
- Pestañas nuevas en `/admin/conciliacion`: «Cobros sin banco»
  (`cobros-sin-banco-table.tsx`, espejo de gastos sin banco) y «Auditoría
  Paywise» (`paywise-auditoria.tsx`: desde/hasta por GET, coinciden /
  comisión distinta / en Paywise sin cobro con «Registrar cobro» prellenado
  (elige vuelo ±15 días → `CobroFormSheet` con `prefill`) / cobros sin
  Paywise / referencia-monto / ambiguos; «Conciliar los que cuadran»
  confirma y llama `conciliarPaywiseAction`; «Descargar reporte» baja
  `paywise/auditoria.xlsx`). El panel SOLO pinta el cruce del API
  (`types/conciliacion.ts` `PaywiseAuditoria`).

## Conciliación: 1 gasto ↔ N cargos (pagos parciales) — 14-sep-2026

- Caso del cliente: «1 factura se hizo en 2 pagos y al conciliar solo me deja
  asociar 1» (ASUR cobra a veces operación y FBO por separado). Desde hoy un
  gasto acepta VARIOS movimientos bancarios ligados, todos en la MISMA moneda
  del gasto; `gasto.conciliado` es true SOLO cuando la suma de los cargos
  CUBRE su monto (tolerancia 1.00 en la moneda del gasto). Un gasto USD contra
  cuenta MXN (T.C. derivado) sigue siendo 1 ↔ 1. La regla vive en el API
  (`conciliacion-parcial.util.ts` + trigger de BD): **el panel nunca la
  recalcula**, solo pinta lo que respondió.
- FUENTE ÚNICA del panel: `lib/admin/conciliacion-parcial.ts` (PURO, con test
  `__tests__/conciliacion-parcial.test.ts`): `faltanteDe`, `cubreGasto`,
  `estadoParcialDeGasto` (devuelve **null** si el API no mandó los aditivos —
  skew de deploy = comportamiento de hoy), `textoFaltanteGasto`
  («faltan $125.82 de $403.61»), `notaParcialGasto` («faltan $125.82»),
  `toastVinculoGasto` («Gasto cubierto» / «Pago parcial: faltan $X») y
  `textoGastoYaCubierto` (409). Ningún componente formatea estos textos a mano.
- Campos ADITIVOS del API (opcionales SIEMPRE): `monto_vinculado` y `faltante`
  en el gasto (`types/expenses.ts`, `GastoSinBanco` de
  `lib/api/conciliacion-server.ts`, `MovimientoGasto` de
  `types/conciliacion.ts`) y, en la RESPUESTA de
  `PATCH /v1/conciliacion/movimientos/:id`, `gasto_conciliado` +
  `monto_vinculado` + `faltante` (`MovimientoBancario`).
- Dónde se ve: diálogo «Vincular gasto» (`movimiento-actions.tsx`; las
  opciones las precarga `app/admin/conciliacion/page.tsx` con `listGastos`)
  — descripción ámbar «Pago parcial: faltan $X de $Y»; el toast tras vincular
  distingue cubierto de parcial; la pestaña «Gastos sin banco» gana la columna
  **Parcial** (`gastos-sin-banco-table.tsx`, fila `parcial`) porque un gasto
  parcial SIGUE ahí hasta que lo cubran; la columna «Conciliación» de
  `movimientos-table.tsx` marca «Pago parcial: faltan $X» bajo el gasto.
- 409 `GASTO_YA_CUBIERTO` (código en `ApiError.code`, `details` con
  `{monto_gasto, suma_ligada, faltante, movimientos:[{id,fecha,monto}]}`): se
  pinta con el MENSAJE del API (explica que si es otro pago de la misma
  factura el gasto debe valer la suma de los dos) + la lista de cargos ya
  ligados. Va ANTES del `status === 409` genérico en `vincular`.
- Desvincular sigue confirmando (regla permanente) y ahora avisa que los demás
  cargos del gasto se conservan: el gasto vuelve a «pago parcial», no a cero.
- Candados del API (no del panel): un gasto con CUALQUIER cargo ligado no se
  edita en monto/moneda/medio de pago ni se borra sin desvincular antes — el
  mensaje llega del API y se pinta tal cual. El API compara contra el valor
  VIGENTE, así que el diálogo «Verificar» puede seguir mandando
  monto/moneda/medio sin cambiarlos (reclasificar o ligar el vuelo de un
  gasto con cargos sigue funcionando).
- **Un cargo MÁS GRANDE que el gasto también se rechaza** (revisión
  14-sep-2026), aunque el gasto no tenga ningún cargo ligado: la regla mira
  la SUMA. Ahí el 409 trae su propio mensaje («Ese cargo ($1,850.00) es
  MAYOR que el gasto ($277.79)…») y `details.movimientos` viene VACÍO, así
  que `textoGastoYaCubierto` no manda a «desvincular» nada — dice que se
  corrija el monto del gasto. `details` trae además `moneda` y `monto_nuevo`
  (aditivos).

## Conciliación: cruzar pendientes, POR QUÉ siguen pendientes y la IA (15-sep-2026)

- Pedido del cliente: «no se están conciliando los gastos, salen como
  pendiente. Revisa a profundidad todo esto de la conciliación […] También
  revisa lo de la IA que tenemos por API». El cruce automático solo corría
  DENTRO de la importación: cuando falló (trigger con `moneda` ENUM comparada
  contra text) los 101 movimientos quedaron insertados y sin conciliar, y
  re-importar el archivo respondía «101 duplicados» sin reintentar nada.
- **FUENTE ÚNICA del panel**: `lib/admin/conciliacion-auto.ts` (PURO, prueba
  `__tests__/conciliacion-auto.test.ts`) — `motivoPendienteDe` + `tonoMotivo`
  (badge y tooltip de por qué está pendiente), `resumenAutoMatch` /
  `lineaCriterios` / `etiquetaCriterio` (resultado del cruce por RESULTADO),
  `resumenImportJob` + `motivoMasComun` (resultado de la importación, también
  cuando el job murió a medias), `textoConfianza`, `etiquetaCandidatoGasto` /
  `descripcionCandidatoGasto` (terminación de tarjeta · lugar/nota ·
  matrícula · vuelo · pago parcial · T.C.), `gastoDePropuesta` /
  `alternativasDePropuesta`, `reglaAutomaticaDe` y `diaMas`. Ningún
  componente redacta estos textos a mano.
- **Contratos del API (TODOS aditivos; sin ellos la UI se comporta como
  antes)**: `POST /v1/conciliacion/auto-match` → `{revisados, conciliados,
  ambiguos, sin_candidato, traspasos?, errores, detalle[], por_criterio?,
  job_id?}` (si manda `job_id` el panel consulta `importar-status`, el mismo
  diálogo de progreso); `POST /v1/conciliacion/sugerir-lote` → `{propuestas:
  [{movimiento_id, gasto_id_sugerido, confianza, razon, evidencias?,
  alternativas[]}]}`; `POST /movimientos/:id/sugerir` devuelve además
  `alternativas` y `motivo_sin_match`; el job de importación expone los
  conteos por resultado (`ambiguos`, `sin_candidato`, `traspasos`, `errores`,
  `errores_detalle`, `por_criterio`); cada movimiento no conciliado puede
  traer `motivo_pendiente`, `candidatos_n` y `auto_match_error`.
- **Dónde se ve**:
  - «**Cruzar pendientes**» (`auto-match-button.tsx`) en la cabecera: cuenta
    + rango (los de la vista, `?cuenta`/`?desde`/`?hasta`) y resumen por
    resultado. Es la salida cuando algo quedó pendiente por un fallo o
    porque el gasto se capturó DESPUÉS del estado de cuenta.
  - «**Sugerir con IA (pendientes)**» (`sugerencias-lote-dialog.tsx`): lista
    de propuestas con confianza, razón y evidencias, cada una con
    **Vincular** / **Descartar**. La IA PROPONE y una persona confirma —
    NUNCA se liga sola (fiabilidad numérica: un cruce equivocado ensucia el
    dinero de un vuelo). Cada consulta gasta créditos y se registra en
    Configuración → Consumo de IA: por eso se pide a mano, no al abrir.
  - Columna «Conciliación» (`movimientos-table.tsx`): el badge «Pendiente»
    lleva debajo el motivo («Sin candidato», «Ambiguo entre 3», «Error al
    cruzar» en rojo) con el tooltip que dice qué hacer; lo clasificado por
    una REGLA automática (traspaso entre cuentas, comisión del banco) se
    marca «automático». Columna «Cuenta» solo cuando la vista mezcla varias.
  - Diálogo «**Vincular gasto**» (`movimiento-actions.tsx`): «Sugerir con
    IA» en el menú y, dentro del diálogo, «Buscar el gasto que corresponde
    (IA)» — las opciones pasan a ser los CANDIDATOS del API (moneda, ventana
    de fechas, monto o faltante) con ★ y verde en el sugerido, cada uno con
    terminación de tarjeta, nota/lugar, matrícula y pago parcial; «Ver todos
    los gastos recientes» regresa a la lista precargada de la página.
  - `import-dialog.tsx`: al terminar canta los conteos por resultado; si el
    job termina en ERROR **refresca la bandeja** y dice cuántos movimientos
    SÍ entraron, cuántos fallaron y el motivo más común, e insiste en NO
    volver a importar el archivo (se detecta como duplicado): la salida es
    «Cruzar pendientes».
- **Filtro por cuenta**: `?cuenta=<uuid>` viaja a `listMovimientosBancarios`
  (el API ya lo soportaba) y los chips de cuenta conservan pestaña y rango
  (`hrefVista`). El API rechaza parámetros desconocidos
  (`forbidNonWhitelisted`): NO mandar `desde`/`hasta` a la lista hasta que el
  DTO los acepte.
- **REVISIÓN ADVERSARIA (15-sep-2026) — contratos que NO cuadraban**:
  - `sugerirLoteAction` mandaba `limit` y el DTO del API se llama **`limite`**:
    con `forbidNonWhitelisted` eso es un **400** en cuanto alguien pase el
    tope. Hoy va `limite`. Misma trampa para cualquier parámetro nuevo:
    revisar el DTO del API, no inventar el nombre.
  - `autoMatchAction` ya podía mandar `movimiento_ids` pero el API no lo
    aceptaba (otro 400 latente): el DTO del API lo acepta desde hoy y **manda
    sobre `desde`/`hasta`** (re-cruce dirigido de las filas señaladas).
  - `importar-status` devolvía el desglose ANIDADO en `resultados` y el panel
    lo lee PLANO: el API lo devuelve en las dos formas, así que el resumen del
    job ya no sale en ceros.
  - **`rechazados`** (el gasto candidato ya no admitía el cargo, 409 legítimo)
    faltaba en el resumen: sin él las cifras NO sumaban («44 revisados» con
    21+2+4+15 = 42). `resumenAutoMatch`/`resumenImportJob` lo nombran y el tipo
    lo declara.
  - **`truncado`**: cuando la corrida alcanza su tope, el resumen dice «vuelve
    a ejecutarlo para los que faltan» en vez de sonar a terminado.
  - Motivo nuevo del API **`SE_PUEDE_CRUZAR`** («Se puede cruzar»): hay UN
    gasto que cuadra y el auto-cruce no ha corrido sobre ese movimiento —
    exactamente el caso del 15-sep. Alias tolerado: `CRUZABLE`.
  - `sugerir-lote` embebe ahora `gasto` (ficha del propuesto), `candidatos[]`,
    `motivo_sin_match` y `disponible`/`nota`: sin ellos el diálogo pintaba un
    uuid pelón y decía «la IA no encontró propuestas» aunque el asistente
    nunca hubiera contestado.
- Pendiente (necesita API): reglas de clasificación administrables desde el
  diálogo «Clasificar» («aplicar siempre a los que digan…»), borrar una
  importación, alta manual de un movimiento y «Buscar su cargo» desde
  «Gastos sin banco». El **motivo de los ABONOS** pendientes tampoco viaja
  (el API solo lo calcula para CARGOS): ahí el badge sigue siendo «Pendiente»
  a secas, y está bien — inventarlo sería mentir.

## Historial de gastos del vuelo: gastos que cambian de vuelo (14-sep-2026)

- Caso del cliente (vuelo #260): «Gastos del vuelo» decía «1 gasto» y el
  «Historial de gastos» mostraba DOS capturas, la segunda sin descripción ni
  «Editar» — el gasto de CZM se había movido al vuelo #268 y su línea de
  captura quedaba muda.
- El API manda ahora, en el UPDATE que cambió `vuelo_id`, el campo ADITIVO
  `movimiento: {tipo:'salio'|'llego', vuelo_id, folio} | null`
  (`GastoHistorialEvento` en `lib/api/flights-server.ts`) y resuelve la
  descripción también de gastos que ya no viven en el vuelo.
- Panel: `flight-gastos-historial-card.tsx` pinta «Gasto movido al vuelo #268»
  / «Gasto traído del vuelo #260» (ícono `ArrowsRightLeftIcon`, azul) con liga
  a `/admin/flights/<id>`; las líneas ANTERIORES de un gasto que ya no vive
  aquí pierden «Editar» y ganan «Ahora vive en el vuelo #268» (también liga).
  Textos y el mapa gasto → destino en `lib/admin/gasto-historial.ts` (PURO,
  `__tests__/gasto-historial.test.ts`). Sin el aditivo (API sin desplegar) la
  card se comporta exactamente como antes.
- **`movimiento.vuelo_id` puede venir null** (revisión 14-sep-2026) y es el
  caso MÁS común: `llego` con null = al gasto se le ASIGNÓ este vuelo estando
  suelto (la oficina liga un gasto de la bandeja), `salio` con null = se le
  QUITÓ el vuelo. Sin contraparte no hay «otro vuelo»: el título dice «Gasto
  asignado a este vuelo» / «Gasto desligado de este vuelo», NO se pinta liga
  y `destinoDeGastosMovidos` los descarta (si no, «Ahora vive en otro vuelo»
  con enlace a `/admin/flights/null`). El tipo es `vuelo_id: string | null`:
  no volver a declararlo `string`.

### Hoja editable `QuoteSheet` (form-as-document, 8-sep-2026)

- `components/admin/quotes/quote-sheet.tsx` = la hoja 1 COMO formulario:
  `<div class="cot-hoja cot-hoja--pantalla">` con el MISMO marcado y clases
  que `_build_html` de pyservices (membrete, `.meta`, `.route`, TRASLADOS,
  ITINERARIO + `.mapa`, `.totales`, `.notas`, `.pie-pantalla`). Sub-partes:
  `quote-sheet-fields.tsx` (`CampoHoja`/`CampoNumero`/`CampoTextoLargo`/
  `CampoFecha`/`CampoDia`/`CampoSelect`/`CampoMoneda`: invisibles en reposo,
  `font: inherit`, clase `cot-in`), `quote-sheet-itinerario.tsx` (tabla del
  PDF con selector de aeropuerto, margen izquierdo con marcas/⋯/🗑, popover
  de detalle por portal, fila «+ Agregar tramo» con ruta rápida),
  `quote-sheet-desglose.tsx` (`.totales` fila por fila; TUA unitario, extras,
  descuento, IVA %, T.C. en su posición), tipos en `quote-sheet-types.ts`,
  helpers puros en `lib/admin/quote-sheet.ts` (`moneyPdf`, `fechaLegible`,
  `fechaDia`, `servicioAereoImpresoUsd`, `tramosVisibles`…).
- CSS COMPARTIDO: `src/styles/cotizacion-fuente.css` + `cotizacion-hoja.css`
  son COPIAS de pyservices (`npm run sync:hoja-css`; test de deriva
  `styles/__tests__/hoja-css-deriva.test.ts`). Lo de pantalla (geometría
  794 px, inputs invisibles, márgenes de fila, filas fantasma) vive en
  `cotizacion-hoja-pantalla.css`. Todo selector cuelga de `.cot-hoja`.
  Ahí también vive el ACENTO DE INTERACCIÓN (`--cot-acento` = brand-600,
  solo en edición `.cot-hoja:not(.cot-hoja--lectura)`): placeholders, filas
  «+ Agregar…» y chips, enlaces `.cot-liga` (12 px, en la línea del campo
  dentro de `.cot-acciones`, nunca en el margen) y punteado en los vacíos
  que el PDF imprime como texto (`.cot-fecha__texto--vacio`). Lo capturado
  sigue idéntico al PDF; un control `disabled` conserva el placeholder gris.
  Dentro de `.cot-acciones` va un ESPACIO real (`{" "}`) antes de cada
  `.cot-sep` «·»: es la oportunidad de salto de línea (U+00B7 no rompe y los
  enlaces son nowrap) para que con un nombre largo las acciones bajen de
  renglón dentro del papel. Guardias: `quote-sheet.test.tsx` («acento de
  interacción»: lectura sin croma, capturado sin `--vacio`) y
  `hoja-css-deriva.test.ts` (toda regla con `var(--cot-acento)` bajo
  `:not(.cot-hoja--lectura)`).
- MAPA: `hooks/use-quote-mapa-svg.ts` → proxy `app/api/quotes/mapa-svg/
  route.ts` → `POST /v1/quotes/mapa-svg` (el mismo `<svg>` del PDF, inline).
  Con form limpio se reutiliza el de la vista previa
  (`extraerMapaSvgDeHtml`, prop `mapaSvg`).
- Contrato: `valores` (subconjunto RHF que se imprime) + `onCambio(campo,
  valor)`; el dinero SIEMPRE del `breakdown`; `data-cot-ui` marca la croma
  que no se imprime. Test de estructura vs el HTML de pyservices:
  `components/admin/quotes/__tests__/quote-sheet.test.tsx` (fixture
  `__fixtures__/hoja1.html` generado con `npm run gen:hoja-fixture`).
- `useLookupNm` (`hooks/use-lookup-nm.ts`) es la fuente única del
  autollenado de millas (la usan `QuoteLegsEditor` y la hoja).

### Ids ancla, memoria y teclado

- Ids DOM que otros componentes/enlaces usan: `cobrable-field`,
  `tarifa-override-field`, `motivo-revision-field` (en el diálogo),
  `tc-usd-mxn-field`, `pasajeros-field`, `metodo-pago-field`,
  `billpocket-field`, `redondeo-field`, `tarifa-tipo-field`, `sobrevuelo-field`,
  `seccion-<id>` (sub-bloques del panel interno), `cobros-vuelo` (card de
  cobros del workspace). En la hoja, `pasajeros-field` y `tc-usd-mxn-field`
  son el PROPIO input invisible (no un contenedor).
- localStorage: `vt-cotizador-interno-v1` (`{abierto}` del panel interno).
  Las claves `vt-cotizador-plegado-v2` y `vt-cotizador-preview-v1` ya no se
  usan (no hay secciones plegables ni preview anclada).
- Teclado: Enter en la ruta rápida arma tramos; Ctrl/⌘+S guarda por el
  mismo camino que el botón primario (revisión: diálogo / presentación;
  alta: «Crear v1»); Esc cierra diálogos (Base UI: `DropdownMenuItem` usa
  `onClick`).
- Invariantes al tocar el cotizador: no renombrar campos RHF ni cambiar los
  payloads de `/calculate`, `/quotes` y `/revise`; el dinero SIEMPRE viene
  del API; `datetime-local` vía `cancunInputToIso`/`isoToCancunInput`; toda
  acción destructiva confirma; dejar `npx tsc --noEmit` en 0 y eslint limpio.

## Calendario: estado de la sync a Google Calendar (12-sep-2026)

Pedido del cliente: «queremos que se sincronicen los vuelos, eventos,
mantenimientos, etc. que tenemos en el calendario del sistema de VuelaTour al
Google Calendar de **aerochartercancunflightplanner@gmail.com**» y, el mismo
día, «el calendario debe sincronizarse de forma **AUTOMÁTICA** cada que se
realizan cambios, **sin sincronización manual**». La sync es UNIDIRECCIONAL
(sistema → Google) y vive en el API; el panel solo la MUESTRA (y conserva el
backfill manual para el arranque).

- **Cómo sincroniza el API ahora**: cada cambio en vuelo/escala/descanso/
  evento de flota/mantenimiento lo encola un **trigger de la BD** en
  `calendar_sync_cola` y un **worker del API lo drena cada 20 s** con
  reintentos y espera progresiva; el reconcile nocturno y el resync manual
  quedan como red de seguridad. Lo que la app sube al reconectar entra por los
  MISMOS endpoints ⇒ por la misma cola. El panel NO orquesta nada de esto: lo
  reporta.
- **Fuente única de los textos**: `lib/admin/calendar-sync.ts` —
  `chipSyncGoogle(estado, ahora?)` (chip), `syncEsAutomatica(estado)`,
  `tituloBotonResync(automatica)` y `toastResyncGoogle(res)` /
  `toastResyncFallo(status)` (toast del backfill). Helpers PUROS, probados en
  `lib/admin/__tests__/calendar-sync.test.ts`. Ningún componente redacta
  textos de la sync por su cuenta. `ahora` es **parámetro** (epoch ms, default
  `Date.now()`) para poder probar la regla de los 15 min sin fingir el reloj.
- **Chip** (`components/admin/calendar/google-sync-chip.tsx`, server): lee
  `getCalendarSyncEstado()` (`lib/api/calendar-server.ts`, GET
  `/v1/calendar/sync-estado`). Estados que NO se confunden entre sí:
  - verde «Google Calendar: **activo · automática**» + «Sin cambios en espera»
    / «N cambios en espera · el más antiguo lleva X min» (menos de 15 min y sin
    errores ⇒ normal: el worker corre cada 20 s) y «última subida …»;
  - ámbar «Google Calendar: **automática · N cambios en espera**» cuando
    `mas_antiguo_at` pasa de **15 min** (`MINUTOS_ESPERA_AMBAR`) o
    `con_error > 0`; el detalle dice desde cuándo y el **texto del error** del
    API (recortado a 140 caracteres: el chip no es un log), y el tooltip que
    nada se pierde y cuándo avisar a soporte;
  - verde «Google Calendar: **activo · automática**» con «los cambios en espera
    no se pudieron leer» cuando `automatica:true` llega **sin `cola`** (los
    conteos fallaron en ese instante): se afirma lo que sí se sabe y NO se
    inventan números — el flag autoritativo es `automatica`, nunca `cola`;
  - ámbar «Google Calendar: **activo · sin cola (migración pendiente)**» cuando
    `enabled` y `automatica:false` con `cola` **`null`** (o `activa:false`): la migración
    `20260912000002_calendar_sync_cola.sql` no está aplicada, así que un fallo
    de Google se corrige hasta la madrugada. El tooltip dice que al aplicarla
    el API la detecta solo (sonda cada 10 min) **sin volver a desplegar**;
  - ámbar «apagado — <motivo>» (faltan las variables en Railway); si hay
    cambios encolados lo dice: «N cambios quedaron en espera y se publicarán en
    cuanto se encienda» (la cola NO se descarta con la sync apagada);
  - gris «estado no disponible» cuando el API responde 404/403. `null` = no se
    pudo saber, que NO es «apagado» (afirmarlo sería mentirle a la oficina).
  - Una **pausa por cuota de Google** (`pausada_hasta`) se pinta solo mientras
    está vigente: «Google pidió esperar hasta HH:MM; se reanuda solo».
- **Tolerancia al API viejo, y la diferencia que importa**: `cola` **ausente**
  (el API todavía no sabe de colas) ⇒ el chip se pinta como antes, verde con el
  `calendar_id`, sin afirmar nada de la cola; `cola: null` ⇒ ámbar «sin cola».
  `automatica` se toma del API si viene y si no se deriva de `cola.activa`
  (`syncEsAutomatica`), nunca se supone.
- **Botón «Re-sincronizar Google»** (ADMIN) llama DIRECTO al API, no por
  server action: el backfill `[hoy−30d, hoy+365d]` es secuencial contra
  Google y puede pasarse del límite de una función de Vercel. Al terminar
  canta los conteos por tipo (`{vuelos, descansos, eventos, mantenimientos,
  errores, nota}`), tolera el `{enabled, total}` del API viejo y hace
  `router.refresh()` para que el chip muestre la nueva fecha. Con la sync
  automática **ya no es el camino normal**: la página le pasa
  `automatica={syncEsAutomatica(syncEstado)}` y su tooltip
  (`tituloBotonResync`) aclara que solo sirve para el arranque o una duda, para
  que nadie crea que hay que pulsarlo tras cada cambio. NO se esconde: sigue
  siendo la salida si alguien sospecha que falta algo viejo.
- El toast **dice la VENTANA** que se publicó (`desde`/`hasta` del API, días
  Cancún vía `fmtDateOnly` para no correr el día): sin eso la oficina cree que
  subió todo el historial y reporta como bug que no ve un vuelo viejo. Si el
  API no manda ventana, no se inventa ninguna.
- El resync es IDEMPOTENTE de verdad (el API solo re-crea un evento cuando
  Google dice 404/410): volver a pulsar el botón tras un corte de red o un
  timeout no duplica nada en el calendario de la oficina — es la salida
  recomendada si el backfill no alcanza a responder.
- El estado del API persiste el resumen del último reconcile/resync, pero si
  el ambiente todavía no lo hace el chip dice «Aún no ha corrido ninguna
  sincronización desde el último reinicio del servidor» en lugar de inventar
  una fecha. Los conteos de la **cola** sí son del momento (los consulta el
  worker en la BD).
- **Los eventos que la oficina capturó A MANO en ese Google Calendar no se
  tocan** (ni se borran ni se deduplican): decisión pendiente del cliente. El
  API lo repite en `nota` y el toast la muestra tal cual; no escribir en el
  panel ninguna promesa de limpiarlos.

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

## Comprobante del gasto: DOS opciones (14-sep-2026)

- Pedido del cliente: «en lugar de Factura solo colocar dos opciones:
  **Comprobante** (aplica para tickets, vouchers, etc.) y **Sin
  comprobante**». Aquí la pregunta es «¿hay papel?», no «¿de qué tipo?»: que
  ese papel sea FACTURA se sigue en la columna vecina «Facturación (oficina)»
  — confundir las dos fue justo el reporte anterior («Factura» vs
  «Facturada»).
- **SIN MIGRACIÓN**: `gasto.estatus_comprobante` sigue siendo el enum de
  Postgres `FACTURA | VALE | SIN_COMPROBANTE`. «Con comprobante» GUARDA
  `FACTURA` (es lo que ya manda la app cuando el gasto trae foto) y `VALE`
  queda como valor **LEGADO**: se LEE como «Con comprobante» y el panel nunca
  lo escribe.
- FUENTE ÚNICA `src/lib/admin/comprobante-badge.ts` (PURO, prueba
  `comprobante-badge.test.ts`): `hayComprobante` (misma regla que
  `comprobante.util.ts` del API: todo lo que no sea `SIN_COMPROBANTE`),
  `etiquetaComprobante` (badge de la columna «Comp.»: **solo** «Sin comp.» —
  ni FACTURA ni VALE pintan badge, con papel la miniatura basta),
  `textoComprobante` («Con comprobante» / «Sin comprobante», historial del
  vuelo), `opcionesComprobante(actual)` y `AYUDA_COMPROBANTE`. No volver a
  escribir el ternario ni la lista de opciones en las tablas/diálogos.
- **La opción legada no se muestra salvo que el gasto ya la traiga**:
  `opcionesComprobante('VALE')` agrega «Con comprobante (vale)» con ese mismo
  value para que verificar un gasto histórico SIN tocar el campo no lo mute.
  Con cualquier otro valor son dos opciones y `VALE` no es elegible.
- Dónde se ve: `expenses-table.tsx` y `flight-gastos-table.tsx` (badge; su
  `ESTATUS_STYLE` ya solo tiene `SIN_COMPROBANTE`), `expense-create-dialog` /
  `expense-verify-dialog` (selector de 2 opciones + hint que manda la factura
  a «Facturación (oficina)») y `flight-gastos-historial-card` (diff).

## Facturación (oficina): ⚪ No requiere factura (14-sep-2026)

- Pedido del cliente: «en Facturación (oficina) agregar la opción **No
  requiere factura / No facturable**». Valor nuevo `NO_FACTURABLE` de
  `gasto.estatus_facturacion` (migración del API
  `20260914000002_estatus_facturacion_no_facturable.sql`).
- FUENTE ÚNICA `src/lib/admin/facturacion-estatus.ts` (PURO — el historial
  del vuelo es Server Component y no puede importar del badge cliente):
  `FACTURACION_ESTADOS` (value/label/labelForm/emoji/dot/pill),
  `estadoFacturacion` (desconocido o ausente ⇒ PENDIENTE: jamás afirmar
  «facturado» en falso), `etiquetaFacturacion`, `opcionesFacturacionForm`
  (diálogos) y `opcionesFacturacionFiltro` (barra de Gastos). Prueba
  `facturacion-estatus.test.ts`. Lo consumen `facturacion-badge.tsx`,
  `expenses-filter-bar.tsx`, los dos diálogos y
  `flight-gastos-historial-card.tsx`.
- Semántica (la decide el API, el panel solo la refleja): un gasto
  `NO_FACTURABLE` **no está «por facturar»** — el filtro agregado
  `NO_FACTURADA` sigue siendo pendiente + solicitada — y queda FUERA del
  pendiente `gastos_sin_comprobante` del pre-cierre. Si alguien le amarra una
  factura recibida, el trigger del API lo pasa a FACTURADA.
- **TOLERANCIA a la migración no aplicada**: el API responde **400** con un
  mensaje claro («esta opción necesita la migración…; mientras, usa
  Pendiente»), nunca 500. El panel NO esconde la opción ni adivina el estado
  del servidor: el mensaje del API se pinta TAL CUAL en el toast del badge y
  en el de los diálogos (`ActionResult.error`).

## Pre-cierre: qué tacómetros hay que revisar (14-sep-2026)

- Pedido del cliente: «en Tacómetros pendientes por revisar (pre-cierre)
  ¿podría indicar cuáles son?». El item `tacos_en_revision` solo decía «· 3»
  y había que ir a buscarlos a mano en taco-live.
- El API agrega al item dos campos **ADITIVOS**: `vuelos` (los mismos chips
  que ya pintan los demás pendientes — salen gratis con el renderer que ya
  existía) y `tramos: [{vuelo_id, folio, orden, origen_iata, destino_iata,
  fecha_salida_plan, motivo, piloto_nombre}]`. Sin ellos (API sin desplegar)
  la card se comporta exactamente como antes.
- FUENTE ÚNICA de las líneas: `src/lib/admin/pre-cierre-tacos.ts` (PURO,
  prueba `pre-cierre-tacos.test.ts`) — `lineasTramosTacos` arma
  «#248 · T1 CUN → CZM · 14 sep, 01:30 p.m. · Juan Pérez · motivo»,
  deduplica por vuelo+tramo, agrupa por vuelo (folio asc), recorta el motivo
  a su primera línea y tope `MAX_TRAMOS_TACOS = 12` + «y N más…». El conteo
  del item lo manda el API y NO se recalcula: el «y N más…» se calcula contra
  el `count` del item (tercer argumento de `lineasTramosTacos`), **no** contra
  `tramos.length` — el API topa ese arreglo en 200 y `count` siempre es el
  total real; un `count` ausente o MENOR que lo recibido nunca esconde líneas.
  `folio`/`orden` en 0 son «no lo sé» (así los emite el API cuando no
  resuelve): se pintan «vuelo» y «Tramo», nunca «#0» ni «T0».
- El folio de cada línea liga a `/admin/flights/<id>`; **«Resolver» sigue
  yendo a `/admin/taco-live`**, que es donde se anota, corrige o confirma la
  lectura.

## El panel se pone al día al volver a la pestaña (14-sep-2026)

- `RefreshOnFocus` (montado UNA vez en `src/app/admin/layout.tsx`) llama
  `router.refresh()` al recuperar el foco / visibilidad, con mínimo 10 s
  entre refrescos (`src/lib/admin/refresh-on-focus.ts`, con prueba). Motivo:
  todas las páginas son `force-dynamic` + `no-store`, pero una pestaña ya
  abierta (p. ej. el detalle del vuelo) no se vuelve a pedir sola: la
  oficina movía un gasto de vuelo en Gastos y al volver a la otra pestaña
  seguía viendo la lista vieja. No toca el estado de formularios abiertos
  (refresh re-renderiza Server Components, no remonta clientes).
