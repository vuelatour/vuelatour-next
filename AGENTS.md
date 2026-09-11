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
- El PDF del CLIENTE no cambia (solo el modelo cotizado); el PDF INTERNO sí
  pinta las dos líneas y marca «Distinto al cotizado» en ámbar.

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
