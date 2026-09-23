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

## Cuando el API no contesta: reintento, degradar sin mentir — 21-sep-2026

Reporte del cliente: en `/admin/inventory` salía «Algo se rompió — An error
occurred in the Server Components render… digest» y al reintentar cargaba.
Causa reproducida con build de PRODUCCIÓN: Railway responde «Application
failed to respond» (502/503) ~30–60 s en CADA deploy del API (cinco entre el
19 y el 21-sep) y (a) `apiFetch` lanzaba ante todo no-2xx, sin reintento, y
(b) las páginas hacían `Promise.all` donde UNA llamada accesoria tumbaba la
pantalla entera. NO era timeout de Vercel (página completa p50 1.14 s).

- **Reintento en el punto ÚNICO** (`lib/api/reintento.ts` + `fetcher.ts`):
  solo **GET/HEAD**, solo ante **error de red / 502 / 503 / 504**, hasta **2**
  reintentos con esperas **400 ms y 1200 ms**. JAMÁS en 4xx (respuesta
  legítima), en **500** (bug del API: repetirlo lo esconde) ni en
  POST/PATCH/PUT/DELETE/server actions (duplicaría dinero; la idempotencia
  vive en el API con `client_request_id`). Un `AbortError` (el debounce del
  cotizador) no se reintenta. Prueba con `fetch` simulado:
  `lib/api/__tests__/fetcher-reintento.test.ts`.
- **CADA reintento lleva la cabecera `x-vt-reintento: N`** (solo en el
  servidor) y eso NO es cosmético: Next **deduplica** los `fetch` idénticos de
  un mismo render (`next/dist/server/lib/dedupe-fetch.js`, memoización de
  React; la clave incluye método y **cabeceras**). Sin cabecera distinta, el
  2.º y el 3.º intento **no salían a la red**: devolvían un clon del mismo
  503 y la pantalla caía igual, 1.6 s más tarde — el reintento era un placebo
  justo en el caso que lo motivó. Medido con el arnés (el proxy veía UNA sola
  petición); con la cabecera se ven las tres y las 7 pantallas se recuperan
  solas. En el navegador NO se agrega (no hay memoización que romper y una
  cabecera no-safelisted dispararía un preflight CORS en el peor momento).
- **Pantalla de error en es-MX** (`lib/admin/pantalla-error.ts` +
  `components/admin/pantalla-error.tsx`, usada por `app/admin/error.tsx`,
  `app/error.tsx` y `app/global-error.tsx`): «No pudimos cargar esta
  pantalla… Pulsa Reintentar; si sigue igual, manda este código a sistemas» +
  **código (digest) · hora Cancún · ruta**, botones «Reintentar» / «Volver al
  inicio». El `error.message` NO se pinta (en prod es el texto en inglés de
  Next); el error completo sigue yendo a `console.error`.
- **«Reintentar» de un boundary = `unstable_retry`, NUNCA `reset`.** La
  documentación de esta versión de Next es explícita: «`reset()` solo limpia
  el estado de error y vuelve a renderizar SIN volver a pedir los datos, así
  que no se recupera de errores de Server Components»
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`).
  Todos los fallos de esta sección son de Server Components: con `reset` el
  botón repintaba el mismo error. Los tres boundaries pasan
  `unstable_retry ?? reset` a `PantallaError` (prop `reintentar`).
- **Los datos para soporte son UNO solo**: `components/admin/datos-soporte.tsx`
  (`DatosSoporte`) pinta Código/Detalle · Hora (Cancún) · Pantalla y lo usan
  el boundary **y** `UnknownErrorScreen`. Con el API caído del todo **ninguna
  pantalla de `/admin` llega a su boundary** (el layout falla antes al leer
  `/v1/me`), así que esa es la única pantalla que el operador ve: sin los
  datos ahí, no había código ni ruta que mandar a sistemas. Su salida
  principal es Reintentar, no «Cerrar sesión». La RUTA se lee con
  `useSyncExternalStore` (snapshot de servidor «—» + snapshot del navegador):
  con `suppressHydrationWarning` React NO corrige el texto al hidratar y la
  pantalla se quedaba con «Pantalla —».
- **Degradar POR TARJETA** (`lib/api/degradar.ts` +
  `components/admin/aviso-degradado.tsx`): una llamada **ACCESORIA**
  (catálogos de selectores: proveedores, aeronaves, cuentas, clientes,
  aeropuertos, `/me`) va con `degradado.opcional("los proveedores", …, vacío)`
  y la página pinta `<AvisoDegradado faltantes={degradado.faltantes} />` («No
  se pudieron cargar los proveedores; recarga para reintentar» — el verbo
  concuerda con la etiqueta: `textoDegradado` mira el artículo, porque «No se
  pudo cargar los proveedores» es lo que salía en pantalla). Un **401/403**
  degrada en SILENCIO (es falta de permiso, recargar no lo arregla). La llamada
  **PRINCIPAL** nunca se traga: o sube al boundary (que ya reintenta) o se
  envuelve con `principal()` y se pinta `TarjetaErrorCarga` (Reintentar =
  `router.refresh()`). **Jamás pintar «sin datos» cuando la carga falló**:
  «Sin ítems en bodega» con 71 partidas cargadas es la mentira a evitar.
- **Batch con tope**: `taco-status` y `cobro-status` se parten en lotes de
  **≤200 ids** (`TOPE_IDS_BATCH` de `lib/admin/lotes.ts`, espejo del
  `@ArrayMaxSize(200)` del DTO del API). La lista mandaba 218 ⇒ 400 que el
  `.catch(() => ({}))` tragaba: NINGÚN vuelo mostraba el badge de tacómetro y
  nadie se enteraba. Un lote fallido NO se disfraza: sus ids quedan en
  `idsSinVerificar` (su total cobrado se pinta `null` = «no se sabe», nunca 0)
  y se avisa con `textoSinVerificar`.
- **Parámetros de la URL** (`lib/admin/url-params.ts`, PURO + test): en una
  ruta de detalle, un id que no es uuid ⇒ `notFound()` **sin llamar al API**
  (`esUuid`); en una lista, un filtro fuera de su catálogo o una fecha que no
  existe se **IGNORA** (`estadoFiltro`, `cobroFiltro`, `valorDeCatalogo`,
  `uuidFiltro`, `fechaFiltro`, `rangoFiltro`) y la barra de filtros recibe el
  valor YA validado. Enlaces viejos y marcadores reproducían el boundary en
  `/admin/inventory/<no-uuid>`, `/admin/flights?cobro=…`,
  `/admin/quotes?estado=…`, `/admin/expenses?desde=2026-13-45`,
  `/admin/profit-sharing?desde=nada`.
- **Verificado de punta a punta con el arnés** (build de PRODUCCIÓN contra
  una copia del API y un proxy que finge el 502/503 de Railway, 21-sep-2026):
  (a) con el API de vuelta dentro de la ventana, las 7 pantallas de muestra
  cargan solas (200, sin digest, ~2.5 s); (b) con el API caído del todo sale
  la pantalla en es-MX con detalle/hora/ruta y CERO texto en inglés; (c) con
  un catálogo caído la pantalla carga y AVISA; `/admin/flights` parte sus
  **219** ids en 2 lotes y los badges de tacómetro vuelven a salir (un lote
  caído se anuncia y no se reintenta: es POST); las 6 URLs inválidas ya no
  caen al boundary; recorrido de **315 rutas: 315 × 200, 0 digest, 0
  pantallas de error**.

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
- Formatos numéricos: `lib/format.ts` — `fmtUsd`, `fmtMxn`, `fmtDecimal`,
  `fmtPercent`, `fmtInt` y **`fmtTc`** (tipo de cambio: hasta 6 decimales sin
  ceros de cola; ver la sección «Tipo de cambio» más abajo). Un T.C. NUNCA se
  pinta con `fmtDecimal(tc, 4)`, `toFixed(4)` ni `numeroG`.
- HORAS pactadas: `lib/admin/horas.ts` (`parseHorasPactadas`,
  `fmtHorasDecimal`, `fmtHorasMinutos`, `horasATexto`…) — ver «Horas
  pactadas: 8 decimales y captura h:mm» más abajo. Se persisten y se
  multiplican con 8 decimales; se PINTAN con 4 (o con `numeroG` en la hoja).
- TARIFA $/hr: `lib/admin/tarifa.ts` (`tarifaOverrideRehidratada`,
  `preferirTarifaPersistida`, `esEcoDeTarifa`, `moneyTarifa`,
  `textoCuentaTarifa`…) — ver «Tarifa por hora: 6 decimales» más abajo. Se
  persiste y se multiplica con 6 decimales; se PINTA con `fmtUsd`/`moneyPdf`
  (2), salvo los textos que enseñan la multiplicación (`moneyTarifa`).
- Cotización de GRUPO (4-sep-2026): `types/grupos.ts` (1:1 con /v1/grupos),
  `lib/admin/grupos-ui.ts` (folioTexto "G-12", estados, semáforos vía
  estadoCobroSemaforo, `mensajeErrorGrupo` para TODOS los 409 estructurados),
  `app/admin/quotes/grupo/actions.ts` (server actions que nunca lanzan:
  `{ok,data}|{ok:false,error}`), `components/admin/grupos/**` (wizard,
  detalle, lista, badge `GrupoBadge`). El panel SOLO pinta: consolidado,
  totales, por persona, partición de cobros y montos derivados de extras
  vienen del API (la Σ local de una partición manual es solo ayuda visual).
  El desglose de la hoja del cotizador es el único editor de extras
  (`extras-editor.tsx` se retiró el 22-sep-2026 con el panel lateral: ya solo
  exportaba `EXTRAS_SUGERIDOS`, que vive en `lib/admin/extras.ts`); extras
  `origen='GRUPO'` se bloquean ("se edita desde el grupo").
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
  cabecera + avisos + cotizador a lo ancho (hoja + sus `<details>`) y, DEBAJO,
  cobros y operación — sin aside ni portal; el HISTORIAL bajó a la pila de
  `<details>` del cotizador, ver BLOQUE C).
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
  ancho del contenedor) y, DEBAJO, los sub-bloques `<details>` (el panel
  lateral se retiró el 22-sep-2026). Arriba una
  barra de ESTADO fija (`TotalBar`, roja): total con IVA del breakdown,
  cliente · folio · vN, «Ver PDF real» / «Guardar y ver PDF», Descartar /
  Guardar → vN (o «Crear v1» en el alta) y chips de avisos (capacidad,
  ancla CUN, millas en 0, costo externo MXN sin T.C.). Debajo de la hoja, la
  save bar (Crear v1 / Guardar → vN con el resumen del diff).
- Todo lo que se IMPRIME se edita en su lugar en la hoja (cliente, aeronave
  = modelo, pasajeros, fecha del vuelo, itinerario + mapa, desglose, notas) con
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
  `onAbrirInterno(destino)` (`'tarifa' | 'cobrable' | 'sobrevuelo'`) — que
  desde el BLOQUE C ya NADIE pasa: en la hoja interna esos campos están en el
  papel y el atajo hace scroll + foco (`enfocarEnHoja`).
- Tarifa y horas NO se editan en la hoja DEL CLIENTE (feedback 9-sep-2026:
  «¿dónde se ajusta la hora volada por tramo y la tarifa por hora?»): ahí la
  hoja solo las SEÑALA con croma de edición y `onAbrirInterno` (la marca
  «1.20 h» NO va exenta del guard de CONFIRMADO/RESERVA porque su popover
  edita). Con el panel retirado (BLOQUE C) nadie pasa ese callback y el
  atajo del CLIENTE no se pinta: ese rol tampoco puede guardar. **En la HOJA
  INTERNA sí se editan desde el BLOQUE B** (22-sep-2026) y el MISMO atajo solo
  hace scroll + foco al renglón del papel (`enfocarEnHoja`). Los atajos:
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

### Panel «Interno · no se imprime» — RETIRADO (22-sep-2026)

`quote-internal-panel.tsx` **ya no existe**. Era el panel lateral derecho
colapsable (botón «Interno» en el borde, memoria `vt-cotizador-interno-v1`) y
se vació bloque a bloque hasta desaparecer, que es lo que pidió el cliente:
«la idea es ir quitando el modal flotante lateral derecho “No se imprime”,
porque en la cotización interna sí va a aparecer todo».

**Dónde vive ahora cada cosa** (el detalle, en «Fase 2.3 · BLOQUE A/B/C»):

| Lo que había en el panel | Dónde está hoy |
|---|---|
| Cliente frecuente · «+ nuevo cliente» · «Poner todo en $0» | línea «Cliente» de la ficha del papel (BLOQUE A) |
| Método de cobro previsto · «¿cuál?» · % de terminal | cabecera del bloque COBROS del papel (BLOQUE A) |
| Redondeo (auto + manual) · switch «Se cobran TUAS» | sus renglones del desglose (BLOQUE A) |
| «Cotización abierta» · «Pase de abordar» | fila «Marcas» de la ficha (BLOQUE A) |
| Notas internas | su bloque del papel (BLOQUE A) |
| Plantilla de ruta · toggles del PDF del cliente | `<details>` bajo el papel (BLOQUE A) |
| Tarifa (segmento + $/hr) · sobrevuelo · cobrable pactado · comisión del vendedor | ficha «Tarifa» / «Horas cotizadas» / «Vendedor» del papel (BLOQUE B) |
| Tabla «Horas por tramo» | la absorbió la columna TIEMPO de «Tramos cotizados» (BLOQUE B) |
| Card azul RUTA OPERATIVA del vuelo | banda azul DENTRO del papel, encima de la tabla de tramos (BLOQUE C) |
| Operador externo · ruta operativa del alta · detalle del cálculo | `<details>` bajo el papel (BLOQUE C) |
| Avisos ámbar (chips del panel) | banda ámbar de ancho completo ARRIBA del papel (BLOQUE C) |
| Botón vertical del borde + `vt-cotizador-interno-v1` | se retiraron |
| **TODO lo anterior, para el rol que NO ve la hoja interna (SOCIO)** | `<details>` «**Ajustes de la cotización**» bajo la hoja del cliente (`quote-captura-basica.tsx`) |

- **Ningún rol se queda sin un control** (revisión adversaria, 22-sep-2026).
  El panel retirado **se pintaba para TODOS los roles**; la hoja interna solo
  la ven `ROLES_HOJA_INTERNA` (ADMIN, COORDINADOR, FACTURACION, ANALISTA). Al
  mudar los controles al papel, **SOCIO** —que entra al cotizador por el menú
  («Cotizaciones» no filtra por rol) y puede SIMULAR con `/calculate`— se
  quedaba sin tarifa, horas, comisión del vendedor, método de cobro, redondeo,
  TUAS, cotización abierta, pase de abordar, notas internas ni la banda de
  ruta operativa: **trece controles que ese rol tenía ayer**. Los tiene en
  `QuoteCapturaBasica`, un `QuotePlegable` (abierto por defecto) que se monta
  **exactamente cuando `puedeVerHojaInterna(rol)` es false**, con el MISMO
  campo RHF y el MISMO id ancla — por eso los ids nunca se duplican con los
  del papel. En LECTURA pinta la lista de solo lectura que daba el panel
  (incluido «Pase de abordar»). La banda de RUTA OPERATIVA se le pinta con su
  otra piel (`QuoteRutaOperativaBanda suelta`), porque `.cot-ops` cuelga de
  `.cot-interna` por invariante del CSS.
- **Qué autoriza el retiro del panel**: `POST /v1/quotes` y
  `POST /v1/quotes/:id/revise` son **ADMIN/COORDINADOR** (`@Roles` del API), y
  los dos están en `ROLES_HOJA_INTERNA` — quien puede GUARDAR ve el papel
  donde se captura todo. La inclusión `ROLES_EDITAN_COTIZACION ⊆
  ROLES_HOJA_INTERNA` la congela `lib/admin/__tests__/quote-sheet-interna.test.ts`.
  SOCIO/FACTURACION/ANALISTA pueden consultar y SIMULAR pero no guardar, y la
  pantalla lo dice con una banda ámbar (`AVISO_SOLO_CONSULTA`) en vez de
  prometerles un guardado que el API rechaza con 403.
- **La pantalla ENTERA está probada rol por rol** en
  `components/admin/quotes/__tests__/quote-pantalla-completa.test.tsx`: monta
  `QuoteCalculator` completo (alta y revisión, ADMIN/COORDINADOR/FACTURACION/
  ANALISTA/SOCIO, editable y en lectura, con BillPocket y con OTRO) y exige
  (1) que los 13 controles del panel estén para TODOS los roles, (2) que
  ningún id se repita en la página, (3) que ningún `<details>` desmonte su
  contenido, (4) que nada `data-guard-exempt` contenga un control que EDITE y
  (5) que todo control tenga nombre accesible. Es la red que faltaba: los
  tests de la hoja comparan el papel contra pyservices, pero nadie montaba la
  pantalla completa — que es donde un control «migrado» desaparece para el rol
  que no ve el papel.

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

## La cotización es INDEPENDIENTE de la operación — TRAMOS (22-sep-2026)

- **El bug (cotización #326, pedido del cliente)**: «antes de poner el tipo de
  cambio está en 3596 y después de ponerlo, se cambia en automático, no sé por
  qué». Se cotizó `T1 CUN→PTU FERRY` + `T2 PTU→CUN 2 pax` ⇒ TUAS $0 ⇒
  **$3,596.00** (la TUA se cobra en el aeropuerto de SALIDA de cada tramo con
  pasajeros, y en PTU las matrículas N están exentas). Al día siguiente el
  PILOTO editó los dos tramos vivos desde la app (4 pax, sin ferry) — cambio
  OPERATIVO legítimo. El cotizador rehidrataba `escalas` de la **escala VIVA**
  cuando `itinerario_operativo = false`, así que al PRIMER cambio real (teclear
  el T.C.) llamaba a `/calculate` con 4 pax saliendo de CUN ⇒ TUA CUN $25 × 4
  + IVA ⇒ **$3,712.00**. En revisión sin cambios el bug no se veía: se pinta el
  snapshot y no se llama al motor. Misma familia que el avión (#298, 12-sep) y
  la misma regla del cliente: «la cotización no debe verse afectada por cambios
  en el vuelo operativo». En prod divergían **9 de 64** cotizaciones con
  `itinerario_operativo = false`, y **8 versiones guardadas** ya se habían
  llevado el pax de la operación al precio con un motivo que solo decía «[TC
  —→16.97] Corrección».
- **Fuente única `lib/admin/tramos-cotizados.ts`** (PURA, sin React; hermana de
  `avion-cotizado.ts`), congelada en `__tests__/tramos-cotizados.test.ts`:
  `tramosCotizadosDeCotizacion` (tramos + el `orden` con el que cruzan),
  `tramosDeCotizacion`, `tramosDeOperacion`, `divergenciasDeOperacion`,
  `textoDivergencia`, `chipDivergencia`, `ETIQUETA_ACTUALIZAR`, `mismaRuta`,
  `paxDeTramo`, `escalasComerciales`. Ningún componente repite esta cascada ni
  redacta estos textos.
- **Qué PRECIA sale del SNAPSHOT** (origen, destino, millas, pasajeros,
  `es_ferry`, pernocta y su costo, tipo de parada y sus notas) y **qué NO
  precia sale de la escala VIVA** del MISMO `orden` y solo si su ruta sigue
  siendo la del tramo cotizado (`fecha_salida_plan`, `notas` del tramo,
  `pasajeros_nombres`). Con `itinerario_operativo = true` no se hereda nada: las
  escalas del vuelo son OTRA ruta a propósito.
- **La RUTA precia Y es de la operación**: el formulario arranca con la
  COTIZADA (es la que imprime el PDF y la que compone el precio), pero
  guardar **no** la escribe sobre el vuelo mientras la oficina no la haya
  cambiado en el cotizador — lo decide el API comparando el DTO contra el
  snapshot (invariante 24; casos reales #322 `CET→PTU` y #297 `PPS→CZM`, los
  dos con tacómetro). Por eso el aviso ámbar dice la verdad completa: la
  cotización conserva lo pactado **y** el vuelo conserva su ruta real. Para
  cobrar lo que se voló está el botón «Actualizar la cotización con la
  operación»; para corregir el vuelo, se edita el tramo desde el vuelo.
- **Cascada**: `calculo_snapshot.ruta.escalas` (`ResolvedLeg[]`: el input
  exacto con el que se pactó) → `calculo_snapshot.tramos` → escalas comerciales
  VIVAS no canceladas (sin snapshot todavía no hay nada pactado: una RESERVA
  que se cotiza por primera vez) → sugerencia CUN→destino→CUN (itinerario
  operativo sin cotizar) → los 2 tramos del REDONDO legado. Las
  `solo_operativa` NUNCA entran; los CANCELADOS tampoco (bug independiente que
  esto arregla de paso: `formDefaults` filtraba `solo_operativa` pero no
  `cancelada_at`, así que un tramo cancelado se PRECIABA).
- **El aviso ámbar** (`quote-calculator.tsx`, FUERA del papel — no toca la hoja
  ni sus fixtures): banda con `textoDivergencia(...)` + botón
  «**Actualizar la cotización con la operación**» y chip
  `chipDivergencia(...)` en la TotalBar (nunca se esconde, aunque el panel
  interno esté cerrado). El botón **confirma** (regla del cliente) y al aceptar
  solo hace `setValue('escalas', tramosDeOperacion(q), {shouldDirty:true})`: el
  formulario queda SUCIO, el motor recalcula y la oficina **VE** el total nuevo
  antes de guardar. **Nunca se guarda ni se recalcula solo.** En LECTURA
  (cotización cobrada/facturada, caso #292) la banda se pinta igual pero SIN
  botón: enterarse no depende de poder editar.
- **Textos, en palabras de operador** (congelados en el test): «el tramo 1 ya
  no es ferry y lleva 4 pasajeros (cotizado: ferry, sin pasajeros)», «el tramo
  2 lleva 6 pasajeros (cotizados 2)», «el tramo 2 ahora va CZM → CET (cotizado
  CZM → CUN)», «el tramo 2 ahora pernocta (no se cotizó pernocta)», «hay un
  tramo 3 PTU → CUN que no se cotizó», «el tramo 3 cotizado (PTU → CUN) ya no
  existe en la operación», «el tramo 2 se canceló en la operación». Siempre
  cerrado con «La cotización conserva lo pactado.».
- **Ruido**: el aviso sale con CUALQUIER divergencia —el pax también cambia lo
  que IMPRIME el itinerario—, pero cada `Divergencia` trae `mueveDinero`
  (false solo para un cambio de pax cuando las TUAS están apagadas, caso #319)
  por si hay que filtrar. **Sin ninguna escala comercial viva se devuelve `[]`**:
  un payload sin `escalas` no es «el piloto borró el itinerario», y N avisos
  falsos «ya no existe» enseñan a ignorar los verdaderos.
- **Campo ADITIVO `tramos_base: 'COTIZADO' | 'OPERACION'`**
  (`ReviseQuotePayload`): viaja **SOLO** en `POST /v1/quotes/:id/revise`,
  **jamás** en `/calculate` (el API corre con `forbidNonWhitelisted`:
  respondería 400 en cada tecla). `COTIZADO` = los tramos salen del snapshot,
  así que lo que difiera de él es una edición DELIBERADA de la oficina y lo que
  coincida el API lo OMITE del UPDATE —la escala viva conserva el pax y el
  ferry del piloto—. `OPERACION` = se pulsó el botón del aviso. Tras guardar o
  Descartar vuelve a `COTIZADO`.
- **Orden de deploy: API ANTES que panel.** Red de seguridad si se invierte
  (`esApiSinTramosBase` + `MSG_TRAMOS_BASE_API_VIEJO` en
  `lib/admin/quote-revise-errores.ts`, PUROS + test): ante el 400 «property
  tramos_base should not exist», si la operación **no** difiere de lo cotizado
  se reintenta sin el campo con el MISMO `client_request_id` (no hay nada del
  piloto que pisar); si **sí** difiere se FRENA con banner ámbar, porque contra
  ese API guardar escribiría los tramos cotizados sobre las escalas vivas y
  borraría los pasajeros que capturó el piloto. El riesgo #1 de este cambio es
  el inverso del bug: corregir la LECTURA sin la ESCRITURA destruye el trabajo
  del piloto.
- **`quote-workspace.tsx` cruza por `orden`, nunca por posición**:
  `tramoExtraLectura` y `escalasPdfPreview` resuelven la escala viva con
  `escalaVivaPorOrden.get(t.orden)` del tramo COTIZADO (es como cruza
  `escalasVisiblesPdf` en el API). Con posiciones, un tramo nuevo o faltante en
  la operación patcheaba el ojito/fecha de la escala equivocada.
  `rutaComercial` de la cabecera sale de la misma fuente.
- **Borrador `?d=` y «Copiar como nueva cotización»**: los dos serializan
  `getValues()`, así que ahora llevan los tramos **COTIZADOS** (o los que el
  operador editó a mano) — copiar una cotización copia lo que se pactó, no lo
  que acabó volándose. Al restaurar un borrador en revisión, `tramos_base`
  vuelve a `COTIZADO` A PROPÓSITO: la decisión del API es POR TRAMO contra el
  snapshot, así que lo que el operador cambió sigue contando como cambio.
- **Lo que NO cambia**: la app del piloto sigue editando sus tramos igual; la
  bitácora, los manifiestos, el reporte por vuelo, el calendario y los toggles
  `PATCH pdf-visibilidad` siguen leyendo la escala VIVA; el PDF del cliente ya
  leía el snapshot (la corrección alinea la pantalla con el papel, no al
  revés). Los fixtures de la hoja NO se regeneran: el aviso vive fuera del
  papel.
- **Cableado vigilado** en
  `components/admin/quotes/__tests__/quote-calculator-tramos.test.ts`: que el
  cotizador siga enchufado a `tramosDeCotizacion`, que `tramos_base` no se
  cuele a `armarCalcPayload`, que el botón del aviso no guarde y que el
  workspace no vuelva a indexar la escala viva por posición.

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

## Tipo de cambio: 6 decimales y el total en pesos se LEE (17-sep-2026)

- **El bug (vuelo #314, pedido del cliente)**: la hoja imprimía «Total MXN
  (T.C. 16.9916) $100,000.00 MXN» y el diálogo «Registrar cobro» decía
  «Total ≈ MXN $99,999.81». El operador captura el T.C. con los decimales que
  hacen cuadrar los pesos (100000 / 5885.25 = 16.991631…), pero (a) la BD
  guardaba el T.C. en `numeric(10,4)` y lo redondeaba a espaldas del motor, y
  (b) el panel lo PINTABA con `fmtDecimal(tc, 4)` / `numeroG` (el `:g` de
  Python = 6 cifras SIGNIFICATIVAS). Cita: «ese cambio cuando hace la
  conversión a pesos, no sé por qué cuando son muchos decimales como que
  siempre cambia a como está en la cotización».
- **REGLA 1 — el total en pesos de un vuelo se LEE, jamás se recalcula.**
  `vuelo.monto_total_mxn` es el número EXACTO que el cliente vio impreso (lo
  compuso el motor: los renglones capturados en pesos —TUAS, extras— entran
  tal cual SIN pasar por el T.C.). `monto_total_usd × tc_usd_mxn` NO es ese
  número, aunque el T.C. tenga todos sus decimales. Solo se estima con el
  producto cuando el vuelo no trae `monto_total_mxn`, y entonces se etiqueta
  «≈» en la UI.
- **REGLA 2 — un T.C. se ESCRIBE con `fmtTc`** (`lib/format.ts`): hasta
  **6 decimales, sin ceros de cola** (`16.991632` → «16.991632»; `16.9916` →
  «16.9916»; `18` → «18»; null/vacío → cadena VACÍA, quien llama decide el
  «—»). Es la traducción literal de `_tc_txt` de pyservices
  (`app/services/_formato.py`) y la misma precisión que persiste el API
  (`numeric(12,6)`, `common/tc.util.ts`). **Nunca** `fmtDecimal(tc, 4)`,
  `toFixed(4)` ni `numeroG` para un T.C.: `numeroG` queda SOLO para las horas
  (`{tiempo_cobrable_hr:g}` del armador). Inputs de T.C.: `step="0.000001"`.
  - Cubre: `vuelo.tc_usd_mxn`, `cobro_vuelo`/`cobro_grupo`, `vuelo_grupo`,
    `cotizacion_version_history` y `gasto.tc_gasto`. **NO** cubre
    `tipo_cambio_oficial.tc`, `compra.tc_usd_mxn` ni
    `inventario_movimiento.tc_usd_mxn` (siguen en 4 decimales a propósito:
    referencia diaria y compras/inventario, no el precio que el cliente ve).
  - Inputs de T.C. con `step="0.000001"` INCLUIDO el del CFDI
    (`invoices/emitir-factura-button.tsx`): su T.C. se persiste en
    `vuelo.tc_usd_mxn`, así que un `step` de 4 decimales invalidaba el
    número exacto que hace cuadrar los pesos.
  - Un total en pesos se pinta con `fmtMxn` (dos decimales + «MXN»), nunca
    con `toLocaleString("es-MX")` a secas: la bandeja de facturas decía
    «$100,000» donde la hoja decía «$100,000.00 MXN».
- **Paridad entre repos** (panel ⇄ pyservices ⇄ API): el texto del T.C. es
  el MISMO carácter por carácter. Lo congelan `lib/__tests__/format.test.ts`
  (misma tabla que `tests/test_cotizacion_pdf.py::test_tc_txt…` de
  pyservices) y, de punta a punta, el fixture **`hoja-tc6`** de la hoja
  editable (`__fixtures__/hoja-tc6.payload.json`, T.C. 16.991632): si el
  panel o pyservices recortan el T.C., ese fixture falla. Tras tocar el
  armador de pyservices hay que regenerar con `npm run gen:hoja-fixture`.
- **«Registrar cobro»** (`flights/cobro-form-sheet.tsx`): recibe
  `montoTotalMxn` (= `vuelo.monto_total_mxn`) y `tieneCobros`. La ficha pinta
  **«Total MXN (cotización)»** con el persistido (y «Total ≈ MXN» solo cuando
  no existe). Al pasar la moneda a MXN, el importe sugerido sale de
  `montoSugeridoMxn` (`lib/admin/cobros.ts`, regla ÚNICA): sin cobros = los
  pesos exactos de la cotización; con cobros = `round2(pendiente_usd × tc)`;
  cancelado = sin sugerencia. La sugerencia NUNCA pisa un importe tecleado
  (misma regla que el T.C. prellenado) y volver a USD restaura el pendiente.

## Quién registró el cobro (22-sep-2026)

- Pedido del cliente sobre la card «Cobro»: «ver ahí en la lista de cobros de
  un vuelo quién registró el cobro». El uuid `cobro_vuelo.registrado_por`
  (y el del sobre `cobro_grupo.registrado_por`) lo resuelve a nombre **el
  API, en lote**, y lo manda como `registrado_por_nombre` — campo **ADITIVO**
  (`FlightCobro`, `SobreSalida`, ambos opcionales): con un API previo la card
  queda EXACTAMENTE como estaba. El panel jamás pide nombres por su cuenta ni
  deduce el nombre de un uuid.
- **Fuente única del texto**: `textoRegistroCobro(cobro)` → `«Registró: Itzi»`
  o `null`, y el tooltip `TITULO_REGISTRO_COBRO` (`lib/admin/cobros.ts`,
  congelados en `__tests__/cobro-registrado-por.test.ts`). Sin nombre no hay
  renglón — nunca un «—», un «Sistema» ni el uuid crudo. Lo pintan, en un
  renglón propio (para que un `truncate` con referencia larga no se lo coma),
  `flights/cobros-card.tsx`, `quotes/quote-cobros-card.tsx` y
  `grupos/detalle/grupo-cobros-card.tsx`; ningún componente redacta la frase.

## Horas pactadas: 8 decimales y captura h:mm (22-sep-2026)

- **El bug (cotizaciones #322 y #302, pedido del cliente)**: mismos datos
  (XB-PEV, CUN→PTU→CUN, tarifa personalizada $600/hr, cobrable pactado
  2.333333333) y dos resultados: la #322 salía $1,399.98 / $1,623.98 y la
  #302 $1,400.00 / $1,624.00. «No me lo redondea en la primer captura… aquí
  sí en la segunda.» El motor multiplicaba con la precisión COMPLETA
  (2.333333333 × 600 = 1,400.00) pero lo PERSISTIDO eran 4 decimales; el
  panel rehidrataba ese 2.3333, el cálculo en vivo daba 1,399.98 y al
  Guardar el descuadre quedaba grabado. Misma familia que el T.C. de 4
  decimales (17-sep) — y la misma regla: **lo que se persiste es lo que se
  usó para multiplicar**.
- **Fuente única `lib/admin/horas.ts`** (PURA, sin React ni `lib/format`,
  congelada en `__tests__/horas.test.ts`): `HORAS_DECIMALES = 8`, `round8`,
  `horasONull` (descarta vacío/negativo/0), `mismasHoras`, `parseHorasPactadas`
  (decimal «2.3333» · «2,5», h:mm «2:20», «2 h 20 min», «45 min»; vacío =
  regla; `parcial` para lo que se está tecleando; errores en es-MX),
  `fmtHorasDecimal` (presentación, 4 decimales por default),
  `fmtHorasMinutos` («2 h 20 min», «≈» cuando no cae en minuto exacto),
  `horasATexto` (texto canónico del input: decimal corto, h:mm cuando hace
  falta, nunca «2.33333333» crudo), `preferirHorasPersistidas` y
  `textoCambioHoras`.
- **Rehidratación** (`quote-calculator.tsx`): el pactado se re-hidrata con
  `preferirHorasPersistidas(calculo_snapshot.tiempos.cobrable_hr,
  quote.tiempo_cobrable_hr)` — de los dos caminos gana el que conserva MÁS
  precisión cuando son el mismo número (snapshot viejo de 4 decimales +
  columna nueva `numeric(14,8)`), y el SNAPSHOT cuando de verdad difieren
  (es la foto con la que se compuso el dinero impreso). En el camino de ida
  (`armarCalcPayload` → `/calculate`, `create`, `revise`) el número viaja
  ENTERO: ningún `toFixed(4)`/round4 sobre horas.
- **Captura amigable** (`CampoHorasPactadas`,
  `components/admin/quotes/campo-horas-pactadas.tsx`): sustituye al
  `type="number" step="0.1"` del «Cobrable pactado» (`#cobrable-field`) y al
  del avión hijo del grupo (`grupo-form/aviones-editor.tsx`). Acepta decimal
  o h:mm, no normaliza mientras se teclea (el cursor no salta) y solo
  re-sincroniza cuando el valor cambia desde FUERA (rehidratación,
  Descartar, `?d=`). Debajo, línea viva «= 2 h 20 min · 2.3333 hr × $600.00 =
  $1,400.00»: el importe es `breakdown.totales.subtotal_vuelo_usd` del
  MOTOR, jamás una multiplicación local; mientras el motor va un debounce
  atrás dice «calculando…» (la coincidencia horas⇄breakdown se mide con
  tolerancia de 4 decimales, que es lo que devuelve un API sin desplegar).
- **Presentación**: las horas se pintan con `fmtHorasDecimal(v, 4)` (panel) y
  con `numeroG` en la hoja (el `:g` de pyservices = 6 cifras
  SIGNIFICATIVAS: 2.33333333 → «2.33333»). Un número de 8 decimales NUNCA se
  pinta crudo (`quote-desglose-card.tsx` lo hacía en el desglose legado).
  Paridad panel ⇄ pyservices congelada en el fixture **`hoja-horas8`**
  (`__fixtures__/hoja-horas8.payload.json`, «Servicio aéreo (2.33333 h ×
  $600.00/hr)»): si alguno de los dos cambia de formato, el test falla.
  Esa paridad depende de que el API mande al PDF las horas del SNAPSHOT y no
  las de la columna (revisión adversaria 22-sep, corregido en
  `quotes-pdf.service`): con la columna todavía en `numeric(10,4)` la hoja de
  pantalla decía «2.33333 h» y el PDF real «2.3333 h» para la misma
  cotización. Si vuelve a divergir, el bug está allá, no aquí.
- **Diff de versiones** (`quote-revision.ts`): las HORAS (`cobrable`,
  `sobrevuelo`) se comparan a 8 decimales, no a los 4 de `num` — con la
  comparación vieja, pactar «2:20» sobre una cotización que guardaba 2.3333
  no contaba como cambio, no aparecía «Guardar» y la cotización no se podía
  arreglar. El texto lo arma `textoCambioHoras`, que sube la precisión (2 →
  4 → 8) hasta que los dos números se distinguen: nunca «Cobrable pactado
  2.3333→2.3333 hr».
- **Captura h:mm, decisiones congeladas**: los minutos son LITERALES tengan
  uno o dos dígitos («2:5» = 2 h **5** min = 2.08333333, no 2:50) y un
  «:30» suelto NO se adivina (error que enseña los dos formatos; media hora
  se escribe «0:30» o «30 min»). Nada de esto queda en la sombra: la línea
  viva bajo el campo dice «= 2 h 5 min · 2.0833 hr × $600.00 = $1,250.00»
  antes de guardar. Congelado en `__tests__/horas.test.ts`.
- **El ciclo completo está probado** (`horas.test.ts` → «ciclo completo
  pactar → guardar → reabrir»): pactar «2:20»/«1:45»/«0:50» a $600, $3,500 y
  $9,750/hr, persistir, rehidratar lo que devuelve el API —`numeric` de
  PostgREST llega como **número O cadena**, y `to_jsonb` conserva los ceros
  de cola («2.50000000»)— y volver a multiplicar: el total no se mueve.
- PENDIENTE conocido: `sobrevuelo_hr` se rehidrata del snapshot y SÍ mueve
  dinero (se suma al cobrable). El API ya lo persiste con 8 decimales desde
  el 22-sep, pero su input sigue siendo `type="number" step="0.1"` (nadie
  pacta un sobrevuelo en minutos); queda pendiente subirlo a
  `CampoHorasPactadas` si alguna vez hace falta.
- **El GRUPO no pierde el pactado del hijo** (verificado en la revisión
  adversaria, 22-sep): `grupo-form/types.ts` rehidrata
  `tiempo_cobrable_override_hr: null` y `payload.ts` **omite** el campo
  cuando es null, así que el API cae a lo persistido
  (`groups.service`: `a.tiempo_cobrable_override_hr ?? prev…`, y `prev` sale
  de `horasPactadasPersistidas`). Lo que sí hay que saber: el campo del
  wizard se VE VACÍO aunque el hijo tenga horas pactadas, y ahí vacío NO
  significa «vuelve a la regla» sino «conserva lo pactado» (lo contrario de
  lo que dice el mismo campo en el cotizador). Cambiar de avión al hijo SÍ
  suelta el pactado (precio nuevo, avión nuevo). Rehidratarlo de verdad
  exige decidir antes cómo se expresa «vuelve a la regla» en el contrato del
  grupo con el API — no tocar sin esa decisión.

## Tarifa por hora: 6 decimales (22-sep-2026)

- **El bug (cotización #105, COMPLETADO y cobrado)**: la oficina tecleó
  **989.583333** $/hr para cerrar el SERVICIO AÉREO en **$2,375.00** con
  2.4 hr. (Al probarlo en pantalla: #105 lleva un descuento de $200.00 y $0
  de IVA, así que la **TotalBar dice $2,175.00** y la línea «Servicio aéreo»
  $2,375.00 — con la tarifa truncada el par bajaba a $2,174.99 / $2,374.99.
  No esperar $2,375.00 en la barra de total.) El motor
  multiplicó con la tarifa completa, pero `vuelo.tarifa_hora_usd` era
  `numeric(10,2)` y `calculo_snapshot.tarifa.usd_por_hora` guardaba
  `round2(...)`: quedó **989.58**. Al reabrir, el panel rehidrataba ESE 989.58
  en «$/hr — SOLO esta cotización» y el motor devolvía 2.4 × 989.58 =
  **$2,374.99**: guardar sin tocar nada bajaba un centavo. Es el MISMO defecto
  de la #322 (horas, 22-sep) y del T.C. (17-sep), por el otro factor del
  producto. **El invariante es uno solo: lo que se persiste es EXACTAMENTE lo
  que se usó para multiplicar** (tc, horas y tarifa).
- **Fuente única `lib/admin/tarifa.ts`** (PURA, sin React ni `lib/format`,
  congelada en `__tests__/tarifa.test.ts`): `TARIFA_DECIMALES = 6`, `round6`,
  `normalizarTarifa` (conserva el **0** = «Poner todo en $0» del cliente
  interno), `tarifaPactadaONull` (0 → null: el `> 0` que ya exigía la
  rehidratación), `mismaTarifa`, `preferirTarifaPersistida`,
  `tarifaOverrideRehidratada`, `esEcoDeTarifa`, `tarifaConDecimalesFinos`,
  `textoTarifaInput` (placeholders), `moneyTarifa`, `textoCuentaTarifa` y
  `textoCambioTarifa`.
- **Rehidratación** (`quote-calculator.tsx` → `tarifaPersistidaDeCotizacion`):
  `tarifaOverrideRehidratada(q.calculo_snapshot?.tarifa, q.tarifa_hora_usd)`.
  Sigue exigiendo `proviene_de_override` (una tarifa que salió del avión o de
  la preferencial del cliente DEBE re-resolverse al cambiar PUBLICO↔BROKER o
  de avión) y, de los dos caminos, se queda con el que conserva MÁS precisión
  cuando son el mismo número (snapshot viejo de 2 decimales + columna nueva
  `numeric(14,6)` o al revés) y con el SNAPSHOT cuando de verdad difieren.
  `tarifa_personalizada` (el segmento «Personalizada») sale del MISMO helper:
  una sola regla decide las dos cosas. En el camino de ida (`armarCalcPayload`
  → `/calculate`, `create`, `revise`, borrador `?d=`) el número viaja ENTERO:
  ningún `toFixed(2)`/round2 sobre la tarifa.
- **Captura**: el input `#tarifa-override-field` pasó a `step="0.000001"`
  (con `0.01` el navegador marcaba inválida la tarifa que hace cuadrar el
  total) — igual que los inputs de T.C. desde el 17-sep. Lo mismo en el avión
  hijo del grupo (`grupo-form/aviones-editor.tsx`), cuyo placeholder pinta la
  tarifa vigente con `textoTarifaInput` (sin ceros de cola).
- **La CUENTA VIVA** bajo el campo: cuando la tarifa trae MÁS de 2 decimales,
  el panel dice «2.4 hr × $989.583333 = $2,375.00» (`textoCuentaTarifa`), con
  el importe del **MOTOR** (`breakdown.totales.subtotal_vuelo_usd`), jamás una
  multiplicación local; mientras el motor va un debounce atrás dice
  «calculando…» (la coincidencia tarifa⇄breakdown se mide con tolerancia de 2
  decimales, que es lo que devuelve un API sin desplegar). Con tarifas de 2
  decimales NO se pinta nada: la cuenta se ve sola.
- **Presentación**: la tarifa se sigue pintando con `fmtUsd` (2 decimales) y
  la hoja la IMPRIME con `moneyPdf` — paridad carácter por carácter con el
  `_money` de pyservices, **ningún fixture cambia**. La excepción son los
  textos que ENSEÑAN la multiplicación, que usan `moneyTarifa` (2 decimales de
  piso, 6 de techo) para no leerse descuadrados por un centavo: la línea viva
  de `CampoHorasPactadas`, el atajo «1.60 h × $650.00/hr · ajustar» de la hoja
  (croma `data-cot-ui`, no se imprime), el hint «Subtotal» del detalle del
  cálculo, el chip de aporte del sobrevuelo, la fila por avión del wizard de
  grupo y el desglose LEGADO de `quote-desglose-card` (que además lee el monto
  PERSISTIDO: nunca recalcula). `tarifaSub` (el sub del selector) enseña sus
  2 decimales cuando la tarifa no es redonda — «$990/hr» sobre 989.583333
  decía otro número del que se cobra.
- **Diff de versiones** (`quote-revision.ts`): la tarifa se compara a 6
  decimales (no a los 4 de `num`) y **un ECO TRUNCADO no es un cambio**
  (`esEcoDeTarifa`: difieren, |Δ| ≤ 0.005 y el entrante tiene MENOS
  decimales) — un borrador `?d=` viejo o un API a medio desplegar devuelven
  989.58 contra 989.583333, y anunciarlo sería prometer un cambio que el API
  DESCARTA (ancla el eco a lo persistido). Una edición real (990, o agregar
  decimales a propósito) sí se cuenta, y el texto lo arma `textoCambioTarifa`
  subiendo la precisión (2 → 4 → 6) hasta que los dos números se distinguen:
  nunca «Tarifa/hr $989.58→$989.58». Vaciar el campo y ponerlo en $0 siguen
  contándose como siempre.
- **Efecto colateral bueno**: la «deriva del motor» («La tarifa cambió desde
  vN» del diálogo de guardar) dejó de dispararse en falso en la #105 — el
  baseline se recalcula con la tarifa completa y vuelve a dar el total del
  snapshot.
- **Compatibilidad**: `tarifa_hora_usd` y `calculo_snapshot.tarifa.
  usd_por_hora` llegan de `numeric` de PostgREST como **número O cadena**
  (con ceros de cola): las dos formas se normalizan igual. Con el API todavía
  sin migrar (los dos caminos en 2 decimales) el panel se comporta
  EXACTAMENTE como antes — no inventa precisión que no le mandaron.
- **Comisión del vendedor POR_HORA**: NO tiene este defecto.
  `comision_vendedor_tarifa_hr` no vive en ninguna columna `numeric`: se
  rehidrata de `calculo_snapshot.meta` (jsonb, precisión completa) y su input
  se queda en `step="0.01"` a propósito.
- Pendiente conocido: si el toggle «tarifa/hr» del PDF está ENCENDIDO, la hoja
  y el PDF imprimen «Servicio aéreo (2.4 h × $989.58/hr) … $2,375.00» — la
  etiqueta impresa se recorta a 2 decimales por paridad con pyservices. El
  monto es el correcto; la etiqueta la decide el armador, no el panel.

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
  que `_build_html` de pyservices (membrete, `.meta`, `.route`,
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
  `components/admin/quotes/__tests__/quote-sheet.test.tsx` (fixtures
  `__fixtures__/*.html` generados con `npm run gen:hoja-fixture`: `hoja1`,
  `hoja-normal`, `hoja-multidia`, `hoja-externo` y `hoja-tc6` — este último
  congela el T.C. de 6 decimales, ver «Tipo de cambio» más arriba).
- SIN horas para el cliente (15-sep-2026, pedido sobre el PDF del folio
  #314): la hoja ya NO tiene el bloque «Traslados». En `.meta`, bajo «Fecha
  de cotización», va **`Fecha del vuelo: dd/mm/aaaa`** (plural + rango
  «15/09/2026 – 17/09/2026» si el regreso cae en otro día de pared; sin
  fecha la línea no existe) — `fechaVueloImpresa` + `fechaCorta` /
  `fechaCortaFlexible` de `lib/admin/quote-sheet.ts`, espejo de
  `_fecha_vuelo_html` / `_fecha_corta` de pyservices, alimentado por
  `fechasTrasladoImpresas` (campo `valor`) para que los tramos ocultos se
  respeten igual que en el API.
  La SALIDA y el REGRESO con hora siguen siendo dato OPERATIVO y solo se
  capturan aquí: viven en `.cot-horas` (dos `CampoFecha` datetime-local +
  la ayuda «Las horas no se imprimen: el cliente solo ve la fecha»), un
  subárbol `data-cot-ui` que el React NO monta en lectura y cuyo CSS cuelga
  de `.cot-hoja:not(.cot-hoja--lectura)`. El guardado no cambia: siguen
  siendo `fecha_vuelo` / `fecha_traslado_final` del form (el calculador los
  manda con `cancunInputToIso`). Cuando el primer/último tramo está oculto,
  junto al campo aparece la marca «impreso: tramo N» (esa fecha se edita en
  el detalle ⋯ del tramo). Tras tocar `cotizacion_pdf.py` hay que
  REGENERAR los fixtures (`npm run gen:hoja-fixture`), nunca editarlos a
  mano.
- `useLookupNm` (`hooks/use-lookup-nm.ts`) es la fuente única del
  autollenado de millas (la usan `QuoteLegsEditor` y la hoja).

### Ids ancla, memoria y teclado

- Ids DOM que otros componentes/enlaces usan: `cobrable-field`,
  `tarifa-override-field`, `motivo-revision-field` (en el diálogo),
  `tc-usd-mxn-field`, `pasajeros-field`, `metodo-pago-field`,
  `billpocket-field`, `redondeo-field`, `tarifa-tipo-field`, `sobrevuelo-field`,
  `seccion-<id>` (`externo` | `operativa` | `detalle`: viven DENTRO de su
  `<details>` bajo el papel desde el BLOQUE C), `cobros-vuelo` (card de
  cobros del workspace). En la hoja interna TODOS son el PROPIO control (no un
  contenedor); en el `<details>` «Ajustes de la cotización» del rol sin hoja
  interna son el `<div>` envoltorio, como en el panel retirado. Quien los
  busca acepta las dos formas
  (`el.matches("input, button") ? el : el.querySelector(…)`) porque nada
  garantiza que el próximo ancla nazca igual. **Cada ancla existe UNA sola
  vez**: la hoja interna y `QuoteCapturaBasica` son EXCLUYENTES (una u otra,
  nunca las dos) y, desde que se retiró la pestaña del PDF, la hoja del CLIENTE
  solo la monta el rol SIN hoja interna — nunca las dos a la vez.
  Congelado en `__tests__/quote-pantalla-completa.test.tsx`.
- localStorage: **solo** `vt-cotizador-plegado-<id>-v1` (los `<details>` bajo
  el papel). Las claves `vt-cotizador-interno-v1` (panel lateral),
  `vt-cotizador-hoja-v1` (la pestaña retirada la noche del 22-sep-2026),
  `vt-cotizador-plegado-v2` y `vt-cotizador-preview-v1` ya no se usan.
- Teclado: Enter en la ruta rápida arma tramos; Ctrl/⌘+S guarda por el
  mismo camino que el botón primario (revisión: diálogo / presentación;
  alta: «Crear v1»); Esc cierra diálogos (Base UI: `DropdownMenuItem` usa
  `onClick`).
- Invariantes al tocar el cotizador: no renombrar campos RHF ni cambiar los
  payloads de `/calculate`, `/quotes` y `/revise`; el dinero SIEMPRE viene
  del API; `datetime-local` vía `cancunInputToIso`/`isoToCancunInput`; toda
  acción destructiva confirma; dejar `npx tsc --noEmit` en 0 y eslint limpio.

## Calendario: semáforo de 5 colores (22-sep-2026)

- Pedido del cliente: «que en los calendarios no se vean tantos colores […]
  los colores que tiene cada avión configurados los seguiremos respetando
  principalmente en los reportes del balance individual y general en los excel
  […] en realidad los colores son para el reporte de excel nada más: **Gris**:
  Tentativo · **Verde**: Confirmado · **Amarillo**: Permiso o asunto pendiente
  · **Rojo**: Cancelado · **Azul**: Descanso 💤». Antes convivían OCHO colores
  (el del avión entre ellos) y el calendario se leía como un mosaico: el color
  decía QUÉ avión, no CÓMO va el vuelo.
- **Los colores los decide el API** (`colores-calendario.util.ts` → campo
  `color` de `GET /v1/calendar` → colorId de Google). El panel **no calcula
  colores de eventos**: `calendar-grid.tsx` pinta `ev.color` tal cual y
  `textOnColor` decide si el texto va blanco u oscuro. La forma de
  `/v1/calendar` NO cambió: solo cambian los VALORES de `color` (y
  `sin_asignar`/`tentativo` siguen viajando para tachar/etiquetar).
- **FUENTE ÚNICA de la leyenda**: `lib/admin/calendario-semaforo.ts` (PURO,
  prueba `__tests__/calendario-semaforo.test.ts`) con los 5 hex —
  `#64748B` tentativo, `#22C55E` confirmado, `#F59E0B` pendiente, `#EF4444`
  cancelado, `#3B82F6` descanso—, `SEMAFORO_CALENDARIO` (orden y textos
  exactos del cliente + tooltip de qué hacer) y `NOTA_COLOR_AVION`. Los hex
  son COPIA de los del API: si allá cambian, aquí también o la leyenda miente.
  La pinta `components/admin/calendar/leyenda-semaforo.tsx`
  (`<LeyendaSemaforo>`, con `children` para notas que no hablan de color, como
  el aviso push); toda leyenda de calendario nueva sale de ahí, nunca de hex
  sueltos. Cableado congelado en `calendar/__tests__/leyenda-semaforo.test.tsx`.
- **El color del avión** (`aeronave.color_calendario`) se sigue capturando y
  se sigue usando — **solo en los Excel** de balance individual y general
  (pyservices). En el panel su etiqueta es «**Color en los reportes de
  Excel**» (`ETIQUETA_COLOR_AVION`/`HINT_COLOR_AVION`/`AYUDA_COLOR_AVION`/
  `tituloColorAvion` del mismo archivo) en el formulario del avión, la ficha
  del expediente y el tooltip del punto de la lista de aeronaves.
- **Ya no hay colores reservados**: `RESERVED_CALENDAR_COLORS` se retiró de
  `app/admin/aircraft/schema.ts`. Existía porque el color del avión pintaba
  sus vuelos y podía confundirse con un estado; sin eso, rechazar un tono
  sería un candado sin motivo (el API nunca validó esa lista).
- «⚠ Falta asignar» del detalle del día pasó de morado a **ámbar**: es un
  asunto pendiente, el mismo cubo del semáforo. El morado «Sin asignar», el
  rosa «Externo», el verde azulado del descanso y el celeste del evento ya no
  existen en ningún calendario. (Los badges violeta del DETALLE DEL VUELO no
  son calendario y se quedaron como estaban.)
- **Orden de deploy: API antes que panel.** Con el API viejo la leyenda ya
  dice 5 colores mientras el calendario todavía pinta 8 — se ve raro pero no
  rompe nada. Tras desplegar el API hay que **re-pintar Google** (resync o
  encolar la ventana), o los eventos ya creados conservan su color viejo.

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

### Nombre corto del piloto para el título del evento (17-sep-2026)

Pedido del cliente: el evento de Google debe leerse como los que la oficina
escribía a mano — `Saab N4142R cun-mid-cun 10:00` — porque **Luis (mecánico)
es el único que sigue usando Google Calendar**; los demás usan la app. El
apodo NO se puede derivar del nombre: a «Alexander E. Saab» le dicen «Saab»,
a «Abraham Zamora» «Zamora», a «Pablo Canales» «Pab».

- El título lo arma el **API** (`google-evento.util.ts`); el panel solo
  CAPTURA el apodo (`usuario.apodo`, ≤ 20 caracteres). Vacío ⇒ el API usa el
  primer nombre, así que el campo nunca es obligatorio.
- Fuente única del panel: `lib/admin/usuario-apodo.ts` (`APODO_MAX`,
  `APODO_LABEL/PLACEHOLDER/HINT`, `normalizarApodo`, `apodoParaPayload`,
  `esRechazoPorApodo`), probada en
  `lib/admin/__tests__/usuario-apodo.test.ts`. Ningún diálogo redacta la
  etiqueta ni recorta a mano.
- Se captura en **Usuarios**: `users/user-form-dialog.tsx` (edición) y
  `users/user-invite-dialog.tsx` (alta, opcional). Viaja al API **solo si
  cambió** y vaciarlo manda `null` explícito — mismo patrón que la tarjeta
  corp. (el `""` lo tira `stripEmpty` y borrarlo sería un no-op silencioso).
  Mandarlo en cada guardado re-escribiría al usuario y re-encolaría sus
  vuelos en el espejo del calendario.
- `users-table.tsx` lo pinta como chip junto al nombre (solo si viene) y el
  buscador de la tabla también busca por apodo.
- **API viejo**: el campo es opcional en `types/users.ts` (`apodo?`), así que
  el panel no rompe si no llega. Si el guardado lo manda y el API todavía no
  lo acepta, Nest responde 400 «property apodo should not exist» y la action
  lo cambia por un mensaje en es-MX (`APODO_API_VIEJO`) en vez del error
  técnico. Regla de deploy: **API antes que panel**.

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

## Próximo servicio: la orden se ve, no solo «faltan 9.8 h» (19-sep-2026)

- Pedido del cliente (Porfirio, ADMIN, captura del XA-VGV a las 08:49):
  «retomando el tema de que se generara automáticamente la instrucción de
  generar una orden de servicio de mantenimiento 10 hrs antes del tiempo
  estimado, no se generó, mejor dicho solo marca una leyenda. Entonces es
  enunciativa y posterior la agrego». La tarjeta decía «Próximo servicio · a
  las 2,250 h · Servicio 500 hrs · faltan 9.8 h» y NO había orden: el avión
  cruzó el umbral a las 08:40 (captura de tacos del vuelo #295) y la revisión
  que crea la orden corría UNA vez al día, a las 08:00.
- Corrección del API: la revisión se dispara también al capturar/confirmar
  cualquier tacómetro (+ red de seguridad cada 10 min) y
  `proximo_servicio` gana el campo **ADITIVO**
  `orden: { id, estado: 'PROGRAMADO'|'EN_TALLER', fecha_programada: string|null,
  automatica: boolean } | null` — el mantenimiento ABIERTO que cubre ese hito,
  resuelto con el MISMO criterio del dedupe de la creación automática. Llega en
  los dos sitios: `/v1/aircraft/:id/metrics` (`faltan_hr`) y
  `/v1/aircraft/:id/tacometros` (`faltan`).
- **FUENTE ÚNICA del panel**: `src/lib/admin/proximo-servicio.ts` (PURO,
  prueba `__tests__/proximo-servicio.test.ts`) — `estadoOrdenServicio`
  devuelve `{texto, tono, detalle?, accion}` ya redactado en es-MX:
  PROGRAMADO sin fecha ⇒ **«Orden programada · falta confirmar fecha»**
  (ámbar + enlace «Poner fecha» a `#mantenimientos`); con fecha ⇒ «Orden
  programada para 25 sep 2026»; EN_TALLER ⇒ «En taller»; **sin orden** y
  dentro del umbral ⇒ «La orden se genera sola en unos minutos» (ya no «solo
  una leyenda»); sin orden y lejos ⇒ `null` (no se pinta nada). El `detalle`
  (tooltip) dice si la creó el sistema o la oficina: es justo la duda que
  levantó el reporte. Ningún componente redacta estos textos a mano.
- **`orden` AUSENTE (`undefined`) ⇒ `null`**: API sin desplegar = la UI se
  comporta EXACTAMENTE como antes. Prometer «se genera sola» contra un backend
  sin el hook sería repetir la mentira que reportó el cliente. `orden: null`
  (el API miró y no hay) sí pinta la promesa. Mismo patrón que
  `estadoParcialDeGasto`.
- **La promesa la respalda el API, no una constante** (revisión adversaria
  20-sep-2026): `proximo_servicio.aviso_automatico` (ADITIVO)
  `= {activo, umbral_hr} | null` dice si la regla `servicio_horas` está
  ENCENDIDA y con qué margen. Con `activo:false` la línea cambia a **«La orden
  NO se crea sola · hay que capturarla»** (ámbar + «Crear orden») — con la
  regla apagada nadie la crea, y prometer lo contrario sería otra vez «es
  enunciativa». `null` (el API no pudo leer la config) o ausente (API sin
  desplegar) ⇒ se conserva la promesa, que es el comportamiento normal. El
  margen sale de `umbralServicio(prox, umbralHr?)`: override explícito →
  `aviso_automatico.umbral_hr` → `UMBRAL_ORDEN_HR`. Bajar el aviso a 5 h en
  Configuración ya no deja la tarjeta prometiendo desde las 10 h.
- `dentroDelUmbral` (≤ el margen VIGENTE; `UMBRAL_ORDEN_HR` = 10 es solo el
  respaldo, espejo de `alerta_config.servicio_horas.horas_anticipacion`)
  sustituye al `< 10`
  suelto que tenía el KPI: a las 10.0 h exactas el API ya disparó y la tarjeta
  no pintaba ámbar. El umbral se puede sobreescribir por parámetro; el panel
  **no lo adivina** desde otro lado. Las horas NO se recalculan aquí: vienen
  del API (`faltanHoras` acepta los dos nombres del campo a propósito —
  mapearlo a mano en cada card es donde se cuela un número equivocado).
- Pruebas: `lib/admin/__tests__/proximo-servicio.test.ts` (los textos y la
  tolerancia al API viejo) y
  `components/admin/aircraft/__tests__/aircraft-kpi-strip.test.tsx` (el
  CABLEADO: que la línea y el enlace lleguen al marcado y que sin el aditivo la
  tarjeta quede idéntica a antes).
- Dónde se ve: `aircraft/aircraft-kpi-strip.tsx` (KPI «Próximo servicio»,
  segunda línea bajo el hint) y `aircraft/aircraft-tacometros-card.tsx`
  (métrica «Faltan»), con el MISMO helper para que las dos digan lo mismo. El
  enlace es el ancla **`#mantenimientos`** = la card «Mantenimientos» de
  `aircraft-engineering.tsx` (`id` + `scroll-mt-24`), que es donde se confirma
  la fecha. Tipos aditivos: `OrdenServicioProgramada` en `types/aircraft.ts`
  (`TacometroHistorial.proximo_servicio.orden`) y
  `AircraftMetricsDetalle.proximo_servicio.orden` en `lib/api/aircraft.ts`.
- La fecha se pinta con `fmtDateOnly` («25 sep 2026»), no en dd/mm/aaaa: es el
  MISMO formato con el que la card de Mantenimientos muestra esa orden, y dos
  formatos para el mismo dato confunden al operador.

## Valorizado de la bodega: JAMÁS un USD sumado como MXN (22-sep-2026)

- Reporte del cliente sobre la hoja «inventario» del Balance general: «Aceite
  15w 50 · 30 · **$3,300.00 MXN**» cuando la única entrada fueron 30 × 110
  **USD sin tipo de cambio**. Medido en prod: **67 de las 68 ENTRADAs** (la
  carga VTF-INV-001 del 29-ago) están así, o sea casi toda la bodega —
  **78,398.88 dólares rotulados como pesos**.
- El API (invariante 8, `inventario-cardex.util.ts#statsFromLayers`) partió el
  valorizado en DOS campos que **nunca se suman entre sí**: `valor_mxn` /
  `valor_total_mxn` / `totales.valor_costo_mxn` pasan a traer **SOLO pesos
  reales** (compra en MXN, o USD con T.C.) y lo comprado en dólares sin T.C.
  viaja aparte, EN DÓLARES, en los ADITIVOS `valor_usd_sin_tc`,
  `valor_total_usd_sin_tc`, `totales.valor_costo_usd` y `pesos_exactos` /
  `totales.valor_sin_tc`.
- **`valor_mxn` CAMBIÓ DE SIGNIFICADO**: el panel pintaba ese campo tal cual en
  `/admin/inventory` («valorizado $X (FIFO)») y en el detalle del producto
  («Valorizado»), así que sin tocar nada las dos pantallas dirían **«$0.00
  MXN»** para 63 de los 66 productos. No es mentira, pero es MUDO — y el
  operador acaba de reportar justo lo contrario.
- **FUENTE ÚNICA** `lib/admin/inventario-valorizado.ts` (PURA, prueba
  `__tests__/inventario-valorizado.test.ts` con el caso real del 15W-50):
  `textoValorizado({mxn, usdSinTc, pesosExactos})` → «$3,500.00 MXN» (sin
  dólares, idéntico a antes) · «$1,785 USD (sin T.C.)» (todo en dólares) ·
  «$2,000.00 MXN + $200 USD (sin T.C.)» (mixto), `tieneUsdSinTc`,
  `NOTA_VALOR_SIN_TC` (dice qué hacer: capturar el T.C. con «Editar costo») y
  `TITULO_VALOR_SIN_TC`. La moneda va SIEMPRE escrita porque `fmtUsd` y
  `fmtMxn` comparten el símbolo «$». Ningún componente redacta estas frases.
- `lib/api/inventory-server.ts#listInventarioTodo` suma **DOS totales**
  (`valor_total_mxn` y `valor_total_usd_sin_tc`): juntarlos en su `reduce`
  reintroduciría el bug del cliente, esta vez en el panel.
- **SKEW**: el aditivo AUSENTE (API previo) ⇒ todo se comporta exactamente como
  hoy. `pesos_exactos` ausente NO significa «hay dólares»: nada se adivina.
- `costo_fifo_mxn_actual` («Costo FIFO» del detalle) **sigue trayendo el número
  en dólares** cuando la capa más vieja no tiene T.C.: no es una suma de dinero
  y el API lo dejó así a propósito (lo cualifica `pesos_exactos`). Si el cliente
  lo reporta, el arreglo es del API, no de aquí.

## Cardex: eliminar un movimiento con justificación (21-sep-2026)

- Pedido del cliente (captura del «Cardex completo» de un ítem con tres
  movimientos capturados por error el 29-ago — Salida −10 a XA-VGV, Entrada
  +1 de $350 MXN, Salida −1 a XA-VGV): «podemos agregar una opción para
  eliminar algunos movimientos, pero que al momento de eliminarlos pida
  justificación y sepamos quién lo hizo». Regla permanente: toda acción
  destructiva confirma.
- **La regla y los números son del API, no del panel.** `evaluarEliminacion`
  (API) simula el cardex SIN el movimiento y solo permite la baja si la
  existencia nunca queda negativa Y ninguna otra salida cambia su costo FIFO.
  El panel **jamás** recalcula un stock ni un FIFO: un segundo motor de cardex
  aquí es precisamente el «cálculo paralelo» que el proyecto prohíbe.
- Dónde se ve: fila del **cardex del ítem** (`inventory/cardex-table.tsx`,
  junto a «Editar costo») → bote «Eliminar» que abre
  `inventory/eliminar-movimiento-dialog.tsx`. El diálogo, al abrirse, pide la
  **VISTA PREVIA** (`previewEliminarMovimientoAction` →
  `GET /v1/inventory/items/:id/movimientos/:movId/eliminacion`) y pinta en
  claro qué va a pasar: «Se eliminará la SALIDA de 10 pzas del 29 ago 2026 a
  XA-VGV. / Regresan 10 pzas a la existencia (de 111 a 121). / También se
  elimina su gasto de $3,500.00 MXN cargado a XA-VGV.» Nunca se enseña el
  botón destructivo antes de haber preguntado.
- **Bloqueado ⇒ sin botón de eliminar**: título corto por `code`
  (`TITULO_BLOQUEO`) + el **`mensaje` del API tal cual**, que es el único que
  nombra QUÉ hay que eliminar primero (con su fecha). Códigos:
  `MOVIMIENTO_DE_COMPRA`, `STOCK_NEGATIVO`, `CAMBIA_COSTO_FIFO`,
  `GASTO_BLOQUEADO`, `TIPO_NO_SOPORTADO` (devolución/ajuste quedan fuera a
  propósito: se corrigen con un movimiento contrario). Se decide por CÓDIGO,
  nunca por el texto — `ActionResult` de inventario ganó `code` (aditivo).
- El bote se muestra en **cualquier tipo** de movimiento aunque algunos estén
  bloqueados: esconderlo dejaría al operador sin respuesta. La explicación la
  da la vista previa.
- **Justificación obligatoria**: textarea «¿Por qué se elimina?» con contador
  (`estadoMotivo`, mínimo 10 caracteres YA recortados — mismos límites que el
  DTO del API y el `check` de la BD) y el botón destructivo deshabilitado
  hasta cumplirlo. Al terminar: toast con la existencia resultante
  (`mensajeExito`) + `router.refresh()`.
- **Historial** bajo el cardex: `inventory/movimientos-eliminados-card.tsx`,
  sección plegable «Movimientos eliminados (N)» con fecha, tipo, cantidad,
  avión, **QUIÉN**, **CUÁNDO** (hora Cancún, `fmtDateTime`) y el **MOTIVO**
  completo. Sin filas no se pinta; si la lectura FALLÓ, se dice
  (`TEXTO_HISTORIAL_NO_CARGO`) — nunca «no hay eliminados» cuando no se pudo
  leer.
- **Tolerancia al API viejo**: `listMovimientosEliminados`
  (`lib/api/inventory-server.ts`) nunca lanza y distingue tres desenlaces —
  `disponible:false` (404 de la RUTA = backend sin desplegar ⇒ el bote NO se
  muestra), `falla:true` (502/red ⇒ el bote sigue y la sección avisa) y
  normal. Si aun así el DELETE llega a un API viejo, `mensajeErrorEliminacion`
  responde «falta actualizar el API» (404 sin `code` estable); el 503
  `MIGRACION_PENDIENTE` y los 409 se pintan con el mensaje del API.
- **FUENTE ÚNICA de los textos**: `lib/admin/inventario-eliminar.ts` (PURO,
  prueba `__tests__/inventario-eliminar.test.ts` con el caso REAL de la
  captura). Ningún componente redacta estas frases a mano.
- Roles: la baja es **SOLO ADMIN** (mismo rol del DELETE del API; el panel lo
  sabe por `getMe()`, igual que «Editar costo» con ADMIN/MECANICO); el
  historial es OFICINA. La server action revalida también `/admin/expenses`:
  la baja borra los gastos REFACCION/BODEGA que generó la salida.
- **Probado con el arnés contra el API 0.0.18 real** (21-sep-2026, sin
  ejecutar ningún DELETE): con rol ADMIN el bote sale y la vista previa del
  aceite 15W-50 responde lo esperado (la SALIDA −10 del 29-ago se permite:
  110 → 120; la ENTRADA +120 se bloquea con STOCK_NEGATIVO y la SALIDA −24
  con CAMBIA_COSTO_FIFO, cada una nombrando qué borrar primero); con rol
  MECANICO el bote NO aparece y «Editar costo» sigue; con la ruta del
  historial en 404 (API viejo) el bote desaparece y con 503 el bote sigue y
  la sección dice que no cargó. Renders congelados en
  `components/admin/inventory/__tests__/movimientos-eliminados-card.test.tsx`
  (quién · cuándo en hora Cancún · motivo, y que un fallo de lectura nunca se
  pinte como «no hay eliminados»).

## Conceptos extra: lo que no entra al total se DICE (21-sep-2026)

- Pedido del cliente (captura de la hoja de una cotización CUN–CZM–CUN):
  «Servicio aéreo $650.00 · TUA CZM $50.00 · [SIN IVA] Concepto $35.00 ·
  Subtotal $700.00 · Total (USD) $700.00 — **¿por qué no suma el extra de 35
  usd en el total?**». «Concepto» en rojo era el **placeholder** del campo
  vacío: el renglón pintaba 35.00 en la columna de importes como si contara,
  `extrasAPayload` no lo mandaba al motor (exige concepto; el API además pide
  `concepto` de 1–120) y **al Guardar se descartaba en silencio** — tampoco
  llegaba al PDF. Propuesta aprobada: «mientras falte el nombre, el renglón se
  ve atenuado con la leyenda “Falta el nombre: no se suma ni se imprime”, y al
  guardar avisa en lugar de descartarlo en silencio».
- **FUENTE ÚNICA `src/lib/admin/extras.ts`** (PURA, prueba
  `__tests__/extras.test.ts`): `estadoExtra(e, {tcCapturado})` → `ok` |
  `vacio` | `sin_nombre` | `sin_monto` | `mxn_sin_tc`, y de ahí cuelgan las
  tres cosas que antes vivían separadas: `extrasAPayload` (reescrito como
  `estadoExtra === 'ok'`, **mismo resultado que antes**, congelado con una
  prueba de paridad contra el filtro viejo), `extrasFueraDelTotal` (los que
  tienen ALGO capturado y no cuentan, con motivo, monto NATIVO, moneda y
  `campo` a corregir) y `bloqueoGuardadoExtras` (decisión PURA del candado:
  `{bloquear, mensaje, primero, fuera}`). Si el filtro y el aviso volvieran a
  vivir en sitios distintos, vuelve el bug.
  - `vacio` = **sin nombre Y sin monto**: renglón recién agregado, no molesta
    (se sigue descartando en silencio, como siempre).
  - Textos ÚNICOS en `TEXTO_EXTRA_FUERA`: «Falta el nombre: no se suma ni se
    imprime», «Falta el monto: no se suma ni se imprime» y, para MXN sin T.C.,
    **el que ya usaba la hoja** («Captura el T.C. en «Total MXN»: sin él el
    renglón no entra al total») — se reutiliza, no se duplica. Ningún
    componente redacta estas frases a mano.
  - El mensaje del candado se adapta al motivo: «Hay 1 concepto que no entra
    al total ($35.00): ponle nombre o quítalo.» / «Hay 2 conceptos… ($35.00 +
    $1,500.00 MXN): ponles nombre y monto o quítalos.» Dos monedas NUNCA se
    suman entre sí, y sin monto capturado no se inventa cifra.
- **HOJA** (`quote-sheet-desglose.tsx`, **solo en EDICIÓN**): la fila lleva
  `cot-fila--fuera` (importe atenuado + tachado suave) y bajo el concepto sale
  la leyenda ámbar `cot-aviso` (`data-cot-ui`). El clic lleva al campo que
  falta — concepto, monto en USD o en pesos, el detalle «⋯» cuando el monto es
  `cantidad × unitario`, o el campo del T.C. En **LECTURA la hoja no monta nada
  de esto**: sigue siendo byte a byte el PDF y los fixtures de
  `__tests__/quote-sheet.test.tsx` **no se regeneran**. CSS en
  `styles/cotizacion-hoja-pantalla.css`, TODA regla bajo
  `.cot-hoja:not(.cot-hoja--lectura)` (lo exige `hoja-css-deriva.test.ts`); el
  texto va en ámbar-**700** (#b45309), no en el #d97706 de las marcas del
  margen: a 10px sobre papel blanco ese ámbar da 3.2:1 y no llega al 4.5:1 de
  AA — y la leyenda es quien CARGA el mensaje, el color solo acompaña.
  - **`data-guard-exempt` solo cuando el clic únicamente MUEVE EL FOCO.** La
    leyenda de `cantidad × unitario` abre el detalle «⋯», que EDITA y cuyo
    popover entero va exento: exenta también la leyenda, la confirmación única
    de CONFIRMADO/RESERVA se saltaba entera. Misma regla que la marca «1.20 h»
    del itinerario — lo que abre un popover que edita NO va exento.
  - **Una línea de GRUPO se DICE, no se toca**: aquí está bloqueada («se edita
    desde el grupo»), así que su leyenda es TEXTO + « · se corrige en el grupo»,
    sin botón. Con clic no habría a dónde ir (el concepto es texto, no input) y
    el atajo al detalle «⋯» habría dado justo la edición que el candado niega.
    La excepción es `mxn_sin_tc`: ese T.C. sí vive en esta hoja y sí se corrige
    aquí, así que esa leyenda conserva su liga.
- **GUARDAR SIN PERDER DINERO**: `frenarPorExtras()` corre en `handleSave`
  (alta «Crear v1», revisión desde el diálogo, Ctrl/⌘+S) **y** en
  `abrirGuardar` (botón primario y «Guardar y ver PDF»), DESPUÉS del candado
  de `mxnSinTc` para que ese conserve su mensaje y su foco al T.C. No se
  guarda: toast con el mensaje + scroll/foco al primer renglón
  (`ariaLabelCampoExtra` → `.cot-hoja [aria-label=…]`). **El botón NO se
  deshabilita** a propósito: un botón apagado no explica nada; el clic sí.
  `guardarPresentacion` (D5, PATCH pdf-visibilidad) queda fuera porque no
  persiste extras.
- **Una línea de GRUPO se MARCA pero no BLOQUEA**: aquí va bloqueada (se edita
  en el grupo), así que frenar por ella dejaría la cotización hija imposible de
  guardar — `bloqueoGuardadoExtras` las descarta por `deGrupo`. Si un cargo del
  grupo viene en pesos sin T.C., el candado que corresponde sigue siendo
  `mxnSinTc`, que sí se corrige en esta pantalla.
- **El «editor clásico» `extras-editor.tsx` se RETIRÓ** (22-sep-2026, BLOQUE
  C): no lo montaba nadie desde que el desglose de la hoja pasó a ser el
  editor de extras, y su `AvisoFueraDelTotal` ya solo servía a sus propias
  variantes. `EXTRAS_SUGERIDOS` (los chips de «+ Agregar concepto») vive ahora
  en `lib/admin/extras.ts`, junto al resto de la regla.
- **GRUPO**: sus cargos son otro tipo (`ExtraGrupoForm`) y otra función, y ahí
  la regla exige además la cantidad cuando no es por persona. **FUENTE ÚNICA en
  `grupo-form/payload.ts`**: `motivoCargoGrupo` (privada) y de ella cuelgan las
  TRES cosas que vivían copiadas — `extrasPayload` (qué viaja al armador y al
  API), `cargoGrupoCompleto` (con la que `extras-grupo-editor.tsx` NUMERA las
  filas contra el consolidado; una copia local de la regla desalinea esa
  numeración y cada fila enseña el monto de OTRA) y `extrasGrupoIncompletos` +
  `avisoCargosGrupo` (el candado, que `grupo-form.tsx` corre antes de guardar
  abriendo la sección «Cargos»). Un renglón EN BLANCO no molesta; uno a medias
  sí. Reutiliza los textos de `TEXTO_EXTRA_FUERA` y agrega
  `TEXTO_CARGO_SIN_CANTIDAD`; `falta` ('nombre'|'monto'|'cantidad') existe para
  redactar el aviso corto sin partir el motivo largo.
- Pruebas: `lib/admin/__tests__/extras.test.ts` (tabla de estados; paridad
  **exhaustiva** de `extrasAPayload` con el filtro anterior sobre el producto
  cartesiano de concepto × monto × moneda × IVA × unitario × cantidad ×
  por_persona × origen —36 000 casos, verificada además una vez contra el
  archivo real de HEAD—; que payload + fuera + vacíos sumen SIEMPRE la lista
  completa, y el mensaje del candado),
  `components/admin/quotes/__tests__/quote-sheet-extras-fuera.test.tsx` (la
  clase y la leyenda en edición; el TOTAL del motor: $700.00 con el renglón
  fuera y $735.00 al ponerle nombre; a qué campo lleva cada leyenda y cuál va
  exenta del guard; la línea de GRUPO sin clic; CERO rastro en lectura) y
  `components/admin/grupos/grupo-form/__tests__/cargos-grupo.test.ts`
  (`cargoGrupoCompleto` ≡ el filtro del payload en producto cartesiano, los
  tres motivos con su índice y el texto del aviso).

## Desglose: conceptos sin IVA debajo del IVA (22-sep-2026)

- Pedido del cliente: «los conceptos que estén SIN IVA que vayan ABAJO de
  donde está el IVA, para que se entienda visualmente que no lleva IVA, igual
  en la cotización». Aplica a los TRES PDF (cliente, interno, grupo) y a la
  hoja WYSIWYG del panel, que replica el del cliente.
- **No es mover renglones**: cambia el significado del que va SOBRE el IVA.
  Hoy vale `total − IVA` e INCLUYE los exentos, así que bajarlos dejaría una
  columna que ni suma lo de arriba ni es la base del 16 % — las dos lecturas
  del Excel de la oficina rotas a la vez. Con la partición ACTIVA ese renglón
  pasa a ser la BASE GRAVABLE y se rotula «**Subtotal gravable**»; los exentos
  bajan bajo «**No causan IVA**», antes del Total.
- **FUENTE ÚNICA `particionarPorIva`** (`lib/admin/quote-sheet.ts`, PURA,
  genérica sobre la fila): port EXACTO de `particionar_por_iva` de
  `cotizacion_pdf.py` — mismos umbrales, mismo orden de decisiones, mismas
  etiquetas literales (`ETIQUETA_BASE_GRAVABLE`, `ETIQUETA_SUBTOTAL`,
  `ETIQUETA_SIN_IVA`, `TOLERANCIA_USD = 0.005`). Si allá cambia, aquí también
  o la pantalla y el papel divergen. Prueba:
  `lib/admin/__tests__/quote-sheet.test.ts`.
- **ACTIVACIÓN CONDICIONAL**: hace falta al menos un exento con monto ≠ 0 **y**
  IVA > 0. Además se verifican las identidades (tolerancia de medio
  centavo) antes de reordenar: `Σ gravables == base` y
  `base + IVA + Σ exentos == total`. Si alguna falla se DEGRADA al layout de
  siempre. **Jamás una columna que no suma** — y ningún monto cambia nunca:
  solo su posición y la etiqueta.
- **TERCERA identidad, solo si la base se DERIVÓ**: `base × ivaPct == IVA`.
  Una base derivada cumple la segunda identidad por construcción, así que sin
  este candado se rotularía «Subtotal gravable» un número cuyo 16 % no es el
  IVA impreso (caso real: redondeo POST-IVA absorbido en «Servicio aéreo»).
  El porcentaje se pasa desde `breakdown.iva.porcentaje × 100`, el mismo que
  se pinta en la etiqueta. En la hoja **casi nunca aplica** (aquí la base SÍ
  viaja, en `breakdown.iva.base_usd`): existe para que el port siga siendo
  idéntico al de pyservices y para los snapshots legados sin base.
- Qué cuenta como EXENTO en la hoja: extra con `aplica_iva === false` (también
  el sintetizado, p. ej. la comisión BillPocket) y **SIEMPRE** la pernocta
  (`viaticos_pernocta_usd`). El descuento entra como gravable con monto
  NEGATIVO; las filas de detalle de TUAS sin importe llevan monto 0 y el total
  va en «TUAS (total)».
- **Un renglón que NO entra al total aporta 0 y NO se mueve**, aunque venga
  marcado «sin IVA»: `estadoExtra` manda (21-sep-2026). Moverlo al bloque de
  exentos lo haría parecer parte del total y desbalancearía la verificación.
  Las filas FANTASMA (`data-cot-ui`: TUA exenta, «+ Agregar concepto»,
  descuento en 0) también aportan 0.
- `subtotalSinIvaUsd` sigue siendo el valor del renglón cuando la partición NO
  está activa: no se borró ni se reemplazó.
- **La base sale de `breakdown.iva.base_usd`**; si el snapshot no la trae se
  deriva `total − IVA − Σ exentos` (re-sumar la columna, lo único permitido).
  El API todavía NO manda `iva_base_usd` en el payload del PDF del CLIENTE
  (Fase 1C), así que pyservices lo deriva; con redondeo POST-IVA + exentos +
  IVA (0 cotizaciones de 231 en prod) los dos números difieren — y por eso
  **los dos degradan**: la hoja por `Σ gravables ≠ base` y pyservices por la
  tercera identidad. Sin ese candado la hoja degradaría y el PDF no.
- CSS: la regla `.exentos-row` vive en `cotizacion-hoja.css`, que es COPIA de
  pyservices — tras tocar el CSS allá, `npm run sync:hoja-css`.
- Fixture **`hoja-sin-iva`** (`__fixtures__/escenarios.ts` + su
  `.payload.json`): el ÚNICO donde la partición se activa (Servicio aéreo
  3,700 + TUA 100 + Handler 200 = base 4,000; IVA 640; Transfers 100 +
  Viáticos 150 debajo; total 4,890). Los otros seis NO cambiaron. Tras tocar
  `cotizacion_pdf.py` hay que **regenerar** con `npm run gen:hoja-fixture`,
  nunca a mano.

## Hoja interna (Fase 2.2) — la pantalla de la cotización ES el documento de oficina (22-sep-2026)

- **Pedido del cliente**: «en la página de la cotización cambiaremos el formato
  de la pantalla para que NO se vea como el PDF de la cotización que se entrega
  al cliente, más bien que se parezca a la cotización INTERNA, que es la más
  completa, y podamos manejar gran parte de cómo va evolucionando la cotización
  en la misma hoja, aprovechando que el formato es igual al que manejaban antes
  en un Excel […] la idea es ir quitando el modal flotante lateral derecho “No
  se imprime”». Se invierte la relación: **la hoja interna es el FORMULARIO y
  el PDF del cliente es una SALIDA** (pestaña de solo lectura).
- **PESTAÑAS — RETIRADAS la noche del 22-sep-2026** (ver «Ajustes 22-sep
  (noche)» más abajo). Durante unas horas la pantalla tuvo «Hoja interna»
  (editable) | «PDF del cliente» (lectura, con la vista previa real en un
  iframe) y memoria en `localStorage vt-cotizador-hoja-v1`. El cliente pidió
  quitar esa pestaña: **quien ve la hoja interna ve SOLO la hoja interna** y el
  PDF del cliente se abre o se descarga cuando alguien lo pide. **SOCIO** sigue
  con su hoja del cliente editable, como siempre. Esa clave de localStorage y
  `quote-pdf-cliente-vista.tsx` ya no existen.
- **Componentes**: `quotes/quote-sheet-interna.tsx` (el documento; raíz
  `<div class="cot-interna cot-interna--pantalla">`) + `-tramos` (la tabla del
  Excel) + `-cobros`. El DESGLOSE lo pinta el MISMO `QuoteSheetDesglose` de la
  hoja del cliente con un **dialecto** (`DIALECTO_INTERNA`): dos editores del
  mismo dinero es donde se cuela el número que no cuadra. `quote-sheet.tsx` NO
  se reescribió.
- **De dónde sale cada número, y aquí no se calcula ninguno**: lo que se mueve
  al teclear (tramos costeados, TUAS, extras, IVA, totales) viene del
  `breakdown` de `POST /v1/quotes/calculate`; lo que es identidad o historia
  (quién cotizó, piloto/copiloto, avión utilizado, cobros con su comisión y su
  «Registró», notas internas) de **`GET /v1/quotes/:id/interno`**
  (`getQuoteInterno`, `types/quotes-interno.ts`), el MISMO payload que imprime
  el PDF interno.
- **La columna TOTAL POR TRAMO y el pie se LEEN** (campos ADITIVOS del API
  0.0.27, fuente única `tramos-costeados.util.ts`): `breakdown.tramos[].
  total_usd / tarifa_usd_hr / tiempo_hhmm` y en la raíz `tramos_total_usd`,
  `tramos_tiempo_total_hr/_hhmm`, `tramos_ajuste_usd`, `tramos_ajuste_motivo`.
  **El panel JAMÁS multiplica `tiempo × tarifa` ni suma el ajuste**: con dos
  fuentes, pantalla y papel dirían cifras distintas del MISMO vuelo (riesgo 10
  del diseño). Con un API previo esas celdas pintan «—», nunca un número
  inventado. Congelado en `lib/admin/__tests__/quote-sheet-interna.test.ts` y
  en el fixture.
- **COSTO POR HORA por tramo es de SOLO LECTURA** (decisión 3 del diseño): el
  motor v1.3 cotiza con UNA tarifa por vuelo. Un input por fila prometería un
  precio por tramo que el motor no respeta; la tarifa por tramo es un cambio de
  MOTOR, no de pantalla.
- **Qué se EDITA en 2.2**: exactamente lo que ya editaba la hoja del cliente —
  cliente, avión cotizado, pasajeros, fecha del vuelo, itinerario
  (origen/destino con continuidad, fecha del PDF, **MILLAS por fin en la
  tabla**, ⋯ con pax/ferry/pernocta/notas/ojito, 🗑 con confirmación y la ruta
  rápida «CUN, HOL, CUN ⏎»), extras, descuento, IVA %, T.C. y las notas al
  cliente. El popover «⋯» es el MISMO `DetalleTramo` de `quote-sheet-itinerario`
  (exportado): dos copias serían dos sitios donde capturar lo mismo.
- **El panel «Interno · no se imprime» se RETIRÓ en el BLOQUE C**
  (22-sep-2026): la pantalla es el papel más una pila de `<details>` debajo.
  `TotalBar`, save bar, `resumirCambios`, `armarCalcPayload`, `tramos_base`,
  `preferirHorasPersistidas`, `tarifaOverrideRehidratada`, el ancla de ecos y
  la idempotencia **no se tocaron** en ninguno de los tres bloques: ninguna
  regla de guardado cambió.

### Fase 2.3 · BLOQUE A — dónde vive ahora cada control (22-sep-2026)

Sigue el `mapa_de_controles` del diseño: lo que se lee EN un renglón del
documento se decide EN ese renglón; lo que no tiene renglón baja a un
`<details>` bajo el papel. **Nada de esto calcula dinero**: son `setValue`
sobre los MISMOS campos RHF de siempre, y el total lo sigue diciendo el
`breakdown`.

| Control | Dónde vive ahora | id ancla |
|---|---|---|
| Método de cobro PREVISTO | cabecera del bloque COBROS del papel, dentro de la frase «previsto: …» (`piezasMetodoPrevisto`, fuente única `METODOS_PAGO`) | `metodo-pago-field` |
| «¿Cuál método?» (OTRO) | junto al selector; el papel imprime «Otro (PayPal)» | — |
| Comisión de terminal % | misma frase, tras el método; **solo se captura con BillPocket** (el % de Paywise lo pone la config) | `billpocket-field` |
| Redondeo (switch auto + monto manual) | **en la línea** del renglón «Redondeo» del desglose (`.cot-acciones`: el margen izquierdo de esa columna se sale del papel); sin ajuste el renglón es FANTASMA (`data-cot-ui`, aporta 0) | `redondeo-field` |
| Switch «Se cobran TUAS» | **en la LÍNEA** del PRIMER renglón del bloque TUAS del desglose (`.cot-acciones`; estuvo en el margen hasta la noche del 22-sep, donde se salía del papel) | — |
| «Cotización abierta» / «Pase de abordar» | fila **«Marcas»** de la ficha derecha; sin marcas encendidas la fila entera es croma | — |
| Notas internas | su bloque del papel: **editables solo en el ALTA** (`revise` no las manda; al revisar se leen y se dice que se cambian en «Editar datos» del vuelo) | — |
| Clientes frecuentes · «+ nuevo cliente» · «corregir nombre» · «Poner todo en $0» | croma en la línea «Cliente» de la ficha (`clienteExtra`); el $0 confirma con `AlertDialog` | — |
| Plantilla de ruta («Suele pedir», ruta guardada, crear/guardar) | `<details>` «Plantilla de ruta» DEBAJO del papel (`quote-plantilla-ruta.tsx`) | — |
| Toggles del PDF del cliente (tarifa/hr, itinerario) + leyenda por tramo | `<details>` «PDF del cliente: qué se imprime» DEBAJO del papel (`quote-pdf-toggles.tsx`); mismo `PATCH pdf-visibilidad` sin versión (D5) | — |

- **`QuotePlegable`** (`quote-plegable.tsx`) es el `<details>` de esos
  sub-bloques: su contenido **NUNCA se desmonta** (un `{abierto && …}`
  tiraría los `register()` y dejaría los ids ancla sin destino, riesgo 9 del
  diseño), solo el `<summary>` va `data-guard-exempt` (abrir no edita) y la
  memoria por usuario es `localStorage vt-cotizador-plegado-<id>-v1`, leída
  con `useSyncExternalStore` (el servidor no tiene storage; con `useState` +
  efecto el linter marca el render en cascada). Los `<details>` se pintan para
  **todos los roles**, también para quien no ve la hoja interna.
- **`SwitchHoja`** (`quote-sheet-fields.tsx`) es el switch del papel: su
  etiqueta va DENTRO del `<button>` (el comparador con el PDF descarta los
  controles) y **no** lleva `data-guard-exempt` — cambiar un switch ES editar
  y tiene que disparar la confirmación única de CONFIRMADO/RESERVA.
- **Lo que el papel NO imprime va en croma** (`data-cot-ui`) y su CSS bajo
  `.cot-interna:not(.cot-interna--lectura)`: el switch del pase de abordar no
  pinta tag porque `_ficha_html` de pyservices no lo lleva, y el renglón
  «Redondeo» sin ajuste es fantasma. Por eso los 3 fixtures de LECTURA
  **no se regeneraron**: el marcado IMPRESO no cambió.
### Fase 2.3 · BLOQUE B — tarifa, horas y comisión del vendedor (22-sep-2026)

Lo que quedaba del bloque «Tarifa y horas» del panel baja al papel, **cada
control en el renglón donde se LEE**. Regla de oro del bloque: **el número que
se IMPRIME lo sigue resolviendo el motor** («Tarifa broker · $1,550.00/hr»,
«1.75 h») y el control de al lado es CROMA (`data-cot-ui`, dentro de
`.cot-acciones`) que solo captura lo que se PACTA. Se separan a propósito —
sustituir el impreso por el input dejaría el papel sin tarifa cuando alguien
enciende «Personalizada» con el campo vacío, y sin horas en las cotizaciones
que no pactan (la mayoría). Por eso el marcado IMPRESO no cambió y los
fixtures existentes **no** se regeneraron.

| Control | Dónde vive ahora | id ancla |
|---|---|---|
| Segmento Pública / Broker / Personalizada | fila **«Tarifa»** de la ficha izquierda, en la línea (`SegmentoHoja`) | `tarifa-tipo-field` |
| `$/hr` SOLO esta cotización + cuenta viva «2.4 hr × $989.583333 = $2,375.00» | misma línea, **solo con «Personalizada»**; en reposo se lee «1,550.00» y con decimales finos los enseña TODOS | `tarifa-override-field` |
| Sobrevuelo (hr) | bloque **«Horas cotizadas»**, fila «Sobrevuelo»; sin horas el renglón es FANTASMA (`data-cot-ui`) para que el campo tenga dónde vivir | `sobrevuelo-field` |
| Cobrable pactado (acepta «2:20») + línea viva + avisos | fila **«Cobrables»**, tras el «· pactar»; el impreso sigue siendo `<b>1.75 h</b>` del motor | `cobrable-field` |
| Comisión del vendedor (Fija \| Por hora, monto o $/hr, quién vendió) | fila **«Comisión»** bajo «Vendedor» (croma entera), en un `PlegableHoja` que NUNCA desmonta | — |
| «Neto VuelaTour $X · Pago al vendedor $Y» | renglón tenue de CROMA al final del desglose (`dialecto.pie`), con `meta.neto_vuelatour_usd` y `pago_vendedor_usd` — **aquí no se resta nada** | — |

- **`segmentoTarifa`** (`lib/admin/tarifa.ts`, PURO + test) es la FUENTE ÚNICA
  de qué opción está activa, y la usan el papel **y** el cotizador: con dos
  copias, una pantalla diría «Pública» mientras se cobra la manual. El modo
  `tarifa_personalizada` sigue siendo PEGAJOSO (vaciar el campo no lo apaga) y
  el CERO cuenta como capturado («Poner todo en $0» del cliente interno).
  Volver a Pública/Broker LIMPIA el override, igual que hacía el panel.
- **`CampoHorasPactadas` gana la variante `hoja`**: el MISMO parser de
  «2:20»/decimal, el mismo texto canónico al salir y la misma línea viva con
  el importe del MOTOR, pintados como input invisible del papel. Dos copias de
  ese parser es donde se cuela el «2:5» que vale 2.5.
- **La tabla «Horas por tramo» del panel se RETIRA** con la hoja interna: la
  absorbe la columna TIEMPO de «Tramos cotizados». Sigue viva para un rol sin
  hoja interna. Lo que NO se migró a propósito es el `AporteChip` del
  sobrevuelo («+$330.00 en el total»): multiplica horas × tarifa en el panel y
  en el papel no se calcula dinero.
- **Los atajos «· ajustar» / «pactar horas» ya no abren nada**: `enfocarEnHoja`
  hace scroll + foco al renglón del propio papel y solo cae a
  `onAbrirInterno` si el ancla no existe (rol sin hoja interna).
- **El CONCEPTO de un EXTRA se LEE del motor** (`conceptoExtraCanonico`): el
  desglose canónico ya trae la cuenta dentro —«Tour · 2 × $85.00 MXN =
  $170.00 MXN»— y el « (sin IVA)» de los exentos, y el PDF interno lo imprime
  tal cual. La hoja escribía el formato del CLIENTE («Tour · $170.00 MXN»),
  así que pantalla y papel nombraban distinto el MISMO renglón. En EDICIÓN el
  input sigue siendo el concepto TECLEADO y el resto del canónico se pinta
  detrás, con el monto en pesos **todavía editable en su sitio**
  (`piezasConceptoExtraInterna`, el mismo truco de `piezasConceptoTua`): ese
  monto se imprime con `toFixed(2)` —sin separador de miles— porque es
  EXACTAMENTE lo que escribe el API dentro del concepto. El cruce exige que el
  canónico EMPIECE por lo tecleado **y** que lo que sobra sea « · …» o
  « (sin IVA)»: a media palabra el breakdown va un debounce atrás y se cae al
  respaldo de siempre en vez de pintar «Handle» + «r · $1500.00 MXN».
- **Fixture nuevo `interna-extras`** (4.º escenario): extra en PESOS con monto
  directo, extra con CANTIDAD × unitario y extra EXENTO que activa la
  partición «No causan IVA» con IVA > 0. Regenerado con
  `npm run gen:hoja-interna-fixture`, nunca a mano.
- **Widgets nuevos del papel** (`quote-sheet-fields.tsx`): `SegmentoHoja`
  (botones en línea con `aria-pressed`; **sin** `data-guard-exempt` — cambiar
  de tarifa ES editar) y `PlegableHoja` (`<details>` en línea; solo el
  `<summary>` va exento). Su CSS vive en `cotizacion-interna-pantalla.css`
  (`.cot-seg`, `.cot-plegable`), con el acento bajo `:not(--lectura)`.

- **Tipos**: `QuoteSheetValoresInterna` / `OnCambioHojaInterna`
  (`quote-sheet-types.ts`) extienden los de la hoja del cliente con
  `metodo_pago`, `metodo_pago_detalle`, `comision_billpocket_pct`,
  `redondeo_auto`, `redondeo_usd`, `cotizacion_abierta`, `pase_abordar` y
  `notas_internas`. `comoOnCambioHoja()` estrecha el handler para los
  componentes compartidos (TS no lo deduce entre dos firmas genéricas).
- **Pruebas**: `__tests__/quote-sheet-interna-controles.test.tsx` (ids ancla,
  que en LECTURA no se monte ningún control, y que lo no impreso sea croma)
  además de los 3 fixtures de paridad, que siguen pasando sin tocarse.
- **CSS compartido con pyservices**: `src/styles/cotizacion-interna.css` es
  COPIA byte a byte de `app/static/cotizacion-interna.css`
  (`npm run sync:hoja-interna-css`); todo selector cuelga de `.cot-interna`. Lo
  de pantalla (papel Carta 816 px, inputs invisibles, croma, marca de agua)
  vive en `cotizacion-interna-pantalla.css`, que es del panel y no se
  sincroniza. La FUENTE (Arimo) es la misma de la hoja del cliente y la trae
  `sync:hoja-css`. Guardas: `styles/__tests__/hoja-interna-css-deriva.test.ts`
  (deriva + todo bajo `.cot-interna` + el acento SOLO en edición + la marca de
  agua es del papel).
- **BANDA ROJA + MARCA DE AGUA «INTERNA»** (riesgo 8 del diseño): la pantalla
  enseña comisiones, costo del operador externo, neto VuelaTour y cobros. Sin
  una separación inequívoca alguien acabaría mandándosela al cliente. La banda
  es la del papel; la marca de agua es croma de pantalla (`data-cot-ui`).
- **Roles: UNA sola lista.** `ROLES_HOJA_INTERNA` +
  `puedeVerHojaInterna(rol)` (`lib/admin/quote-sheet-interna.ts`) es el espejo
  de `ROLES_PDF_INTERNO` del API — ADMIN/COORDINADOR/FACTURACION/ANALISTA, sin
  SOCIO ni PILOTO — y la consume TAMBIÉN el botón «PDF interno» de
  `quote-actions-bar.tsx`. Con dos listas escritas a mano, la pantalla y el PDF
  podrían divergir y alguien vería en el panel lo que el papel le niega. El
  panel solo ESCONDE; el gate real es el API (403 ⇒ `getQuoteInterno` → null).
- **Tolerancia al API previo**: `getQuoteInterno` devuelve `null` ante 404
  (ruta que no existe) y 403 (rol), en silencio; cualquier otro fallo lo
  degrada `degradado.opcional("la hoja interna", …)` en
  `app/admin/quotes/[id]/page.tsx` y la pantalla lo AVISA con
  `<AvisoDegradado>`. Sin `interno` la hoja se pinta igual con el breakdown y
  los bloques sin dato quedan vacíos — nunca se inventa un piloto ni un cobro.
- **PARIDAD de DATOS, no de bytes** (decisión del diseño): el documento interno
  es un formulario denso con controles en casi cada celda, así que exigir
  igualdad de secuencia tag+clase en EDICIÓN obligaría a que cada input
  invisible tuviera espejo en el PDF. Lo que se custodia en
  `__tests__/quote-sheet-interna.test.tsx` es (1) la secuencia de tags+clases
  en LECTURA, (2) el TEXTO en lectura y (3) el TEXTO en edición, contra los
  fixtures `__fixtures__/interna-*.html` que genera
  **`npm run gen:hoja-interna-fixture`** con la MISMA función que sirve
  `POST /reportes/cotizacion-interna/preview-html`. Escenarios:
  `interna-329` (3 tramos, horas pactadas con ajuste +$412.50, TUA cobrada, 1
  cobro, avión utilizado distinto), `interna-311` (2 tramos, sin ajuste, sin
  TUAS, sin cobros, IVA 0 por efectivo) e **`interna-070`** (el documento
  COMPLETO: comisión del vendedor, ajuste «Redondeo», pernocta que activa la
  partición de exentos, TUA en PESOS con su T.C., `mxn_nativos`, tramo ferry y
  cobro en MXN con comisión de terminal) e **`interna-extras`** (BLOQUE B: los
  tres sabores de EXTRA —en pesos con monto directo, con cantidad × unitario y
  EXENTO— con su concepto CANÓNICO y la partición «No causan IVA» activa). Los
  payloads viajan DOS veces a propósito
  (`__fixtures__/escenarios-interna.ts`): como `interno` y convertidos a
  `breakdown`, para que fixture y pantalla no puedan divergir por una copia mal
  hecha; lo único que va aparte son los EXTRAS CAPTURADOS (el payload solo
  lleva la línea canónica, que ya trae la cuenta dentro: que la pantalla
  reconstruya ese MISMO texto es justo lo que mide el test de edición). Tras
  tocar `cotizacion_interna_pdf.py` hay que **regenerar**, nunca editar los
  HTML a mano.
- **Textos del documento** (espejo de `cotizacion_interna_pdf.py`, en
  `lib/admin/quote-sheet-interna.ts`, PURO + test): `hhmm` («01:18»),
  `millasTxt` («157.3»), `horasTxt` («1.75 h»), `diaMes` («26-jun»),
  `diaLargo`, `montoInterno` (negativos con «−» tipográfico), `pctBanco`
  («8.8570 %»), `fechaCortaCobro`, `celdaRutaTramo` (**«CUN–PCE» con guion
  LARGO** —decisión 5— y RESPALDO al nombre largo si falta un IATA o la fila es
  consolidada), `pieTramos`, `notasTramos`, `metodoPrevistoTxt`,
  `resumenCobros`, `avisoCobrosSinTc`, `subLineaCobro`, `claseSemaforo`,
  `servicioAereoCanonicoUsd`, `comisionVendedorCanonicaUsd`,
  `ajustePositivoUsd`, `opComisionVendedor`, `piezasConceptoTuaInterna`.
  Ningún componente los redacta a mano.
- **Los CONCEPTOS del desglose se LEEN del motor, no se redactan**
  (`conceptoCanonico(breakdown, clave)` + `conceptoComisionVendedor`, revisión
  adversaria del 22-sep-2026). El papel arranca de `ln.concepto`
  (`_concepto_operacion`) y esos textos ya traen dentro lo que el panel estaba
  reescribiendo: **«Comisión del vendedor (Saab) · $50.00/hr × 2.3 hr»** (el
  panel decía «Comisión del vendedor · Saab» — 35 de 231 cotizaciones en
  prod), **«Redondeo»/«Descuento»** del ajuste (decía «Ajuste» cuando había
  precio pactado — 17 con ajuste, 4 pactadas) y **«Viáticos por pernocta (sin
  IVA)»** (decía el texto corto del cliente). El nombre del vendedor solo se
  cuelga con « · » si NO venía ya en el concepto, igual que pyservices. Sin
  línea canónica (API previo) se usa el respaldo de siempre.
- **«Total MXN» del documento interno dice cuánto NO pasó por el T.C.**:
  `opTotalMxnInterna` → «Total MXN · T.C. 18.1 · **incluye $1,322.40 MXN
  nativos**» desde `breakdown.totales.mxn_nativos` (TUAS y extras capturados
  en pesos entran al total tal cual). Son 14 de 231 cotizaciones en prod y sin
  esa frase el total en pesos no se puede cuadrar contra el tipo de cambio. La
  hoja del CLIENTE nunca la lleva.
- **Una TUA en PESOS cierra con su T.C.**: `piezasConceptoTuaInterna(fila,
  fmtTc(tc))` → «4 pax × $330.60 MXN = $1,322.40 MXN **· T.C. 18.1**». El
  texto del T.C. lo pasa quien llama (`fmtTc`, fuente única) porque este
  módulo es PURO y no importa `lib/format`.
- **La moneda de un cobro va en `.muted`**, como en `_cobro_fila`
  («$40,000.00 <span class="muted">MXN</span>»): en texto plano decía lo mismo
  pero la fila dejaba de tener la estructura del documento.
- **El toggle «mostrar tarifa» es del PDF del CLIENTE**: el documento interno
  imprime siempre «Servicio aéreo» a secas (la multiplicación vive en «Horas
  cotizadas»), así que `conTarifa` queda apagado en el dialecto CANÓNICO.
- **El dialecto del desglose** (`DialectoDesglose` en `quote-sheet-desglose.tsx`)
  cambia SOLO etiquetas y qué renglones se publican:
  - `servicioAereo: "IMPRESO"` (cliente) ABSORBE el redondeo y la comisión del
    vendedor; `"CANONICO"` (interno) pinta la línea TIEMPO_VUELO tal cual y
    publica la **comisión del vendedor** y el **ajuste positivo** en su propio
    renglón — sin eso la columna del documento interno no sumaría su total.
  - orden canónico v1.3 en el interno (…EXTRA · COMISION_VENDEDOR · AJUSTE ·
    PERNOCTA); la hoja del cliente conserva el suyo, que congelan sus 6
    fixtures.
  - «Total USD» vs «Total (USD)», `mxn-row` vs `total-mxn`, «IVA 16 %» vs
    «IVA (16%)» (con el gris «16 % de $X» solo cuando el renglón de arriba NO
    es ya la base), «TUA CUN» + gris «4 pax × $25.00» vs «TUA CUN · $25.00 ×
    4 pax», y la línea TUAS en 0 sin detalle no se imprime (queda fantasma en
    edición).
  - `pct`: el % del IVA se escribe con `porcentajeEntero` (`{:.0f}`) en el
    cliente y con `pctG` (`{:g}`) en el interno, porque así lo imprime cada
    PDF. Con el 16 % de siempre dan lo mismo; con un `iva_pct_override` de
    8.5 el cliente dice «8» y el interno «8.5».
- El CONCEPTO de un EXTRA también se LEE del motor desde el **BLOQUE B**
  (22-sep-2026): ver esa sección más arriba (`conceptoExtraCanonico` +
  `piezasConceptoExtraInterna` y el fixture `interna-extras`). Antes se
  escribía con el formato del cliente (`etiquetaExtra`) y el papel decía otra
  cosa del mismo renglón.
- **Roles: el panel tampoco PIDE lo que no va a pintar.**
  `app/admin/quotes/[id]/page.tsx` llama a `getQuoteInterno` solo si
  `puedeVerHojaInterna(me.rol)`: a SOCIO/PILOTO el API respondía 403 en cada
  carga de la pantalla. El gate real sigue siendo el API.

### Fase 2.3 · BLOQUE C — el panel se retira (22-sep-2026)

Lo último que quedaba en el cajón lateral baja al papel o a un `<details>`, y
`quote-internal-panel.tsx` **se borra**. La pantalla de la cotización pasa a
ser: banda(s) de aviso → papel (hoja interna | PDF del cliente) → pila de
`<details>` → save bar.

| Control | Dónde vive ahora | id ancla |
|---|---|---|
| RUTA OPERATIVA del vuelo + «Cotizar con estos tramos» | **banda azul DENTRO del papel**, justo ENCIMA de «Tramos cotizados» (`QuoteRutaOperativaBanda`, prop `bandaTramos`) | — |
| Operador externo (switch, operador, modelo, matrícula, costo + moneda, aviso T.C., margen) | `<details>` «Operador externo» bajo el papel (`quote-operador-externo.tsx`), que se **auto-abre** con `es_externo` | `seccion-externo` |
| Eco de quién cubre el vuelo | tarjeta «Avión cotizado» del papel, croma con «editar abajo» (prop `avionExtra`) | — |
| Ruta operativa del ALTA (`escalas_operacion[]`) | `<details>` «Ruta operativa del vuelo» (`quote-ruta-operativa.tsx`) | `seccion-operativa` |
| Detalle del cálculo (`Preview` + `QuoteDesgloseCard`) | `<details>` «Detalle del cálculo (motor)» (`quote-detalle-motor.tsx`) | `seccion-detalle` |
| Historial de versiones (`QuoteVersionsTimeline`) | `<details>` «Historial de versiones», que el **workspace** inyecta con la prop nueva `plegablesExtra` | — |
| Avisos ámbar (`avisosCaptura`) | **banda de ancho completo ARRIBA del papel** (`quote-avisos-banda.tsx`), nunca plegable, + el chip de la `TotalBar` como siempre | — |

- **La banda de ruta operativa va DENTRO del papel a propósito**: es el aviso
  de DIVERGENCIA —la ruta que vuela el piloto no es la que se cotiza— y solo
  se entiende junto a la tabla que lo dice. Es CROMA (`data-cot-ui`, CSS
  `.cot-ops` en `cotizacion-interna-pantalla.css`), así que el documento de
  pyservices no la imprime y **los cuatro fixtures no se regeneraron**. Se
  pinta también en LECTURA (sin botón): enterarse no depende de poder editar.
  «Cotizar con estos tramos» conserva su confirmación y sigue sin guardar
  nada — deja el formulario sucio para que se vea el total antes de Guardar.
- **`QuotePlegable` gana `forzarAbierto`**: el `<details>` del operador
  externo se abre al prender «cubierto por externo» y al montar si la
  cotización YA es externa, igual que hacía el `SubBloque`. Un campo
  OBLIGATORIO no puede quedar escondido detrás de un triángulo. Abrir por
  fuerza SÍ escribe la memoria (`vt-cotizador-plegado-externo-v1`): cerrarlo
  después es decisión del operador y se respeta hasta el siguiente encendido.
- **La pestaña «PDF del cliente» con la vista previa REAL en iframe vivió
  unas horas y se RETIRÓ** esa misma noche (pedido del cliente: «no hace falta
  verlo»). `quote-pdf-cliente-vista.tsx` se borró; `useQuotePreviewHtml` quedó
  SOLO para el mapa de la hoja del cliente con el form limpio y ya no se pide
  para los roles que ven el papel interno (`activo: previewLimpio &&
  !hayHojaInterna`). El proxy `/api/quotes/preview-html` sigue en pie.
- **Atajos**: `abrirInterno` y `destinoInternoPendiente` desaparecieron del
  cotizador; `enfocarEnHoja` de la hoja interna ya no tiene a dónde caer (sus
  tres anclas están SIEMPRE montadas en el papel) y `QuoteSheetInterna` perdió
  la prop `onAbrirInterno`. La hoja del CLIENTE sí la recibe (revisión
  22-sep-2026) con `atajoEnCaptura`: abre el `<details>` «Ajustes de la
  cotización» y lleva el foco al campo. Dejarla sin pasar habría quitado al
  rol sin hoja interna los dos atajos que tenía —«· ajustar» de «Servicio
  aéreo» y «Pactar horas» del detalle ⋯ de un tramo—; sus tooltips ya no
  nombran el panel muerto («… se ajustan en «Ajustes de la cotización», debajo
  de la hoja»).
- **«Pase de abordar» en LECTURA** (pendiente que abrió el BLOQUE A): solo se
  leía en el bloque «Cobro» del panel, y es el dato que explica por qué el
  desglose no cobra TUAS. Se pinta como TAG de CROMA en la fila «Marcas»;
  imprimirlo de verdad exige tocar `_ficha_html` de `cotizacion_interna_pdf.py`
  (pyservices), que no se toca desde aquí.
- **`extras-editor.tsx` se retiró**: no lo montaba nadie y solo exportaba
  `EXTRAS_SUGERIDOS`, que ahora vive en `lib/admin/extras.ts` con el resto de
  la regla de extras.
- **Pruebas**: `__tests__/quote-bloque-c.test.tsx` (la banda ENCIMA de la
  tabla y como croma; la lectura sin botón; que sin itinerario operativo no
  haya banda; el eco del externo; que cada `<details>` monte su
  `seccion-<id>`; que la banda de avisos NO sea un `<details>`),
  `__tests__/quote-pantalla-completa.test.tsx` (la pantalla ENTERA, rol por
  rol) y, en `lib/admin/__tests__/quote-sheet-interna.test.ts`, el invariante
  de roles.

### Fase 2.3 · lo que corrigió la revisión adversaria (22-sep-2026)

1. **SOCIO se había quedado sin un solo control de dinero** → `<details>`
   «Ajustes de la cotización» (`quote-captura-basica.tsx`), la banda de ruta
   operativa con piel `suelta` y los atajos de la hoja del cliente enchufados
   a `atajoEnCaptura`. Ver «Ningún rol se queda sin un control», arriba.
2. **«Ajuste rápido» no hacía nada con la hoja interna**: `enfocarPasajeros`
   buscaba `.cot-hoja table.grid` y con pax POR TRAMO el itinerario vive bajo
   `.cot-interna` — el mismo defecto que el BLOQUE B ya había corregido en
   `enfocarExtraFuera`. Ahora busca en LAS DOS hojas.
3. **La vista previa del PDF se pedía para quien nunca la ve**: `activo:
   previewLimpio || hojaActiva === "cliente"`, y para SOCIO `hojaActiva` vale
   SIEMPRE «cliente» — un render completo de pyservices por cada tecleo, en el
   alta incluida, para un HTML que su pantalla no monta. Ahora lleva
   `hayHojaInterna &&`.
4. **El ancla `cobrable-field` desaparecía sin breakdown** (alta recién
   abierta o `/calculate` en error): el renglón «Cobrables» del papel se pinta
   FANTASMA en edición, como «Sobrevuelo» y «Redondeo», así que el campo
   siempre tiene dónde vivir. El marcado IMPRESO no cambió (es croma) y los
   fixtures siguen intactos.
5. **`npm run gen:hoja-fixture` reventaba siempre**: globeaba también los
   `interna-*.payload.json`, que son de otro esquema, y salía con error
   DESPUÉS de escribir bien las 7 hojas del cliente — el camino corto para que
   alguien crea que la regeneración «no funciona» y edite un fixture a mano.
6. **Textos que nombraban un panel que ya no existe** («Interno › Tarifa y
   horas», «Interno › Cobro», «Pactar horas: abre Interno › Cobrable
   pactado») y el `AVISO_SOLO_CONSULTA`, que decía que había que pedir a
   Coordinación para «ajustar tarifa, horas, comisión o método de cobro»
   cuando ahora ese rol SÍ puede ajustarlas para simular: lo que no puede es
   guardarlas.
- **Lo que NO cambió**: `armarCalcPayload`, `resumirCambios`, `tramos_base`,
  `preferirHorasPersistidas`, `tarifaOverrideRehidratada`, `estadoExtra`, las
  anclas de ecos, la idempotencia, el guard único de CONFIRMADO/RESERVA (los
  `<details>` siguen DENTRO del contenedor que lo intercepta), `beforeunload`,
  el 409 y `?d=`. Cero dinero calculado en pantalla.

### Ajustes 22-sep (noche): sin pestaña de PDF, nada clicable fuera del papel, cursor-pointer

Pedido del cliente sobre la hoja interna ya desplegada (captura de la #232):
«(1) el botón de la pestaña de PDF del cliente, ese lo vamos a quitar porque no
hace falta verlo, ese solo mandarlo a imprimir cuando se requiera para
descargar y enviar al cliente, pero es raro que lo pidan. (2) … se pierde el
botón o la opción que está del lado izquierdo que solo se alcanza a ver
“COBRAN”. (3) Todas las opciones que sean cliqueables deben tener la clase
cursor-pointer para que el usuario sepa que puede interactuar con esa opción y
no es un dato fijo o que no se puede editar».

1. **UNA sola hoja en pantalla.** La pestañera «Hoja interna | PDF del
   cliente» se RETIRÓ con su estado (`hojaActiva`), su memoria
   (`localStorage vt-cotizador-hoja-v1`, clave muerta) y la vista previa en
   iframe (`quote-pdf-cliente-vista.tsx`, **borrado**). Quien ve la hoja
   interna ve SOLO la hoja interna; el rol sin ella (SOCIO) sigue con su hoja
   del cliente editable, exactamente como antes. El PDF del cliente se ABRE o
   se DESCARGA: «PDF» + `<a download>` de la barra de acciones y «Ver PDF
   real» / «Guardar y ver PDF» de la TotalBar (`abrirPdfCotizacion`, sin
   cambios), y el `<details>` «PDF del cliente: qué se imprime» sigue bajo el
   papel — ahora dice dónde se ve el resultado, para que nadie lo busque en
   pantalla.
   - **`useQuotePreviewHtml` sigue vivo pero se pide MENOS**: su único consumo
     era (a) el MAPA de la hoja del cliente con el form limpio y (b) la
     pestaña. Como esa hoja solo la monta el rol SIN hoja interna, el hook va
     con `activo: previewLimpio && !hayHojaInterna`: para ADMIN/COORDINADOR/
     FACTURACION/ANALISTA ya no se arma NI UN render de pyservices por
     cotización (el papel interno no lleva mapa). El proxy
     `/api/quotes/preview-html` NO se toca: lo sigue usando ese rol.
2. **Nada clicable fuera del papel.** El `.cot-margen` (`right: 100 %`) vive
   FUERA del área impresa y el desglose es la columna IZQUIERDA de la hoja: el
   switch «Se cobran TUAS» quedaba medio fuera del contenedor — eso era el
   «COBRAN» cortado de la captura. Dos correcciones:
   - **El switch de TUAS pasa a la LÍNEA** del primer renglón del bloque TUAS
     (`.cot-acciones`, el patrón de «capturado · quitar» y del redondeo), con
     la etiqueta «se cobran» / «no se cobran». Sigue siendo croma
     (`data-cot-ui`), sigue sin `data-guard-exempt` (cambiarlo ES editar) y
     el prop de `FilaTua` pasó de `margenExtra` a `accionExtra`.
   - **[SUPERSEDIDO el 22-sep-2026 por «La croma vive DENTRO del papel»,
     más abajo]** El canal siguió sin bastar: el cliente volvió a reportar
     «no se alcanzan a ver los 3 puntitos» sobre TRAMOS COTIZADOS. En la hoja
     INTERNA la croma se mudó a la celda y el canal pasó a 0; la hoja del
     CLIENTE conserva lo que se describe aquí.
   - **El papel gana un CANAL a la izquierda** (`CANAL_CROMA_PX = 88`, fuente
     única en `lib/admin/quote-sheet.ts`): las DOS hojas lo reservan como
     `padding-left` de su `.cot-escenario` y lo DESCUENTAN del ancho antes de
     escalar (`clientWidth` incluye el padding), así el papel nunca se sale
     por la derecha y lo que queda en el margen —🗑, ⋯ y las marcas de
     pax/ferry/pernocta/nota— siempre está dentro del contenedor. En LECTURA
     el canal es 0: ahí no se monta croma.
   - **La geometría la decide `geometriaHoja`** (`lib/admin/quote-sheet.ts`,
     PURA, prueba en `lib/admin/__tests__/quote-sheet.test.ts`), una sola
     regla para las dos hojas: `s = min(1, ancho / (anchoHoja + CANAL))` y
     `canal = CANAL · s`. **El canal ESCALA CON EL PAPEL**, y no es un
     detalle: con un canal FIJO (los 72 px del primer intento) la cuenta
     falla justo en el punto donde la hoja deja de escalar —contenedor de
     866–888 px, un portátil de 13″— porque ahí el papel presta su padding SIN
     escalar y el canal tampoco crece; y en una pantalla angosta un canal
     fijo se come un cuarto del ancho. Escalado, `canal + padding·s ≥
     margen·s` se cumple a TODOS los anchos. El tamaño (88) sale de medir el
     margen más cargado REAL —el tramo 4 de la #232: ferry + pernocta +
     servicio + nota + oculto ⇒ ~116 px, ~152 px en la hoja del cliente, que
     además lleva el botón de HORAS— contra el padding que presta cada papel
     (45 px el interno, 74 px el del cliente). Sin medir todavía (SSR y primer
     render) el canal ya se reserva completo: si apareciera al hidratar, la
     croma saltaría de sitio.
   - Congelado en `quote-pantalla-completa.test.tsx`: el switch de TUAS está
     DENTRO de la tabla del desglose y **ningún `.cot-margen` contiene un
     `role="switch"` ni un `.cot-liga`** (lo ancho va en la línea; en el
     margen solo iconos de 18 px y marcas de 9 px), y el `padding-left` del
     escenario se compara contra la CONSTANTE, no contra un número a mano.
3. **`cursor-pointer` en TODO lo que se pulsa** (el cliente pidió la CLASE, no
   solo el efecto). Tailwind v4 dejó los `<button>` con la flecha del sistema
   y en el papel los controles son invisibles en reposo: juntos se leen como
   «dato fijo».
   - La clase se agregó en los PRIMITIVOS compartidos —`ui/button.tsx`,
     `ui/switch.tsx` y el disparador de `ui/searchable-select.tsx`— así que
     alcanza a todo el panel, y en la croma del papel: `.cot-liga`,
     `.cot-btn`, `.cot-margen__accion` (🗑 y ⋯), `.cot-marca--liga`, los
     `select` de moneda, `SwitchHoja`, `SegmentoHoja`, `PlegableHoja`,
     `CampoSelect`, `CampoFecha`/`CampoDia` y el `Segmentado` de
     `QuoteCapturaBasica`. También los `<details>` de abajo: `.cot-ops__btn`
     («Cotizar con estos tramos», en sus DOS pieles), «+ nombres de
     pasajeros» de la ruta operativa, el aviso del costo externo en MXN, el
     enlace de «Plantilla de ruta» y «+ nuevo aeropuerto»
     (`airport-quick-create-button.tsx`, que también se usa fuera del
     cotizador).
   - **Regla ÚNICA de respaldo** en `cotizacion-interna-pantalla.css`, sección
     5, bajo `.cot-interna:not(.cot-interna--lectura)`: `button, summary, a,
     select, label[for], .cot-fecha, [role="button"], [role="switch"],
     [role="tab"], [data-clic], input[type="date"|"datetime-local"|
     "checkbox"], .cot-liga, .cot-chip, .cot-sel` ⇒ `cursor: pointer`, más
     `:disabled ⇒ default`, hover tenue y foco visible. Los inputs de
     texto/número **conservan `cursor: text`** pero ganan hover con fondo y
     subrayado del acento: «invisible en reposo» era justo lo que el cliente
     describía como dato fijo.
   - **La hoja del CLIENTE tiene su PROPIO CSS** y hubo que tocarlo igual
     (revisión adversaria): es la ÚNICA pantalla del rol SOCIO. Dos arreglos
     en `cotizacion-hoja-pantalla.css`: (a) `.cot-fecha__input` estaba en
     `cursor: text` —ese input TRANSPARENTE cubre la etiqueta entera, así que
     su cursor es el ÚNICO que se ve y la clase `cursor-pointer` del `<label>`
     no llegaba: la fecha del vuelo seguía leyéndose como dato fijo—; (b) la
     MISMA regla única de respaldo, bajo `.cot-hoja:not(.cot-hoja--lectura)`.
   - **`label[for]` también se pulsa**: `ui/label.tsx` agrega `cursor-pointer`
     **solo cuando lleva `htmlFor`** (se lo pone `Field`), porque una etiqueta
     ligada enciende el switch o enfoca el campo y una suelta no hace nada —
     prometer la manita ahí sería mentir. Alcanza a todo el panel, igual que
     Button/Switch/SearchableSelect. Y `MonedaSelect` (costo del operador
     externo, FUERA del papel) la lleva explícita.
   - Lo vigila `quote-pantalla-completa.test.tsx`: en CADA caso (rol × modo)
     ningún `<button>`/`<summary>` habilitado se queda sin la clase, ningún
     `role="switch"` tampoco, y el CSS contiene la regla con todos sus
     selectores colgando de `:not(--lectura)`. Encima corre un **INVENTARIO
     COMPLETO** del DOM renderizado —`button`, `summary`, `select`, `a[href]`,
     `label[for]`, `[role=button|switch|tab]` e inputs de
     fecha/checkbox/radio/file— que acepta la CLASE **o** una regla
     `cursor: pointer` REAL del CSS de la hoja donde vive el nodo (parsea los
     DOS archivos y respeta `--lectura`). Ese inventario es el que encontró
     los tres huecos de arriba: el mirar solo `<button>`/`<summary>` los
     dejaba pasar.
4. **El avión EN TALLER se dice UNA vez** (dos con el chip). Se anunciaba
   TRES: chip de la TotalBar + nota ámbar grande + banda de avisos.
   `QuoteAvisosBanda` gana `yaDichos`: los textos que otro componente de la
   MISMA pantalla ya pinta se descartan (la fuente de los dos es
   `lib/admin/aviso-taller.ts`, así que se comparan sin redactar nada; mismo
   patrón que `aviones-editor.tsx` en el grupo). **Se conserva el chip de la
   TotalBar a propósito**: es el resumen que sigue a la vista al hacer scroll,
   mientras la nota —la que dice qué hacer— se queda arriba. Probado con el
   avión en taller (#232, N58BT): «está en taller» aparece 2 veces, nunca 3.
   En LECTURA la nota ámbar no se monta, así que las dos apariciones son el
   chip y la banda — ahí `yaDichos` va vacío a propósito.
5. **Lo que NO cambió**: el marcado IMPRESO (los 4 fixtures `interna-*.html` y
   los 7 de la hoja del cliente se regeneraron con
   `npm run gen:hoja-interna-fixture` y salieron **byte a byte idénticos**),
   ninguna regla de guardado, `armarCalcPayload`, `tramos_base`, la
   idempotencia, el guard de CONFIRMADO/RESERVA ni el dinero: aquí no se
   calcula nada. Los tests que miraban la clase EXACTA de la croma
   (`class="cot-liga"`, `cot-sel cot-sel--vacio`, el `<summary>` del plegable)
   ahora aceptan clases adicionales.
6. **Lo que encontró la revisión adversaria** (misma noche, sobre el DOM
   renderizado de la #232 y la #329 de producción, ADMIN y SOCIO, alta y
   revisión, editable y en lectura): (a) la fecha del papel del CLIENTE
   seguía con el cursor de texto —`.cot-fecha__input`, el arreglo se había
   hecho solo en el CSS de la interna—; (b) las etiquetas de campo ligadas
   (`label[for]` de `Field`) y (c) el `MonedaSelect` del costo externo no
   llevaban la clase; (d) el canal de 72 px se quedaba corto justo en el
   ancho donde la hoja deja de escalar. Los cuatro están corregidos arriba, y
   el INVENTARIO COMPLETO del test es la red que los habría atrapado.

## Lista de flota = el pizarrón de Tacómetros (22-sep-2026)

- Pedido del cliente con dos fotos: en `/admin/aircraft` tachó **Pax**,
  **USD/hr público** y **USD/hr broker** y pidió «sustituir estas columnas por
  las columnas de tacómetro último servicio, tacómetro siguiente servicio,
  tiempo restante para servicio y siguiente tipo de servicio (50, 100 hrs,
  etc.) para tratar de igualar la tabla que usamos hoy en día» — la hoja
  «Tacómetros» de la oficina (matrícula · Sig. Servicio · Últ. Tact. Serv. ·
  Tact. Actual · Tiempo restante, con el «−30» en rojo).
- Columnas hoy: Aeronave · País · Motores · **Último taco** (= «Tact. Actual»,
  se queda) · **Último servicio** · **Siguiente servicio** · **Restante** ·
  **Tipo** · Estado. Las tres quitadas siguen vivas en el expediente del avión
  y el aviso «N sin tarifa configurada» de la cabecera NO se tocó.
- El dato llega en el campo **ADITIVO** `servicio` de CADA fila de
  `GET /v1/aircraft` (`ServicioFlota` en `types/aircraft.ts`):
  `{ ultimo: {hobbs_hr, fecha, etiqueta, origen:'MANTENIMIENTO'|'BASE'} | null,
  siguiente: {hobbs_hr, intervalo_hr, etiqueta, faltan_hr, orden} | null,
  aviso_automatico } | null`. `null` = el avión no tiene programa (XB-IJP);
  AUSENTE = API sin desplegar. El listado NO llama a `/metrics` por avión.
- **FUENTE ÚNICA** de textos y tonos: `lib/admin/servicio-flota.ts` (PURO,
  prueba `__tests__/servicio-flota.test.ts` con los casos REALES de prod) —
  `textoUltimoServicio` (taco + «Servicio 50 hrs · 12 sep 2026», o «base del
  programa» con `origen:'BASE'`), `textoSiguienteServicio`, `textoRestante`
  («faltan 27.0 h» / **«vencido por 30.0 h»**), `tonoRestante`
  ('ok'|'ambar'|'rojo') y `etiquetaTipoServicio` («100 hrs»; el nombre largo
  de la etapa va en el `title`). Ningún número se recalcula en el panel.
  `tituloSinServicio` decide el `title` del guion: «Sin programa de servicio»
  solo si de verdad no hay programa, «Sin servicios registrados» si el hueco
  es únicamente el último servicio, y NADA con el API sin desplegar.
- El ámbar sale de `dentroDelUmbral`/`umbralServicio` (`proximo-servicio.ts`),
  con `aviso_automatico.umbral_hr` y respaldo `UMBRAL_ORDEN_HR` — nada de un
  `< 10` suelto — y la sublínea de la orden la redacta `estadoOrdenServicio`,
  el MISMO helper del KPI del expediente. En la lista solo se habla de órdenes
  que YA existen (la promesa «se genera sola» es del expediente) y no se
  renderiza su enlace: un `<a>` dentro del link de fila sería marcado
  inválido; la fila entera lleva al expediente, que es donde se actúa.
- **Si el hito de la fila no tiene orden pero el avión SÍ está en el taller,
  se dice** (revisión adversaria 22-sep-2026, caso REAL del N58BT: orden de
  100 h abierta a las 1,600 h con el tacómetro en 1,627.2 ⇒ el programa ya
  apunta al hito de 1,700 y la celda dice «faltan 72.8 h», que es correcto y
  tranquilizador de más). `estadoOrdenDeServicio(servicio, {enTaller})` usa el
  `en_taller` que viaja en la MISMA fila del API y pinta «En taller»
  (`TEXTO_EN_TALLER`, la MISMA cadena que la orden EN_TALLER de
  `proximo-servicio.ts`). No calcula nada ni inventa una orden: solo deja de
  callar un dato que ya estaba en la fila.
- `faltan_hr` NEGATIVO **no se recorta a 0** (el pizarrón escribe «−30»); el
  vencido se decide con la décima que se PINTA, para no anunciar «vencido por
  0.0 h». Las horas van con un decimal y SIN separador de miles, igual que
  «Último taco» y que la hoja de la oficina.
- Cableado probado en
  `components/admin/aircraft/__tests__/aircraft-table.test.tsx`: las cuatro
  columnas salen, las tres tachadas no, y con `servicio` ausente la fila pinta
  «—» sin romper (deploy en dos tiempos: API nuevo con panel viejo y al revés
  conviven).


## Reporte de la oficina del 22-sep-2026 (cuatro capturas)

Cuatro cosas, en palabras del cliente: (1) «en la hélice del XB-ANU no está
haciendo bien la resta y se sale de parámetros»; (2) «en estas ventanas no se
desplaza hacia abajo para el botón de guardado, lo que hago es moverme con la
tecla tabulador y atinarle»; (3) «en los registros de gastos, además de la
opción facturada, agregar la opción para subir la factura correspondiente de
dicho gasto»; (4) «en vuelos, apartado COBRO, colocar las opciones link de
pago, transferencia, efectivo; y agregar por cada vuelo las opciones para
identificar vuelos facturado, sin factura, factura elaborada y enviada, y que
pueda yo también subir la factura del servicio»; (5) «no se alcanzan a ver los
3 puntitos para las demás opciones en la cotización».

### Los diálogos se DESPLAZAN (`ui/dialog.tsx`, `ui/sheet.tsx`)

- `DialogContent` gana `max-h-[calc(100dvh-2rem)] overflow-y-auto
  overscroll-contain`; `SheetContent`, `overflow-y-auto overscroll-contain`.
  Sin eso, en una laptop el diálogo de editar hélice/motor crecía más que la
  ventana y su pie —donde vive «Guardar cambios»— quedaba FUERA, sin forma de
  llegar con la rueda: el operador tabulaba a ciegas.
- El scroll va en el POPUP, no en un hijo: `DialogContent` es un `grid` y los
  diálogos existentes cuelgan sus secciones de él; meter un contenedor nuevo
  habría descolocado a todos. Un panel que ya desplaza su propio cuerpo
  (`flex-1 overflow-y-auto`) no cambia.
- `dvh` y no `vh`: en el navegador del celular la barra de direcciones se
  come la diferencia justo donde está el botón.
- Guarda: `components/ui/__tests__/dialog-scroll.test.ts` (lee el archivo, no
  el DOM: son primitivos de Base UI que renderizan por portal, y quitar esas
  clases devuelve el bug a TODOS los diálogos del panel a la vez).

### TURM = TSO, como en la bitácora (`lib/admin/overhaul-turm.ts`)

- **El bug**: en la bitácora física **T.U.R.M. = Tiempo desde la Última
  Reparación Mayor = TSO**. El formulario decía «TURM · horas del componente
  EN su último overhaul» y el API hacía `tso_base = horas_totales −
  turm_componente`: la oficina capturó Horas totales 2708 y TURM 364 (que ya
  era el TSO) y el sistema guardó 2,708 − 364 = **2,344** sobre un TBO de
  2,000 ⇒ ficha con «Restantes **−344.00**» y «Vida usada 100 %». La resta la
  corrige el API (el T.U.R.M. tecleado es el TSO de HOY y se guarda en el
  marco del ancla: `tso_base = turm − lo volado desde el ancla`); el panel
  corrige lo que el operador LEE al capturar, que es donde nació el error.
- **El campo se prellena con el TSO VIVO** (`turm_componente` del API, que es
  `tso_base + delta`) y eso solo cuadra porque el API descuenta ese mismo
  delta al guardar. Si alguien «simplifica» el API a `tso_base = turm`, esta
  pantalla empieza a inflar el TSO en cada edición de un componente cuyo
  ancla esté vieja (el N4142R: 1,098 h). No tocar uno sin el otro.
- FUENTE ÚNICA de textos y tonos (PURA, prueba
  `__tests__/overhaul-turm.test.ts` con el caso REAL del XB-ANU):
  `ETIQUETA_TURM` («TURM (TSO)»), `HINT_TURM` («horas **DESDE** el último
  overhaul (TSO)»), `TITULO_TURM`, `AYUDA_HORAS_COMPONENTE`,
  `ETIQUETA_TURM_FICHA`, `estadoTbo`, `renglonRestantes`, `textoVidaTbo` y
  `avisoTsoImposible`. Ningún formulario ni card redacta estas frases.
- **La barra «Vida usada del TBO» se recorta a 100 %** (el `style` ya lo
  hacía; el número de al lado no) y el vencido se DICE: «overhaul vencido por
  344.00 h» en rojo, y el renglón de la ficha pasa de «Restantes −344.00 hrs»
  a «Overhaul · vencido por 344.00 h». Un negativo bajo la etiqueta
  «Restantes» no se lee como «se pasó»: se lee como que el sistema está mal —
  que es exactamente lo que reportó la oficina.
- **Sin exceso que contar no se escribe «vencido por 0.00 h»**: con 0 h
  restantes el texto es «overhaul cumplido» / «toca ahora (sin horas
  restantes)».
- El aviso de captura ya no dice «el TSN es menor al TURM» (con la lectura
  correcta eso no describe nada): dice que **el TSO no puede superar al TSN**,
  espejo del 400 del API.
- **El renglón TURM de la ficha se conserva aunque repita al TSO**: con la
  lectura correcta son el MISMO número, pero «T.U.R.M.» es el nombre que la
  oficina busca (es el de la bitácora física y el del formulario). Se rotula
  «T.U.R.M. (bitácora)» con un `title` que dice que es el mismo dato, para que
  nadie lo lea como dos cuentas distintas.
- Aquí NO se calcula ninguna hora: TSN, TSO, restantes y % los manda el API.
- **Orden de deploy: API antes que panel.** Con el API viejo, un TURM
  capturado con la etiqueta nueva se guardaría otra vez como `horas_totales −
  turm` (el bug al revés). Los datos de prod los corrige el usuario tras el
  deploy; el panel no toca ninguna fila.

### La croma vive DENTRO del papel (cotización)

- Reporte con captura de **TRAMOS COTIZADOS**: «no se alcanzan a ver los 3
  puntitos para las demás opciones en la cotización». El canal de croma de la
  noche anterior (`CANAL_CROMA_PX`) no bastaba: `.cot-margen` está
  `position:absolute; right:100 %`, o sea FUERA del área impresa, y el borde
  del contenedor lo corta en cuanto la ventana se estrecha o la barra lateral
  se abre — y el documento interno es ANCHO (816 px).
- **La croma pasa a la celda**: `.cot-croma` (inline-flex, sin posicionar) al
  INICIO de la celda RUTA de cada tramo —🗑 · ⋯ · marcas (pax, ferry,
  pernocta, servicio, nota, sobrevuelo, oculto, «NM?»)— y al INICIO del
  renglón en el desglose (🗑/⋯ de cada extra). La moneda de una TUA y la marca
  «manual» del IVA van con `.cot-croma--der`, al final de su línea. Se
  conservan las clases de los hijos (`.cot-margen__accion`, `.cot-marca`): lo
  único que cambia es el CONTENEDOR.
- **Los iconos se VEN sin pasar el mouse** (`opacity: .6`, plena al pasar por
  la fila o al enfocar): el reporte era justamente que no se alcanzaban a ver.
- **La hoja INTERNA ya no reserva canal**: `geometriaHoja` acepta `canalPx` y
  `QuoteSheetInterna` pasa **0** — con la croma dentro, un canal vacío solo le
  quitaría ancho al papel. La hoja del **CLIENTE conserva el suyo**: su
  itinerario sigue pintando `.cot-margen` porque ahí vive el botón de HORAS
  («3.68 h»), que no cabe en la línea de la tabla.
- En **LECTURA no se monta nada de esto** (sigue siendo `data-cot-ui`), así
  que los fixtures del documento **no cambian**. El único fixture que se
  regeneró fue `interna-070`, y por las etiquetas de método de cobro (abajo),
  no por la croma.
- Guardas: `quote-sheet-interna-controles.test.tsx` («croma del tramo: dentro
  del papel, nunca en el margen») y `quote-pantalla-completa.test.tsx` (la
  interna sin `padding-left`, la del cliente con el canal, y que en cualquier
  `.cot-margen` que quede solo haya croma estrecha).

### Métodos de cobro: «Link de pago» (etiquetas y orden)

- `lib/admin/metodos-pago.ts`: HSBC_LINK pasa a **«Link de pago (HSBC)»**,
  PAYWISE a **«Link de pago (Paywise)»**; TRANSFERENCIA y EFECTIVO se quedan
  igual. Cambian TAMBIÉN el ORDEN del selector, que ahora arranca por lo que
  la oficina usa a diario: Link de pago (HSBC) · Link de pago (Paywise) ·
  Transferencia · Efectivo, y después Cheque, BillPocket, Dólares y Otro.
- **Los VALORES del enum NO cambian**, ni el IVA, ni `facturable`, ni
  `METODOS_CON_CUENTA`, ni la whitelist del piloto. `METODOS_FACTURABLES` se
  deriva del arreglo, así que su test compara CONJUNTOS: esa regla no puede
  depender del orden del selector.
- Las etiquetas son ESPEJO de `common/metodo-cobro.util.ts` del API (las mismas
  que imprimen el recibo de pago y el PDF interno) y de la app. La paridad la
  congela `__tests__/metodos-pago.test.ts` con la tabla COPIADA del API: si
  cambia un solo lado, el test falla. Si el recibo dijera «Link de pago
  (HSBC)» y la pantalla «HSBC link», el operador creería que son dos cosas.
- **DOLARES se alineó en los tres repos a «Dólares directo»** (revisión
  adversaria 22-sep-2026): el panel ya lo pintaba así y el API imprimía
  «Dólares» en el recibo. La ÚNICA divergencia que queda —y está probada
  aparte— es OTRO: el SELECTOR dice «Otro (escríbelo)» porque ahí es una
  instrucción, pero lo que se PINTA de un cobro lo arma `metodoPagoLabel`
  («Otro» / «Otro (PayPal)»), idéntico al API. La tabla del test no puede
  volver a decir que son iguales renglón por renglón cuando no lo son.
- El fixture **`interna-070`** se regeneró (`npm run gen:hoja-interna-fixture`)
  porque su payload lleva `metodo_cobro_label`/`metodo_label`, que los manda el
  API: con la etiqueta vieja, pantalla y papel dejaban de cuadrar.

### Factura del SERVICIO, por vuelo (`lib/admin/factura-cliente.ts`)

- Tres estados MANUALES de oficina: **SIN_FACTURA · ELABORADA_ENVIADA ·
  FACTURADO**, más el archivo (PDF o XML) que se le mandó al cliente. Hasta hoy
  el vuelo solo tenía `facturado` (= CFDI timbrado por el sistema), y eso deja
  fuera el caso real: la factura la elabora el contador y se manda por correo.
- Campo **ADITIVO** del API: `factura_cliente { estatus, archivo{path, nombre,
  subida_at, subida_por_nombre} | null }` en el snapshot del vuelo.
  `estatusFacturaCliente(v)` es la fuente única de lectura y **con un API sin
  desplegar cae a `facturado`**: la card queda EXACTAMENTE como estaba y no se
  ofrece ningún control (`facturaCliente === undefined` ⇒ el bloque no se
  monta), porque un selector que responde 404 es peor que no tenerlo.
- **El CFDI manda**: con `vuelo.facturado` el estatus se queda en FACTURADO, el
  selector no se monta y se explica por qué (el API responde 409
  `VUELO_CON_CFDI`). Al revés no: marcar FACTURADO a mano NO timbra nada.
- Dónde: `flights/cobros-card.tsx` — el badge del resumen usa el helper (tres
  estados) y debajo va `flights/factura-cliente-bloque.tsx` con el selector,
  «Subir factura» (PDF/XML, ≤10 MB), «Ver» (URL FIRMADA de 10 min, pestaña
  nueva) y «Quitar» **con confirmación**. Roles: ADMIN/COORDINADOR/FACTURACION.
- Server actions en `app/admin/flights/actions.ts`
  (`setFacturaClienteEstatusAction`, `subirFacturaClienteAction`,
  `quitarFacturaClienteAction`, `urlFacturaClienteAction`), todas con
  `revalidateFlight`.
- **`apiFetch` ya acepta `FormData`** (22-sep-2026): viaja TAL CUAL y SIN
  `Content-Type` —lo pone `fetch` con su `boundary`; fijarlo a mano deja al API
  sin poder separar las partes—. Es el ÚNICO cuerpo que no se serializa; todo
  lo demás sigue yendo como JSON. El límite de las server actions ya estaba en
  12 MB (`next.config.ts`), así que un archivo de 10 MB pasa.
- Pruebas: `lib/admin/__tests__/factura-cliente.test.ts` (tolerancia, el CFDI
  que manda, validación del archivo) y
  `flights/__tests__/cobros-card-factura-cliente.test.tsx` (cableado, incluido
  «API viejo ⇒ la card de hoy»).

### Factura de UN gasto, desde su fila (`expenses/gasto-factura-button.tsx`)

- No hace falta ningún mecanismo nuevo: el buzón de Facturas recibidas ya
  existe. Lo que faltaba era hacerlo DESDE la fila. El botón vive junto al
  `FacturacionBadge` y hace **UNA** llamada:
  `POST /v1/invoices/recibidas/de-gasto { gasto_id, xml_b64?, pdf_b64?,
  pdf_nombre? }` ⇒ la factura con sus `gastos` y `ya_existia`.
- **Por qué esa ruta y no las dos de siempre** (revisión adversaria
  22-sep-2026, que encontró el panel llamando a un endpoint inexistente):
  (a) `POST /recibidas/:id/amarrar-gastos` **REEMPLAZA** la lista de gastos de
  la factura — desde la fila de UN gasto desamarraría en silencio a los demás
  que ampara la misma factura (VIP SAESA: una factura, varios aterrizajes);
  (b) el XML quedaba obligatorio y hay proveedores que solo mandan PDF;
  (c) un UUID ya registrado respondía 409 sin salida cuando es el caso normal
  (la misma factura amparando otro gasto); (d) **`POST /recibidas/:id/pdf` NO
  EXISTE**: cada PDF se perdía con un aviso de que «solo el PDF no se guardó».
- **Basta con UNO de los dos archivos**. Con solo PDF la factura entra con
  `uuid_fiscal` null y marca el gasto igual; el XML sigue siendo el que trae
  UUID, emisor y total. El diálogo lo dice.
- **El semáforo no se toca desde el panel**: al amarrar, el trigger
  `gasto_sync_facturacion` del API pone el gasto en 🟢 FACTURADA. Escribir
  `estatus_facturacion` aquí sería una segunda fuente para el mismo dato.
- **«Ver la factura»** de un gasto ya amarrado abre el archivo con URL
  FIRMADA (`GET /v1/invoices/recibidas/:id` → `POST /recibidas/file-urls`,
  `verFacturaGastoAction`), prefiriendo el PDF; el bucket es privado y nunca
  se guarda una URL en el HTML.
