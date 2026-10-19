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
  `ActionResult` y revalidan (`revalidateFlight`, `revalidatePath`). OJO: en
  Next 16 un `revalidatePath` dentro de una server action repinta la página
  ABIERTA; una action que se llama desde un diálogo que debe seguir montado
  NO revalida y quien la llama hace `router.refresh()` al cerrar (caso
  `corregirFechaGastoAction`, sección «Conciliación: corregir la fecha del
  gasto…»).
- **Foco del pre-cierre** (`pc`, `ids`, `pcn`, `pct`, `pcd`, `pcp`; 15-oct-2026):
  son parámetros SOLO del panel. Ninguna consulta al API los reenvía; cada
  página los lee aparte con `leerFocoPreCierre` (validados: basura ⇒ sin foco,
  jamás un 400). Ver «Pre-cierre: «Resolver →» marca en ámbar».

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
  `/admin/profit-sharing?desde=nada`. Conciliación acepta además `?mov=` y
  `?gasto=` (13-oct-2026, enfoque desde Gastos) y `?cobro=` (API 0.0.78,
  desde la hoja «Conciliación con el banco» de una entrada de dinero), los
  tres con `uuidFiltro` vía `enfoqueConciliacionDeUrl`: un valor que no es
  uuid se ignora.
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
- **El núcleo es GENÉRICO desde el 24-sep-2026**: `proxyArchivoDelApi` con
  `tipo: TIPO_PDF | TIPO_XLSX` (Content-Type, extensión, `Accept` y título de
  la página de error); `proxyPdfDelApi` es un envoltorio que conserva sus
  defaults (POST, `PDF_ERROR`) y `errorPdf` = `errorArchivo(…, «No se pudo
  abrir el PDF»)`. `nombreArchivoSeguro`/`armarContentDisposition` aceptan
  `extension` (default `.pdf`). Un 404 «Cannot GET …» del API (endpoint que
  aún no existe) sale como `RUTA_NO_DISPONIBLE` en es-MX. Los PDF no cambian
  (sus 10 pruebas siguen iguales).

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
  **Orden** (opcional, 24-sep-2026): columnas con `ordenable: true` + prop
  `orden` (`DataTableOrden`: dirección por columna, clic, atajos visibles
  «Ordenar: …»). La tabla NO ordena: el padre pasa `rows` YA ordenadas con
  una función PURA de `lib/admin` (con test) sobre el conjunto COMPLETO, y la
  tabla vuelve a la página 1 al cambiar el orden. El valor vive en la URL
  (`?orden=`, default fuera de la URL) y el componente lo LEE con
  `useSearchParams` (la elección del clic solo gana mientras la URL no se
  asiente y luego caduca: `resolverOrdenInventario`, puro + test), **nunca**
  con `useState(propDelServer)`: al volver del detalle
  (BackLink = `router.back()`) Next reusa el payload viejo de la página y esa
  prop es la de la primera carga — la URL decía `?orden=se-acaban` y la tabla
  salía A–Z (revisión 24-sep-2026, test de regresión en
  `inventory/__tests__/items-table-orden.test.tsx`).
  Ejemplar: inventario (`lib/admin/inventario-orden.ts` +
  `inventory/items-table.tsx`, «Se están acabando primero» = Bajo primero y
  luego stock ascendente, desconocidos al final).
  **Filas que el operador está viendo** (opcional, 25-sep-2026): prop
  `alCambiarFiltradas(filas)` — DataTable avisa, en un EFECTO y solo cuando
  cambia el conjunto (clave = ids unidos), las filas que quedan tras la
  búsqueda rápida (todas las páginas). Lo usan «Mover a…» del inventario y,
  desde el 14-oct-2026, la selección de Conciliación («Seleccionar los N
  pendientes de la búsqueda»; solo cuando la tabla trae `seleccion`).
  **Fila activa y teclado** (13-oct-2026): toda DataTable trae fila activa
  con clic/foco y ↑/↓/Home/End/Enter/Esc; fuente única
  `lib/admin/filas-activas.ts` + `lib/admin/desplazamiento-visible.ts` +
  hook `hooks/use-filas-activas.ts` + el <tr> suscrito
  `components/admin/fila-navegable.tsx`; sin URL ni localStorage; ver
  «Tablas: fila activa y teclado ↑/↓/Enter/Esc» al final.
- Confirmación antes de TODO borrado/acción destructiva (Dialog + toast
  `sonner`). Regla permanente del cliente.
- ID de vuelo por cliente («january02-211026», 13-oct-2026): lo ARMA el API
  (`clave_cliente`) y el panel lo pinta SOLO con
  `components/admin/clave-cliente.tsx`; textos y reglas del alias en
  `lib/admin/clave-cliente.ts`. Ver «ID de vuelo por cliente junto al folio».
- Abrir el balance EN LA CELDA de un gasto (13-oct-2026, API 0.0.75): la
  llegada (`?gasto=`, celda, franja) sale SOLO de `lib/admin/libro-vinculos.ts`
  y los enlaces «Ver en balance…» de Conciliación y de Caja chica SOLO de
  `lib/admin/conciliacion-balance.ts` (también el NOMBRE de la pestaña del
  Excel donde vive el gasto, `NOMBRE_HOJA_BALANCE_*`). Ver «Desde
  Conciliación: el libro abre en la celda del gasto» y «Caja chica: el gasto
  con más datos y «Ver en balance»».
- Compras en DÓLARES contra cargos en PESOS (13-oct-2026, API 0.0.75): la
  regla del T.C. oficial del día es del API; el panel la PINTA solo con
  `lib/admin/conciliacion-tc.ts` (3.ª línea del candidato, marca de la liga,
  aviso «Vincular de todos modos», sufijo de moneda) y
  `lib/admin/pre-cierre-tc-usd.ts` (renglones del pre-cierre). Ver
  «Conciliación: compras en dólares contra el T.C. oficial del día».
- Un COBRO contra el banco (14-oct-2026, API 0.0.78): el estado del cobro,
  el badge de 3 estados, el renglón «Banco», el chip «Parcial · faltan $X»
  de Ingresos y las URLs al abono salen SOLO de `lib/admin/cobro-banco.ts`;
  «Cobrado de más» y la vista previa del formulario de cobro, de
  `lib/admin/cobrado-de-mas.ts`; la guía `al_vincular` del diálogo
  «Vincular», de `lib/admin/conciliacion-cobros-lote.ts`; la hoja
  «Conciliación con el banco» de una entrada de dinero, de
  `lib/admin/entrada-banco.ts` (lo común con la de Gastos, en
  `lib/admin/hoja-banco.ts`). Ver «Cobros: un cobro con varios abonos…» e
  «Ingresos: «Conciliado» abre su conciliación con el banco» al final.
- AFAC por vuelo (16-oct-2026, API 0.0.89, invariante 90 del API): la celda
  EDITABLE del costo real en el libro en pantalla sale SOLO de
  `lib/admin/libro-afac.ts` (vínculo, teclado, qué se guarda, valor
  optimista, textos) y sus piezas con estado de
  `components/admin/reportes/libro-afac-edicion.tsx`; la marca «Pago de
  AFAC» del gasto, SOLO de `lib/admin/pago-afac.ts` (+ `CasillaPagoAfac` y
  `AfacRealProvider`). Ver «AFAC por vuelo (16-oct-2026, API 0.0.89)» al final.
- Gastos «por pagar» (19-oct-2026, API 0.0.95): la capacidad, la regla de la
  fecha de captura, el chip, «Marcar pagado», el filtro y sus textos salen
  SOLO de `lib/admin/gasto-por-pagar.ts` (+ `PorPagarProvider`). Ver «Gastos
  por pagar (fecha a futuro)» al final.
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
- **Fila resaltada / foco del pre-cierre** (15-oct-2026): el foco sale SOLO
  de `lib/admin/pre-cierre-resolver.ts` (leer, ordenar, marcar, textos) y la
  franja SOLO de `components/admin/franja-pre-cierre.tsx`. La marca ámbar es
  UNA: `CLASE_FILA_RESALTADA` (= `CLASE_FILA_ENFOCADA` de
  `conciliacion-vista.ts`, = la literal de «Por facturar»). `DataTable` no se
  toca: el resaltado entra por `rowClassName` y el «primero» por el ORDEN de
  las filas que recibe.

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
  inputs), 🔒 + razón en la barra de estado y «Copiar como nueva cotización»
  (este último solo para quien puede crear cotizaciones; «Copiar como nueva»
  vive ADEMÁS en la barra de acciones en TODOS los estados — ver «Copiar
  como nueva: siempre a la mano», abajo).

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
  `/new?d=`; desde el 28-sep-2026 también en la barra de acciones, en todo
  estado). Cobrado bloquea en cualquier estado (D3; el API responde 409
  `COTIZACION_COBRADA` → banner rojo + liga a `#cobros-vuelo`) **salvo para
  quien tiene el permiso especial por persona** (26-sep-2026, ver «Cotización
  cobrada: editable con permiso por persona» abajo).
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

### «Copiar como nueva»: siempre a la mano (28-sep-2026)

Pedido del cliente: «ya no está la opción de usar de copia la cotización para
una nueva; esa función es muy útil, la necesitamos de nuevo» (captura de la
#257, Completado, Cobrado $0: la barra tenía Ver vuelo · PDF · PDF interno ·
Ajuste rápido y NO copiar). El botón existía, pero SOLO en la lectura
bloqueada (🔒 de la TotalBar); desde que el 26-sep muchas cotizaciones abren
editables, para ellas desapareció.

- **Dónde**: botón **«Copiar como nueva»** (ícono duplicar + texto visible,
  `title` = `TITULO_BOTON_COPIAR`) en la barra de acciones
  (`quote-actions-bar.tsx`, prop `onCopiarComoNueva`) en TODOS los estados:
  editable, con cambios, bloqueada, cancelada, completada. El botón del
  candado 🔒 y el del banner rojo del 409 `COTIZACION_COBRADA` se QUEDAN y
  llaman a la MISMA función.
- **Roles**: `puedeCopiarCotizacion(rol)` = quien puede CREAR
  (`ROLES_EDITAN_COTIZACION`: ADMIN/COORDINADOR, espejo del `@Roles` de
  `POST /v1/quotes`). SOCIO/FACTURACION/ANALISTA no lo ven —tampoco el del
  candado, que antes salía a todos—: los llevaría a un alta que el API les
  rechaza al guardar. Sin rol (`/me` falló) se ofrece, como
  `puedeEditarCotizacion`: el gate real es el API.
- **Una sola copia**: `copiarComoNueva` del cotizador (con `getValues()`, lo
  que hay en PANTALLA) → `urlCopiarComoNueva` de **`lib/admin/quote-copia.ts`**
  (PURO, fuente única; también vive ahí el formato del borrador `?d=`:
  `codificarBorrador` / `decodificarBorrador` / `PARAM_BORRADOR`, que el
  cotizador ya no define). El cotizador la reporta a la barra con
  `EstadoEdicionCotizador.copiarComoNueva` (mismo mecanismo que guardar /
  descartar); hasta el primer efecto el botón va deshabilitado.
- **Qué lleva la copia** (`valoresCopiaCotizacion`): lo de la COTIZACIÓN
  viaja —cliente, avión, ruta y tramos (millas, pax por tramo, ferry,
  pernocta, servicio, notas), extras, tarifa con sus 6 decimales y el
  segmento, horas pactadas, sobrevuelo, TUAS, redondeo/descuento, método de
  cobro y T.C., comisión del vendedor, notas, toggles del PDF—; lo del VIAJE
  se vacía: `fecha_vuelo`, `fecha_traslado_final`, `fecha_salida_plan` y
  `pdf_fecha` de cada tramo, el manifiesto (`pasajeros_nombres`), la ruta
  operativa del alta, el motivo y el `total_pactado_usd` LEGADO (el API lo
  descarta al crear: la vista previa mostraría un total que no se guarda).
  Un extra de GRUPO pierde `origen`/`grupo_extra_id` (la copia es de un
  avión y el renglón se vuelve propio). Nace SIN cobros, sin vuelo ligado y
  como v1 nueva (nada de eso vive en el form). El OJITO del PDF por tramo
  tampoco viaja desde una cotización guardada: en revisión la visibilidad
  vive en la escala VIVA (toggles del workspace), no en el form, así que la
  copia nace con todos los tramos visibles y se ocultan en el alta (D4). El formato del borrador SIN
  copia es byte a byte el de siempre: las URLs viejas se siguen leyendo.
- **Con cambios sin guardar SE PREGUNTA** (decisión: salir con cambios
  siempre se confirma en este panel, y `router.push` no pasa por
  `useCambiosSinGuardar`): «¿Copiar con tus cambios sin guardar?» + «La
  cotización nueva llevará lo que ves en pantalla, incluidos tus cambios. La
  #257 se queda como está: esos cambios NO se guardan en ella.» → «Copiar con
  mis cambios» / «Volver». Sin cambios copia directo.
- **Con un guardado EN VUELO no se copia** (revisión adversaria 28-sep): el
  botón de la barra va deshabilitado mientras `edicion.saving` y
  `copiarComoNueva` sale sin hacer nada si `saving`. Salir a la copia a medio
  guardado dejaba la versión nueva escrita en la original mientras el diálogo
  prometía «esos cambios NO se guardan en ella».
- **El alta avisa de dónde viene**: el borrador de una copia trae `copia =
  {folio, conCambios}` y al montar el alta el toast dice «Copia de la
  cotización #257[, con los cambios que no guardaste en ella]. Pon la fecha
  del vuelo y revisa cliente y pasajeros antes de crear la v1.» (en vez de
  «Se restauró tu avance desde la URL.»). La marca se suelta al reescribir
  la URL con el debounce: un F5 posterior es «tu avance».
- Pruebas: `lib/admin/__tests__/quote-copia.test.ts` (la URL reproduce
  tramos, extras y tarifa; qué se vacía; compatibilidad del `?d=`; roles;
  textos), `quotes/__tests__/quote-copiar-como-nueva.test.tsx` (el botón en
  cada estado, ausente para SOCIO/FACTURACION/ANALISTA, y el CABLEADO: una
  sola copia para la barra, el candado y el banner del 409) y
  `quote-pantalla-completa.test.tsx` («Copiar como nueva cotización» en el
  candado: ADMIN sí, SOCIO no).

### IVA manual al reabrir (14-oct-2026)

#341 (transferencia con IVA manual 0 %, cobrada exacta: $800.00) volvía al
16 % ($928.00) al primer `/calculate`, sin salir en el diff. Regla: se
rehidrata `iva.porcentaje` del snapshot si difiere a 4 decimales del default
del método (`aplica_por_metodo_pago ? 0.16 : 0`), incluido el 0; igual ⇒
null. SOLO con esa foto del motor (`calculo_snapshot.iva`), como la tarifa
(`proviene_de_override`) y las horas: sin ella el vuelo nunca se cotizó
(reserva, externo cubierto o dado de alta) y su `iva_pct` 0 es el default de
la columna aunque «Editar» ya le haya puesto Transferencia ⇒ null, y su
primera cotización sale con el IVA del método. (La primera versión leía
`iva_pct` + `metodo_cobro` sin snapshot y la arrancaba con «IVA 0 % manual»:
$800.00 en vez de $928.00, sin salir en el diff.) Fuente única:
`ivaOverrideRehidratado` (`lib/admin/iva.ts`, paridad con el API). El grupo
no tiene IVA manual.

«Copiar como nueva» y «Recargar conservando borrador» leen el FORM ya
rehidratado: la copia de la #341 nace con «IVA 0 % · manual» a la vista,
como ya nacían las de BillPocket con 16 % manual (`quote-copia.test.ts`). En
prod (14-oct-2026) 13 cotizaciones tienen un IVA distinto del de su método:
5 ya se rehidrataban (#91, #96, #233, #260 BillPocket 16 %; #314 Paywise
5 %) y 8 son nuevas (#219, #253, #341, #349, #358 transferencia 0 %; #374
transferencia 5 %; #193 y #217 transferencia 0 %, de agosto: mes cerrado,
se abren en lectura). Ninguna con snapshot tiene el método distinto de la
marca del motor, y las 68 sin snapshot tienen IVA 0 y método null.

## Cotización cobrada: editable con permiso POR PERSONA (26-sep-2026, API 0.0.37)

Pedido de los dueños por WhatsApp (capturas de #305 y #317 con el chip
«Bloqueada · vuelo cobrado» y la banda roja): «un vuelo que se cobró en
efectivo pero estaba cotizado como para transferencia, entonces tenía IVA:
decía 754 dólares, pero entró el cobro en efectivo por 600… Yo necesito que
eso se desbloquee para mí, no para todos… Pero yo o Pablo sí necesitamos
poder entrar y hacer modificaciones.» Es por PERSONA, no por rol: todos los
de oficina son ADMIN (Alejandro Villalobos también, y NO tiene el permiso).

- **De dónde sale el permiso**: `GET /v1/me` → `permisos.editar_cotizacion_
  cobrada` (ADITIVO; `MeResponse.permisos` opcional). Lo resuelve el API de
  la lista `editores_cotizacion_cobrada` (configuración, `valor_json`,
  sembrada con Alejandro y Pablo Canales). Helpers PUROS en
  `lib/admin/cotizacion-cobrada.ts` (`puedeEditarCotizacionCobrada`,
  `apiConPermisosPorPersona`). **API previo (sin `permisos`) ⇒ todo como
  hoy** y no se pide la lista.
- **Candado (fuente única)**: `candadoRevision(quote, { ...cobrosInfo,
  puedeEditarCobrada, editoresCobrada })` (`lib/admin/quote-revision.ts`,
  `CandadoRevisionOpts extends CobrosInfoCandado`). Con cobros y permiso ⇒
  `canRevise` y `edicionConCobros: true`, `bloqueadaPorCobro: false`. Solo
  abre el candado del COBRO: factura (CFDI), mes cerrado y servicio siguen
  (y el grupo/vuelo ya volado los decide el API). CANCELADA nunca es
  «edición con cobros» (ahí el cobro no bloquea a nadie). Sin permiso: igual
  que hoy, pero la razón es `razonCobrada(nombres)` = `RAZON_REVISION.cobrado`
  + «Solo pueden editarla: Alejandro Canales, Pablo Canales.» — MISMA
  redacción que el 409 del API. Los nombres los pide la página de la
  cotización a `GET /v1/config/editores-cotizacion-cobrada` SOLO para quien no
  tiene el permiso y con `/me.permisos` presente; si no llegan, la razón de
  siempre (sin aviso: es texto de apoyo).
- **A quién se nombra** (revisión adversaria 26-sep-2026):
  `candado.quienesEditanCobrada` (fuente única; la razón y el diálogo
  «Bloqueada · vuelo cobrado» de la barra de acciones lo leen de ahí) es
  «Solo pueden editarla: …» SOLO cuando el cobro es lo único que frena. Con
  el MES CERRADO o un vuelo de SERVICIO el permiso tampoco la abriría (el API
  rechaza esos 409 ANTES que el del cobro) y se deja `null`: si no, toda
  cotización cobrada de hace dos meses mandaba al operador a pedirle la
  corrección a Alejandro o Pablo, que tampoco pueden.
- **Sin cobros cargados no hay permiso en pantalla**: la página pide el
  snapshot con `degradado.opcional("los cobros del vuelo", …)` (si falla, se
  AVISA — antes era un `.catch(() => null)` mudo que pintaba «sin cobros») y
  pasa `permisoEditarCobrada = permiso && cobrosVuelo != null`. Sin los
  cobros la banda diría «ya tiene cobros por $0 USD» y el diálogo «Guardar
  vN» un saldo igual al total: falla CERRADO, se recarga y el API vuelve a
  decidir al guardar.
- **Pantalla con permiso** (`QuoteWorkspace` pasa `edicionConCobros =
  { cobradoUsd: totalCobrado, cobrosSinTc }` al cotizador): chip ÁMBAR
  «Cobrada · editable con permiso» en la TotalBar (en vez del botón
  «Bloqueada · vuelo cobrado» de la barra de acciones, que ya no sale); banda
  ámbar sobre el papel «Esta cotización ya tiene cobros por $X USD. Tienes
  permiso para corregirla: al guardar cambia el total y el saldo se recalcula
  con los cobros que ya existen (los cobros no se modifican).» (+ aviso de
  cobros MXN sin T.C.); **confirmación ÚNICA** al primer cambio (misma
  mecánica que CONFIRMADO/RESERVA; si aplican las dos, UN diálogo con el
  texto del dinero y la explicación de tripulación al final:
  `textoConfirmarEdicionConCobros`).
- **«Guardar vN» con cobros**: `ResumenGuardadoConCobros`
  (`quote-resumen-guardado-cobros.tsx`) sustituye la línea «Total con IVA»:
  «Total $754 → $600 USD», «Cobrado $600 USD (no cambia)» y «Saldo nuevo $X
  USD» / «Saldo nuevo $0 USD · liquidada» / «Sobrecobro $X USD» (rojo, con
  «regístrala como reembolso en Cobros del vuelo» — NUNCA «otro ingreso»: el
  ingreso del vuelo ya sale de los cobros y se contaría dos veces). Total =
  el del MOTOR (`breakdown.totales.total_usd`), cobrado = el del API; la
  única cuenta es la resta visible `saldoTrasEdicion` con la tolerancia de
  `pendienteCobro` (1 USD, en los dos sentidos). La vista previa del motivo
  muestra el prefijo `[Con cobros · permiso especial] ` que antepone el API
  (el panel NO lo manda). Tras guardar: `toastAvisos` pinta el saldo/
  sobrecobro que manda el API, el toast dice «(con cobros · permiso
  especial)» si llega `edicion_con_cobros: true`, y `reviseQuoteAction`
  revalida también `/admin/flights`, el detalle del vuelo y el calendario
  (la bandera `cobrado` la recalcula el API con `refreshCobradoFlag`).
  **Los cobros no se tocan.**
- **Configuración · «Editan cotizaciones cobradas»**
  (`configuracion/editores-cotizacion-cobrada-section.tsx`, action
  `setEditoresCotizacionCobradaAction` → `PUT
  /v1/config/editores-cotizacion-cobrada {usuario_ids}`): switches por
  persona SOLO si `puede_modificar` (estar en la lista); el último
  encendido no se apaga (la lista nunca queda vacía); «Guardar» confirma
  quién gana y quién pierde el permiso y advierte si te quitas a ti
  (`textoConfirmarEditores`). Los demás la ven de SOLO LECTURA («Hoy pueden
  editarlas: …» + «Solo quien ya está en la lista puede cambiarla.»).
  Candidatos: los `candidatos` del API (oficina activa: ADMIN/COORDINADOR/
  FACTURACION) — o `/v1/users?estado=ACTIVO` con un API que no los mande —
  filtrados a `ROLES_EDITAN_COTIZACION` (quien puede GUARDAR una cotización:
  el API solo da `/me.permisos` a esos roles, así que a Facturación sería un
  switch que no hace nada) + los ya elegidos que siguen activos. Errores del
  PUT (`mensajeErrorEditores`: manda el texto del API, respaldo por código):
  `SOLO_EDITORES_COTIZACION_COBRADA` (403), `LISTA_VACIA` y
  `USUARIOS_INVALIDOS` (400) y el CAS `EDITORES_CAMBIARON` (409); todos
  menos `LISTA_VACIA` repintan la sección (`errorEditoresPideRecargar`), y
  la página le pone `key` = la lista GUARDADA: al repintar con la lista que
  dejó otro editor, los switches arrancan de lo que hay hoy (con
  `useState(datos)` se quedaban con la selección vieja del operador).
  404 ⇒ «Disponible cuando se actualice el API» (gris, sin aviso); otro
  fallo ⇒ `AvisoDegradado`. `ConfiguracionClient` filtra la clave
  (`CLAVES_CON_SECCION_PROPIA`; el API ya la excluye de `GET /v1/config`).
- Tests: `lib/admin/__tests__/quote-revision.test.ts` (candado por permiso:
  CFDI/mes/servicio siguen, razón con nombres), `lib/admin/__tests__/
  cotizacion-cobrada.test.ts` (textos, saldo/sobrecobro/tolerancia, diff y
  errores de la lista), `quotes/__tests__/quote-pantalla-completa.test.tsx`
  («cotización cobrada · permiso especial»: chip + banda + editable vs
  lectura con nombres), `quotes/__tests__/quote-cobrada-permiso.test.tsx`
  (barra de acciones y resumen del diálogo) y `configuracion/__tests__/
  editores-cotizacion-cobrada-section.test.tsx`.
- **Orden de deploy**: migración `20260926000001_editores_cotizacion_cobrada`
  → API 0.0.37 → panel. Con el panel nuevo y el API previo nada cambia
  (sin `permisos` en `/me`, la sección de configuración dice «Disponible
  cuando se actualice el API»).

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

## El vuelo YA VOLÓ: cambiar el avión de la cotización es SOLO COMERCIAL (24-sep-2026)

- Caso #338 (CUN→PTU→CUN): se cotizó y voló en el Seneca N4142R; ya COMPLETADO, la oficina guardó la v2 «se cobra como cessna, pidieron cessna» (Cessna 206). El API leyó el avión como cambio de operación: la cabecera del vuelo quedó en XA-VGV con los tramos (con tacómetro) en N4142R, salían dos matrículas y el piloto recibió «Ahora vuela en XA-VGV» y «el REGRESO ahora sale…» de un vuelo que ya había aterrizado. La regla la APLICA el API (`resolverAeronaveDeRevision` / `estadoVueloVolado`); el panel la DICE antes de guardar.
- **Fuente única `lib/admin/avion-cotizado.ts`**: `estadoVueloVolado(quote)` → `{yaVolo, termino}`, espejo EXACTO del API. `yaVolo` = EN_VUELO/COMPLETADO o algún tramo VIVO con tacómetro (un CONFIRMADO con el tramo 1 capturado cuenta). `termino` = COMPLETADO o el ÚLTIMO tramo vivo por `orden` con tacómetro. Si cambia en un repo, cambia en el otro.
- **Texto único** `textoCambioAvionVueloVolado`: «Este vuelo ya voló en N4142R. Cambiar el avión aquí solo cambia con qué se cobra (Cessna 206); la operación no se mueve ni se avisa a la tripulación.» (matrícula de `aeronave_utilizada`, modelo del avión elegido). Sale cuando `yaVolo` y el diff trae la clave `aeronave` (no en externos) en: el diálogo «Guardar vN» (recuadro azul), junto al selector de la hoja interna (`.cot-aviso` bajo «Avión cotizado») y junto al de la hoja del cliente (sustituye a «Opera en …»), vía `DocumentoHoja.avisoCambioAvion`. Nunca se imprime ni aparece en lectura. El API manda su propio texto en `avisos[]` (`avisoAvionSoloComercial`): si cambia la redacción, cambian los dos.
- **Confirmación al abrir la edición** (`textoConfirmarEdicionCotizacion({ yaVolo, termino })`, los dos de `estadoVueloVolado(initialQuote)`): terminado ⇒ «…ya voló… La operación no se mueve y la tripulación no recibe aviso.»; A MEDIO CAMINO (`termino === false`) ⇒ «…ya salió… Lo ya volado no se mueve; si cambias el regreso o la pernocta pendientes, la tripulación recibe aviso.» (el API sí reagenda y avisa el regreso pendiente).
- **«Se notificará a la tripulación»** = `cambiosTocanTripulacion(cambios, volado)` (`quote-revision.ts`): con `yaVolo`, ni el avión ni la salida avisan; con `termino`, NADA avisa. Entran CONFIRMADO, RESERVA y EN_VUELO (a medio camino el regreso sí avisa). `avisoFechasVueloVolado` dice en el diálogo que el API conserva la salida (`yaVolo`) o el regreso (`termino`) del vuelo. La fecha de un TRAMO ya volado también la conserva el API (`tramoConservaFechaPlan`) y lo dice en `avisos[]` (toast).
- **Squawk**: un 409 `SQUAWK_ALTA_SIN_RESOLVER` con el vuelo ya volado NO abre «Guardar de todas formas»: es un API sin desplegar que movería la cabecera. Sale el banner ámbar `MSG_AVION_VUELO_VOLADO_API_VIEJO` (mismo banner que `tramos_base`) y los cambios se quedan. La nota de TALLER tampoco sale (el avión es solo de cobro); la marca del selector sí.
- **Card «Operación» y hoja interna**: cotizado (MODELO) vs utilizado (matrícula · modelo de `aeronave_utilizada`, que el API resuelve de los TRAMOS VIVOS, jamás de la cabecera a secas) con `ETIQUETA_DISTINTO_AL_COTIZADO` en ámbar; ayuda en pasado con `hintAeronaveUtilizada`; nota tenue «Voló en N4142R (Piper Seneca V)» (`fraseOperaEn(..., {yaVolo})`). El panel NO recalcula el utilizado de las escalas.
- **Orden de deploy: API antes que panel.**
- Pruebas: `lib/admin/__tests__/avion-cotizado.test.ts` (incluye la confirmación a medio camino), `quote-revision.test.ts` (caso #338 exacto), `quote-sheet.test.tsx` / `quote-sheet-interna-controles.test.tsx` (nota junto al selector, jamás impresa) y `components/admin/quotes/__tests__/quote-calculator-avion-volado.test.ts` (conexión del cotizador y de la card).

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
  `pasajeros_nombres`). **Excepción 5-oct-2026**: la `fecha_salida_plan` se
  hereda del mismo `orden` AUNQUE la ruta difiera — `replaceEscalas` la escribe
  en esa misma escala, y con la del snapshot guardar la cotización regresaba al
  día viejo un tramo que la operación (o el «Sí» del modal de fecha) ya había
  movido; con la viva el guardado es un no-op (escala viva sin fecha ⇒ el
  tramo va sin fecha: no se escribe una fecha ajena). Con
  `itinerario_operativo = true` no se hereda nada: las escalas del vuelo son
  OTRA ruta a propósito.
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
  que acabó volándose (desde el 28-sep-2026 la copia además vacía fechas y
  manifiesto: `valoresCopiaCotizacion`). Al restaurar un borrador en revisión, `tramos_base`
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

## Server actions: un archivo en base64 NUNCA va como argumento suelto (29-sep-2026)

- React (`decodeReply`, el que deserializa los argumentos de una server
  action en el servidor) suma la longitud de los TEXTOS que van directos en la
  lista de argumentos y, con dos o más argumentos, revienta al pasar de
  1,000,000 caracteres con «Maximum array nesting exceeded». El usuario solo
  ve «An error occurred in the Server Components render…» y la action NUNCA
  corre. Así falló la importación del estado de cuenta con un PDF de
  Scotiabank de 1.18 MB (1.6 M caracteres en base64); los archivos menores a
  ~750 KB pasaban, por eso nadie lo había visto.
- Regla: el archivo viaja DENTRO de un objeto (`{ filename, fileBase64 }`, así
  ya lo hacían gastos/vencimientos/clientes) o como `File`/`Blob`; ahí el
  texto no cuenta para ese límite. `parseEstadoCuentaAction` recibe un objeto.
  Candado estático: `app/admin/__tests__/server-actions-base64-en-objeto.test.ts`.
- Siguen vigentes los otros dos topes del camino panel → API: Vercel rechaza
  cuerpos mayores a 4.5 MB (413 `FUNCTION_PAYLOAD_TOO_LARGE`, el archivo en
  base64 pesa 1.37× ⇒ archivos de hasta ~3.3 MB) y `bodySizeLimit` 12 MB de
  Next. Para archivos mayores el camino correcto es mandarlos desde el
  navegador al API directo (`apiBrowser`), no por una server action.
- Diagnóstico: `npx vercel logs --scope vuelatours-projects --project
  vuelatour-next --environment production --since 1h --level error` (en el
  plan Hobby los registros duran 1 hora).

## Columna y filtro «Banco» en Gastos (9-oct-2026, API 0.0.67)

Pedido de oficina: «un apartado donde me diga si el gasto está conciliado con
el banco». Es una TERCERA pregunta, aparte de «¿trajo papel?» (comprobante) y
«¿ya se facturó?» (semáforo de facturación): «¿ya cruzó con el estado de
cuenta?».

- FUENTE ÚNICA `src/lib/admin/conciliacion-estado.ts` (PURO):
  `estadoBancoGasto(g)` → CONCILIADO (`g.conciliado`, que solo escribe la BD al
  cubrir el gasto; también un efectivo ligado con justificación) / PARCIAL
  (`estadoParcialDeGasto`: cargos ligados que no cubren; el tooltip dice lo
  que falta) / SIN_CONCILIAR (medio bancario `MEDIOS_BANCARIOS_CONCILIACION`
  sin cargo: lo que la oficina persigue, en rojo) / NO_APLICA (efectivo,
  personal, bodega: «—»). Espejo de `estado-banco.util.ts` del API, que
  pinta la misma columna en el Excel de gastos.
- `BancoBadge` (`components/admin/expenses/banco-badge.tsx`) = la columna
  «Banco» de `expenses-table.tsx`, entre Facturación y las acciones. Para
  ADMIN y FACTURACION el badge abre la conciliación al revés (sección del
  13-oct-2026, «Gastos: «conciliación al revés» desde el badge «Banco»»); para
  los demás sigue de solo lectura. El cruce vive en Conciliación. `banco` está
  en `FILTROS_URL` (las pestañas, la fecha de captura y «quitar avión» lo
  conservan).
- Filtro «Banco» del `expenses-filter-bar` (`?banco=conciliados|sin_conciliar`
  → `conciliado` true/false del API vía `conciliadoDeFiltroBanco`; el Excel
  hereda el filtro como texto "true"/"false"). Un valor desconocido se ignora.
- Tests: `__tests__/banco-badge.test.tsx`.

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
  — **desde el 2-oct-2026 el diálogo del CARGO vive en
  `vincular-gasto-dialog.tsx` y la precarga es solo el respaldo con un API
  previo (ver «Conciliación: 1 cargo ↔ N gastos»)** —
  descripción ámbar «Pago parcial: faltan $X de $Y»; el toast tras vincular
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
    **Desde el 2-oct-2026 el diálogo del CARGO vive en
    `vincular-gasto-dialog.tsx`** (UNA lista con casillas de los candidatos
    del servidor; la IA solo pone ★ dentro de ella; ya no existen «Buscar el
    gasto que corresponde (IA)» ni «Ver todos los gastos recientes»): ver la
    sección «Conciliación: 1 cargo ↔ N gastos».
  - `import-dialog.tsx`: al terminar canta los conteos por resultado; si el
    job termina en ERROR **refresca la bandeja** y dice cuántos movimientos
    SÍ entraron, cuántos fallaron y el motivo más común, e insiste en NO
    volver a importar el archivo (se detecta como duplicado): la salida es
    «Cruzar pendientes».
- **Filtro por cuenta**: `?cuenta=<uuid>` viaja a `listMovimientosBancarios`
  (el API ya lo soportaba) y los chips de cuenta conservan pestaña y rango
  (`hrefConciliacion`). El API rechaza parámetros desconocidos
  (`forbidNonWhitelisted`); `desde`/`hasta` los acepta el DTO de la lista
  desde el 24-sep-2026 (`YYYY-MM-DD` sobre `fecha`) y la vista los manda desde
  el 12-oct-2026 — ver «Conciliación: filtro de fechas de la vista» al final.
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

## Calendario: semáforo de 7 colores (22-sep-2026 · 24-sep-2026 · 28-sep-2026)

- Pedidos del cliente:
  - 22-sep: «que en los calendarios no se vean tantos colores […] los
    colores que tiene cada avión configurados los seguiremos respetando
    principalmente en los reportes del balance individual y general en los
    excel […] en realidad los colores son para el reporte de excel nada
    más».
  - 24-sep: «Ale quiere cambiar el color del descanso y agregar el de
    cobrado (este me imagino se cambiaría en automático cuando ya esté
    cobrado) […] Tentativo - Gris · Pendiente (permiso) - Amarillo ·
    Confirmado - Verde · Pagado - Azul · Cancelado - Rojo · Descanso -
    Morado».
  - 28-sep: «los vuelos de Servicio, poner en color Café en el calendario
    web, app y google calendar».
- **Los colores los decide el API** (`colores-calendario.util.ts` → campo
  `color` de `GET /v1/calendar` → colorId de Google). El panel **no calcula
  colores de eventos**: `calendar-grid.tsx` pinta `ev.color` tal cual y
  `textOnColor` decide si el texto va blanco u oscuro (el azul y el morado
  llevan texto oscuro; el café, BLANCO — lo congela
  `calendario-semaforo.test.ts`). La forma de `/v1/calendar` solo creció con
  ADITIVOS (`tentativo` el 22-sep, `pagado` el 24-sep, `servicio` el
  28-sep).
- **Paleta** (copia EXACTA de `SEMAFORO` del API), en el orden del cliente:
  `#64748B` Tentativo · `#F59E0B` Pendiente (permiso) · `#22C55E`
  Confirmado · `#3B82F6` **Pagado** · `#EF4444` Cancelado · `#8B5CF6`
  **Descanso 💤** · `#8B5E3C` **Servicio (taller / parada técnica)** (al
  final, 28-sep).
  - **El azul cambió de dueño el 24-sep**: era del descanso y hoy es del
    PAGADO.
  - El morado era del viejo «sin asignar» y hoy es SOLO del descanso.
  - Mantenimiento = amarillo y evento de flota = verde.
- **«Servicio» (café) lo decide el API, nunca el panel** (28-sep-2026): es
  el vuelo con tramos activos, alguno con parada `SERVICIO` y ninguno con
  pasajeros — la MISMA regla del candado del cotizador
  (`quote-revision.ts#esVueloDeServicio`, espejo de
  `common/vuelo-servicio.util.ts` del API). El calendario NO la evalúa:
  pinta `ev.color` y usa el aditivo `CalendarEvent.servicio?: boolean` solo
  para la línea «Vuelo de servicio (taller / parada técnica, sin pasajeros)»
  del detalle del día (jamás decide un color; lo vigila
  `sin-hex-sueltos.test.ts`).
  - Precedencia del API: cancelado > **servicio** > tentativo > pendiente >
    pagado > confirmado. Un servicio cobrado se ve café (nunca azul); un
    servicio cancelado, rojo.
  - Tooltip: arranca con `AYUDA_SERVICIO` (copia exacta del API: «Vuelo sin
    pasajeros con parada de servicio: no es del cliente y no se cotiza.») y
    agrega que el mantenimiento (🔧) sigue AMARILLO — no confundirlos.
  - En Google el café no existe: el evento sale **Mandarina** (colorId 6,
    fijo) con el renglón «Vuelo de SERVICIO …» en su descripción.
- **«Pagado» lo decide el API, nunca el panel**: sale de `vuelo.cobrado`,
  que mantiene `refreshCobradoFlag` con `cobrosEnUsd`.
  - Un vuelo en $0 o de cliente interno nunca es pagado.
  - Precedencia: cancelado > tentativo > pendiente > **pagado** >
    confirmado. Un pagado con permiso pendiente o sin avión/piloto se ve
    AMARILLO.
  - Se pinta solo al registrar el cobro que liquida el vuelo y vuelve a
    verde si ese cobro se borra o se reembolsa.
  - `CalendarEvent.pagado?: boolean` es ADITIVO (ausente = API viejo = no
    pagado). Solo alimenta la línea «✓ Pagado (cobrado completo)» del
    detalle del día; jamás decide un color.
- **FUENTE ÚNICA de la leyenda**: `lib/admin/calendario-semaforo.ts` (PURO).
  - Contiene los 7 `COLOR_*`, `COLOR_SEMAFORO`/`ClaveSemaforo` (con
    `pagado` y `servicio`), `SEMAFORO_CALENDARIO` (7 renglones con el texto
    exacto del cliente y un tooltip de qué hacer), `AYUDA_PENDIENTE`,
    `AYUDA_SERVICIO` y `NOTA_COLOR_AVION`.
  - `AYUDA_PENDIENTE` es copia exacta del API; el tooltip de «Pendiente
    (permiso)» arranca con ella y agrega el mantenimiento y «un vuelo ya
    pagado se queda en amarillo…».
  - La leyenda se pinta con `components/admin/calendar/leyenda-semaforo.tsx`
    (`<LeyendaSemaforo>`, con `children` para notas que no hablan de color).
    Nunca hex sueltos.
  - Paridad con el API congelada (tabla COPIADA: `SEMAFORO_API`,
    `LEYENDA_API`, `AYUDA_PENDIENTE_API`, `AYUDA_SERVICIO_API`) en
    `lib/admin/__tests__/calendario-semaforo.test.ts`. Orden y cableado en
    `calendar/__tests__/leyenda-semaforo.test.tsx`.
    `calendar/__tests__/sin-hex-sueltos.test.ts` truena si un componente del
    calendario escribe un `#RRGGBB` a mano o decide un color por
    `ev.pagado` o `ev.servicio`.
  - Si el API cambia un hex o un texto, se cambia aquí en el MISMO lote, o
    la leyenda miente.
- **El color del avión** (`aeronave.color_calendario`) se sigue capturando y
  usando **solo en los Excel** de balance individual y general
  (pyservices). Su etiqueta es «**Color en los reportes de Excel**»
  (`ETIQUETA_COLOR_AVION`/`HINT_COLOR_AVION`/`AYUDA_COLOR_AVION`/
  `tituloColorAvion`). El `#3B82F6` del selector de tonos del formulario del
  avión es un tono de AVIÓN, no el semáforo. Ya no hay colores reservados
  (`RESERVED_CALENDAR_COLORS` se retiró el 22-sep).
- «⚠ Falta asignar» del detalle del día va en **ámbar** (asunto
  pendiente). El rosa «Externo», el verde azulado y el azul del descanso, y
  el celeste del evento ya no existen en ningún calendario.
- **Deploy del café (28-sep-2026): API 0.0.40 (y su migración
  `20260928000003_calendar_sync_tipo_parada.sql`) antes que el panel.** Con
  el API viejo la leyenda ya dice 7 colores pero nada sale café (no rompe
  nada). Tras desplegar el API hay que re-pintar Google encolando SOLO los
  vuelos de servicio (SQL en el encabezado de la migración) o esperar al
  reconcile de las 00:15.
- **Orden de deploy: API (y su migración
  `20260924000002_calendar_sync_cobrado.sql`) antes que el panel.** Con el
  API viejo la leyenda ya dice 6 colores mientras el grid todavía pinta el
  descanso azul y no hay «Pagado». Se ve raro pero no rompe nada. Tras
  desplegar el API hay que **re-pintar Google** (`POST /v1/calendar/resync`
  o el reconcile de las 00:15).

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
- Periodos por defecto: mes corriente en hora Cancún, del día 1 a HOY. En
  `/admin/reportes` y `/admin/reportes/balance` es
  `periodoDefaultVista(todayCancun())` de `lib/admin/balance-vista.ts`;
  Reparto (`profit-sharing/page.tsx`) y Tableros (`dashboards/page.tsx`)
  conservan su `currentMonth()` local (`startOfMonthCancun()` +
  `todayCancun()`, mismo resultado), pendiente de unificar en un lote aparte.

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
  seguía viendo la lista vieja.
- **El refresh NO remonta los componentes cliente, pero SÍ les entrega
  props NUEVAS**: el mismo dato llega como OTRO objeto. Un formulario que se
  reinicia con `useEffect(…, [gasto])` (o con la identidad de
  `initialItem`) pierde lo capturado cada vez que la oficina vuelve a la
  pestaña. Regla: un formulario se reinicia UNA vez por apertura, con una
  `sesionRef` (el id del registro; se suelta al cerrar) — así lo hacen
  `inventory/item-form-dialog.tsx` (28-sep-2026) y
  `expenses/expense-verify-dialog.tsx` (14-oct-2026: el reset por identidad
  borraba lo tecleado y volvía a prellenar N990GG sobre el gasto repartido
  STARLINK). Ver «Repartir entre aviones desde «Verificar / editar»».

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
  total_usd / tarifa_usd_hr` (y desde el 0.0.33 `tiempo_horas`; el
  `tiempo_hhmm` legado ya no se pinta) y en la raíz `tramos_total_usd`,
  `tramos_tiempo_total_hr`, `tramos_tiempo_total_horas` (0.0.33),
  `tramos_ajuste_usd`, `tramos_ajuste_motivo`. La columna TIEMPO va en horas
  decimales: ver «TIEMPO VUELO (HRS) en horas decimales» más abajo.
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

### TIEMPO VUELO (HRS) en horas decimales (24-sep-2026, API 0.0.33)

- Pedido del cliente con la captura de la hoja interna de una CUN→PTU→CUN:
  «la parte de tiempo de vuelo, lo podemos manejar solo en decimales por
  favor? Porque parece ser que el sistema tiene un poco de problema al
  momento de convertirlo y luego como que se nos hacen raros los tiempos».
  Cada tramo valía 1.19166… h (125 nm / 120 kt + 0.15 de calzo) ⇒ «01:12»; el
  total 2.38333 h ⇒ «02:23»; y 01:12 + 01:12 ≠ 02:23.
- La columna se llama **«TIEMPO VUELO (HRS)»** (`ENCABEZADO_TIEMPO` =
  «Tiempo vuelo (hrs)»; el CSS de la hoja pone las mayúsculas) y va con **2
  decimales FIJOS** («1.19», «2.38», «1.20») por tramo, en la fila TOTAL y en
  la fila consolidada. Nota al pie `NOTA_TRAMOS`: «Tiempo de vuelo en horas
  decimales (1.50 = 1 h 30 min) e incluye calzos» + lo de siempre. Pantalla y
  PDF dicen lo mismo carácter por carácter (fixtures regenerados).
- **SUMA CUADRADA**: los tramos que se ven suman el total que se ve. Lo
  decide el API (`repartirHorasDecimales` de `tramos-costeados.util.ts`,
  RESIDUO MAYOR: total = Σ exacto redondeado una vez; cada tramo a su piso y
  las centésimas que faltan a los residuos más grandes, empate por orden) y
  lo manda como `breakdown.tramos[].tiempo_horas` +
  `breakdown.tramos_tiempo_total_horas` (y en el payload de `/interno`).
- **Fuente del panel: `tiemposDeTabla(breakdown)`** (`lib/admin/
  quote-sheet-interna.ts`): con `tramos_tiempo_total_horas` LEE lo del API
  (`tiempo_horas` vacío ⇒ «—»); sin él —cotización guardada ANTES del 0.0.33,
  que la hoja pinta desde su `calculo_snapshot` sin llamar al motor, o un API
  previo— reparte con el ESPEJO EXACTO `repartirHorasDecimales` /
  `horasADecimal` (medio hacia arriba en enteros; `toFixed(2)` daría «1.00»
  para 1.005). Es tiempo, no dinero: ningún importe se toca. La celda por fila
  sale del MISMO índice que `tramoCalculado` (una fila que el motor aún no
  calculó sigue en «—»).
- **Paridad**: la MISMA tabla `CASOS_HORAS_DECIMALES` vive en
  `lib/admin/__tests__/quote-sheet-interna.test.ts`, en el spec del API y en
  el pytest de pyservices; y `__tests__/quote-sheet-interna.test.tsx` exige que
  el espejo, sobre un breakdown SIN los campos nuevos, pinte EXACTAMENTE el
  texto de los 5 fixtures (incluido `interna-ptu`, la captura del cliente).
- **Lo que NO cambió**: el campo de captura de horas pactadas
  (`lib/admin/horas.ts`, acepta decimal o h:mm y devuelve h:mm solo cuando el
  valor vino así) y «Horas pactadas 2.4 h». `tiempo_hhmm` /
  `tramos_tiempo_total_hhmm` siguen en los tipos (compatibilidad), pero nadie
  los pinta; `hhmm()` se retiró. Orden de deploy: API → pyservices → panel
  (en cualquier otro orden la tabla también cuadra: panel y pyservices tienen
  el espejo).
- Barrido de otros relojes de TIEMPO DE VUELO (mismo día): el `<details>`
  «Detalle del cálculo (motor)» (`quote-detalle-motor.tsx`) decía «pactado a
  mano (2 h 20 min) · la regla daría …»; el eco en reloj se quitó (el pactado
  ya se lee en decimal, 4 dec., en la misma fila). Quedan A PROPÓSITO: la
  línea viva «= 2 h 20 min · 2.3333 hr × $600.00» de `CampoHorasPactadas` (es
  la CAPTURA, que acepta h:mm) y el «~72 min» de taco-live (promedio
  operativo del tramo en minutos, no un reloj).

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
  EXENTO— con su concepto CANÓNICO y la partición «No causan IVA» activa) e
  **`interna-ptu`** (24-sep-2026: la captura del cliente reconstruida con folio
  ficticio —CUN→PTU→CUN, 125 mi, $746/hr, horas pactadas 2.4— con TIEMPO VUELO
  (HRS) «1.19» + «1.19» = «2.38»). Los
  payloads viajan DOS veces a propósito
  (`__fixtures__/escenarios-interna.ts`): como `interno` y convertidos a
  `breakdown`, para que fixture y pantalla no puedan divergir por una copia mal
  hecha; lo único que va aparte son los EXTRAS CAPTURADOS (el payload solo
  lleva la línea canónica, que ya trae la cuenta dentro: que la pantalla
  reconstruya ese MISMO texto es justo lo que mide el test de edición). Tras
  tocar `cotizacion_interna_pdf.py` hay que **regenerar**, nunca editar los
  HTML a mano.
- **Textos del documento** (espejo de `cotizacion_interna_pdf.py`, en
  `lib/admin/quote-sheet-interna.ts`, PURO + test): `horasADecimal` («1.19»;
  `hhmm` se retiró el 24-sep-2026), `repartirHorasDecimales`,
  `tiemposDeTabla`, `ENCABEZADO_TIEMPO`, `millasTxt` («157.3»), `horasTxt` («1.75 h»), `diaMes` («26-jun»),
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
  (`setFacturaClienteEstatusAction`, `setFacturaClienteFolioAction`,
  `quitarFacturaClienteAction`, `urlFacturaClienteAction`,
  `refrescarFacturaClienteAction`), todas con `revalidateFlight`. **La SUBIDA
  del archivo YA NO es una server action** (24-sep-2026): ver «Factura del
  servicio: FOLIO y subida que no miente» justo abajo.
- **`apiFetch` ya acepta `FormData`** (22-sep-2026): viaja TAL CUAL y SIN
  `Content-Type` —lo pone `fetch` con su `boundary`; fijarlo a mano deja al API
  sin poder separar las partes—. Es el ÚNICO cuerpo que no se serializa; todo
  lo demás sigue yendo como JSON. ~~El límite de las server actions ya estaba
  en 12 MB, así que un archivo de 10 MB pasa~~ — **FALSO en producción**: el
  `bodySizeLimit` de Next sí es 12 MB, pero Vercel corta ANTES (4.5 MB).

### Factura del servicio: FOLIO y subida que no miente (24-sep-2026)

> **SUPERSEDIDO en parte la noche del 24-sep-2026**: la subida suelta
> («Subir factura», `factura-cliente-subir-dialog.tsx`,
> `lib/api/factura-cliente-browser.ts`) se BORRÓ; la factura se registra en
> «Facturas emitidas» (sección al final de este archivo). Lo de abajo sigue
> valiendo para el estatus manual y el archivo/folio LEGADOS.

- Palabras del cliente: «subí la factura de un vuelo, peroooo al momento de
  descargar el reporte en Excel sí aparece la columna de factura (del vuelo)
  pero no aparece el folio de la factura que subí en el registro». Dos
  problemas: (a) el folio no se guardaba en ningún lado (el API 0.0.29 agrega
  `vuelo.factura_folio` / `factura_uuid` y el Excel lo imprime en «FACTURA
  VUELATOUR»); (b) en prod el vuelo **#297** quedó «Facturado» (Mary Cruz,
  23-sep) SIN archivo y con `facturas/vuelos/` VACÍO.
- **Qué pasó con el archivo del #297 — LOGS de Supabase (revisión adversaria
  24-sep, edge_logs + storage_logs, hora Cancún del 23-sep)**: la subida **SÍ
  funcionó**. 14:27:31 cambio de estatus; **14:28:29 `POST storage
  facturas/vuelos/dc204a2f…/33c47a79….pdf` → 200, PDF de 51,220 bytes (50
  KB)** subido por la server action de entonces + `PATCH vuelo` con el path;
  14:32:43 y 14:37:22 se abrió dos veces con «Ver» (URL firmada, Chrome en
  Windows); **14:37:46 «Quitar archivo» (confirmado): `PATCH vuelo` +
  `DELETE storage` del MISMO objeto** (`ObjectRemoved:Delete`); 14:38:11 y
  14:38:18 dos cambios de estatus (queda FACTURADO). No se perdió al subir:
  **se quitó a mano** y el objeto ya no existe (el «Quitar» es borrado duro
  del bucket). Por eso el diálogo de «Quitar» ahora dice que NO se puede
  deshacer. El tope de Vercel de abajo es REAL pero NO fue la causa del #297
  (50 KB); el cambio de camino es endurecimiento para archivos > 4.5 MB.
- **Diagnóstico del camino de subida (medido)**:
  - El tope de 1 MB de las server actions NO era: `next.config.ts` ya lo sube
    a 12 MB y Next 16.2.6 lo lee de `nextConfig.experimental.serverActions`
    (`build/templates/app-page.js` → `server/app-render/action-handler.js`).
  - **Vercel corta el cuerpo de TODA función en 4.5 MB**, antes de Next.
    Medido contra prod el 24-sep: POST de 1 MB a `/api/flights/cobros/<id>/
    recibo` ⇒ 405 (llegó a Next); de 5 MB ⇒ **413 `FUNCTION_PAYLOAD_TOO_LARGE`**
    (text/plain de Vercel). Aplica igual a server actions y a `app/api/**`:
    un proxy tampoco llega a los 10 MB del contrato.
  - Ese 413 no es respuesta RSC ⇒ la server action **LANZA** en el cliente
    (`server-action-reducer.js`: «An unexpected response was received from
    the server» o el text/plain), y `subir()` tenía `try/finally` SIN `catch`,
    llamado con `void`: ningún toast, el botón volvía a «Subir factura» y el
    operador creía que ya estaba. Defecto LATENTE real para archivos > 4.5
    MB (los logs de Supabase descartan que fuera lo del #297: ver arriba).
- **Camino elegido: del NAVEGADOR DIRECTO al API** —
  `lib/api/factura-cliente-browser.ts` (`subirFacturaClienteDirecto`) con
  `apiBrowser` (el JWT de la sesión de Supabase que el navegador YA tiene: el
  mismo mecanismo de `descargarDelApi`, las notificaciones y
  `lib/api/invoices.ts`). Preflight CORS verificado contra prod: `204`,
  `access-control-allow-origin: https://vuelatour-next.vercel.app`,
  `allow-headers: authorization`, `allow-methods …POST…`. El multipart lleva
  SOLO `file` (+ `folio`): el API corre con `forbidNonWhitelisted`. Espera
  máxima 150 s (`TIEMPO_MAX_SUBIDA_MS`) y se dice. Tras una subida
  confirmada, `refrescarFacturaClienteAction` revalida (cuerpo diminuto) +
  `router.refresh()`.
- **Regla de la UI**: «Factura guardada» **SOLO** si el API respondió 200 y el
  bloque trae `archivo` (`confirmarSubida`); cualquier otra cosa dice qué
  pasó y **«La factura NO se guardó.»** (`mensajeFalloSubidaFactura`: 413 con
  el peso del API «El archivo pesa 10.4 MB y el máximo son 10 MB», 400
  `CAMPO_ARCHIVO_INVALIDO`/`SUBIDA_ILEGIBLE`, red, tiempo agotado, 401/403,
  502 de Railway sin inglés, ruta inexistente de un API viejo). El diálogo se
  queda ABIERTO con el motivo en rojo. Nunca lanza.
- **Diálogo «Subir factura»** (`flights/factura-cliente-subir-dialog.tsx`):
  archivo (PDF/XML ≤ 10 MB, peso visible) + **«Folio de la factura»**
  opcional. Con el XML del CFDI el folio se PRELLENA con `datosDeCfdi`
  (espejo EXACTO de `extraerDatosCfdi` del API: `SERIE-FOLIO`, solo Folio si
  pasa de 40, UUID del `TimbreFiscalDigital`, BOM/UTF-16/3.2/entidades) y se
  puede corregir; `folioAEnviar` NO manda el folio cuando es igual al que el
  API sacaría solo del XML (así un XML sin tocar no dispara el 409 mientras la
  migración no esté aplicada). El tecleado gana en el API.
- **Folio en la card** (`flights/factura-cliente-bloque.tsx`): junto al
  archivo, «Folio A-1234 · factura.pdf · subió Itzi · 23 sep»
  (`textoArchivoFactura(archivo, fecha, folio)`), UUID en el tooltip; lápiz
  para corregirlo (`PATCH {folio}` vía `setFacturaClienteFolioAction`) y
  «Agregar folio» **sin archivo** cuando el estatus es Facturado / Elaborada y
  enviada (`ofreceCapturarFolio` — el caso #297). Vaciar un folio que existía
  = BORRAR ⇒ confirma. «Quitar» el archivo NO borra el folio (lo dice).
- **Tolerancia**: `soportaFolio(bloque)` mira la LLAVE `folio` (el 0.0.29 la
  manda siempre, aunque sea `null`). API previo ⇒ ni se ofrece ni se MANDA
  folio (el 0.0.28 respondería 400 a un campo `folio`). API nuevo sin la
  migración `20260924000001` ⇒ PATCH responde 409
  `FACTURA_FOLIO_NO_DISPONIBLE` (su mensaje se pinta tal cual) y la subida
  con folio tecleado se REINTENTA sin folio y avisa
  (`AVISO_FOLIO_NO_DISPONIBLE`): el archivo nunca se pierde por el folio.
- Pruebas: `lib/admin/__tests__/factura-cliente.test.ts` (folio, parser con
  la estructura del XML real FECMID-90255, mensajes: TODO fallo dice «NO se
  guardó»), `lib/api/__tests__/factura-cliente-browser.test.ts` (el CAMINO:
  origen del API, JWT, multipart exacto, PDF de 2.5 y de 6 MB, 413/400/red/
  tiempo/502, reintento sin folio, y que `actions.ts` ya no suba archivos) y
  `flights/__tests__/cobros-card-factura-cliente.test.tsx` (folio junto al
  archivo, «Agregar folio» del #297, API previo sin folio, sin permiso).
- PENDIENTE (mismo tope de 4.5 MB, fuera de este cambio): la factura de UN
  gasto (`expenses/gasto-factura-button.tsx`, base64 por server action con
  tope local de 8 MB ⇒ muere arriba de ~3.3 MB con el mensaje engañoso «No se
  pudo leer el archivo») y la lectura IA de fotos/PDF por server action.
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

## Caja chica: el Excel de lo que se REPONE (24-sep-2026)

- Palabras del cliente: «en el apartado de caja chica, quiero ver si se puede
  al momento de reembolsar la caja de cada uno, me puede arrojar un Excel
  descargable con la información de lo que estoy reembolsando».
- **El Excel lo arma el API 0.0.29 (con pyservices) y el panel SOLO lo
  descarga.** Qué gastos repone cada reposición, en qué orden y con qué saldo
  lo decide `tramoDeReposicion` sobre `historialConSaldo`
  (`common/caja-chica-saldo.util.ts` del API, fuente única del saldo). El
  panel no suma ni resta un peso.
- Endpoints del API (roles **ADMIN / FACTURACION** = `GESTION`):
  `GET /v1/caja-chica/movimientos/:id/reposicion.xlsx` (409
  `MOVIMIENTO_NO_ES_REPOSICION` si es reintegro/ajuste) y
  `GET /v1/caja-chica/fondos/:id/por-reponer.xlsx` (lo pendiente HOY, mismo
  formato). El nombre lo manda el API en `Content-Disposition`: «Reposicion
  caja <responsable> <YYYY-MM-DD>.xlsx» / «Por reponer caja <responsable>
  <hoy Cancún>.xlsx».
- **Proxies** (patrón de los PDF, cookie de sesión, nunca token en el
  cliente): `app/api/caja-chica/movimientos/[id]/reposicion/route.ts` y
  `app/api/caja-chica/fondos/[id]/por-reponer/route.ts`, con
  `proxyArchivoDelApi({tipo: TIPO_XLSX, descargar: true})`, `esUuid` antes de
  llamar al API y `maxDuration = 60` (el render vive en pyservices).
- **Descarga en el navegador**: `lib/descargar-archivo.ts`
  (`descargarArchivoDelPanel`): `fetch` a la MISMA origen, errores del API en
  es-MX (`mensajeDescargaFallida`), el nombre del servidor gana y el blob solo
  se GUARDA con `<a download>` (nunca se abre en pestaña). Nunca lanza.
- **Fuente única** de rutas, nombres de respaldo, roles y textos:
  `lib/admin/caja-chica-excel.ts` (PURO): `rutaExcelReposicion`,
  `rutaExcelPorReponer`, `nombreExcelReposicion`, `nombreExcelPorReponer`,
  `puedeDescargarExcelCaja` (espejo de `GESTION`), `esReposicionDescargable`,
  `reposicionRecienRegistrada` y los textos (`TEXTO_BOTON_POR_REPONER`,
  `TITULO_ICONO_REPOSICION`, `TEXTO_REPOSICION_REGISTRADA`,
  `ETIQUETA_DESCARGAR_DE_NUEVO`, `textoExcelNoDescargado`).
- **Dónde se ve** (`/admin/caja-chica/[id]`, la página lee el rol con
  `getMe()`; sin `/me` o sin rol GESTION no se ofrece nada):
  (a) botón **«Descargar lo pendiente por reponer (Excel)»** junto a
  «Registrar movimiento», para bajarlo ANTES de reponer;
  (b) al **registrar una REPOSICIÓN** (desde el detalle o desde el menú ⋯ de
  la lista: los dos usan `MovimientoDialog`) sale el toast «Reposición
  registrada» con **«Descargar de nuevo»** y el Excel se descarga SOLO
  (`avisarReposicionYDescargar` en `caja-chica/excel-caja-buttons.tsx`); si el
  Excel falla, el error dice que **la reposición SÍ quedó registrada** y
  ofrece «Reintentar» — nunca parece que el dinero no se guardó. Corregir una
  reposición vieja o registrar reintegro/ajuste NO descarga nada;
  (c) en el historial, cada fila **REPOSICIÓN** lleva un ícono de descarga
  (`DescargarReposicionIcon`, `cursor-pointer` + `title`) junto a su menú ⋯.
- **La card «Por reponer» del detalle = la cifra del Excel** (revisión
  adversaria 24-sep-2026, con los 10 fondos REALES de prod): la card
  calculaba `fondo total − saldo actual` por su cuenta y NO coincidía con
  `por-reponer.xlsx` ni con la app cuando el fondo no tiene entregas
  registradas — Diego Ramírez decía **$9,944** en pantalla y **$4,944** en
  el Excel; Gregorio $2,000 contra $0. Hoy la card lee
  `porReponerDeFondo(fondo)` (`lib/admin/caja-chica-excel.ts`): el
  `por_reponer` de la ÚLTIMA fila del historial que manda el API
  (`porReponerCaja`, fuente única; libro vacío ⇒ 0); solo sin ese campo cae a
  la fórmula vieja. Los otros 8 fondos ya coincidían al centavo.
- **Tolerancia**: con el API sin estos endpoints el proxy convierte el 404
  «Cannot GET» en «Esta descarga todavía no está disponible en el servidor…»
  (`RUTA_NO_DISPONIBLE`); la pantalla no cambia de forma.
- Pruebas: `lib/admin/__tests__/caja-chica-excel.test.ts`,
  `lib/__tests__/descargar-archivo.test.ts`,
  `lib/api/__tests__/xlsx-proxy.test.ts` (xlsx `attachment` con el nombre del
  API, JWT solo hacia el API, 409/404 legibles, rutas contra el endpoint
  correcto, uuid inválido sin llamar al API, `maxDuration`) y
  `components/admin/caja-chica/__tests__/excel-caja.test.tsx` (ícono SOLO en
  reposiciones y solo con permiso, botón, toast + descarga automática +
  «Descargar de nuevo», error que dice que la reposición quedó).

## Facturas emitidas, «Necesito factura» y comprobante del cobro (24-sep-2026)

Dos pedidos del mismo día. **Ale**: «necesita las facturas emitidas … las
que hace Mari manualmente … por orden del número de la factura … saber que
ya están emitidas, que no hay unas duplicadas … Mari las estaría adjuntando
en PDF». **Itzi** (audio): «que haya algo que yo marque así como de
necesito factura … y a Mari le salga una alertita … el pendiente de
factura» + «visualmente afuerita nada más diga el número de la factura y ya
si le picas ves el PDF» + «si el cliente me manda su comprobante que se
pueda adjuntar … ahí mismo en ese apartado de cobros». Contrato con el API
0.0.32 (migración `20260924000003_factura_emitida.sql`) y pyservices
(`/facturacion/leer-pdf-emitida`). Las flechas entre cotizaciones son OTRO
cambio (agente NAV).

- **Menú**: «Facturas emitidas» (`/admin/facturas-emitidas`) es el PRIMER
  ítem de Tesorería (ADMIN/FACTURACION) con un **badge ámbar** = vuelos por
  facturar (`hooks/use-conteo-por-facturar.ts`: una sola petición a nivel de
  MÓDULO para las dos instancias de `SidebarNav`, caché 30 s, al cambiar de
  pantalla / volver el foco / cada 120 s / al llegar una notificación / con
  el evento `vt:conteo-por-facturar` que disparan pedir, retirar y
  registrar). Error o 503 ⇒ sin badge (es una pista). La página del PAC
  (`/admin/facturas`) NO cambia: solo su etiqueta pasa a **«Facturación
  automática»** (su H1 sigue diciendo «Facturas»).
- **Fuentes únicas**: tipos `types/facturas-emitidas.ts` (1:1 con el API);
  lógica PURA `lib/admin/facturas-emitidas.ts` (filtros de la URL
  validados, `queryDeFiltros`, `hrefFacturas`, `prellenarSinPisar`,
  `claveCompacta` —ESPEJO del API: el aviso ámbar y el 409 no pueden
  discrepar—, `diferenciasLecturaVsFormulario/VsFactura`, `textoHuecos`,
  `textoSolicitud`, `semaforoDeCobro` (insumos del API + `estadoCobroSemaforo`
  del panel; el `semaforo` del API es para el Excel), permisos,
  `abrirArchivoFirmado`, `mensajeErrorFactura`). Prueba:
  `lib/admin/__tests__/facturas-emitidas.test.ts`.
- **Red**: lecturas del server en `lib/api/facturas-emitidas-server.ts`
  (anti-cap con `limit=500`); **toda subida va del NAVEGADOR DIRECTO al
  API** (`lib/api/facturas-emitidas-browser.ts`: tope de 4.5 MB de Vercel,
  nunca lanza, multipart exacto: alta/edición = `datos` JSON + `pdf` +
  `xml`; leer = `pdf`/`xml`; comprobante = `file`). Lo que no lleva archivo
  son server actions (`app/admin/facturas-emitidas/actions.ts`,
  `solicitarFacturaAction` / `retirarSolicitudFacturaAction` /
  `urlComprobanteCobroAction` en `app/admin/flights/actions.ts`,
  `setResponsablesFacturacionAction` en configuración). Prueba del camino:
  `lib/api/__tests__/facturas-emitidas-browser.test.ts` (sustituye a la de
  `factura-cliente-browser`, que se borró junto con la subida suelta).
- **PDF sin ventana bloqueada**: TODO «Ver PDF» (registro, burbuja, menú,
  archivo legado del vuelo, comprobante sin URL) usa `abrirArchivoFirmado`:
  abre `about:blank` en el MISMO clic y luego le asigna la URL firmada; si el
  navegador no abrió la ventana, toast con «Abrir PDF». Un `window.open`
  después de un `await` lo bloquea Safari.
- **Página** (`app/admin/facturas-emitidas/page.tsx`): arriba **«Por
  facturar (N)»** (`PorFacturarTable`: vuelo con liga a la cotización,
  fecha/ruta, chip de grupo; cliente con sus datos fiscales y «Faltan datos
  fiscales»; total USD y MXN; semáforo; quién/cuándo pidió + nota; «Paga
  contra factura»; «Marcado «Facturado» sin factura registrada»;
  «Registrar factura» con el vuelo —y sus hermanos de grupo pendientes— ya
  elegido; ⋯ «Retirar solicitud» que confirma). `?resaltar=<vuelo>` (link
  de la notificación) pone esa fila primero con anillo ámbar. Luego el
  resumen (chips que filtran; 0 en gris sin liga; totales por moneda;
  HUECOS por razón social + serie, con el aviso de «salto grande» arriba de
  200 faltantes), la barra de filtros en la URL, y la tabla
  (`RegistroFacturasTable`: «Factura ↓/↑» invierte el orden por número,
  Emisor solo con ≥2 razones sociales, semáforo por vuelo, «Sin PDF», chips
  de alerta, menú ⋯ con Editar / Ver PDF / Reemplazar PDF (lee el PDF nuevo
  y pregunta si parece de OTRA factura) / Ver XML / Cancelar (motivo) /
  Reactivar / Quitar PDF / Eliminar registro (motivo)). Sin la migración
  (503) la página pinta una tarjeta ámbar, nunca la pantalla rota; si
  falla la carga, `TarjetaErrorCarga` (nunca «sin datos»).
- **Diálogo «Registrar factura»** (`registrar-factura-dialog.tsx`, también
  `RegistrarFacturaBoton`): soltar PDF (+ XML) ⇒ «Leyendo la factura…» ⇒
  prellenado SIN pisar lo que Mari tocó (la fecha por defecto `todayCancun()`
  sí la reemplaza la del archivo); banner ROJO «Ya está registrada…» con
  «Guardar» deshabilitado; avisos ámbar de la lectura; «El PDF dice A-124 y
  capturaste A-123.» (no bloquea); selector de razón social (con UNA sola
  activa se elige sola; con dos se pide), casilla «Factura parcial»,
  selector de vuelos (`selector-vuelos-factura.tsx`: #folio / día / cliente,
  chips «Por facturar», «Ya tiene A-120», «Cancelado», grupo y «Agregar los
  N del grupo»). Pie STICKY con «Guardar». 409 ⇒ banner rojo junto al botón
  con «Verla en el registro». Edición = solo lo que cambió
  (`cambiosDeEdicion`).
- **«Necesito factura»** (`necesito-factura-dialog.tsx`): nota ≤500, «El
  cliente paga hasta recibir la factura» y, en un grupo, «Pedir para los N
  aviones del grupo» (encendido). El toast dice a quién se avisó. En el ALTA
  de la cotización, `SolicitudFacturaAlta` bajo la TotalBar: al crear la
  cotización se pide la factura ANTES de navegar; si falla, toast que no se
  va solo diciendo que la cotización SÍ se creó.
- **Cards de cobros** (`flights/cobros-card.tsx` y
  `quotes/quote-cobros-card.tsx`): (1) encabezado en tres renglones
  —título (+estado), descripción a todo lo ancho, botones que envuelven—; el
  texto aplastado de la captura venía de `flex-row justify-between` +
  `shrink-0`, y en la cotización además de vivir en UN tercio de la grilla
  (`quote-workspace.tsx` ahora `xl:col-span-2`); (2) montos con
  `fmtMonto`; (3) **burbuja de factura** (`factura-servicio-burbuja.tsx`):
  chip verde «Factura A-123» ⇒ PDF; ámbar «Factura pedida por Itzi · 24 sep
  — pendiente» + «Retirar»; «Sin factura» + «Necesito factura»; «Registrar
  factura» solo ADMIN/FACTURACION; sin `factura_servicio` (API previo o sin
  migración) NO se pinta; (4) en el vuelo, el bloque viejo
  (`factura-cliente-bloque.tsx`) va DEBAJO rotulado «Seguimiento manual»,
  ya no sube archivos ni ofrece «Agregar folio» con el registro; el
  archivo/folio LEGADO se sigue viendo; (5) **comprobante por cobro**
  (`flights/comprobante-cobro.tsx`): miniatura / «PDF» / enlace «HEIC»
  (nunca un `<img>` roto) / «Comprobante» sin URL firmada; «Adjuntar
  comprobante» o «Reemplazar» (confirma y abre el selector en el MISMO
  clic) para oficina; en un sobre de grupo se dice que no se adjunta por
  vuelo. No toca dinero ni lo bloquea el candado de la cotización. Prueba:
  `flights/__tests__/cobros-card-facturas-emitidas.test.tsx`.
- **Listas**: chip ámbar «Por facturar» bajo el semáforo de cobro en
  `/admin/quotes` y `/admin/flights` (`ChipPorFacturar`, campo aditivo
  `factura_servicio_resumen`; ausente/null ⇒ sin chip).
- **Configuración**: «Responsables de facturación»
  (`configuracion/responsables-facturacion-section.tsx`): switches por
  usuario de oficina + «Hoy el aviso le llega a: …»; 503 ⇒ texto gris.
  `ConfiguracionClient` filtra la clave `responsables_facturacion` (es una
  lista, no un switch).
- **DINERO NUNCA CON 1 DECIMAL** (`lib/format.ts`): `fmtUsd` redondea a
  centavos; entero ⇒ «$1,200», con centavos ⇒ EXACTAMENTE 2 («$8,050.40»);
  `-0` ⇒ «$0». `fmtMonto(valor, moneda)` ⇒ «$136,856.80 MXN». Los títulos de
  `estadoCobroSemaforo` usan `fmtUsd`. Misma regla que `fmtDineroTexto` del
  API. Quedan `toLocaleString("en-US")` de dinero fuera de este alcance
  (expediente del piloto, CFDI automático). El PRE-CIERRE ya no
  (revisión del lote 2, 14-oct-2026): su monto por renglón es
  `textoMontoItem` = `fmtMonto(item.monto_usd, "USD")` / `fmtMonto(…,
  "MXN")` / `fmtUsd(item.monto)` y el chip de saldo `fmtUsd(v.saldo_usd)` —
  el renglón «TUA cobrada sin TUA pagada» decía «$172.4 USD» (lo congela
  `tua-incluida-ui.test.tsx`).
- **Orden de deploy recomendado**: migración → API → pyservices → panel. Con
  el panel nuevo y SIN migración, el detalle del vuelo ya no ofrece la
  subida vieja y la burbuja está oculta (la ventana debe ser de minutos).
- **Revisión adversaria (24-sep-2026, noche)** — lo que se corrigió:
  - `claveCompacta` convertía la «Ñ» en «N» (NFD) y el API la CONSERVA: el
    aviso ámbar y el 409 podían discrepar. Ahora es espejo exacto (misma
    tabla que el spec del API).
  - `esNoDisponible` decide por el CÓDIGO `FACTURAS_EMITIDAS_NO_DISPONIBLE`,
    no por el 503 a secas: el 503 de Railway en un deploy (`PARSE_ERROR`) es
    una carga que falló (tarjeta con «Reintentar»), no «falta la migración».
    La sección de responsables tampoco dice «Disponible cuando se habilite…»
    cuando solo no se pudo leer (`fallo`).
  - «Responsables de facturación» solo manda CANDIDATOS: un responsable que
    se dio de baja no tiene switch y reenviarlo daba 400
    `USUARIOS_INVALIDOS` en CADA guardado, sin forma de quitarlo.
  - `datosDeFormulario` recorta `emisor_nombre`/`receptor_nombre` a 300 (el
    del emisor no tiene campo visible: un renglón largo leído del PDF era un
    400 imposible de corregir).
  - Diálogo «Registrar factura»: la lectura lleva TURNO (soltar PDF y luego
    XML ya no deja que la lectura vieja pise a la nueva ni reactive
    «Guardar» a media lectura) y quitar UNO de los dos archivos vuelve a leer
    el que queda (el «ya está registrada» / «El XML dice…» de antes ya no
    describía lo que se iba a subir). El selector de vuelos hidrata sobre lo
    elegido AHORA (un vuelo agregado mientras llegaba la hidratación se
    perdía).
  - Alta de cotización con «El cliente pide factura»: si la llamada misma no
    sale (red), ya no sube al boundary sin toast ni navegación: toast rojo
    que no se va + navega a la cotización que SÍ se creó.
  - «Reemplazar PDF» del menú avisa con un toast mientras revisa y sube (el
    menú no tiene dónde pintar un «Subiendo…»).
  - Comprobante del cobro para SOCIO: sin URL firmada (su lote da 403) se
    pintaba «Comprobante» como botón que pedía la firma al momento… al MISMO
    endpoint de oficina, que también le da 403: fallaba siempre. Ahora dice
    «Con comprobante» sin botón («Solo oficina abre el comprobante»); el
    botón queda para oficina cuando el lote falló.

- **«Por facturar» vs «marcado Facturado a mano» (13-oct-2026, caso #376;
  contrato aditivo del API del lote 0.0.75, invariante 65 del API)**. Caso real: A-0440 ($31,435.91
  MXN ≈ 2 × 904.51 USD) cubría #375 y #376 del mismo cliente y se ligó solo a
  #375; #376 siguió «Por facturar» («Mary dice que ya lo hizo») hasta que el
  13-oct a las 13:21 la ligaron a mano. Lo que cambia en el panel:
  - **Regla del API** (el panel no la recalcula): un vuelo con «Necesito
    factura», sin factura VIGENTE y marcado «Facturado» A MANO sale de la
    bandeja y del badge y viaja aparte en `marcados_sin_registro`
    (`ListaPorFacturar`, misma forma `PorFacturarItem`); el conteo trae
    `marcados_sin_registro` (el badge del menú sigue leyendo SOLO
    `por_facturar`). Todo opcional: con un API previo nada cambia.
  - **Página**: «Por facturar (n)» con `descripcionPorFacturar(...)` (con la
    llave del API nuevo: «…ni están marcados «Facturado» en el vuelo…»; sin
    ella, la frase de siempre) y, DEBAJO y solo si hay, la segunda tarjeta
    «Marcados «Facturado» sin factura registrada (n)»
    (`TITULO_MARCADOS_SIN_REGISTRO` / `DESCRIPCION_MARCADOS_SIN_REGISTRO`) con
    la MISMA `PorFacturarTable` y `syncId="pfm"` (paginación aparte; la
    primera sigue en `"pf"`).
  - **Burbuja** (`factura_servicio.marcado_sin_registro`): chip GRIS
    `textoSolicitudMarcada` («Factura pedida por Itzi · 5 oct — marcada
    «Facturado» en el vuelo, sin factura registrada», tooltip
    `AYUDA_SOLICITUD_MARCADA` + la nota); «Retirar» y «Registrar factura»
    igual. Sin el campo, el chip ámbar de siempre.
  - **Parte B — «Ligar a A-0440»** (`PorFacturarItem.facturas_del_cliente`,
    máx. 3: facturas VIGENTES del mismo cliente NO ligadas a ese vuelo,
    emitidas desde la solicitud − 30 días): la fila dice «El cliente ya tiene
    registrada la factura A-0440 (8 oct · $31,435.91 MXN · vuelo #375). Si
    también cubre este vuelo, lígala.» (`textoFacturaDelCliente`; la fecha es
    un DÍA de pared: `fechaCortaDeDia`, sin corrimiento) y, SOLO para
    ADMIN/FACTURACION, el botón «Ligar a A-0440» (cursor-pointer) que abre la
    confirmación «¿Ligar la factura A-0440 al vuelo #376?» / «La factura
    quedará ligada a los vuelos #375 y #376 y el vuelo saldrá de «Por
    facturar». Si este vuelo lleva su propia factura, usa «Registrar
    factura».» («Cancelar» / «Ligar factura»). **Nunca se liga sola.** La
    llamada `ligarVueloAFactura` (`lib/api/facturas-emitidas-browser.ts`)
    RELEE la factura (`GET /v1/facturas-emitidas/:id`) y manda la UNIÓN en
    `PATCH … datos.vuelo_ids` — ese PATCH REEMPLAZA el conjunto: mandar una
    lista vieja desligaría vuelos —; ya ligada ⇒ ok sin escribir; ya no
    VIGENTE ⇒ error («recarga la página»). Al ligar: toast «Factura A-0440
    ligada al vuelo #376.», los `avisos` del API como `toast.warning` de 10 s,
    `avisarCambioPorFacturar()` y `router.refresh()`.
  - **Pruebas**: `lib/admin/__tests__/facturas-emitidas.test.ts` (textos
    exactos, descripción según el API, Parte B), `facturas-emitidas/
    __tests__/registro-facturas.test.tsx` (`syncId`, cableado de la página,
    línea y botón por rol, confirmación por regex: el diálogo es un portal),
    `flights/__tests__/cobros-card-facturas-emitidas.test.tsx` (chip gris en
    las dos cards; sin el campo, ámbar) y `lib/api/__tests__/
    facturas-emitidas-browser.test.ts` (relee y manda la unión, idempotente,
    no vigente, relectura fallida sin escribir).
  - **Solicitud automática que ya no aplica (API 0.0.77, invariante 60 del
    API; 14-oct-2026)**: chip GRIS en la burbuja (`textoSolicitudYaNoAplica`,
    `AYUDA_SOLICITUD_YA_NO_APLICA`) y TERCERA tarjeta `ya_no_aplican` con el
    ancla `ya-no-aplican` y `syncId="pfy"`; el badge sigue leyendo SOLO
    `por_facturar`. Detalle en «Anticipo devuelto sin CFDI y permisos sin
    avión» (dentro de la sección siguiente).

## Factura obligatoria por la cuenta de cobro (13-oct-2026, invariante 60 del API)

Pendiente del lote del 13-oct (decisión 4 del cliente: un cobro que cae en
HSBC Dólares / HSBC Pesos / Scotiabank Dólares / Scotiabank Pesos EXIGE
factura del servicio). El API ya la aplica (solicitud automática, columna
«FACTURA VUELATOUR», pre-cierre); el panel la DICE. **Sin cambios de API.**

- **Regla espejo PURA** `lib/admin/factura-obligatoria.ts` — **desde el API
  0.0.77 (14-oct-2026) es solo RESPALDO**: la exigencia la decide el API y
  viaja en `factura_servicio.exigencia` y `origenes_exigen`; el panel la
  pinta (`obligatoriaDeBloque`). El espejo queda con la regla del API ≤
  0.0.76 (corre SOLO si la llave falta: skew o rollback) y NO se actualiza a
  la regla nueva (rompería el skew; retirable cuando ya no haya rollback
  posible a ≤ 0.0.76). Ver «Anticipo devuelto sin CFDI y permisos sin
  avión» abajo. La regla del respaldo (copia de
  `common/cuentas-cobro.ts` del API ≤ 0.0.76, con la MISMA tabla de verdad en
  `__tests__/factura-obligatoria.test.ts` y comparación por regex de las dos
  listas contra el repo hermano): la CUENTA manda (las cuatro de banco ⇒ sí;
  Paywise ⇒ no; vacía o fuera del catálogo ⇒ decide el método: link de pago
  HSBC, transferencia y cheque exigen); reembolsos nunca por sí solos; a
  nivel vuelo **por el NETO** de cada cuenta (o método sin cuenta) y moneda
  — un anticipo en HSBC devuelto completo en la misma cuenta ya no exige;
  devuelto en efectivo, en otra cuenta o en otra moneda, sí (USD y MXN
  jamás se suman). No es dinero: es clasificación, con los cobros que la
  card ya tiene.
- **Burbuja de FACTURA** (`factura-servicio-burbuja.tsx`, en las cards de
  cobros del vuelo y de la cotización; props nuevas OPCIONALES `cobros` y
  `facturaRegistradaFuera`): chip rosa «Factura obligatoria: cobro en HSBC
  Pesos» (2+: «cobros en HSBC Pesos y por Transferencia») junto a la
  etiqueta «Factura», con el tooltip `AYUDA_FACTURA_OBLIGATORIA` (y, en un
  vuelo CANCELADO, «Vuelo cancelado: regístrala directo en Facturas
  emitidas.»). Solo mientras NO haya factura registrada: con una emitida
  VIGENTE o registrada por fuera del registro (`facturaRegistradaFuera`:
  CFDI timbrado, folio legado o estatus manual ≠ «Sin factura» — los pasos
  de la cascada del API) la obligación está cumplida y no se anuncia, igual
  que el pre-cierre. «Retirar» la solicitud agrega «Ojo: la factura es
  obligatoria (…); el pre-cierre seguirá marcando el vuelo mientras no se
  registre.». La cotización recibe `facturaRegistradaFuera` de su página
  (snapshot del vuelo) a través de `QuoteWorkspace`. Desde el API 0.0.77 el
  chip sale de `obligatoriaDeBloque(bloque, cobros)` (con la llave
  `exigencia` manda el API; sin ella, el espejo con los cobros de la card) y,
  con `solicitud_ya_no_aplica`, en lugar del chip ámbar va el chip gris «ya
  no aplica».
- **Pre-cierre** (`reportes/pre-cierre-card.tsx` + `lib/admin/pre-cierre-factura.ts`):
  el renglón `vuelos_cobrados_sin_factura` pinta cada vuelo como «#341
  (HSBC Pesos · pedida)» / «#430 (CANCELADO · HSBC Dólares)» (`cuentas`,
  `solicitada` y el aditivo `estado` del API), con title de qué hacer
  («Pídela con «Necesito factura»…», «Ya está en «Por facturar»…» o «Vuelo
  cancelado: regístrala directo…») y liga a la card de cobros del vuelo
  (`/admin/flights/<id>#cobros`). «Resolver →» va a `/admin/facturas-emitidas`.
  El `detalle` y la lectura fallida son los del API.
- **Pruebas**: `lib/admin/__tests__/factura-obligatoria.test.ts`,
  `lib/admin/__tests__/pre-cierre-factura.test.ts` y el describe «FACTURA
  OBLIGATORIA» de `flights/__tests__/cobros-card-facturas-emitidas.test.tsx`
  (cuentas, Paywise, devuelto completo / en efectivo, cumplida por vigente,
  estatus manual, CFDI o la prop de la cotización, cancelado, sin bloque, el
  aviso de «Retirar»).

### Anticipo devuelto sin CFDI y permisos sin avión (14-oct-2026, API 0.0.77)

Decisiones del cliente del 14-oct-2026: «¿Un anticipo devuelto lleva CFDI?»
⇒ «eso no» y «el AFAC lo cargan al Avión» (invariantes 60 y 62 del API). El
API decide TODO (regla 1 por moneda sin T.C.; regla 2 solo en devolución
CRUZADA, con `cobrosEnUsd` del vuelo: dinero que el panel no replica); el
panel lo pinta. Contrato ADITIVO (`types/facturas-emitidas.ts`):
`FacturaServicioBloque` += `exigencia` (EXIGE | NO_EXIGE | SIN_COBROS |
null), `origenes_exigen`, `solicitud_ya_no_aplica` (últimas llaves);
`ListaPorFacturar` += `ya_no_aplican: PorFacturarItem[]`;
`ConteoPorFacturar` += `ya_no_aplican` (el badge sigue leyendo SOLO
`por_facturar`); pre-cierre `cobros_en_cancelados.vuelos[].
diferencia_cambiaria?: true` y el renglón BLOQUEANTE `permisos_sin_avion`.

- **Chip «Factura obligatoria»** (`obligatoriaDeBloque`, PURO): con la
  llave `exigencia` presente MANDA EL API — 'EXIGE' ⇒ el texto de
  `origenes_exigen` (`textoFacturaObligatoriaDeOrigenes`, fuente ÚNICA del
  texto; sin orígenes, «Factura obligatoria» a secas: el API dijo que exige
  y eso no se calla); 'NO_EXIGE', 'SIN_COBROS', `null` («no se pudo leer») o
  un valor desconocido ⇒ nada. Sin la llave (API ≤ 0.0.76) ⇒ el espejo de
  siempre. Así panel y API no dicen cosas opuestas del mismo vuelo en
  ninguna ventana: con el API 0.0.77 y el panel viejo, la burbuja vieja usa
  su espejo unos minutos (un devuelto en efectivo diría «Factura
  obligatoria»; 0 casos en prod).
- **Solicitud AUTOMÁTICA que ya no aplica** (`solicitud_ya_no_aplica`): el
  API pidió la factura SOLA al registrar un cobro en una cuenta que la exige
  y luego el dinero se devolvió (o se corrigió o eliminó el cobro). No se
  retira sola (retirar es destructivo y lo confirma una persona). Burbuja:
  chip GRIS «Factura pedida por Itzi · 5 oct — ya no aplica: el vuelo ya no
  exige factura» (`textoSolicitudYaNoAplica`) con el tooltip
  `AYUDA_SOLICITUD_YA_NO_APLICA` (+ « Nota: …»), «Retirar» para quien puede
  pedir factura y «Registrar factura» para facturación; también en un vuelo
  CANCELADO (el API no mira el estado); «marcada Facturado» GANA (como
  `estadoSolicitud` del API) y con factura VIGENTE va el chip verde.
- **Bandeja** (`app/admin/facturas-emitidas/page.tsx`): tercera tarjeta
  «Solicitudes automáticas que ya no aplican (n)» (`TITULO_YA_NO_APLICAN`,
  `DESCRIPCION_YA_NO_APLICAN`) dentro de la sección «Por facturar», debajo de
  la de los marcados, con `id="ya-no-aplican"` (`ANCLA_YA_NO_APLICAN`,
  `scroll-mt-24`), borde neutro, la MISMA `PorFacturarTable` con
  `syncId="pfy"` y el `resaltar` de los avisos (las TRES tarjetas resaltan la
  fila). Solo con el arreglo presente y no vacío; si «Por facturar» no se
  pudo leer, la tarjeta de error de siempre (nunca «nada pendiente»).
  Revisión del 15-oct-2026: en esa tarjeta lo VISIBLE es «Retirar solicitud»
  (lo que la tarjeta pide, con su confirmación de siempre), «Registrar
  factura» pasa al ⋯ (solo facturación) y NO se sugiere «Ligar a A-0440» (un
  anticipo devuelto no lleva CFDI y su confirmación diría que el vuelo sale de
  «Por facturar», donde no está). En la burbuja, con la solicitud que ya no
  aplica, «Retirar» es el botón principal (outline) y «Registrar factura» va
  en segundo plano (ghost).
- **«Retirar» dice lo que pasa** (`descripcionRetirarSolicitud` /
  `textoSolicitudRetirada`, PUROS; prop `yaNoAplican` de `PorFacturarTable`
  y el `yaNoAplica` de la burbuja): la confirmación de siempre dice «El
  vuelo #341 sale de «Por facturar»…» (byte a byte la de antes), pero una
  que ya no aplica NO está ahí: «La solicitud de factura del vuelo #341 se
  pidió sola y ya no aplica: el vuelo ya no exige factura. Al retirarla se
  borra del vuelo y deja de aparecer en Facturas emitidas.» y el aviso «Se
  retiró la solicitud de factura del vuelo #341.». La llamada a
  `retirarSolicitudFacturaAction` va con `.catch` (red caída o deploy ⇒
  `MSG_SERVIDOR_NO_RESPONDIO`, jamás el error boundary).
- **Avisos del API** (la campana no filtra por tipo): «Ya no aplica: factura
  del vuelo #341» (`factura_solicitud_ya_no_aplica`) enlaza al DETALLE del
  vuelo, `/admin/flights/<id>#cobros` (la card de cobros tiene
  `id="cobros"` y ahí está «Retirar» en CUALQUIER panel — revisión del API:
  con el API 0.0.77 y el panel viejo el ancla de la bandeja no existía);
  «Vuelve a aplicar» (`factura_solicitud_vuelve_a_aplicar`) enlaza a
  `/admin/facturas-emitidas?resaltar=<id>#por-facturar`. El ancla
  `#ya-no-aplican` queda para enlaces a la tarjeta.
- **Pre-cierre** (`reportes/pre-cierre-card.tsx` +
  `lib/admin/pre-cierre-anticipo-afac.ts`, PURO): `permisos_sin_avion`
  (BLOQUEA; `listo` lo manda el API) con «Resolver →»
  `hrefPrecierrePermisosSinAvion` = `/admin/expenses?categoria=PERMISO&
  desde=…&hasta=…` (los permisos del periodo, mismo eje `fecha_gasto` del
  API; el que no tiene avión dice «Falta avión»). El monto del renglón
  (`textoMontoItem`) dice dólares Y pesos cuando el API manda los dos
  («$100.50 USD · $5,000 MXN»; antes solo salían los dólares y los pesos se
  perdían de la vista). `cobros_en_cancelados`: el chip
  «#215 (diferencia cambiaria)» (`ETIQUETA_DIFERENCIA_CAMBIARIA`) con el
  title `AYUDA_DIFERENCIA_CAMBIARIA` cuando el API manda
  `diferencia_cambiaria: true` (solo `true`); sin él, el chip de siempre.
- **Skew / rollback**: con un API ≤ 0.0.76 no llega ninguna llave y todo se
  pinta como antes (el respaldo dice lo mismo que ese API); el panel se
  regresa en cualquier orden. Sin rutas nuevas ni server actions nuevas.
- **No hecho (requiere API)**: el 409 «aceptar el T.C.» para una devolución
  cruzada tecleada a un T.C. bajo (límite conocido de la regla 2 en la
  invariante 60 del API, sin corregir en el 0.0.77) y prellenar el diálogo
  de reembolso con moneda/método/cuenta/T.C. del cobro (pregunta abierta).
- **Pruebas**: `lib/admin/__tests__/factura-obligatoria.test.ts`
  (`textoFacturaObligatoriaDeOrigenes`, `obligatoriaDeBloque` con
  EXIGE / NO_EXIGE / SIN_COBROS / null / desconocido / sin llave, el aviso de
  «Retirar» sin orígenes y la cabecera del respaldo; la tabla de 0.0.76 se
  queda), `lib/admin/__tests__/facturas-emitidas.test.ts` (textos exactos),
  `flights/__tests__/cobros-card-facturas-emitidas.test.tsx` (devuelto en
  efectivo con NO_EXIGE ⇒ sin chip y el control sin llave ⇒ con chip;
  EXIGE con los orígenes del API; null; chip gris con su tooltip, «Retirar»
  y roles; cancelado; precedencias), `facturas-emitidas/__tests__/
  registro-facturas.test.tsx` (`pfy`, `yaNoAplican`, cableado),
  `app/admin/facturas-emitidas/__tests__/ya-no-aplican.test.tsx` (la
  PÁGINA real con el API simulado: tarjeta, ancla, orden, `resaltar`, sin
  llave / vacía / carga caída) y `reportes/__tests__/
  pre-cierre-anticipo-afac.test.tsx` (renglón bloqueante, las dos monedas,
  «Resolver →», el chip de diferencia cambiaria).

## Flechas «‹ Anterior» / «Siguiente ›» entre cotizaciones (24-sep-2026)

Pedido de Itzi (audio): «ya le piqué al vuelo del 20 de septiembre. Y si hay
una flechita arriba, pues me brinca el siguiente vuelito, ya sea de ese mismo
día o … hasta el siguiente día … estando adentro de la cotización me pueda
brincar a la siguiente». Contrato con el API: `GET /v1/quotes/:id/vecinos`
(invariante 28 del API).

- **Qué vuelo es el vecino lo decide el API**: orden CRONOLÓGICO por
  `fecha_vuelo`, empate por folio, con los MISMOS filtros y roles de
  `GET /quotes`. «Siguiente» = el vuelo que SIGUE en el tiempo (mismo día más
  tarde o días después), no el folio siguiente. Como la lista pinta lo más
  reciente ARRIBA, «Siguiente» es la fila de ARRIBA: por eso en `md+` el
  destino se lee sin pasar el mouse («#338 · 19 sep»).
- **Fuente única** `lib/admin/quote-navegacion.ts` (PURA, prueba
  `__tests__/quote-navegacion.test.ts`): `FILTROS_LISTA` (`estado`,
  `cliente_id`, `q`, `grupo_id` y, desde el 13-oct-2026, `desde`/`hasta` —
  ver «Cotizaciones: filtro de fechas de la lista» al final), `filtrosListaDeParams` (valida con
  `estadoFiltro`/`uuidFiltro`; `q` recortada y topada a 100),
  `qsFiltrosLista` (orden fijo), `hrefCotizacion`, `hrefListaCotizaciones`,
  `textoVecino` («#341 · 27 sep · Maqar», fecha Cancún con
  `fechaCortaCancun`), `tituloFlecha`, `MSG_SIN_FECHA` y `direccionDeTecla`.
  La lista (`app/admin/quotes/page.tsx`) y el detalle leen los filtros con la
  MISMA función —la lista también le pide al API con ellos—: si divergen, la
  flecha recorre otra cosa que la lista de donde vino.
- **La liga lleva los filtros**: `QuoteListRow.href` se arma en el SERVER
  (`hrefCotizacion(q.id, qsFiltrosLista(filtros))`) porque las `columns` de
  `quotes-table.tsx` son una constante de módulo; `rowHref` y el folio usan
  `q.href`. `/admin/quotes/[id]/revise` redirige CONSERVANDO el query string.
- **Detalle** (`app/admin/quotes/[id]/page.tsx`): `getQuoteVecinos`
  (`lib/api/quotes-server.ts`, en paralelo con la cotización) envuelto en
  `degradado.opcional("la navegación entre cotizaciones", …, null)`; 404
  (API previo) y 403 ⇒ `null` en silencio; otro fallo ⇒ aviso y SIN flechas —
  nunca «no hay siguiente» por una lectura que falló. `QuoteWorkspace` lleva
  `key={quote.id}`: al brincar (misma ruta, otro id) el cotizador jamás
  conserva el formulario de la cotización anterior.
- **Componente** `components/admin/quotes/quote-navegacion.tsx`, en la
  primera fila de la cabecera del workspace, a la derecha del `BackLink` (cuyo
  href ahora es `/admin/quotes?<filtros>`). Estilo de los botones de día de
  `/admin/taco-live`. Reglas:
  - Las flechas son `<Link replace>` (un `<a href>`), **nunca**
    `router.push`: `useCambiosSinGuardar` intercepta en captura todo clic en
    un `<a>` interno y pide «Salir sin guardar». `replace` = brincar no apila
    historial, así «← Cotizaciones» y el «atrás» del navegador regresan a la
    LISTA (con sus filtros, búsqueda y página), no a la cotización anterior.
  - Prefetch de las dos vecinas al montar (`router.prefetch`).
  - Sin vecino ⇒ `<span aria-disabled>` apagada con «No hay un vuelo anterior
    con estos filtros»; sin fecha ⇒ las dos apagadas con «Esta cotización no
    tiene fecha de vuelo: ponle fecha para brincar entre vuelos.» (subtítulo
    visible «Sin fecha» en `md+`).
  - Atajo ←/→ sin modificadores: solo si el foco NO está en un
    input/textarea/select/contenteditable ni en un control con flechas
    propias (pestañas, radios, listas) y no hay diálogo/menú abiertos; dispara
    el MISMO clic del enlace (pasa por el guard).
- **Diferencias documentadas**: la búsqueda rápida LOCAL de la tabla (`tq`) y
  su página (`tp`) NO viajan a las flechas (filtran en el navegador; el API no
  las conoce) — solo los filtros de la barra. Con `?q=` de puros espacios la
  lista ya no manda el filtro (antes el API lo volvía un filtro que dejaba
  pasar casi todo).
- Pruebas: `lib/admin/__tests__/quote-navegacion.test.ts` (filtros, URL de
  ida y vuelta, textos, día Cancún, atajo) y
  `components/admin/quotes/__tests__/quote-navegacion.test.tsx` (marcado de
  las flechas y el CABLEADO lista → detalle → workspace → /revise).
- **Orden de deploy**: API antes que panel (con un API previo el detalle
  recibe 404 en `vecinos` y simplemente no pinta flechas).

## Ingresos (24-sep-2026)

Pedido del cliente: «faltarían las categorías de "ingresos" de igual manera
de como están ya ahorita las de "gastos" … •Otros Ingresos •Anticipos y
depósitos •Ingresos en cuentas de banco». Usuario: «que tengamos un espacio
para ingresos como en Gastos y podamos conciliar como los gastos pero ahora
los ingresos subiendo un estado de cuenta y con IA marcar los que sí empatan
con los cobros de los vuelos … y la sección de ingresos para registrar otros
ingresos». Contrato INGRESOS con el API 0.0.34 (migración
`20260924000004_ingresos.sql`) y pyservices (`/conciliacion/sugerir-abonos`).

- **Menú**: «Ingresos» (`/admin/ingresos`, ícono `ArrowTrendingUpIcon`) va
  JUSTO ANTES de «Gastos» con sus MISMOS roles (ADMIN, COORDINADOR,
  FACTURACION). Congelado en `lib/admin/__tests__/ingresos-ui.test.ts`.
- **Reglas de dinero (las decide el API, el panel solo pinta)**:
  - Tabla nueva `ingreso` para lo que NO es cobro de vuelo. Los cobros de
    vuelo se siguen registrando en el vuelo; en Ingresos se LISTAN en solo
    lectura.
  - **Anticipo** = dinero de un cliente ANTES de que exista su vuelo
    (`ANTICIPO_CLIENTE`, fuera de resultados). «Aplicar a vuelo» crea un
    cobro NORMAL del vuelo ligado al anticipo (cuenta por `cobrosEnUsd`:
    bandera cobrado, calendario «Pagado», reparto). Su saldo lo garantiza un
    trigger; la liga cobro↔anticipo es INMUTABLE (para corregir: desaplicar y
    volver a aplicar).
  - **Un ingreso de resultado nunca es el pago de un vuelo**: vuelo solo en
    «Reembolsos y devoluciones recibidos»; desde un abono la categoría llega
    VACÍA si el API no sugiere una (jamás «Otros ingresos» por default) y el
    409 `ABONO_TIENE_COBRO_CANDIDATO` ofrece «Vincular a este cobro» antes de
    «No, es otro dinero: registrar de todos modos».
  - El resumen suma montos NOMINALES por moneda (nunca convierte). El total se
    rotula «Dinero que entró» (no es utilidad: incluye anticipos y
    préstamos) y los cobros que salieron de un anticipo NO se suman otra vez.
- **Fuentes únicas**: tipos `types/ingresos.ts` (COPIA EXACTA de
  `ingresos.types.ts` del API, §4 del contrato); categorías
  `lib/admin/categorias-ingreso.ts` (MISMOS nombres de export y textos que
  `common/categoria-ingreso.util.ts` del API; el test congela la tabla
  literal y los nombres); lógica PURA `lib/admin/ingresos-ui.ts` (pestañas y
  roles, filtros de la URL validados, `hrefIngresos`, queries EXACTAS por
  pestaña —el API corre con `forbidNonWhitelisted`—, badges
  `etiquetaEstadoConciliacion`, motivos `etiquetaMotivoAbono`,
  `mensajeErrorIngreso` con el fallback por code de la tabla §10, el
  formulario (`formularioDesdeAbono`, `erroresFormularioIngreso`,
  `datosAltaDeFormulario`, `cambiosDeEdicion`), `montoDefaultAplicacion`, los
  textos de confirmación, `preseleccionada`, `aceptarEnLote` y la bitácora).
  Ningún componente redacta estos textos a mano.
- **Red**: lecturas del server en `lib/api/ingresos-server.ts` (anti-cap:
  pagina de 200 en 200 hasta `total`, tope 5,000, `huboCorte` se AVISA); el
  ALTA y la EDICIÓN con comprobante van del NAVEGADOR DIRECTO al API
  (`lib/api/ingresos-browser.ts`: tope de 4.5 MB de Vercel, multipart
  `datos` JSON + `archivo`, nunca lanza, espera 150 s, solo celebra si el API
  devolvió el ingreso); lo demás son server actions
  (`app/admin/ingresos/actions.ts`, nunca lanzan, revalidan Ingresos,
  Conciliación y el vuelo). El Excel sale por el proxy
  `app/api/ingresos/export` (`proxyArchivoDelApi` + `TIPO_XLSX`, solo reenvía
  parámetros conocidos y válidos, `maxDuration = 60`).
- **Página** (`app/admin/ingresos/page.tsx`, **`maxDuration = 300`**: «Sugerir
  con IA» y «Subir estado de cuenta» son server actions invocadas desde aquí y
  heredan el límite del segmento — test `ingresos-page.test.ts`): resumen por
  moneda → pestañas (chips que conservan filtros) → filtros → lista.
  «Todos» / «Cobros de vuelos» (entradas: vuelo con liga, cobro de anticipo en
  gris con «Del anticipo ING-12», reembolsos en rojo), «Otros ingresos»
  (categoría + destino en verde, comprobante, menú Ver · Editar · Ver
  comprobante · Dar de baja), «Anticipos» (con saldo por default + «Depósitos
  de vuelos que aún no vuelan», SOLO LECTURA, para que nadie los vuelva a
  registrar como anticipo) y «Por conciliar» (ADMIN/FACTURACION: abonos del
  banco sin identificar con motivo, «Cliente: …», «¿Duplicado?» y el menú en
  orden: Vincular · Es el pago de un vuelo · Es un anticipo · Otro ingreso ·
  Traspaso · Reverso · Sugerir con IA; barra con «Cruzar pendientes»
  (`AutoMatchButton tipo="ABONO"`) y «Sugerir con IA (pendientes)»). Sin la
  migración (503 `INGRESOS_NO_DISPONIBLE`) o con un API previo (404 «Cannot
  GET») la página pinta una tarjeta ámbar, nunca la pantalla rota. El
  detalle (`?ingreso=<uuid>`) es un Sheet con ficha, conciliación
  («Desvincular del abono»; desde el API 0.0.78, para ADMIN/FACTURACION,
  EMBEBE el cuerpo de la hoja «Conciliación con el banco»), aplicaciones
  («Desaplicar»), comprobante y bitácora; desvincular y desaplicar solo
  ADMIN/FACTURACION y confirman. Desde el 0.0.78 el badge «Conciliación» de
  cada lista abre esa hoja: ver «Ingresos: «Conciliado» abre su conciliación
  con el banco».
- **Diálogos**: `registrar-ingreso-dialog` (DIVULGACIÓN PROGRESIVA: a la
  vista categoría, fecha, concepto, monto, «¿Dónde entró el dinero?», cliente
  o «Quién pagó», comprobante —desde el 13-oct-2026 también «Avión
  (opcional)» en las categorías de resultado: ver «Ingreso asignado a un
  avión»—; el resto en «Más datos»; `client_request_id`
  por apertura, el MISMO en los reintentos de confirmación);
  `aplicar-anticipo-dialog` (monto sugerido = menor entre saldos, confirm con
  el texto exacto, 409 `ANTICIPO_OTRO_CLIENTE` ⇒ segundo confirm con la misma
  llave); `cobro-desde-abono-dialog` («Es el pago de un vuelo»: registra el
  cobro y lo concilia en UNA operación del API; su aviso ámbar «el neto no
  cuadra» es `netoNoCuadraConAbono`: con comisión tecleada avisa si el NETO
  no cuadra aunque el bruto sí —el 409 COMISION_NO_CUADRA del API 0.0.78—,
  revisión 2 del 15-oct-2026; el veredicto sigue siendo el 409); `vincular-abono-dialog`
  (cobros, sobres e INGRESOS; ★ exactos; un ingreso de otra cuenta se ve pero
  no se elige; desde el API 0.0.78, con UN cobro marcado manda el veredicto
  `al_vincular` del API: ver «Cobros: un cobro con varios abonos…»);
  `sugerencias-abonos-dialog` (la IA PROPONE, nada se liga
  solo; solo van marcadas las ligas con `monto_exacto` y confianza ≥ 85 % y
  las clasificaciones por regla; un posible duplicado nunca; «Aceptar las
  marcadas» confirma y corre SECUENCIAL; `disponible=false` dice que el
  asistente no estuvo, nunca «no encontró nada»); `baja-ingreso-dialog`
  (motivo 5..500).
- **Pantallas existentes**: Conciliación pinta «Ingreso ING-12 · categoría»
  con liga, desvincula por `PATCH movimientos/:id/ingreso` y ofrece
  «Conciliar en Ingresos» en los abonos pendientes; «Cobros sin banco» marca
  «Del anticipo ING-12» (se concilia el anticipo, no el cobro); las cards de
  cobros del vuelo y de la cotización pintan el chip y cambian «Eliminar» por
  «Desaplicar» (ADMIN/FACTURACION, confirma «el monto regresa al saldo del
  anticipo»); la card del vuelo muestra el **banner** «Este cliente tiene un
  anticipo con saldo…» + «Aplicar anticipo» (pista: sin permiso, sin la
  migración o con un API previo no se pinta nada); Configuración → Consumo de
  IA nombra `CONCILIACION_ABONOS_SUGERIR`. `ImportButton` acepta `label`
  («Subir estado de cuenta» en Ingresos). La importación y «Cruzar
  pendientes» revalidan también `/admin/ingresos`.
- **Tolerancia**: todos los campos nuevos en tipos existentes son OPCIONALES
  (`MovimientoBancario.ingreso_id/ingreso`, `CandidatosCobroResponse.ingresos`,
  `CobroSinBanco.anticipo`, `FlightCobro.anticipo/conciliado_via`): con un
  API previo las pantallas quedan como estaban. `tipo` de «Cruzar
  pendientes» solo viaja cuando se pide (con un API previo sería un 400).
- **Pruebas**: `lib/admin/__tests__/categorias-ingreso.test.ts`,
  `ingresos-ui.test.ts`, `ingresos-page.test.ts`,
  `lib/api/__tests__/ingresos-browser.test.ts`,
  `components/admin/ingresos/__tests__/ingresos-pantalla.test.tsx` (caso real
  #235: «Sin candidato automático · 1 con el monto exacto» + «Cliente: Cristy
  Chavez») y `components/admin/flights/__tests__/cobros-card-anticipo.test.tsx`.
- **Orden de deploy**: migración → API 0.0.34 → pyservices → panel.
- **Revisión adversaria (24-sep-2026, noche)** — lo que se corrigió:
  - La IA puede sugerir «Otros ingresos» o «Anticipo» y «Aceptar» un
    REGISTRAR_INGRESO abría el alta con esa categoría YA elegida: el default
    que el contrato prohíbe. `formularioDesdeAbono` jamás prellena esas dos
    (solo «Es un anticipo» del menú la FUERZA); el alta dice la sugerencia en
    el hint para que el operador la elija a mano.
  - Tres diálogos pintaban «sin datos» cuando la lectura FALLÓ: «Vincular»
    («Sin cobros ni ingresos candidatos» ⇒ el operador lo registraba como
    ingreso), «Aplicar anticipo» («Este cliente no tiene vuelos todavía») y
    «Es el pago de un vuelo» («El cliente sugerido no tiene vuelos»). Ahora
    dicen que no se pudo leer y ofrecen «Reintentar» o buscar por folio.
  - «Ver vuelos de otros clientes» del anticipo buscaba SIN el cliente del
    anticipo: el API no marcaba `es_otro_cliente` y todos salían como del
    mismo cliente. `vuelosCandidatosAction` ya no pregunta con alcance «todos»
    y `q` < 2 aunque haya cliente (400 `BUSQUEDA_CORTA`).
  - `?hasta=` de un mes anterior sin `desde` ⇒ desde = día 1 del mes corriente
    > hasta ⇒ 400 y la lista caía en «No se pudo cargar». Hoy desde = día 1 del
    mes de `hasta`.
  - «Conciliar en Ingresos» (Conciliación), el chip «Del anticipo ING-n»
    (Cobros sin banco) y «concílialo en «Por conciliar»» (detalle) llevaban a
    «Por conciliar» del MES CORRIENTE: el abono de otro mes no aparecía. Ahora
    llevan el día/cuenta del abono, el detalle del anticipo y la ventana del
    ingreso (−7/+30 días), respectivamente.
  - Una comisión vigente de 0 contaba como «cambió» (`null` ≠ 0): editar las
    notas de un ingreso CONCILIADO respondía 409 `INGRESO_CONCILIADO`.
  - Errores del API cuyo campo vive en «Más datos» (`TC_REQUERIDO`,
    `COMISION_INVALIDA`, vuelo/gasto…) despliegan el plegable; el resumen dice
    por qué falta (también `PERIODO_MUY_GRANDE`); textos de la bitácora =
    copia EXACTA del API; menú de fila de Conciliación con `cursor-pointer`.

## Inventario: UTILIDAD de la tienda y UBICACIÓN (25-sep-2026)

> **SUPERSEDIDO en parte el mismo 25-sep (API 0.0.36)**: el costo ya NO es
> FIFO sino el ÚLTIMO PRECIO DE COMPRA, la utilidad cuenta en PESOS (T.C.
> oficial del día de la venta), la card «Utilidad por salida» se RETIRÓ y la
> ficha del producto es la sencilla. Ver «Inventario: último precio de compra,
> T.C. del día y ficha sencilla» al final de este archivo. Ubicaciones, orden
> y «Mover a…» siguen como aquí se describen.

Pedido del cliente (captura de `/admin/inventory`): «Producto | Categoría |
Stock | Utilidad (de los productos que compramos, el precio que le ponemos en
el costo se le saca el 25 % el cual va a ser nuestra utilidad por producto
vendido o cargado a un avión). Ya echamos a andar la venta de VuelaTour, que
viene siendo la "tienda"… necesitamos ver las ganancias de dichos productos. Y
aprovechar poner una columna de ubicación: la Oficina vieja, la oficina nueva,
el locker del aeropuerto, la bodega del taller de Mérida, nuestra bodega en el
taller de Cozumel». Contrato con el API **0.0.35** (migraciones
`20260925000001_inventario_ubicacion_margen.sql` y
`20260925000002_repreciar_salidas_tienda.sql`) y pyservices (hoja
«inventario» del Balance general).

- **La regla es del API, el panel solo PINTA.** Toda SALIDA a un avión sin
  precio se cobra a costo FIFO × (1 + margen) —25 % por defecto, clave
  `inventario_margen_venta_pct` de Configuración—; el precio tecleado en la
  salida o el `precio_venta` del producto siguen ganando; **0 explícito = a
  costo**. Utilidad = venta − costo FIFO con la fuente única del API
  (`inventario-cardex.util.ts#ventaDeSalida`, la MISMA del Balance general).
  El panel **jamás** recalcula utilidad ni FIFO; solo suma la MISMA moneda
  (como el valorizado). **Pesos y dólares NUNCA se suman** (invariante 8): la
  bodega casi entera se compró en USD sin T.C. y por eso la utilidad de hoy es
  toda en dólares (+535.35 USD tras el re-precio de las 10 salidas del 01-sep).
- **Lista** (`inventory/items-table.tsx`): **Producto · Categoría · Stock ·
  Utilidad · Ubicación · ⋯**, los atajos de siempre («A–Z · Se están acabando
  primero · Más stock») y encabezados ordenables (Utilidad y Ubicación
  incluidos). Celda Utilidad = una línea por moneda (`lineasUtilidad`: «+$191.25
  USD», «+$1,200.00 MXN», o ambas), «—» sin ventas, tooltip `tituloUtilidad`
  («66 unidades cargadas a aviones (30 a costo, sin utilidad) · margen vigente
  25 % sobre el costo») y triángulo ámbar SOLO con `avisoUtilidad` (entradas a
  $0, ventas no calculables). «sin TC» ya NO se avisa en esa celda cuando hay
  utilidad en USD (con un API previo sí, como antes).
- **Orden** (`lib/admin/inventario-orden.ts`): `utilidad(-desc)` y
  `ubicacion(-desc)`. **Alias**: `?orden=ganancia` / `ganancia-desc` (enlaces
  viejos) = `utilidad` / `utilidad-desc`. Utilidad: primero los que tienen
  pesos (por monto), luego los que solo tienen dólares (por monto) — sin T.C.
  no se comparan —, sin utilidad AL FINAL. Ubicación: catálogo por su `orden`
  → texto anterior A–Z → sin ubicación AL FINAL (desc invierte catálogo/legado).
- **Tarjeta «Utilidad de la tienda»** (`inventory/utilidad-tienda-card.tsx`,
  cliente): `GET /v1/inventory/tienda/resumen?desde&hasta` (`getTiendaResumen`,
  nunca lanza; null ⇒ respaldo con `utilidad_total_mxn/usd` de la lista y Σ
  `ventas_cant`). Chips **Todo · Este mes · Mes pasado** (`?periodo=`, días
  Cancún con `rangoPeriodoTienda(periodo, todayCancun())`) que son Links armados
  desde la URL VIVA (conservan orden, filtro y búsqueda; sueltan `tp`). El
  periodo acota también la columna Utilidad (`listInventarioTodo({desde,
  hasta})`); stock y valorizado son siempre de todo el cardex. Botón «Excel» →
  `/v1/inventory/items/export` con `desde/hasta` y, SOLO con catálogo, el
  `ubicacion` vigente (un API previo respondería 400). La «ganancia acumulada»
  de la cabecera se retiró.
- **UBICACIÓN** (`lib/admin/inventario-ubicacion.ts`, PURO + test): catálogo
  `inventario_ubicacion` (Oficina vieja · Oficina nueva · Locker del aeropuerto
  · Bodega del taller de Mérida · Bodega del taller de Cozumel). El texto libre
  de siempre (`ubicacion`: «Bodega Cancún» ×69, «Corner»…) es LEGADO y **no se
  adivina su mapeo**: `textoUbicacion(it)` ⇒ `CATALOGO` (nombre) · `LEGADO`
  («Bodega Cancún **(anterior)**» en ámbar, title «Elige la ubicación nueva») ·
  `VACIA` («Sin ubicación» tenue) · `TEXTO` (la llave `ubicacion_id` NO vino =
  API previo o migración pendiente ⇒ el texto tal cual, sin ámbar).
- **Herramientas** (solo con el catálogo `disponible`; `listUbicaciones` nunca
  lanza: 404 o 503 `MIGRACION_PENDIENTE` ⇒ `disponible:false`; otro fallo ⇒
  `falla:true` + aviso «No se pudieron cargar las ubicaciones»): select
  **«Ubicación: Todas · Sin ubicación nueva (N) · Oficina vieja (N) · …»**
  (`?ubic=`, filtro PURO en el navegador sobre la bodega completa, con la misma
  regla de URL viva que el orden: `resolverFiltroUbicacion`); vista vacía ⇒
  «No hay productos en «X»» + «Ver todas las ubicaciones» (nunca «Sin
  resultados para “”»). ADMIN/MECANICO (roles del API): **«Mover a…»**
  (`mover-ubicacion-dialog.tsx`) sobre las filas VISIBLES tras filtro +
  búsqueda (DataTable `alCambiarFiltradas`), el diálogo ES la confirmación
  (`textoConfirmarMover`: «Se moverán 12 productos a «Oficina nueva»: … y 7
  más. No mueve stock ni dinero.»), tope 500, toast `textoResultadoMover`.
  El conteo y la muestra son SOLO los que cambian (`particionMover`): los que
  ya están en el destino se dicen aparte («(3 ya están ahí)») y, si son todos,
  `textoNadaQueMover` y el botón se apaga (revisión adversaria 25-sep: decía
  «Se moverán 12» cuando solo cambiaban 9). Viajan TODOS los ids de la vista:
  si el panel trae un dato viejo, el API decide con `sin_cambio`; y
  **«Ubicaciones»** (`ubicaciones-dialog.tsx`): agregar, renombrar (propaga a
  sus productos), ↑/↓ (dos PATCH, `intercambioOrden`), activar/desactivar con
  confirmación inline; desactivar deshabilitado con productos («Mueve primero
  sus N productos a otra ubicación»). ~~Sin borrar: se desactiva.~~ **Desde el
  28-sep-2026 (API 0.0.38) SÍ se elimina** —solo sin productos— y ▲▼ es UNA
  llamada: ver «Inventario: ubicaciones rápidas desde el formulario» al final.
  Duplicados sin acentos ni mayúsculas se frenan antes
  (`errorNombreUbicacion`); el 409 del API se pinta tal cual.
- **Formulario del producto** (`item-form-dialog.tsx`): con catálogo, select
  «Ubicación» (Sin ubicación + activas en su orden + la actual aunque esté
  inactiva, «(inactiva)», deshabilitada). Legado ⇒ nota ámbar «Ubicación
  anterior: «Bodega Cancún». Elige la ubicación nueva.» — va en el `hint` de
  `Field`, NUNCA junto al select en un Fragment: `Field` clona a su único
  hijo para ponerle el id del label, y con un Fragment React avisa «Invalid
  prop `id` supplied to React.Fragment» y la etiqueta queda sin ligar. Viaja SOLO
  `ubicacion_id` (jamás el texto): en el alta si se eligió; al editar SOLO si
  cambió (uuid, o `null` = «Sin ubicación»). Sin catálogo, el input de texto de
  siempre y ningún `ubicacion_id`. Props opcionales `ubicaciones` y
  `margenVentaPct` (skew-safe) viajan por `ItemsTable → ItemActions`,
  `ItemCreateButton` y `CodigoSearch`.
- **SALIDA (CRÍTICO)** — `lib/admin/inventario-salida.ts#ventaDelFormulario`:
  el diálogo de antes mandaba `venta_unitaria: "0"` con el precio vacío; con
  el API nuevo eso dejaría TODA salida del panel a costo (sin utilidad). Ahora
  vacío ⇒ se OMITEN `venta_unitaria` y `venta_moneda` (el API aplica el precio
  del producto o costo + margen) y la casilla **«Cargar a costo, sin
  utilidad»** manda `0` y deshabilita el precio. Placeholder «Vacío = costo FIFO
  + 25 %» / «Vacío = precio del producto». Toast `textoSalidaRegistrada` con
  `gasto_generado` + `venta_origen`: «Salida registrada: se cargó $318.75 USD a
  XA-VGV (costo + 25 %).» (sin `venta_origen` = API previo ⇒ «precio de venta»
  / «costo FIFO»). Cableado vigilado en
  `inventory/__tests__/utilidad-por-salida.test.tsx`. **Orden de deploy: API
  antes que panel** — con el panel VIEJO y el API nuevo, las salidas sin precio
  quedan a costo; con el panel nuevo y el API VIEJO, vaciar el precio ya no
  fuerza «a costo» (usa el del producto): para eso está la casilla.
- **Detalle del producto**: ubicación con `textoUbicacion` (adiós al fallback
  «Bodega Cancún»); «Precio de venta» = `textoPrecioVentaProducto` («Costo FIFO
  + 25 %» sin precio con el API nuevo; «A costo FIFO» con uno previo); card
  nueva **«Utilidad por salida»** (`utilidad-por-salida.tsx`: Fecha · Avión ·
  Cantidad · Costo · Venta · Utilidad, cada monto con su moneda vía
  `filaUtilidadSalida`; a costo ⇒ «A costo · sin utilidad»; incompleta ⇒ ámbar
  «no calculable: venta en pesos sobre costo en dólares sin T.C.»; pie con la
  utilidad por moneda). `resumen-producto.tsx` pinta «utilidad +$63.75 USD» en
  VENTAS (ya no «sin TC · utilidad no calculable» cuando hay `ganancia_usd`) y
  la línea USD en totales y por día; `cardex-table.tsx` («Utilidad») pinta
  `ganancia_usd` cuando `ganancia_mxn` es null.
- **Configuración**: `NUMERICAS_UI.inventario_margen_venta_pct` («Utilidad de
  la tienda (margen sobre el costo)», `%`, `max: 100`, `step: 0.5`); la meta
  numérica ganó `max`/`step` opcionales y el mensaje «Captura un número de 0 a
  100.». El API responde 400 `VALOR_FUERA_DE_RANGO` si se cuela.
- **Textos**: TODOS en `lib/admin/inventario-utilidad.ts`,
  `inventario-ubicacion.ts` e `inventario-salida.ts` (puros + test). Ningún
  componente redacta estas frases. `textoMonto` escribe SIEMPRE la moneda
  («+$63.75 USD», «−$10.00 MXN», «$0 USD»; menos tipográfico).
- **Pruebas**: `lib/admin/__tests__/inventario-utilidad.test.ts` (textos,
  periodos Cancún con cruce de año y febrero, filas REALES del aceite),
  `inventario-ubicacion.test.ts`, `inventario-orden.test.ts` (utilidad
  pesos→dólares→nulos, ubicación catálogo→legado→sin, alias `ganancia`),
  `inventario-salida.test.ts` (vacío ⇒ omitido; a costo ⇒ 0; precio ⇒ número +
  moneda), `inventory/__tests__/items-table-orden.test.tsx` (columnas en su
  orden, `?orden=ganancia`, filtro, «(anterior)», permisos),
  `utilidad-tienda-card.test.tsx` y `utilidad-por-salida.test.tsx`.
- **Pendientes conocidos**: la app Flutter no se tocó (sigue con ubicación de
  texto libre ⇒ lo que no coincida con el catálogo queda «(anterior)»; su
  salida ya omite el precio vacío, así que el margen le aplica solo). Los 72
  productos arrancan «(anterior)» hasta que la oficina los mueva con «Sin
  ubicación nueva» + «Mover a…».

## Inventario: último precio de compra, T.C. del día y ficha sencilla (25-sep-2026)

Pedido del cliente (capturas de `/admin/inventory/<id>`): «al entrar algún
producto nos están llenando de información repetida 😅 … Solo necesitamos el
apartado de: Compras | Ventas | Resumen de ventas» · «En el tipo de cambio, que
sea los mismos que usan en las cotizaciones (Tipo de cambio del día de la
venta)» · «la hoja de información del producto debe ser mucho más sencilla: la
descripción detallada · a cuánto se ha comprado · en cuánto se ha estado
vendiendo · dinero generado por ese producto» · «que los precios se ajusten en
automático al último registrado … el remanente que teníamos de agosto ahora
igual su costo de 30 DLS». Contrato con el API **0.0.36** (migración de DATOS
`20260925000003_inventario_tc_oficial_movimientos.sql`) y pyservices.

- **Las reglas son del API (fuente única `inventario-cardex.util.ts`); el
  panel SOLO pinta.** (1) COSTO = ÚLTIMO PRECIO DE COMPRA: la ENTRADA con costo
  > 0 más reciente; cada SALIDA **congela** en su fila el costo vigente de su
  fecha (lo ya cobrado nunca se mueve). (2) T.C. = el OFICIAL del día (la misma
  función del cotizador, `TipoCambioService.oficialDetallePara`): compras al de
  su día, venta Y costo de una salida al del día de la VENTA, valorizado al de
  HOY. (3) La utilidad cuenta en PESOS; el dólar original (`*_usd_original`) es
  dato secundario y **jamás se suma**. `utilidad_usd`/`ventas_usd` quedan solo
  para filas que sigan SIN T.C. El panel no calcula costo, T.C., utilidad ni
  sumas entre monedas (lo único que suma es la MISMA moneda en
  `listInventarioTodo`, como siempre).
- **Ficha** (`app/admin/inventory/[id]/page.tsx`): cabecera (categoría ·
  marca, nombre, parte · código · ubicación con «(anterior)» en ámbar,
  DESCRIPCIÓN completa y «Aeronave / uso» en su renglón vía
  `partirDescripcion`) con **Registrar movimiento · Cardex (Excel) · Editar**.
  «Editar» = `inventory/item-edit-button.tsx` → el MISMO `ItemFormDialog` en
  edición (NUNCA el menú de `ItemActions`, que trae «Salida» duplicada y
  «Desactivar») + `router.refresh()` (prop nueva opcional `onGuardado`). La
  página carga `listUbicaciones({incluirInactivas:true})` para ese diálogo.
  Cuerpo: `<ResumenProducto>` = **COMPRAS | VENTAS | RESUMEN** +
  **«Dinero generado por este producto»**. Al fondo, dos plegables CERRADOS
  (`inventory/ficha-plegable.tsx`): **«Empaques y fotos»** y **«Cardex
  completo»** (+ movimientos eliminados). **Se RETIRARON** la tira de KPIs
  (stock actual/mínimo, costo, precio de venta, valorizado) y la card
  «Utilidad por salida» (`utilidad-por-salida.tsx` y `filaUtilidadSalida` se
  borraron). La única señal que sobrevive de los KPIs es «bajo el mínimo (mín.
  N)» en ámbar en el pie del Resumen (`textoBajoMinimo`, con `bajo_stock`).
- **`FichaPlegable`**: `<details id>` nativo, cerrado, SIN memoria, contenido
  SIEMPRE montado (los diálogos de «Editar costo»/«Eliminar» viven adentro);
  `<summary>` con `cursor-pointer`, chevron y foco visible. Se abre si
  `location.hash` es su ancla (`#cardex`, `#empaques-fotos`) **al montar Y en
  `hashchange`** (un `<a href="#cardex">` en la misma página no remonta nada),
  y también al PULSAR un enlace a su ancla con el hash YA puesto (listener de
  `click` en `document`: se abrió, el operador la cerró y vuelve a pulsar
  «Abrir el cardex…» — ahí no hay `hashchange` y el enlace solo hacía scroll a
  la sección cerrada).
  El aviso de compras a $0 enlaza `#cardex` («Abrir el cardex para corregir el
  costo»).
- **Tablas** (`resumen-producto.tsx`, server-safe): COMPRAS = Fecha
  (proveedor/ref/«Ver compra» debajo) · Cantidad · **Precio unitario** NATIVO
  (`fmtPrecioUnitario`: 2–4 decimales + moneda; sub «T.C. 17.0115» o «T.C. 17.51
  (captura en pesos)»; chip «Precio vigente» con `es_precio_vigente`;
  Devolución/Ajuste «no cambia el precio») · **Total MXN** (sub el total USD
  nativo). Debajo, `textoPrecioVigente`: «Precio vigente $21.25 USD · la
  siguiente salida se cobra a $26.5625 USD (+25 %)». VENTAS = Fecha · Avión ·
  Cantidad · Precio unitario nativo (sub «T.C. 17.0077» SOLO si hubo dólares) ·
  Total MXN (sub total USD + «utilidad +$1,084.24 MXN» / «A costo · sin
  utilidad»); pie «Total vendido» + «+ $X MXN cargados a costo (N)» — las
  unidades del pie son `totales.unidades_vendidas` (las salidas CON precio,
  las mismas que suman `ventas_mxn`): **`totales.ventas_cant` del bloque
  cuenta TODAS las salidas** (también las a costo) y junto a `ventas_mxn`
  decía «66 qt · $16,263.61» cuando se vendieron 36 (revisión adversaria
  25-sep; con un API previo, sin el campo, `ventas_cant` como siempre). RESUMEN =
  existencia por día + utilidad/pérdida en pesos; pie «Hoy» con
  `totales.existencia_actual` (NO la última fila). «Dinero generado» lee
  `dinero_generado` TAL CUAL; con un API previo, `dineroGeneradoDeTotales`
  (los dólares sin T.C. en su propio renglón, nunca sumados).
- **Banda naranja** SOLO si `totales.movimientos_sin_tc > 0`
  (`textoBandaSinTc`, sin afirmar la causa: entre el deploy del API y la
  migración, «no había T.C.» sería falso); con un API previo, la bandera de
  siempre. Nota al pie `notaFicha` («…el mismo de las cotizaciones…último
  precio de compra…»). **Con `regla_costo` la palabra «FIFO» no aparece en
  ningún texto**; sin ella (API ≤ 0.0.35) se conservan SOLO donde el dato lo
  exige: `NOTA_FICHA_API_PREVIO`, «valorizado $X (FIFO)» de la lista y el
  título del código viejo `CAMBIA_COSTO_FIFO` («El costo de otra salida
  cambiaría»).
- **«Corregir el costo de la compra»** (`editar-costo-dialog.tsx`, D7 del
  contrato): T.C. OPCIONAL en pesos (`HINT_TC_OPCIONAL`: vacío = oficial del
  día); en dólares nota fija `NOTA_TC_USD`. `MovimientoCostoEditable` gana
  `salidasConEstePrecio`/`salidasSinCargo` (del detalle,
  `salidas_con_este_precio`/`salidas_sin_cargo`). Con alguna, el primer
  «Guardar» **NO llama a la acción** (`decidirGuardarCosto`): pinta
  `AvisoSalidasCosto` (ámbar; renglón ROJO si hay salidas a $0 SIN cargo —
  completar el costo no las cobra) y «Guardar de todos modos» reenvía con
  `confirmar_salidas: true`. Un 409 `ENTRADA_CON_SALIDAS` (dato viejo o la
  lista de pendientes de la portada, que no trae conteos) abre el MISMO
  recuadro con `details.salidas` (`confirmacionDeConflicto`). La server action
  manda el flag SOLO confirmado (un API previo respondería 400) y
  `ActionResult` ganó `details` (aditivo). Toast: «Costo actualizado · el
  valorizado y las siguientes salidas ya usan este precio».
- **Baja de un movimiento**: el API ya no emite `CAMBIA_COSTO_FIFO` (se
  conserva el título para un API previo). `lineasVistaPrevia` agrega, con el
  API nuevo, «Ninguna salida cambia de costo: cada una guarda el costo con que
  se cobró.» y, si `cambia_precio_vigente`, el cambio del último precio en su
  PROPIO renglón (`fraseCambioPrecioVigente`).
- **Movimiento** (`movimiento-dialog.tsx` + `schema.ts`): ENTRADA en pesos con
  T.C. OPCIONAL (el refine ya solo exige > 0 si viene); en dólares, nota «Se
  convierte con el T.C. oficial del día de la compra»; se quitó el «≈ $X USD
  c/u» (una conversión local). **El T.C. solo VIAJA si su campo estaba a la
  vista** (`tcQueViaja`, en este diálogo y en «Corregir el costo»): en dólares
  el campo se oculta, pero un valor tecleado antes en pesos seguía en el
  formulario y el API le da prioridad sobre el oficial — la nota «oficial del
  día» mentía. SALIDA: placeholder «Vacío = último precio de
  compra + 25 %», «A costo» con la casilla, toast «(último precio + 25 %)» y
  el `aviso` del API (`SIN_COSTO_VIGENTE` ⇒ `AVISO_SIN_COSTO_VIGENTE`) como
  warning. El error `SALIDA_ANTES_DE_LA_COMPRA` se pinta tal cual (mensaje del
  API).
- **Lista** (`/admin/inventory`): «valorizado $1,385,535.56 MXN (último precio
  de compra · T.C. de hoy 17.6729)» (`textoValorizadoConTc`, en el helper
  EXISTENTE `inventario-valorizado.ts`); la celda Utilidad en PESOS y el dólar
  original en el tooltip («En dólares: +$191.25 USD (al T.C. de cada
  venta)»); la tarjeta «Utilidad de la tienda» con la cifra en pesos y, tenue,
  «≈ +$535.35 USD al T.C. de cada venta» (`lineaUsdOriginalTienda`), nota con
  `notaUtilidad(margen, {enPesos})`. `listInventarioTodo` pasa `tc_hoy` y
  `regla_costo` (1.ª página) y suma `utilidad_total_usd_original` (misma
  moneda). En el cardex, el T.C. se pinta con `fmtTc` («T.C. del día» en
  salidas en dólares; en una salida en PESOS no se pinta T.C. ni USD: su
  `usd × tc` ya no da los pesos).
- **Textos**: TODOS en `lib/admin/inventario-ficha.ts` (nuevo, PURO) y en los
  helpers de siempre (`inventario-utilidad.ts` —aquí vive `fmtPrecioUnitario`,
  re-exportado por la ficha para no crear un ciclo con
  `inventario-eliminar.ts`—, `inventario-salida.ts`, `inventario-valorizado.ts`,
  `inventario-eliminar.ts`). Configuración: «Utilidad de la tienda (margen
  sobre el último precio de compra)».
- **Tipos** (`types/inventory.ts`): todo ADITIVO y opcional (skew-safe):
  `ReglaCosto`, `CostoVigente`, `TcHoy`, `SalidaDependiente`,
  `PrecioVigenteFicha`, `DineroGenerado` y los campos nuevos de
  `ResumenCompra`/`ResumenVenta`/`ResumenDia`/totales, del ítem, del
  movimiento (detalle, respuesta de la salida y del PATCH), de
  `TiendaResumen`, de la lista y de la vista previa de la baja.
- **Pruebas**: `lib/admin/__tests__/inventario-ficha.test.ts` (formatos,
  `partirDescripcion` con la descripción REAL del SAE 50, precio vigente con el
  ejemplo del cliente —30 USD ⇒ $37.50 USD—, dinero generado del 15W-50,
  confirmación D7, hash), `components/admin/inventory/__tests__/
  ficha-producto.test.tsx` (la PÁGINA completa con el API simulado: sin KPIs
  ni «Utilidad por salida», los 3 bloques + «Dinero generado» con las cifras
  del contrato §6.4, `<details>` cerrados con el contenido montado, sin
  «FIFO», banda solo con `movimientos_sin_tc > 0`, «bajo el mínimo», el SAE 50
  de la captura, API previo sin sumar monedas, el recuadro D7 y el cableado de
  la salida que vivía en el test retirado), más los ajustes de
  `inventario-utilidad`, `inventario-salida`, `inventario-eliminar`,
  `inventario-valorizado`, `items-table-orden` y `utilidad-tienda-card`.
- **Orden de deploy: API 0.0.36 → migración → pyservices → panel ENSEGUIDA.**
  Con el API nuevo y el panel viejo, «Editar costo» de una compra ya usada
  responde 409 `ENTRADA_CON_SALIDAS` sin forma de confirmar. Con el panel
  nuevo y el API previo, la ficha se pinta con los datos de siempre (sin
  «Dinero generado» del API: se arma con los totales) y los textos viejos
  donde el dato lo exige.
- **Pendientes conocidos**: el formulario del producto (`item-form-dialog`)
  sigue exigiendo el T.C. de la «Entrada inicial» en pesos (el API ya no lo
  exige; no estaba en el alcance). Sin QA visual en navegador todavía.


## Corregir un cobro: «Editar» en las cards de cobros (26-sep-2026)

Pedido del cliente con la captura de la cotización #315 «Beh Kay» (card
«Cobros del vuelo» con «$3,400 MXN · Transferencia → Scotiabank Pesos · 15
sep 2026 · Registró: Itzi» y «$68,205.55 MXN …», cada uno SOLO con recibo y
bote de basura): «Necesito que me ayudes a habilitar una opción para poder
editar los cobros en las cotizaciones, porque ahorita pasó que grabaron mal un
cobro del 17 de septiembre y no podemos editarlo de forma sencilla para
corregirlo». La única salida era borrar y recapturar.

- **El API ya lo permitía** (`PATCH /v1/flights/cobros/:cobroId`, ADMIN y
  FACTURACION, `UpdateCobroDto`, `FlightsService.updateCobro` recalcula la
  bandera `cobrado` con `cobrosEnUsd`). **No se tocó el API**: los cuerpos que
  manda el panel (incluidos los `null` para vaciar referencia/notas/cuenta y
  `comision_banco_pct: 0` para quitar la comisión) se verificaron contra el
  `ValidationPipe` real del API (whitelist + forbidNonWhitelisted + implicit
  conversion).
- **Dónde**: botón «Editar» (lápiz + texto visible, `title` que dice qué se
  corrige, nombre accesible con el monto: «Editar cobro de $3,400 MXN»,
  `cursor-pointer`) en cada cobro de `quotes/quote-cobros-card.tsx` y de
  `flights/cobros-card.tsx`, vía el componente ÚNICO
  `flights/editar-cobro-boton.tsx` (`EditarCobroBoton`). Solo ADMIN/FACTURACION
  (`puedeEditarCobro`, espejo del `@Roles` del PATCH). Parte de un sobre de
  grupo ⇒ sin botón y la card lo dice (`TEXTO_SOBRE_NO_SE_EDITA`: «…se
  corrigen, re-parten o eliminan desde el grupo»). Las dos cards agregan «Si
  un cobro se capturó mal…, corrígelo con «Editar»» para quien puede.
- **El MISMO formulario** (`flights/cobro-form-sheet.tsx`, prop nueva
  `cobroEditar`): título «Corregir cobro · vuelo #315» («Corregir reembolso»
  si es negativo), subtítulo «Cobro del 17 sep 2026 · $68,205.55 MXN ·
  Registró: Itzi…», prellenado con `formularioDesdeCobro` (fecha = día de
  pared en Cancún vía `isoToCancunInput`; al cambiar el día se conserva la
  HORA de pared original con `cancunInputToIso`). Cada card monta su propia
  instancia en modo edición (la del vuelo conserva además la del alta); el
  cobro se guarda en estado aparte del `open` para que la ficha no cambie de
  modo mientras se anima la salida. En edición NO hay sugerencias de monto
  (el pendiente ya descuenta ese cobro). La ficha decía siempre «El saldo
  del vuelo se recalcula al guardar»; desde el API 0.0.78, con el
  `monto_usd` del cobro que manda el snapshot, compara contra el saldo SIN
  este cobro (total − cobrado + `monto_usd`): «Con este cambio el vuelo
  quedará cobrado de más por $X USD.» / «Cubre el pendiente — el vuelo se
  marcará como cobrado.» / «Quedará pendiente $Y USD.»
  (`vistaPreviaMontoCobro`); sin `monto_usd`, el texto de siempre. El reset
  de la edición es un
  efecto APARTE que solo depende de abrir y del cobro: un `router.refresh()`
  (p. ej. `RefreshOnFocus`) no borra una corrección a medio capturar.
- **Qué se corrige por TIPO** (`edicionDeCobro`, espejo EXACTO de los candados
  de `updateCobro`; el panel es igual o MÁS estricto, nunca menos):

  | Tipo | Dinero (monto, moneda, método, comisión, cuenta) | T.C. | Fecha, referencia, notas |
  |---|---|---|---|
  | Normal | editable | editable | editable |
  | Reembolso (monto < 0) | solo lectura (API: 400) | solo lectura (API: 400) | editable |
  | Ligado al banco (`ligado_banco` —con un API previo, `conciliado`— y `conciliado_via ≠ ANTICIPO`; desde el 0.0.78 también un «Conciliado parcial») | solo lectura (API: 409 `COBRO_CONCILIADO`) | solo lectura (API: 409) | editable |
  | De un anticipo | solo lectura (API: 409 `COBRO_DE_ANTICIPO`) | **editable** (no toca el saldo del anticipo) | editable |
  | Parte de sobre de grupo | — sin botón (API: 409 `COBRO_DE_GRUPO`) | — | — |

  Desde el API 0.0.78 (un cobro, varios abonos) el candado es «tiene
  abonos» (`ligado_banco`), no «cubierto»: un parcial también congela su
  dinero (candado E de la BD). Su explicación dice cuánto respalda el banco
  («Está conciliado PARCIAL con el banco ($1,700 MXN de $3,400 MXN): …») o
  cuántos abonos tiene, y el 409 `COBRO_CONCILIADO` (ahora estructurado) se
  pinta con el texto del API o, sin texto, con `MSG_COBRO_CONCILIADO`.

  Lo bloqueado se LEE en un recuadro «Lo que no se corrige aquí»
  (`datosSoloLecturaCobro`, montos con su moneda) + la explicación de qué
  hacer (desvincular en Conciliación, eliminar y recapturar el reembolso,
  desaplicar el anticipo). El API deja cambiar método/cuenta de un conciliado
  o de un reembolso y la cuenta de un anticipo; el panel NO lo ofrece (son el
  «dinero» del movimiento y romperían el cuadre con el banco/anticipo).
- **Solo viaja lo que cambió** (`cambiosDeCobro` → `PatchCobro`), nunca el
  formulario entero; lo bloqueado jamás viaja aunque el formulario traiga otro
  valor. Monto y moneda van en UNA línea con su moneda («$68,205.55 MXN →
  $62,805.55 MXN»); vaciar referencia/notas/cuenta manda `null`; una cuenta
  LEGADA (alias fuera del catálogo) se conserva si no se elige otra
  (`hintCuentaLegada`).
- **T.C. con la MISMA regla que el alta** (revisión adversaria 26-sep-2026):
  un cobro en DÓLARES no guarda T.C. (el alta nunca lo manda en USD y en
  producción ningún cobro USD lo tiene). Al pasar un cobro de pesos a dólares
  el diff manda `tc_usd_mxn: null` con la línea «Tipo de cambio: 17.35 → no
  aplica (cobro en USD)»: si el T.C. viejo se quedara, el balance por avión y
  el Libro Dinero (`c.tc_usd_mxn ?? K`) convertirían ese cobro con él en vez
  del T.C. de venta, distinto de un cobro idéntico registrado en dólares. El
  `ValidationPipe` real del API acepta el `null` y `updateCobro` lo guarda
  como null (`normalizarTc`). Al pasar de dólares a pesos el T.C. viaja
  SIEMPRE (es el que convierte desde ahora).
- **Motivo del reembolso**: vive en sus notas («Reembolso: …», obligatorio al
  registrarlo); al corregir se reescribe pero no se deja vacío
  (`MSG_MOTIVO_REEMBOLSO`).
- La card solo dice «corrígelo con «Editar»» cuando hay al menos un cobro con
  el botón (`hayCobrosEditables`): con puras partes de sobre no hay qué
  señalar.
- **Comisión WYSIWYG**: el cobro guarda % y monto; `formularioDesdeCobro`
  prellena el % SOLO si reproduce EXACTO la comisión guardada con la expresión
  del API (`Math.round(monto × (pct/100) × 100)/100`; Paywise 8.857 % de
  68,205.55 = 6,040.97) y si no el MONTO (589.05 capturado directo tiene un %
  derivado 0.8636 que daría 589.02). Al corregir el monto: con % el API
  recalcula con el mismo % y la confirmación ya dice el resultado; con monto
  directo el panel REENVÍA `comision_banco_monto` (el API la reescalaría con
  el % derivado).
- **Validación propia** (`erroresEdicionCobro`, el refine del alta se apaga
  con el campo oculto `modo_edicion`): monto > 0 y comisión < monto solo si el
  dinero es editable; T.C. obligatorio en pesos SALVO un cobro que ya estaba
  en pesos sin T.C. propio (el API lo convierte con el de la cotización) — se
  frena vaciar uno que existía; fecha obligatoria.
- **Confirmación** (regla del cliente: es dinero): «Revisar y guardar» NO llama
  al API; abre un `AlertDialog` «¿Guardar la corrección?» con «Cobro del 17 sep
  2026 · vuelo #315. Esto es lo que cambia:» y las líneas antes (tachado) →
  después, más «El cobrado y el saldo del vuelo se recalculan al guardar»
  cuando cambia monto/moneda/T.C./comisión. Sin cambios ⇒ toast «No cambiaste
  nada del cobro.». Solo «Guardar corrección» llama a `updateCobroAction`
  (`app/admin/flights/actions.ts`: valida uuid, descarta `undefined`, nunca
  lanza, revalida vuelo + `/admin/quotes` + `/admin/quotes/:id`) y luego
  `router.refresh()` + toast «Cobro corregido · Cambió: monto, fecha del
  cobro.». Error ⇒ toast + recuadro rojo que se queda en la ficha con
  `mensajeErrorEdicionCobro`: las reglas del API (conciliado, reembolso,
  anticipo, sobre, comisión ≥ monto) se pintan TAL CUAL; 404 ⇒ «ya no existe
  (alguien lo eliminó)», 403 ⇒ «solo administración y facturación», validación
  en inglés ⇒ texto genérico en es-MX, «should not exist» ⇒ falta actualizar
  el API, 502/Railway ⇒ «la corrección NO se guardó»; `COBRO_DE_GRUPO` con
  «Ir al grupo».
- **No lo bloquea el candado de la cotización**: corregir un cobro no cambia el
  precio pactado (el candado de edición depende del cobrado neto y se
  rehidrata con el `router.refresh()`).
- **Fuente única**: `lib/admin/cobro-edicion.ts` (PURA): roles, tipos,
  prellenado, diff, validación, textos (títulos, `title`/`aria-label` del
  botón, confirmación, toast) y errores. Ningún componente redacta estas
  frases.
- **Pruebas**: `lib/admin/__tests__/cobro-edicion.test.ts` (los cobros de
  la #315, hora Cancún del cobro del 17-sep capturado a las 22:30, comisión % vs
  monto, cada tipo, diff y validación, errores),
  `components/admin/flights/__tests__/cobros-card-editar.test.tsx` (botón
  por rol y por tipo en las DOS cards, sobre sin botón con su texto, cableado
  de la ficha y guardas de código: el PATCH sale una sola vez y solo tras
  confirmar) y `app/admin/flights/__tests__/update-cobro-action.test.ts`
  (ruta, cuerpo sin `undefined` pero con los `null`, revalidación, guardas,
  error con `code`).
- **Pendiente conocido**: sin QA visual en navegador (el formulario vive en un
  portal y el proyecto no tiene DOM de pruebas).

## Inventario: ubicaciones rápidas desde el formulario (28-sep-2026)

Pedido del cliente con la captura del selector «Ubicación» DENTRO del formulario
del producto (Sin ubicación · Oficina vieja · Oficina nueva ✓ · Locker del
aeropuerto · Bodega del taller de Mérida · Bodega del taller de Cozumel):
«Necesitamos una forma rápida y ágil para poder editar, borrar o agregar
opciones a este listado de lugares para el inventario». Contrato con el API
**0.0.38** (sin migración): `DELETE /v1/inventory/ubicaciones/:id` y
`PUT /v1/inventory/ubicaciones/orden { ids }`.

- **`components/admin/inventory/ubicacion-selector.tsx`** — `UbicacionSelector`
  (el select de ubicación, fuente ÚNICA del formulario del producto y del
  destino de «Mover a…») + `useCatalogoUbicaciones` (copia LOCAL del catálogo,
  patrón base/lista: lo agregado/renombrado/eliminado se ve al instante y,
  cuando el server manda otro catálogo, manda el del server). Con
  `puedeAdministrar` (ADMIN/MECANICO, los roles de POST/PATCH/DELETE/PUT del
  API):
  - **«＋ Agregar ubicación…»** es la ÚLTIMA opción del select (valor
    centinela `VALOR_AGREGAR_UBICACION`, jamás viaja al API): cambia el select
    por un campo de nombre + «Guardar» + ✕ (Enter guarda, Esc cancela; los dos
    con `preventDefault` + `stopPropagation`: sin eso Enter ENVIABA el
    formulario del producto y Esc CERRABA su diálogo). La crea, relee el
    catálogo y la deja SELECCIONADA (primero el catálogo, luego el valor: el
    select nunca apunta a un valor sin opción). Lo tecleado que ya existe sin
    acentos ni mayúsculas se ELIGE en vez de duplicarse
    (`resolverAltaRapidaUbicacion` ⇒ `EXISTE`); una desactivada se explica
    («actívala en «Administrar ubicaciones» (engrane)»); el 409
    `UBICACION_DUPLICADA` de una carrera con `details.id` activo también se
    elige.
  - **Engrane «Administrar ubicaciones»** (`aria-label` + `title`,
    `cursor-pointer`): abre el diálogo «Ubicaciones» EXISTENTE (no se duplicó)
    **ENCIMA del formulario**. **Decisión**: Base UI 1.4.1 anida diálogos de
    forma nativa (un `Dialog.Root` montado dentro del popup del padre se
    registra como hijo en su árbol — `useDialogRoot`/`onNestedDialogOpen`,
    `useDismiss`: Esc y el clic fuera cierran SOLO el de arriba) y el
    formulario queda montado con todo lo capturado; no hizo falta hoja,
    popover ni cerrar/reabrir. El diálogo hijo es `UbicacionesDialog` con
    `onCatalogoCambio`: cada cambio se publica al selector sin recargar.
  - Si la ubicación elegida se ELIMINA o se DESACTIVA desde el engrane, el
    select vuelve a la opción vacía (`ubicacionSigueElegible`; la ACTUAL del
    producto se respeta aunque esté inactiva).
  - Sin `puedeAdministrar`: el select de siempre (sin opción de agregar ni
    engrane ni diálogo montado). Sin catálogo (API previo): el input de texto
    de siempre, con o sin permiso.
- **`ItemFormDialog`**: prop OPCIONAL `puedeAdministrarUbicaciones` (default
  `false`, skew-safe) que viaja por `ItemCreateButton`, `CodigoSearch`,
  `ItemsTable → ItemActions` (`app/admin/inventory/page.tsx`: ADMIN/MECANICO)
  e `ItemEditButton` (ficha: `puedeEditarCosto`, el mismo par de roles). El
  select sigue siendo el ÚNICO hijo de `Field` (el selector recibe el `id` y lo
  pone en el select o en el campo del alta: la etiqueta sigue ligada).
  **CANDADO NUEVO del `reset`**: el efecto de apertura solo reinicia el
  formulario UNA vez por sesión (`sesionRef` = `id del producto|código`).
  Antes dependía de la IDENTIDAD de `initialItem` y un `router.refresh()` /
  `revalidatePath` —que ahora ocurre CON el formulario abierto, al agregar o
  administrar ubicaciones— traía un objeto nuevo de la misma fila y BORRABA lo
  capturado.
- **Diálogo «Ubicaciones»** (`ubicaciones-dialog.tsx`, se abre desde la lista
  y desde el engrane): renombrar EN LÍNEA con **clic en el nombre** o el lápiz
  (Enter guarda; Esc cancela SIN cerrar el diálogo); **▲▼ en UNA llamada**
  (`reordenarUbicacionesAction` ⇒ `PUT ubicaciones/orden` con la lista
  COMPLETA de `ordenTrasMover`, optimista; con un API previo el PUT da 404 sin
  código ⇒ `ordenSinRutaNueva` ⇒ los dos PATCH de `intercambioOrden`; 409
  `UBICACIONES_CAMBIARON` ⇒ toast + relectura); **«Eliminar»** (bote +
  texto, en TODAS las filas) CONFIRMA siempre: sin productos
  `textoConfirmarEliminar` («Se eliminará «X» de la lista para siempre…») +
  «Sí, eliminar»; con productos activos NO ofrece borrar:
  `textoEliminarConProductos` + select de destino (`destinosParaVaciar`) +
  «Mover N productos» (`productosDeUbicacionAction` = `GET items?ubicacion=`
  paginado de 300 en 300 ⇒ `moverUbicacionAction`) y, ya vacía, el panel pasa
  solo a la confirmación. Si el API aún responde 409 `UBICACION_EN_USO` (la
  usan productos DADOS DE BAJA, que «Mover a…» no mueve) se pinta su mensaje
  y se ofrece «Desactivarla». «Desactivar/Activar» siguen. Tras cada cambio:
  `listarUbicacionesAction` (catálogo completo) ⇒ `onCatalogoCambio` +
  `router.refresh()`. Todo `<button>` con `cursor-pointer`.
- **«Mover a…»** (`mover-ubicacion-dialog.tsx`): prop `destinos` ⇒
  `ubicaciones` (catálogo COMPLETO) + `puedeAdministrar`; el destino es el
  MISMO `UbicacionSelector` («Elige la ubicación…»): si el lugar no existe se
  agrega ahí y queda elegido. En la tabla, «Mover a…» ya no se apaga por no
  haber ubicaciones activas (solo sin productos en la vista).
- **Server actions nuevas** (`app/admin/inventory/actions.ts`, nunca lanzan):
  `listarUbicacionesAction`, `eliminarUbicacionAction`,
  `reordenarUbicacionesAction`, `productosDeUbicacionAction`.
- **Textos y lógica PUROS** (`lib/admin/inventario-ubicacion.ts`, sección
  «Alta rápida, administrar y eliminar»): `limpiarNombreUbicacion`,
  `opcionesSelectorUbicacion`, `ubicacionSigueElegible`,
  `resolverAltaRapidaUbicacion`, `ordenTrasMover`, `reemplazarUbicacion`,
  `destinosParaVaciar`, `textoConfirmarEliminar`, `textoEliminarConProductos`,
  `textoUbicacionAgregada/YaExistia/Eliminada`, `textoErrorUbicacion` (los
  códigos del API —`UBICACION_DUPLICADA`, `UBICACION_EN_USO`,
  `UBICACIONES_CAMBIARON`, `UBICACION_NO_EXISTE`, `MIGRACION_PENDIENTE`— se
  pintan tal cual en es-MX; DELETE 404 sin código ⇒ «El sistema todavía no
  permite eliminar ubicaciones; desactívala mientras tanto.»; 403 ⇒ «Tu usuario
  no puede cambiar las ubicaciones.») y `ordenSinRutaNueva`.
- **Pruebas**: `lib/admin/__tests__/inventario-ubicacion.test.ts` (bloque
  «alta rápida, administrar y eliminar») y
  `components/admin/inventory/__tests__/ubicacion-selector.test.tsx`
  (formulario SIN permiso / sin la prop / CON permiso —opciones en su orden
  con «＋ Agregar ubicación…» al final, engrane con texto accesible y
  `cursor-pointer`—, etiqueta ligada al select, actual inactiva, sin catálogo;
  selector suelto; diálogo con «Eliminar» y renombrar por fila, todo botón con
  `cursor-pointer`, ninguna confirmación sin pedirla; «Mover a…» con el mismo
  selector). El diálogo de Base UI se sustituye por un pase en línea (el
  portal no existe en `react-dom/server`).
- **Revisión adversaria (28-sep-2026)**: dos huecos que el render estático
  no veía, corregidos y congelados en el bloque «cableado en el código» del
  mismo test:
  - **Un nombre a medias no se pierde en silencio.** Con «＋ Agregar
    ubicación…» abierto y un nombre tecleado SIN guardar, el «Guardar» del
    producto salía con la ubicación ANTERIOR (y «Mover» movía al destino
    anterior) y el nombre desaparecía. El selector avisa con
    `onAltaPendiente(nombre | null)` (pasar un setter de `useState`: es
    estable) y el formulario / «Mover a…» frenan con
    `textoAltaUbicacionPendiente` («Falta guardar la ubicación nueva «X»:
    pulsa Enter o «Guardar» junto al nombre (o cancélala con Esc).»). El
    botón NO se apaga: el clic explica. Cada sesión nueva del formulario
    arranca sin pendiente.
  - **Vaciar desde «Administrar» la ubicación del propio producto.** «Mover N
    productos» mueve TAMBIÉN al producto que se está editando; el selector
    seguía en la ubicación vieja y (a) sin eliminarla, «Guardar» lo REGRESABA
    ahí (el `initialItem` refrescado ya decía la nueva, así que el valor viejo
    contaba como cambio); (b) al eliminarla, el selector caía a «Sin
    ubicación» y «Guardar» le QUITABA la ubicación. `UbicacionesDialog` avisa
    `onProductosMovidos(desde, hacia)` ANTES de publicar el catálogo y el
    selector sigue a su producto con `ubicacionTrasVaciar` (puro + test).
- **Orden de deploy**: API 0.0.38 antes que el panel. Con el panel nuevo y un
  API previo: agregar/renombrar/activar funcionan igual; ▲▼ cae a los dos
  PATCH; «Eliminar» responde el texto de «desactívala mientras tanto».
- **Pendientes conocidos**: sin QA visual en navegador (el anidado de diálogos
  se verificó leyendo Base UI 1.4.1, no con clics reales); la app Flutter no se
  tocó (sigue con su texto libre).

## Comisión del vendedor como gasto (28-sep-2026)

Pedido del cliente con capturas del Excel del Balance general (hojas «otros
movimientos» y «otros gastos») y del formulario de gasto: «¿cómo registro un
gasto para que aparezca en la hoja de otros movimientos? Como pagarle una
comisión a Saab… Si lo agrego en Gastos como "Otros gastos VuelaTour" me lo
manda a la hoja de Otros gastos como un gasto aparte del que ya está en otros
movimientos: queda duplicado». Hasta hoy el pago al vendedor solo existía como
PROVISIÓN calculada. Contrato con el API **0.0.39** (migraciones
20260928000001 enum y 20260928000002 CHECK; invariante 31 del API).

- **13-oct-2026 (API 0.0.74, invariante 61 del API): DOS categorías.** Esta
  categoría se llama ahora **«Comisión del vendedor (VuelaTour)»** (mismo
  código `COMISION_VENDEDOR`, solo cambia la etiqueta: donde esta sección
  dice «Comisión del vendedor» se lee «(VuelaTour)») y nace **«Comisión del
  vendedor (avión)»** (`COMISION_VENDEDOR_AVION`), que sí carga el balance
  del avión. Ver «Dos categorías de comisión del vendedor» justo abajo.
  Desde el 0.0.74 ningún libro provisiona el pago al vendedor (tampoco el
  Libro Dinero).
- **12-oct-2026 (API 0.0.73, invariante 58 del API)**: «otros movimientos»
  ya NO provisiona el pago al vendedor: sin el gasto real «Comisión del
  vendedor» la fila del vuelo no lleva egreso (el ingreso cobrado se queda).
  Por eso `AYUDA_COMISION_VENDEDOR` y `hojaDestinoGasto` ya no dicen
  «reemplaza la provisión» (pruebas en `categorias-gasto.test.ts` y
  `comision-vendedor-ui.test.tsx`). Lo de abajo describe el estado del
  28-sep; el Libro Dinero sigue provisionando (hasta el API 0.0.74).
- **Categoría nueva `COMISION_VENDEDOR`** = «Comisión del vendedor», destino
  «Pago al vendedor (otros movimientos VuelaTour; no es costo del avión)»
  (tabla canónica IDÉNTICA en API, panel y app — `lib/admin/categorias-gasto.ts`).
  Va en `CATEGORIAS_CAPTURA` justo después de `PILOTO_EXTERNO` (alta, alta
  desde «Gastos del vuelo» y verificación) y en `CategoriaEnum` del schema.
  **No es repartible** (`CATEGORIAS_REPARTIBLES` sin cambio), no es de compra.
  El API la aparea con la comisión cobrada en «otros movimientos» (Balance
  general) y «Otros ingresos» (Libro Dinero) y **reemplaza la PROVISIÓN**; con
  pago parcial/excedido pinta «faltan $…»/«excede $…». No resta al avión, no va
  a «otros gastos», no entra al reparto.
- **Exige vuelo para TODOS los roles** (espejo del 400 `GASTO_REQUIERE_VUELO`
  del API; respaldo en BD). `categoriaExigeVueloSiempre`,
  `errorVueloObligatorio(categoria, vueloId)` y
  `MSG_GASTO_REQUIERE_VUELO_COMISION` (texto IDÉNTICO al del API): los dos
  diálogos bloquean el guardado con ese toast ANTES de subir la factura o
  llamar al API. El campo «Vuelo» sale con asterisco, SIN la opción «Sin
  vuelo» y con el hint `HINT_VUELO_COMISION` («Obligatorio: la comisión se
  aparea con lo cobrado en ese vuelo. La lista trae los vuelos de los últimos
  90 días.»).
- **Ventana de vuelos**: la comisión se paga días o semanas DESPUÉS del vuelo
  ⇒ `buscarVuelosCercanosAction(fecha, VENTANA_VUELOS_COMISION)` = 90 días
  atrás, 15 adelante, 500 vuelos (tope `@Max(500)` del API). Sin `opts`, la
  ventana de SIEMPRE (±15, 100: Paywise y demás sin cambio). El argumento
  viene del cliente ⇒ la action lo acota (días 0–366, limit 1–500, enteros).
- **Ayuda en pantalla** (`AYUDA_COMISION_VENDEDOR`, cuadro del mismo estilo
  que INDIRECTO/NÓMINA, en el alta —con o sin vuelo prefijado— y en la
  verificación): se aparea con la comisión cobrada en «otros movimientos» y
  reemplaza la PROVISIÓN; «faltan»/«excede»; **«Registra un gasto por
  vuelo»** (única defensa operativa contra el doble conteo de una
  transferencia que paga varios vuelos o los aviones de un grupo — riesgos
  R1/R14 del contrato); no es costo del avión; no capturarla como «Otros
  gastos VuelaTour».
- **Verificación: el vuelo viaja en el MISMO PATCH** que la categoría
  (`payload.vuelo_id = vueloSel`) y se SALTA la 2.ª llamada
  `assignVueloGastoAction`: el API valida el estado EFECTIVO tras el merge y
  reclasificar un gasto SIN vuelo rebotaba (el PATCH de categoría llegaba sin
  vuelo). Reclasificar un «Otros gastos VuelaTour» CON vuelo a «Comisión del
  vendedor» es EL camino para corregir capturas previas (sale de «otros
  gastos» y reemplaza la provisión). El efecto que fija `vueloSel` quedó
  separado del que carga la lista: cambiar la categoría recarga la lista con
  la ventana ancha SIN reiniciar el vuelo elegido.
- **La IA no la pisa** (`iaPuedeCambiarCategoria(actual, sugerida)`): si el
  humano eligió la comisión, la lectura del ticket (alta) o «Reanalizar con
  IA» (verificación) no cambian la categoría; y la IA tampoco la PROPONE
  (pyservices no la sugiere; si llegara, se ignora — un pago al vendedor lo
  decide la oficina).
- **«Simular operación como piloto»**: oculto y forzado a `false` con esta
  categoría (la paga la oficina). Con vuelo prefijado, la descripción del
  diálogo ya no promete «resta en el reparto».
- **Gastos del vuelo** (`flight-gastos-table.tsx`): bajo «Comisión del
  vendedor» se pinta su destino en verde (solo en esa categoría). El total de
  la card no cambia (un gasto es un gasto). La card de cobros/cotización NO se
  tocó. `createGastoAction` ahora revalida también `/admin/flights` (layout),
  igual que verificar/ligar/borrar: el alta desde «Gastos del vuelo» se ve al
  instante.
- **Hint «Con lo elegido cae en:» corregido** (`hojaDestinoGasto`; CLAUDE.md:
  los flujos confusos se corrigen — justo esa pista engañó al cliente). Orden:
  PERSONAL_DUENO → **COMISION_VENDEDOR** («Balance general VuelaTour · Otros
  movimientos (el pago al vendedor, apareado con la comisión cobrada; sin él
  esa fila no lleva egreso)») → **NOMINA** (desde el 16-oct-2026, API
  0.0.90: `HOJA_NOMINA_SIN_REPARTIR`, «Nómina (módulo Nómina): no entra a
  ningún balance hasta repartirla entre aviones desde Nómina») → **empresa**
  (`CATEGORIAS_EMPRESA` = OTRO/NOMINA/GASOLINA/FIJO/VISITA, sincronizada con
  `CATEGORIAS_GASTO_EMPRESA` del API y congelada en el test contra
  `DESTINO_POR_DEFECTO`: con vuelo «… · Otros gastos (el vuelo queda solo como
  referencia)», con avión «… · Otros gastos (el avión queda solo como
  referencia; para cargarlo a aviones usa el reparto)», sin nada el texto de
  siempre) → con vuelo: **TUAS** «Balance general VuelaTour · Otros
  movimientos (apareado con las TUAS cobradas; en la hoja del vuelo solo es
  nota)», **GAS** «Balance del avión · Combustible (por avión y mes; el vuelo
  es referencia)», **PERMISO** «Balance del avión · Permisos», lo demás «hoja
  del vuelo» → sin avión → GAS/PERMISO con avión → Gastos Indirectos. Antes
  todo gasto con vuelo decía «hoja del vuelo» aunque desde el 11-sep las de
  empresa van SIEMPRE a «otros gastos». (La NÓMINA ya no: desde el
  16-oct-2026 sin reparto no entra a ningún balance; su cuadro del alta es
  `AYUDA_ALTA_NOMINA` en `lib/admin/nomina.ts`, ver «Nómina: fuera de Gastos y
  reparto en partes iguales».)
- **Pruebas**: `lib/admin/__tests__/categorias-gasto.test.ts` (tabla
  canónica == API, orden en el selector, no repartible, vuelo obligatorio y su
  mensaje, ventanas, `iaPuedeCambiarCategoria`, ayuda, `hojaDestinoGasto` por
  rama, schema zod de alta y verificación),
  `app/admin/expenses/__tests__/comision-vendedor-actions.test.ts` (ventana
  default/comisión/acotada, POST y revalidación, 400 del API tal cual, PATCH
  único) y `components/admin/expenses/__tests__/comision-vendedor-ui.test.tsx`
  (hint, «Gastos del vuelo», cableado de los dos diálogos). Verificar con
  `npx tsc --noEmit`, `npx eslint <archivos>` y `npx vitest run`.
- **Orden de deploy**: el panel sale DESPUÉS del API 0.0.39 (el 0.0.38 rechaza
  la categoría con 400 de `IsEnum`), y el API después de la migración
  20260928000001 (dependencia dura del API).
- **Pendientes conocidos**: sin QA visual en navegador; pagos periódicos que
  cubren varios vuelos (1 transferencia ↔ N comisiones) siguen sin solución
  en esta ronda (riesgo R1: el cargo no se puede ligar a ninguno de los N
  gastos); las dos PRUEBAS del cliente en el vuelo #317 (`OTRO`, 250,000.00 y
  870,000.00 MXN) siguen duplicando en «otros gastos» hasta que la oficina las
  borre (nadie las tocó).

## Dos categorías de comisión del vendedor (13-oct-2026, API 0.0.74)

Pedido textual del cliente (13-oct-2026, 17:10): «aqui en las categorias
necesitamos una opcion que sea Comision del vendedor pero que esa opcion si se
cargue al balance del avión, y dejamos el otro que se va a balance de
vuelatour para tener esas 2 opciones». Contrato con el API **0.0.74**
(invariante 61 del API; migraciones 20261013000003 —valor del enum— y
20261013000004 —CHECK «exige vuelo»—). Corrige la decisión 3 del lote del
13-oct (en ella el avión absorbía la `COMISION_VENDEDOR` por vigencia): eso ya
no existe.

- **Tabla canónica** (IDÉNTICA en API `common/categoria-gasto.util.ts`, panel
  `lib/admin/categorias-gasto.ts` y app `categoria_gasto.dart`):

  | código | etiqueta | destino (verde en el selector) |
  |---|---|---|
  | `COMISION_VENDEDOR` | Comisión del vendedor (VuelaTour) | Pago al vendedor (otros movimientos VuelaTour; no es costo del avión) |
  | `COMISION_VENDEDOR_AVION` | Comisión del vendedor (avión) | Pago al vendedor (columna COMISIONES del balance del avión; sí es costo del avión) |

  Orden en `CATEGORIAS_CAPTURA` (alta, alta desde «Gastos del vuelo»,
  verificación y «¿No está el gasto? Créalo»): …PILOTO_EXTERNO,
  COMISION_VENDEDOR, COMISION_VENDEDOR_AVION, INDIRECTO… La «(VuelaTour)»
  queda PRIMERO a propósito (quien elige por costumbre la sigue cargando a
  VuelaTour); cambiar el orden es tocar `CATEGORIAS_CAPTURA` y su test.
  `CategoriaEnum` (zod) trae la nueva justo después de COMISION_VENDEDOR.
- **Quién paga** (lo decide el API; el panel NO calcula dinero): la
  «(VuelaTour)» SIEMPRE la paga VuelaTour (egreso en «otros movimientos» del
  Balance general) y nunca es costo del avión. La «(avión)» la carga el avión
  del vuelo en la columna COMISIONES de su balance y en el reparto a socios,
  en el MES DEL VUELO (vuelo completado o cancelado con cobros retenidos; en
  un vuelo de varios aviones, por participación, como la venta); en «otros
  movimientos» sale con egreso $0.00 «a cargo del avión». Fuera de ese
  universo (vuelo aún no completado, cancelado sin cobros, sin avión de la
  flota) la paga VuelaTour y el balance lo avisa en el concepto y en
  pendientes.
- **Comparación EXACTA** (`esCategoriaPagoVendedor` /
  `CATEGORIAS_PAGO_VENDEDOR` / `===`): 'COMISION_VENDEDOR' es PREFIJO de
  'COMISION_VENDEDOR_AVION' ⇒ prohibido `startsWith`/`includes`/`indexOf` con
  ese literal. Un test guardián recorre `src/` y falla si aparece. (En las
  cotizaciones `clave === "COMISION_VENDEDOR"` es la línea del DESGLOSE, no
  esta categoría: no cambia.)
- **Reglas comunes** (las dos; los diálogos no cambiaron de cableado porque
  todo cuelga de `categoriaExigeVueloSiempre` = `esCategoriaPagoVendedor`):
  vuelo obligatorio a TODOS los roles (sin «Sin vuelo», asterisco,
  `HINT_VUELO_COMISION`, ventana de 90 días `VENTANA_VUELOS_COMISION`);
  candado ANTES de subir la factura con `errorVueloObligatorio` ⇒
  `mensajeGastoRequiereVuelo(cat)`, IDÉNTICO al 400 `GASTO_REQUIERE_VUELO` del
  API con la etiqueta de SU categoría («Esta categoría es del vuelo: elige el
  vuelo. «Comisión del vendedor (avión)» siempre se registra con el vuelo al
  que pertenece.»); `MSG_GASTO_REQUIERE_VUELO_COMISION` conserva el de la
  «(VuelaTour)». «Simular operación como piloto» oculto y en false (la paga la
  oficina). No repartibles (`CATEGORIAS_REPARTIBLES` sin cambio), no son pago
  de compra (`CATEGORIAS_COMPRA` es lista blanca) y `CATEGORIAS_EMPRESA` no
  cambia. La IA no sugiere ni pisa ninguna (`iaPuedeCambiarCategoria`:
  tampoco cambia una por la otra; quién paga lo decide la oficina).
- **Ayudas** (`ayudaComisionVendedor(cat)` ⇒ `{ titulo: etiqueta, texto }`;
  el cuadro ya no rotula a mano «Comisión del vendedor.»):
  `AYUDA_COMISION_VENDEDOR` empieza con «La paga VuelaTour.», conserva las
  frases de siempre y remite a la «(avión)»; `AYUDA_COMISION_VENDEDOR_AVION`
  («La carga el avión del vuelo: …») remite a la «(VuelaTour)». En
  **Verificar / editar** el cuadro suma, en su propia línea,
  `AYUDA_RECLASIFICAR_COMISION` («¿Cambió quién la paga? …»): reclasificar
  entre las dos se permite aunque el gasto esté conciliado (el candado
  `GASTO_CONCILIADO` del API solo cubre monto, moneda y medio) y el vuelo
  viaja en el MISMO PATCH (`vueloEnPatch`). El cambio mueve el mes DEL VUELO
  al regenerar balance y reparto.
- **«Con lo elegido cae en:»** (`hojaDestinoGasto`, rama nueva ANTES de las
  de empresa): la «(avión)» ⇒ «Balance del avión · columna COMISIONES y
  reparto a socios, en el mes del vuelo (con el vuelo completado; en «otros
  movimientos» sale con egreso $0.00 «a cargo del avión»)». La «(VuelaTour)»
  sin cambio.
- **Gastos del vuelo** (`flight-gastos-table.tsx`): el destino en verde sale
  bajo las DOS (`esCategoriaPagoVendedor`): así se ve quién paga cada pago.
- **Tablero de Gastos**: `DashboardGastos.resumen.gastos_comision_vendedor_avion_usd?`
  (ADITIVA del API 0.0.74, por fecha del gasto: dentro de «Gastos totales»,
  fuera de «Gastos por avión», del costo por hora y de empresa). Renglón
  `textoTableroComisionVendedorAvion`: «$X en comisiones del vendedor a cargo
  de los aviones (restan en la columna COMISIONES de su balance y en el
  reparto; no entran al costo por hora).», solo con > 0; con un API previo no
  se pinta.
- **Reparto**: el sublabel de «Comisiones (banco + vendedor)» es
  `SUBLABEL_COMISIONES_REPARTO` («parte del avión de la comisión bancaria
  (regla sep-2026) + pagos «Comisión del vendedor (avión)»»); decía
  «provisión del vendedor», desfasado desde la D3. `comisiones_venta_usd > 0`
  también puede venir de un mes ANTERIOR a la regla si el avión cargó un pago
  «(avión)». El título del botón «Dinero (Excel)» ya no promete un pago
  «provisionado»: el Libro Dinero resta el pago real de las dos categorías.
- **Rótulos al día (13-oct-2026, lote 2; invariantes 50 y 61 del API; solo
  textos)**: ya no queda «provisión del vendedor» ni «Comisiones de venta ·
  regla anterior» en el panel (la cascada usa `SUBLABEL_COMISIONES_REPARTO`
  y `categorias-gasto.test.ts` lo vigila). Los tooltips de «Otros ingresos
  VuelaTour» del reparto (KPI de la flota en `kpi-strip.tsx` y la línea
  informativa de `avion-reparto-card.tsx`) decían «su pago al vendedor,
  egreso de VuelaTour» / «la comisión se paga al vendedor desde VuelaTour»:
  hoy cierran con `NOTA_PAGO_VENDEDOR_REPARTO` («Lo cobrado al cliente por la
  comisión del vendedor es ingreso de VuelaTour; el pago al vendedor es el
  gasto real capturado: «Comisión del vendedor (VuelaTour)» egresa en «otros
  movimientos» del Balance general y «Comisión del vendedor (avión)» resta en
  «Comisiones» del avión (sin pago capturado no se resta nada).»). En el
  **tablero de Gastos** el renglón de `resumen.gastos_empresa_usd` sale de
  `textoTableroGastosEmpresa`: «$X en gastos de la empresa VuelaTour:
  categorías de empresa (Otros gastos VuelaTour, Nómina, Gasolina
  (vehículos), Gasto fijo y Visita), «Comisión del vendedor (VuelaTour)» y
  remanentes de repartos. No se imputan a aeronaves.» (antes solo decía
  «remanentes de repartos», y esa cifra incluye las categorías de empresa y
  la «(VuelaTour)»; las etiquetas salen de `CATEGORIAS_EMPRESA` y de la
  tabla canónica). Comentarios de `types/profit-sharing.ts`,
  `types/quotes-persisted.ts` y `quote-desglose-card.tsx` al día.
- **Datos del cliente** (nada se reclasifica solo): #251 (N990GG, $4,080.00) y
  #332 (N621TX, $1,305.00, conciliado) se quedan «(VuelaTour)»; si el pago le
  toca al avión, la oficina lo cambia en Verificar / editar. Comisiones
  cotizadas sin pago capturado (#233, #237, #260 y #317 de N4142R en
  septiembre; #404 y #417 de N990GG en octubre): capturar el pago real en la
  categoría correcta ANTES de regenerar septiembre y octubre.
- **Orden de deploy**: migraciones → pyservices → API 0.0.74 → **panel**
  (SIEMPRE después del API). Con el API 0.0.73 el panel no se rompe: la
  categoría nueva rebota con el 400 de `IsEnum` (el toast lo dice tal cual) y
  el renglón del tablero no se pinta.
- **Pruebas** (congelan los textos): `lib/admin/__tests__/categorias-gasto.test.ts`
  (tabla == API == app, orden en el selector, solo las dos exigen vuelo,
  mensaje por categoría, ayudas exactas, `ayudaComisionVendedor`, IA,
  `hojaDestinoGasto`, renglón del tablero, sublabel del reparto, zod y el
  guardián del prefijo), `components/admin/expenses/__tests__/comision-vendedor-ui.test.tsx`
  (hint de las dos, «Gastos del vuelo» con las dos, cableado del cuadro y de
  reclasificar, tablero y reparto) y
  `app/admin/expenses/__tests__/comision-vendedor-actions.test.ts` (POST y
  PATCH de la «(avión)», 400 con «(VuelaTour)», skew con el API previo).
- **Pendientes conocidos**: sin QA visual en navegador; un vuelo de varios
  aviones no se puede cargar a UNO solo (se reparte como la venta); una
  «(avión)» de un vuelo sin avión de la flota aparece en la bandeja «sin
  avión» del API (asignarle avión al gasto NO cambia quién paga: la salida es
  reclasificarla a «(VuelaTour)»).

## Comisariato (13-oct-2026, API 0.0.75, invariante 63 del API)

Pedido del cliente (Jimmy, 12-oct): «agregar en la categoría de gastos:
Comisariato; entraría en [la columna OTROS de costos directos] en el balance
del avión». Snacks, bebidas y comisariato para los PASAJEROS: hasta hoy se
capturaban como «Otros gastos VuelaTour» y nunca llegaban al avión. Contrato
con el API **0.0.75** (migración `20261013000001`, valor del enum; la
`20261013000002` reclasifica los 4 gastos OTRO de agosto con vuelo y
«comisariato» en notas). La app ya la tiene (commit `66e8036`, +81).

- **Tabla canónica** (IDÉNTICA en API `common/categoria-gasto.util.ts`, panel
  `lib/admin/categorias-gasto.ts` y app `categoria_gasto.dart`): código
  `COMISARIATO`, etiqueta «Comisariato», destino «Gastos directos del vuelo
  (en el balance del avión)» — el MISMO de COMIDA. Va JUSTO después de
  «Comida» en `CATEGORIAS_CAPTURA` (alta, alta desde «Gastos del vuelo»,
  verificación y «¿No está el gasto? Créalo») y en `CategoriaEnum` (zod).
  Con ella el enum tiene **22 valores**: `categorias-gasto.test.ts` congela
  que zod, etiquetas y destinos tengan los mismos 22 códigos y, si el repo
  del API está al lado, que sus tablas (`CATEGORIA_GASTO_LABEL` /
  `CATEGORIA_GASTO_DESTINO`) sean byte a byte las del panel.
- **Reglas (las decide el API; el panel solo etiqueta, ofrece y explica)**:
  gasto DIRECTO del vuelo — en el balance del avión cae en la columna OTROS
  de costos directos (junto al FBO) y en el reparto resta como DIRECTO;
  exige vuelo SOLO al PILOTO (`categoriaExigeVueloSiempre` NO la incluye: la
  oficina la captura suelta y la liga después; sin vuelo NI avión queda en
  «otros gastos» del general y como pendiente de avión, como una COMIDA
  suelta); no es de empresa (`CATEGORIAS_EMPRESA` sin cambio) ni repartible
  (`CATEGORIAS_REPARTIBLES` sin cambio). La IA SÍ la propone para
  snacks/bebidas de pasajeros y el alta la aplica como cualquier directa
  (`iaPuedeCambiarCategoria` la acepta; nunca pisa una comisión elegida a
  mano).
- **Ayuda** `AYUDA_COMISARIATO` (cuadro con «Comisariato.» en los dos
  diálogos, solo con la categoría elegida): «Snacks, bebidas y comisariato
  para los PASAJEROS. Es gasto directo del vuelo: en el balance del avión
  cae en la columna OTROS de costos directos (junto al FBO) y resta en el
  reparto a socios. La comida de la tripulación va en «Comida». Sin vuelo
  queda como pendiente de avión hasta ligarlo.»
- **«Con lo elegido cae en:»** (`hojaDestinoGasto`): con vuelo «Balance del
  avión · hoja del vuelo (columna OTROS de costos directos, junto al FBO)»;
  con avión sin vuelo «Balance del avión · Gastos Indirectos»; sin nada, el
  texto de siempre de «otros gastos».
- **Gastos** (`/admin/expenses`): desde el 14-oct-2026 hay UNA sola tabla
  (sección «Gastos: una sola tabla»): se encuentra con el filtro «Categoría»
  y, sin vuelo ni avión, dice «Falta avión» (es pendiente, como una COMIDA
  suelta). `/admin/otros-gastos` no la lista
  (solo empresa). «Gastos del vuelo» la pinta con su etiqueta, sin destino
  en verde (eso es solo de las comisiones del vendedor).
- **Capturas viejas**: el camino manual es Verificar / editar → reclasificar
  un «Otros gastos VuelaTour» CON vuelo a «Comisariato» (sale de «otros
  gastos» y entra a la columna OTROS del vuelo; el balance y el reparto de
  ese mes cambian al regenerarlos).
- **Pruebas**: `lib/admin/__tests__/categorias-gasto.test.ts` (tabla, orden,
  listas, vuelo, IA, `hojaDestinoGasto` por rama, ayuda exacta, zod con y
  sin vuelo, paridad de 22 y espejo del API) y
  `components/admin/expenses/__tests__/comisariato-ui.test.tsx` (hint,
  cableado de los dos diálogos, «Gastos del vuelo»).
- **Orden de deploy**: migración `20261013000001` → API 0.0.75 → **panel**
  (el 0.0.74 rechaza la categoría con el 400 de `IsEnum` y el panel solo
  muestra el toast) → APK.

## Medio de pago «Pago domiciliado» (13-oct-2026, API 0.0.75, invariante 64 del API)

Pedido del cliente (13-oct-2026): «a la hora de vincular un gasto… no viene
en método de pago algo que diga Pago domiciliado». Contrato con el API
**0.0.75** (migración `20261013000009`, 8.º valor de `public.medio_pago`; se
renumeró desde la 000004, que ya usa la comisión del vendedor del avión).

- **Qué es**: `DOMICILIADO` = «Pago domiciliado», cargo AUTOMÁTICO a la
  cuenta (suscripciones, seguros, servicios). Es BANCARIO: se concilia con
  el cargo del estado de cuenta como una transferencia (auto-cruce, «Vincular
  gasto» SIN justificación ni interruptor, «Gastos sin banco», pre-cierre,
  columna/filtro «Banco»). Sin tarjeta (el CHECK de la BD y el acoplamiento
  medio↔tarjeta de Verificar ya mandan `tarjeta_terminacion` null). Solo lo
  registra la oficina: el API responde 400 `MEDIO_SOLO_OFICINA` («El pago
  domiciliado lo registra la oficina: elige otro medio de pago.») a
  piloto/mecánico/visitante en el ALTA. La IA de tickets nunca lo sugiere.
- **Fuente única** `lib/admin/medios-pago.ts`: etiqueta en
  `MEDIO_PAGO_LABELS`, `MEDIOS_CAPTURA_VALUES` con el orden del selector
  (TRANSFERENCIA, **DOMICILIADO**, PAYWISE, EFECTIVO, TARJETA_CORP,
  PERSONAL_PABLO, PERSONAL_ALE; `MEDIOS_VERIFICACION` = + BODEGA), que
  gobierna el selector del alta, el `z.enum` del alta y la validación de
  `?medio=` de Gastos; `MedioPagoEnum` (Verificar) lo trae antes de BODEGA.
  `AYUDA_MEDIO_DOMICILIADO` / `ayudaMedioPago(medio)` = el hint bajo el
  selector en los dos diálogos («Cargo automático a la cuenta (suscripción,
  seguro, servicio). Se concilia con el cargo del banco como una
  transferencia; no lleva tarjeta.»). Filtro «Medio» de Gastos: tras
  «Transferencia».
- **BODEGA nunca viaja al API (verificación del lote 2, 14-oct-2026)**: el
  enum `MedioPago` del DTO del API (alta Y PATCH: `UpdateGastoDto extends
  PartialType(CreateGastoDto)`) no trae BODEGA —lo pone solo la salida de
  inventario— y «Verificar / editar» mandaba SIEMPRE el medio del
  formulario: los 20 gastos BODEGA de prod no se podían verificar ni editar
  (400 «medio_pago must be one of the following values: …»). Fuente única
  en `medios-pago.ts`: `medioPagoAceptadoPorApi` (= los de captura) decide
  qué viaja — `verifyGastoAction` omite el resto (el API conserva el medio
  guardado) y la IA de «Reanalizar» solo propone uno aceptado — y
  `opcionesMedioVerificacion(gasto.medio_pago)` ofrece «Bodega (inventario)»
  SOLO a un gasto que ya lo es (en cualquier otro, elegirlo sería un no-op).
  Pruebas: `medios-pago.test.ts` (con la paridad contra el enum del DTO del
  API, si el repo hermano está al lado) y
  `app/admin/expenses/__tests__/medio-bodega-action.test.ts` (PATCH sin
  `medio_pago`, cableado del diálogo).
- **Espejo bancario** `MEDIOS_BANCARIOS_CONCILIACION`
  (`lib/admin/conciliacion-no-bancario.ts`) = `["TARJETA_CORP",
  "TRANSFERENCIA", "PAYWISE", "DOMICILIADO"]`, en el MISMO orden que
  `MEDIOS_BANCARIOS` del API (el test espejo lo lee del repo hermano por
  regex). De ahí salen solos `esMedioNoBancario` (false), la columna «Banco»
  (`conciliacion-estado.ts`: SIN_CONCILIAR / PARCIAL / CONCILIADO) y la liga
  automática de «¿No está el gasto? Créalo».
- **Prellenado desde el cargo** (`gasto-desde-cargo.ts`): si
  `pareceCargoRecurrente(descripcion)` (`RE_CARGO_RECURRENTE` =
  `/\bCARG\.?\s*RECUR|\bRECURRENTE\b|DOMICILIA|CARGO\s+AUTOM|SUSCRIP/i`) el
  alta abre con «Pago domiciliado» y SIN tarjeta, aunque la referencia traiga
  8+ dígitos (casos reales: «STR*AMAZON RET REC Carg Recur.», «DLO*STARLINK
  Carg Recur.», «03 POR COBRANZA DOMICILIADA» con 20 dígitos que NO son una
  tarjeta); si no, la regla de siempre (tarjeta con 8+ dígitos, si no
  transferencia). «RECURSOS HUMANOS» no dispara la regla. La oficina puede
  cambiar el medio antes de guardar.
- **Textos de Conciliación que nombran los medios bancarios** (revisión del
  lote 2, 14-oct-2026): la nota al pie de «Vincular gasto»
  (`NOTA_VENTANA_CARGO`), el aviso de excluidos `EFECTIVO_U_OTRO_MEDIO` y la
  descripción de la pestaña «Gastos sin banco» decían «tarjeta,
  transferencia, PayWise» mientras un «Pago domiciliado» salía ahí mismo como
  candidato: hoy los dos primeros se arman con `mediosBancariosEnFrase()`
  (`conciliacion-no-bancario.ts`: `MEDIO_BANCARIO_EN_FRASE`, una frase por
  código de `MEDIOS_BANCARIOS_CONCILIACION` en su orden — «tarjeta,
  transferencia, PayWise o pago domiciliado»; un medio bancario nuevo sin
  frase rompe el test, no el texto) y la corrección sugerida dice «Si en
  realidad se pagó con tarjeta, transferencia o pago domiciliado…»; la
  pestaña dice «Pagados con tarjeta corporativa, transferencia, Paywise o
  pago domiciliado…». No se usa `medioPagoLabel` (las etiquetas de selector
  no van en minúscula dentro de una oración).
- **Pruebas**: `lib/admin/__tests__/medios-pago.test.ts` (orden, etiquetas
  de los 8 valores, zod, ayuda), `conciliacion-no-bancario.test.ts` (lista,
  espejo del API y la frase de los medios en los tres textos),
  `expenses/__tests__/banco-badge.test.tsx` y `gasto-desde-cargo.test.ts`
  (casos reales).
- **Orden de deploy**: migración `20261013000009` → API 0.0.75 → **panel**
  (con un API previo el selector lo ofrece y el API responde el 400 de
  `IsEnum`, legible y sin escribir nada). El espejo del API (test) solo pasa
  cuando el API trae `DOMICILIADO` al final de `MEDIOS_BANCARIOS`.

## TUA incluida en este gasto (13-oct-2026, API 0.0.75)

Caso real (#383): la factura del aeropuerto traía la TUA ($559.63 MXN con
IVA) DENTRO de su total de $1,925.27 y la IA la leyó con la etiqueta corrida
(«Autobuses» en vez de «Tarifa TUA»): el balance cargó esa TUA al avión como
operación. «TUA sistémica»: pyservices pide la tabla resumen más estricta y
manda `tua_monto` (la TUA con IVA leída aparte), y la OFICINA puede fijar la
TUA de un gasto en «Verificar / editar». Contrato con el API **0.0.75**
(migración `20261013000008`, columna `gasto.tua_incluida`; se renumeró desde
la 000003, que ya usa la comisión del vendedor del avión).

- **Qué es**: `gasto.tua_incluida` = override de OFICINA sobre la lectura de
  la IA, CON IVA y en la moneda del gasto. `null` = usar la lectura de la IA;
  `0` = esta factura no cobra TUA (todo el ticket es costo del avión); `> 0` =
  esa TUA se separa del costo del avión y va a «Otros movimientos» del
  Balance general, junto a la TUA cobrada al cliente.
- **Prioridad (la decide el API, `common/desglose-gasto.util.ts#partesDeGasto`;
  el panel NO calcula ninguna TUA)**: oficina > renglón de la IA reconocido
  como TUA > `tua_monto` SOLO si ningún renglón es TUA y la tabla CUADRA (una
  lectura rota no se repara: regla del 26-ago, caso #118). Lo que separa la
  lectura lo dice el API: `tua_detectada_ia` en el gasto (GET lista y
  detalle) y `tua_detectada` en una lectura fresca (`POST
  /v1/vision/gasto-ticket` y «Reanalizar con IA»). `tua_monto` crudo solo se
  ENSEÑA como sugerencia (`tuaLeidaIa`). Un 0 de oficina gana aunque un
  reanálisis posterior lea la TUA bien (decisión humana sobre esa factura);
  volver a la IA = vaciar el campo y guardar.
- **FUENTE ÚNICA** `lib/admin/tua-incluida.ts` (PURA):
  `CATEGORIAS_TUA_INCLUIDA` (= `['OPERACIONES','ATERRIZAJE','FBO']`, COPIA de
  la del API; el test de paridad lee `common/desglose-gasto.util.ts` del repo
  hermano) + `categoriaAdmiteTuaIncluida`, `ETIQUETA_TUA_INCLUIDA` («TUA
  incluida en este gasto»), `apiConTuaIncluida` (la LLAVE existe = API con la
  migración), `valorFormTuaIncluida`, `tuaLeidaIa`, `placeholderTuaIncluida`
  («IA: 559.63» / «0.00»), `ayudaTuaIncluida` (cinco textos + el sufijo «Este
  gasto no tiene vuelo…»), `notaTuaVigente` («Vigente: fijada por oficina
  ($559.63 MXN). Borra el valor y guarda para volver a la lectura de la
  IA.»), `mensajeTuaMayorQueTicket` / `errorTuaIncluida` (MISMOS textos que
  los 400 del API: «La TUA incluida ($600 MXN) no puede ser mayor que el
  monto del ticket ($559.63 MXN, sin propina).», «La TUA incluida no puede
  ser negativa.», «La TUA incluida no es un número válido.») y
  `tuaIncluidaParaPatch`. Ningún componente redacta estas frases.
- **«Verificar / editar»** (`expense-verify-dialog.tsx`): el campo va en su
  propia fila JUSTO debajo de «Monto del ticket / Propina» y se pinta SOLO
  con la llave `tua_incluida` del API Y la categoría en la lista (con un API
  sin la columna ni se pinta ni viaja: cero 400 por `forbidNonWhitelisted`).
  Debajo, con cifra guardada, la nota de la vigente (en la moneda del gasto
  GUARDADO). El error local se ve mientras se escribe (`error` del `Field`) y
  frena el guardado con un toast, evaluado SIEMPRE que el campo tenga valor
  (también si solo cambió el monto: bajar el monto por debajo de la TUA se
  ataja antes del 400 «vigente» del API) — salvo con moneda nueva y la
  cifra sin reescribir (`tuaSeLimpiaPorMoneda`): no viaja y el API la
  limpia, así que validarla contra el ticket en la moneda nueva frenaría en
  falso. **La llave viaja SOLO si cambió**
  (`null` al vaciar una vigente) **o si cambió la moneda del gasto Y la
  oficina REESCRIBIÓ la cifra en el campo** (`tuaEditada`: tecleó en él,
  aunque sea el mismo número; así la confirma en la moneda nueva). Revisión
  del lote 2 (14-oct-2026): antes la cifra PRECARGADA viajaba siempre con la
  moneda nueva y el API la aceptaba tal cual (USD 1,000 con TUA 300 → MXN
  17,500 guardaba 300 MXN de TUA en silencio; «Reanalizar con IA» podía
  cambiar la moneda sin que nadie tocara el campo). Hoy, sin reescribirla, la
  llave NO viaja y el API la LIMPIA por la moneda (USD y MXN nunca se
  mezclan). Campo oculto (categoría fuera de la lista) ⇒ no viaja y el API
  la limpia solo (con bitácora). **Las dos limpiezas se AVISAN y se
  CONFIRMAN** (regla del cliente: lo destructivo confirma): `tuaQueSeBorra`
  (espejo de `decidirTuaIncluidaEnUpdate`; solo con la llave del API y una
  TUA de oficina > 0 — un 0 nunca se borra solo) da el motivo y el texto:
  CATEGORIA bajo el selector («Al guardar se borrará la TUA incluida de
  $559.63 MXN que fijó la oficina: «Comida» no lleva TUA (solo
  Operaciones, Aterrizaje o FBO).»), MONEDA bajo el campo («La TUA incluida
  ($300 USD) estaba en USD: al guardar con MXN se borrará (USD y MXN nunca
  se mezclan). Si este gasto lleva TUA, escríbela en MXN.»); con la cifra
  reescrita en otra moneda, `notaTuaMonedaNueva` («Se guardará en MXN:
  $5,250 MXN.»). Al guardar, tras la confirmación de fecha
  (`continuarGuardado`), un borrado abre «¿Borrar la TUA incluida?» con
  «Revisar» / «Sí, guardar y borrar la TUA» antes del PATCH. `tua_incluida` no es dinero del banco: se
  corrige aunque el gasto esté conciliado. La lectura fresca se persiste SIN
  `tua_detectada` (es cálculo); `tua_monto` sí se queda. El bloque «Desglose
  leído» no cambió: ya pinta la línea «TUA (IVA incluido) - $X MXN» que
  compone el API.
- **Schema**: `GastoVerifySchema.tua_incluida` (preprocess: vacío/espacios ⇒
  no viaja, `null` ⇒ null, si no `Number`; mín. 0; mensajes del API) — sin
  declararla, el `z.object` la TIRA. `GastoCreateSchema` no cambia (la TUA se
  captura en Verificar). `stripEmpty` conserva el `null` («volver a la IA»).
- **Historial de gastos del vuelo**: «TUA incluida: Lectura de la IA →
  $3,443.89» (`null` se pinta «Lectura de la IA» y la línea siempre es «antes
  → después», nunca «se agregó» / «se quitó»: `CAMPOS_NULL_CON_NOMBRE`).
- **Pre-cierre**: **RETIRADO el 15-oct-2026** (ver «## Pre-cierre: fuera
  `pistas_sin_gasto` y `tua_cobrada_sin_pagada`…» al final) — renglón NO
  bloqueante `tua_cobrada_sin_pagada` («Vuelos con
  TUA cobrada al cliente sin TUA pagada», justo después de
  `vuelos_sin_gasto_operaciones`): renderer genérico (chips `#folio` al
  vuelo, `monto_usd` = TUA cobrada sin IVA, `lectura_fallida` ⇒ «sin
  verificar») + «Resolver →» a `/admin/expenses` (la factura del aeropuerto
  se corrige en Verificar / editar). `PreCierreVuelo.tua_cobrada_usd` es
  aditivo.
- **Tipos** (todos ADITIVOS): `Gasto.tua_incluida?: string | number | null`,
  `Gasto.tua_detectada_ia?`, `GastoTicketIA.tua_monto?` y `.tua_detectada?`,
  `GastoVerifyValues.tua_incluida`.
- **Pruebas**: `lib/admin/__tests__/tua-incluida.test.ts` (textos exactos,
  qué viaja, paridad con el API), `app/admin/expenses/__tests__/
  tua-incluida-schema.test.ts` (zod y el PATCH real de `verifyGastoAction`) y
  `components/admin/expenses/__tests__/tua-incluida-ui.test.tsx` (el diálogo
  REAL con la llave, sin ella, COMIDA, 0, leída, sin vuelo y el error en
  vivo; el historial; el pre-cierre renderizado; el cableado del guardado).
- **Orden de deploy**: pyservices → migración `20261013000008` → API 0.0.75 →
  **panel** (con un API viejo o sin la migración el gasto no trae la llave y
  el campo simplemente no se pinta). Avisar al cliente: capturar la TUA o
  «Reanalizar con IA» + guardar un gasto viejo mueve el balance de ESE mes
  (septiembre ya cerrado incluido).
- **Pendientes conocidos**: sin QA visual en navegador; los chips del
  pre-cierre no pintan la TUA cobrada por vuelo (el total va en el
  renglón). RESUELTO en la revisión del lote 2: al reclasificar fuera de la
  lista (o cambiar la moneda sin reescribir la cifra) el panel avisa y
  confirma antes de que el API limpie la cifra de oficina.

## Ingreso asignado a un avión (13-oct-2026, API 0.0.75)

Pedido del lote 2 del 13-oct-2026: un ingreso registrado en Ingresos que es
DE UN AVIÓN (reembolso de su servicio o de su aseguradora, venta de una pieza
suya…) debe sumar al balance de ese avión y a su reparto a socios, no a
VuelaTour. Caso real: ING-4 ($46,550.80 MXN, 4-sep, «reembolso del pago del
serv de 50 hrs en toledo», pagador = el socio al 51 % de N990GG). Contrato con
el API **0.0.75** (migración `20261013000005` = solo CHECK
`ingreso_aeronave_chk` + COMMENT; la columna `ingreso.aeronave_id` existe
desde el 24-sep). Hasta hoy el avión de un ingreso era «solo referencia: el
dinero va a VuelaTour».

- **El avión MANDA (regla del API, el panel solo la DICE)**: un ingreso VIVO
  de RESULTADO (`OTRO_INGRESO`, `INGRESO_BANCARIO`, `REEMBOLSO_DEVOLUCION`,
  `VENTA_ACTIVO`) con `aeronave_id` cuenta UNA vez, en el mes de su `fecha`,
  para ESE avión: hoja «Otros ingresos» de su libro, «(+) OTROS INGRESOS USD»
  de su cascada (suma a la utilidad) y su reparto a socios. Deja de contar en
  «otros movimientos», en el bloque VUELATOUR (empresa) y en los totales de
  VuelaTour del Libro Dinero. Anticipos y aportaciones JAMÁS llevan avión
  (CHECK + 400 `AVION_SOLO_EN_RESULTADO`). Un avión dado de baja cuenta en su
  libro, no en ningún reparto (el reparto computa solo activos).
- **Fuentes únicas**: `lib/admin/categorias-ingreso.ts` gana los 5 exports del
  API con los MISMOS nombres y textos (`categoriaIngresoAdmiteAvion` ≡ suma a
  resultados, `DestinoIngreso`, `destinoIngreso`, `destinoIngresoAvion`,
  `textoDestinoIngreso`; el test de paridad por nombre los congela y repite
  los casos literales del spec del API). `lib/admin/ingresos-ui.ts`:
  `ETIQUETA_AVION_INGRESO`, `OPCION_SIN_AVION_INGRESO`,
  `HINT_AVION_SIN_ELEGIR`, `hintAvionIngreso`, `MSG_AVION_SOLO_RESULTADO`
  (= el fallback de `AVION_SOLO_EN_RESULTADO`), `DESCRIPCION_AVION_DADO_DE_BAJA`,
  `etiquetaChipAvionIngreso`, `textoAvionDetalleIngreso`; `hayMasDatos` ya no
  mira el avión; `erroresFormularioIngreso` marca el avión en un anticipo o
  aportación; `datosAltaDeFormulario` solo lo manda en categorías de
  resultado y `cambiosDeEdicion` manda `null` al reclasificar a anticipo o
  aportación (igual que suelta el vuelo).
- **Alta / edición** (`registrar-ingreso-dialog.tsx`): «Avión (opcional)» sale
  de «Más datos» a la zona A LA VISTA, después de Cliente/«Quién pagó» y antes
  del comprobante, SOLO en categorías de resultado (o con un dato legado
  inválido, que se ve con su error). `SearchableSelect` con «Sin avión
  (ingreso de VuelaTour)» al frente; un avión dado de baja se ofrece igual,
  con la descripción ámbar «Dado de baja: cuenta en su balance, no en el
  reparto» (nunca deshabilitado; `CatalogosIngreso.aeronaves[].activa`
  opcional, lo pasan Ingresos y Conciliación). Si el avión vigente no está en
  el catálogo (no cargó), se conserva con su matrícula: jamás «Sin avión» por
  una carga fallida. El hint dice a dónde cuenta y el «Va a:» es local
  (`textoDestinoIngreso` con la matrícula elegida). Reclasificar a anticipo o
  aportación suelta el avión; `AERONAVE_NO_EXISTE` ya no despliega «Más
  datos»; el resumen del plegable ya no dice «avión». Los `avisos[]` del API
  («Este ingreso cuenta para el avión…» / «…vuelve a ser ingreso de
  VuelaTour…») se pintan con el `toast.warning` de 10 s de siempre.
  `FormularioIngreso` se exporta para la prueba de render.
- **Lista y detalle**: la línea verde bajo la categoría = `destino_etiqueta`
  del API (con un API previo, la de la categoría) y, con avión, el chip
  «Avión N990GG» (title = el destino). El detalle dice «N990GG · cuenta para
  este avión: su balance («Otros ingresos») y su reparto a socios» SOLO con
  `destino: 'AVION'` (con un API previo, la matrícula a secas). Tipos:
  `Ingreso.destino?` y `.destino_etiqueta?` (ADITIVOS, copia del API).
- **Reparto** (`avion-reparto-card.tsx`): fila VERDE «Otros ingresos del
  avión» («reembolsos y ventas registrados en Ingresos con este avión, netos
  de comisión») justo después de «Venta del avión cobrada», SOLO con
  `ingresos.otros_ingresos_avion_usd > 0`, con un renglón por ingreso en el
  tooltip (`tituloOtrosIngresosAvion` sobre `detalle.otros_ingresos_avion`;
  `CascadaRow` ganó `title`). El API ya la incluye en `saldo_disponible_usd`:
  la cascada sigue sumando EXACTO el saldo. Badges: ámbar «Otros ingresos sin
  TC · X MXN» (no entraron al saldo: nunca se inventa un T.C.) e informativo
  «N ingreso(s) con TC oficial». **KpiStrip**: la cifra de «Venta de aviones
  cobrada» NO se mezcla; su hint (y tooltip) suma « · + $X otros ingresos de
  aviones», así Venta + Otros − Gastos − Reserva = Saldo se lee en pantalla.
  Tipos ADITIVOS: `AvionReparto.ingresos.otros_ingresos_avion_usd?`,
  `.otros_ingresos_avion_sin_tc_mxn?`, `.otros_ingresos_avion_tc_oficial_count?`,
  `DetalleOtroIngresoAvion`, `AvionRepartoDetalle.otros_ingresos_avion?`,
  `TcOficialResumen.ingresos?`.
- **Tablero ejecutivo** (`dashboards/page.tsx`): «Ingresos cobrados» gana el
  hint «+ $X otros ingresos de los aviones (suman al saldo)» y la celda
  «Ingresos» por avión una segunda línea «+ $X otros». Identidad del API:
  `ingresos_cobrados_usd + otros_ingresos_aviones_usd − gastos_totales_usd ==
  saldo_disponible_usd`. Tipos ADITIVOS `DashboardResumen.otros_ingresos_aviones_usd?`
  y `DashboardAvion.otros_ingresos_avion_usd?`. Textos en
  `lib/admin/otros-ingresos-avion.ts` (PURO).
- **Balance en pantalla**: hereda la pestaña «Otros ingresos» y la línea de la
  cascada SIN código (el `libro_json` es genérico). En Reportes,
  `DETALLE_BALANCE_POR_AVION` nombra «otros ingresos asignados al avión
  (reembolsos, ventas)».
- **Pruebas (sin DOM)**: `lib/admin/__tests__/categorias-ingreso.test.ts`,
  `ingresos-ui.test.ts`, `otros-ingresos-avion.test.ts` y
  `reportes-ui.test.ts`; `components/admin/ingresos/__tests__/
  registrar-ingreso-avion.test.tsx` (render de `FormularioIngreso`: a la
  vista, hint, «Va a:», anticipo sin campo, legado visible, dado de baja,
  catálogo que no cargó, «Más datos» sin «avión» y cableado),
  `ingresos-pantalla.test.tsx` (chip, línea verde con su respaldo y detalle) y
  `components/admin/profit-sharing/__tests__/otros-ingresos-avion.test.tsx`
  (card con la fila y sus badges, API previo = marcado de hoy, KpiStrip y
  cableado del tablero).
- **Orden de deploy**: pyservices → API 0.0.75 → migración `20261013000005`
  (se recomienda después del API; antes es aceptable si el lote aplica sus
  migraciones juntas) → **panel al final** (es el único que ofrece el
  selector nuevo y sus textos dicen que el ingreso cuenta para el avión; con
  un API previo la lista y el reparto degradan solos —sin `destino_etiqueta`
  ni campos nuevos— pero el hint del alta ya lo prometería). Antes
  del API, el PASO 0 del cliente: confirmar a qué avión pertenece ING-4
  (septiembre 2026 cambia: VuelaTour baja y N990GG y sus socios suben).
- **Fuera de alcance**: filtro «Avión» en la lista de Ingresos (el API ya
  acepta `?aeronave_id`), `EntradaDinero.matricula`, pre-cierre, reporte por
  vuelo y la app Flutter (el piloto no registra ingresos). El vínculo de la
  celda «Otros ingresos» desde Conciliación queda para el punto del enlace al
  balance.

## ID de vuelo por cliente junto al folio (13-oct-2026, API 0.0.75)

Pedido del lote 2 del 13-oct-2026: un ID que el cliente reconozca,
«diego01-131026» = alias del cliente + número de vuelo de ESE cliente (2
dígitos mínimo, fijo al crear el vuelo; el histórico se numeró por fecha de
vuelo) + fecha del vuelo DDMMAA en día Cancún (sin fecha, sin sufijo:
«francisco10»), JUNTO al folio. Contrato con el API **0.0.75** (migración
`20261013000006_vuelo_id_cliente`: `cliente.alias`, el contador
`cliente_consecutivo_vuelo` y `vuelo.consecutivo_cliente`; invariante «ID de
vuelo por cliente junto al folio» del CLAUDE.md del API).

- **El panel NUNCA arma el ID**: `clave_cliente` (string | null) llega ARMADO
  en GET /v1/flights, /v1/flights/:id/snapshot, /v1/quotes y /v1/quotes/:id
  y se pinta TAL CUAL (tipos ADITIVOS `FlightListItem.clave_cliente?`, que
  hereda `FlightSnapshot`, y `PersistedQuote.clave_cliente?`). null o ausente
  (API previo, migración sin aplicar o lectura fallida) = solo el folio. El
  panel no recibe el número del cliente y nadie concatena alias + número
  (candado en `lib/admin/__tests__/clave-cliente-cableado.test.ts`).
  Reprogramar el vuelo o editar el alias re-etiqueta sus vuelos (se calcula
  al leer).
- **El FOLIO no se quita de ninguna pantalla** y sigue siendo la referencia
  del sistema: cobros, gastos, facturas, conciliación, flechas «‹ Anterior» /
  «Siguiente ›», reparto, pre-cierre, PDFs y diálogos siguen solo con el
  folio. Los libros (Excel y balance en pantalla) muestran la CLAVE nueva sin
  código del panel: la arma el API en el payload de pyservices.
- **UI única** `components/admin/clave-cliente.tsx`: `ClaveClienteLinea` (sin
  hooks; mono 11px, `data-clave-cliente`, title «ID del vuelo por cliente:
  alias + número de vuelo de ese cliente + fecha del vuelo (DDMMAA). El folio
  sigue siendo la referencia del sistema.») BAJO el folio en Vuelos
  (`flights-table`), Cotizaciones (`quotes-table`) y la tarjeta «Vuelos» del
  avión (`aircraft-flights-table`), con el encabezado «Folio / ID». En Vuelos y
  Cotizaciones va DENTRO del link del folio (su clic abre lo mismo que la
  fila) y antes del badge del grupo; sin clave, el marcado de la celda es
  byte a byte el de antes (congelado en la prueba). `ClaveClienteCabecera`:
  chip-botón COPIABLE (cursor-pointer, aria-label «Copiar ID del vuelo …»,
  toasts «ID copiado: …» / «No se pudo copiar al portapapeles») JUNTO al h1
  de `/admin/flights/[id]` y de `quote-workspace.tsx`, nunca dentro (el
  título sigue siendo «Vuelo #376»). `copiarClaveCliente(clave, deps)` nunca
  lanza.
- **Búsqueda**: las tres tablas suman la clave a su `searchText` («january02»
  empata por inicio de palabra: el «-» no separa palabras en
  `normalizarTexto`) y sus placeholders dicen «folio o ID tipo diego01». La
  barra de Cotizaciones («Cliente, folio, ID (diego01), ruta IATA…») manda
  `q` al API, que desde la 0.0.75 entiende «january02» y «january02-211026»
  (la fecha escrita se ignora: un vuelo reprogramado se encuentra con su ID
  viejo); con un API previo simplemente no lo encuentra.
- **Textos y reglas** `lib/admin/clave-cliente.ts` (PURO): `ALIAS_REGEX` y
  `MENSAJE_ALIAS_INVALIDO` (los MISMOS literales del API), `aliasSugerido`
  (espejo EXACTO de `public.cliente_alias_default`: primera palabra, mapa
  `ACENTOS_DE`/`ACENTOS_A` de 50 copiado del `translate()`, minúsculas, solo
  a-z, máximo 24, si no queda nada «cliente»; la MISMA tabla de 24 casos del
  dry-run — si cambia uno, cambian los dos), `normalizarAliasCaptura`
  (onBlur: NFD sin marcas, minúsculas, solo a-z, 24), avisos, toasts,
  rótulos y placeholders. La prueba de paridad lee
  `../vuelatour-api/src/common/clave-cliente.util.ts` y la migración
  `*_vuelo_id_cliente.sql` SI el repo hermano está al lado (en Vercel se
  omite).
- **Clientes, tabla**: tipos ADITIVOS `Client.alias?` (ausente = API previo o
  sin migración; cuando viene, nunca es null), `Client.alias_compartido_con?`
  (string[] | null) y `ClientListResponse.alias_disponible?`. El alias va
  bajo el nombre (mono) y el badge ámbar «Alias repetido» (title «También lo
  usa(n): … Sus IDs de vuelo se verán iguales; cámbialo con «Editar».») sale
  SOLO cuando `alias_compartido_con` trae nombres: lo decide el API sobre
  TODO el catálogo (activos e inactivos), no la página filtrada; `null` = no
  se pudo saber ⇒ sin badge. La búsqueda rápida incluye el alias.
- **Clientes, formulario** (`client-form-dialog.tsx`): campo «Alias para el
  ID de sus vuelos» justo después de «Nombre» SOLO si el API lo habilita —
  alta: `aliasDisponible` (= `alias_disponible === true` de la lista, que
  `clients/page.tsx` pasa a `ClientCreateButton`; no depende de las filas
  visibles); edición: la fila trae `alias`. Con un API previo no aparece y así
  no hay 400 por forbidNonWhitelisted. Se maneja FUERA de react-hook-form
  (como es_interno): viaja SOLO si se tocó; vacío ⇒ `null` (= volver al
  sugerido: la BD lo recalcula del nombre ACTUAL); en edición, si quedó
  igual, no viaja. El sugerido es solo el placeholder y NUNCA se manda. En
  vivo: «Ejemplo: diego01-131026 (vuelo 1 del cliente con la fecha de hoy).»
  (con lo que quedará al salir del campo), «Usar el sugerido (diego)», el
  aviso ámbar de re-etiquetado al cambiarlo en edición y «Ya lo usa…»
  (GET /v1/clients/alias-en-uso vía `aliasEnUsoAction`, que nunca lanza;
  debounce 400 ms, ligado al alias consultado, sin consultar con el
  formulario vacío; un fallo no avisa ni bloquea). Cambiar el alias NO es
  acción destructiva (es reversible y no borra datos): basta el aviso ámbar,
  sin diálogo. Toasts «Cliente creado · alias «diego» para el ID de sus
  vuelos» y «Cliente actualizado · alias «jchacon»» (este solo si se
  cambió). Schema: `alias` = `z.string().regex(ALIAS_REGEX).nullable()
  .optional()` SIN `.default` (con zod 4 se colaría en el `.partial()` del
  PATCH); `stripEmpty` conserva `null` y descarta `undefined`.
- **Alta rápida** (`quick-client-dialog.tsx`): sigue pidiendo SOLO el nombre
  (no frena la captura del vuelo; el alias queda en el default de la BD). El
  toast dice el alias asignado y, si otro cliente ya lo usa, un
  `toast.warning` con el aviso. Sin alias (API previo) el texto es el de
  siempre.
- **Pruebas (sin DOM)**: `lib/admin/__tests__/clave-cliente.test.ts` (24
  casos, limpieza, textos exactos y paridad con el API),
  `lib/admin/__tests__/clave-cliente-cableado.test.ts` (páginas, cabeceras,
  barra, `searchText` y que nadie arme el ID),
  `components/admin/__tests__/clave-cliente.test.tsx` (línea, chip y copiar),
  `components/admin/__tests__/clave-cliente-tablas.test.tsx` (las tres
  tablas con y sin clave), `app/admin/clients/__tests__/alias-actions.test.ts`
  (el BODY real del alta/edición y `aliasEnUsoAction`),
  `components/admin/clients/__tests__/clients-alias.test.tsx` (tabla y
  cableado del formulario) y `client-form-alias.test.tsx` (render del campo).
- **Orden de deploy**: migración → pyservices → API 0.0.75 → panel. El panel
  tolera un API previo (todo opcional: sin clave se ve solo el folio y el
  alias no se ofrece). La app Flutter no cambia (sigue mostrando «#NNN»).

## Inventario: alta de producto con el costo PENDIENTE (28-sep-2026)

Pedido del cliente con la captura del alta de producto: «me ayudas a poder
agregar productos sin costo ya que lo tenemos como pendiente, pero necesitamos
ingresarlo a la bodega». Hasta hoy la «Entrada inicial» del formulario exigía
costo > 0 (toast «Captura el costo unitario de compra de la entrada inicial
(mayor a 0) o borra la cantidad.») y la pieza no podía entrar a bodega. **Sin
cambios en el API ni migración**: `POST /v1/inventory/items/:id/movimientos`
ya aceptaba ENTRADA con `costo_unitario_usd: 0` (`@Min(0)` del DTO, CHECK
`costo_unitario_usd >= 0` en prod, verificado con SELECT el 28-sep), `fijaPrecio`
exige > 0 (no fija el último precio de compra) y el filtro `sin_costo=true`
(banner «entradas de bodega sin costo» de `/admin/inventory`) la lista.

- **Sin costo = decisión EXPLÍCITA, nunca accidente.** Con cantidad > 0 y el
  costo vacío o en 0, «Crear ítem» valida TODO lo demás (ubicación a medias,
  empaques) y en vez de crear abre un `AlertDialog` **«¿Registrar la entrada
  sin costo?»** — «La pieza entra a bodega con N unidades y el costo queda
  PENDIENTE. Mientras no lo captures, las salidas de esta pieza se cobran a $0
  (sin cargo al avión) y así se quedan aunque después captures el costo; la
  pieza tampoco cuenta en el valorizado. Lo completas después desde la ficha del
  producto («Cardex completo» → «Editar costo») o con «Completar costo» en el
  aviso de entradas sin costo de Inventario.» (texto corregido en la revisión
  adversaria, ver abajo) — con **«Capturar el costo»** (cancela y lleva el
  foco al campo del costo vía `finalFocus` de Base UI) y **«Registrar sin
  costo»** (crea con lo capturado al pulsar «Crear ítem»). Montado DENTRO del
  `DialogContent` del formulario: Base UI lo anida (Esc cierra solo la
  confirmación). Si el producto trae **precio de venta propio**, el texto NO
  dice «sin cargo al avión» (el API sí carga ese precio: `precioVentaDeSalida`
  origen PRECIO_PRODUCTO) sino «salen con costo $0 (al avión se le carga solo
  el precio de venta del producto)».
- **Payload con costo pendiente**: `{ tipo: "ENTRADA", cantidad, moneda: "USD",
  costo_unitario_usd: 0 }` + fecha Cancún + notas «Stock inicial (alta del
  ítem)» — SIN `costo_unitario_mxn` ni `tc_usd_mxn`, igual que la carga masiva.
  El T.C. NO se exige (no hay nada que convertir) aunque la moneda elegida sea
  MXN; «Editar costo» fija después la moneda real (con $0 arranca en MXN). El
  API sella el T.C. oficial del día en la fila (inofensivo con costo 0). La nota
  NO dice «pendiente» a propósito: sobreviviría a «Editar costo» y mentiría.
- **Con costo > 0 NADA cambia**: MXN exige T.C. («Captura el tipo de cambio
  (MXN por USD) de la compra inicial.»), costo sin cantidad avisa como hoy y el
  payload es byte a byte el de antes. Nuevo: cantidad o costo NEGATIVOS o
  ilegibles son error (antes una cantidad inválida se ignoraba en silencio y un
  costo negativo habría caído a «pendiente»).
- **Aviso en línea** (ámbar, bajo los campos) mientras hay cantidad y el costo
  va vacío/0 (`AVISO_COSTO_PENDIENTE`), y el hint del T.C. cambia a «No hace
  falta mientras el costo quede pendiente…». La ayuda del bloque «Entrada
  inicial (opcional)» agrega `AYUDA_COSTO_PENDIENTE` («Si aún no tienes el
  costo, déjalo vacío: la pieza entra a bodega y el costo queda pendiente para
  completarlo después.»).
- **Al terminar**: toast «Producto creado con N unidades. Costo pendiente:
  complétalo en la ficha del producto.» con la acción **«Ver ficha»**
  (`router.push('/admin/inventory/<id>')`, 10 s). Si la ENTRADA falla, el
  aviso de siempre («Ítem creado, pero la entrada inicial falló…»).
- **FUENTE ÚNICA** `lib/admin/inventario-entrada-inicial.ts` (PURA):
  `decidirEntradaInicial` (NINGUNA · ERROR · CON_COSTO · COSTO_PENDIENTE, con el
  movimiento listo), `costoQuedaPendiente`, `textoUnidades` («1 unidad» /
  «2.5 unidades» / «1,200 unidades»), `textoConfirmarSinCosto(cantidad,
  conPrecioVenta)`, `textoProductoCreadoSinCosto`, títulos/botones/avisos y los
  mensajes de error. El formulario (`item-form-dialog.tsx`) ya no redacta ni
  arma nada de esto: el `onSubmit` decide y `guardar(values, entrada)` crea.
- **Carga masiva (Excel)**: NO se tocó. Hoy su validador del API
  (`inventario-masivo.util.ts`) RECHAZA la existencia inicial con el costo
  VACÍO («La existencia inicial necesita su costo unitario…»); acepta el costo
  `0` explícito con aviso («Costo unitario 0: las salidas de este ítem no
  generarán gasto de bodega»), pero con la moneda MXN (default de la plantilla)
  sigue exigiendo el T.C. aunque el costo sea 0. Para dar de alta sin costo
  desde Excel: costo `0` y moneda `USD`.
- **Pruebas**: `lib/admin/__tests__/inventario-entrada-inicial.test.ts` (sin
  costo ⇒ COSTO_PENDIENTE con USD 0; T.C. no exigido ni enviado; costo > 0 sin
  cambios; errores; textos exactos), `app/admin/inventory/__tests__/
  entrada-sin-costo-action.test.ts` (el 0 sobrevive a zod + `stripEmpty` y llega
  al API sin pesos ni T.C.) y `components/admin/inventory/__tests__/
  entrada-sin-costo.test.tsx` (ayuda en el alta, sin bloque en edición y el
  CABLEADO: la rama COSTO_PENDIENTE abre la confirmación DESPUÉS de validar
  empaques y sale; solo «Registrar sin costo» llama a `guardar`; una sola
  `createMovimientoAction`; toast con «Ver ficha»; `cursor-pointer`).
- **Deploy**: solo panel (el API ya lo soportaba). **Pendientes conocidos**:
  sin QA visual en navegador (la confirmación vive en un portal); la app
  Flutter la hace su propio agente con el mismo diseño.

### Revisión adversaria (28-sep-2026)

Lo que encontró y corrigió la revisión (todo en el panel; API sin cambios):

1. **El texto de la confirmación prometía de más.** (a) El API CONGELA el
   costo de cada salida en su fila: completar el costo después NO cobra las
   salidas que ya se hicieron (`TEXTOS_INVENTARIO.sinCostoVigente`: «esta se
   queda sin cargo»). El texto decía «Mientras no lo captures, … se cobran a
   $0» y dejaba creer que al completarlo se cobrarían: ahora dice «y así se
   quedan aunque después captures el costo» (con precio de venta: «y conservan
   ese costo $0 aunque después lo captures»). (b) «(Compras → Editar costo)»
   no existe en el panel: el bloque COMPRAS de la ficha solo tiene la banda
   «Abrir el cardex para corregir el costo»; «Editar costo» vive en «Cardex
   completo» y el botón de la portada dice «Completar costo». Fuente única del
   «dónde»: `DONDE_COMPLETAR_COSTO`. **La app Flutter debe decir lo mismo**
   (si usa el texto del diseño, quedan distintas).
2. **Un costo > 0 que la BD guarda como $0 entraba SIN confirmación.**
   `costo_unitario_usd` es numeric(14,4) y el API convierte pesos con
   `round(mxn / tc, 4)`: «0.00001 USD» o «0.0005 MXN» a T.C. 17.5 pasaban como
   CON_COSTO y la pieza quedaba sin costo en silencio (y con el toast normal).
   Ahora es error `MSG_COSTO_EN_CERO` («…se guardaría como $0: captura el costo
   real, o déjalo vacío…»), vía `costoSeGuardariaEnCero`. Sin T.C. en pesos el
   API usa el oficial (desconocido aquí): solo se frena lo que ya es 0 en pesos.
3. **Cantidad que la BD redondea a 0.00** (numeric(12,2), CHECK > 0): «0.004»
   creaba el producto y LUEGO rebotaba la entrada. Ahora `MSG_CANTIDAD_INVALIDA`
   («…mayor a 0 (mínimo 0.01)…») antes de crear nada.
4. **«Registrar movimiento» → ENTRADA con «0» registraba la entrada sin costo
   EN SILENCIO** (y con el costo vacío respondía el crudo
   «costo_unitario_mxn: El costo unitario es requerido»). Es el camino natural
   para meter a bodega sin costo un producto que YA existe. Ahora usa la MISMA
   regla (`clasificarCostoEntrada`): vacío o 0 ⇒ la MISMA confirmación
   «¿Registrar la entrada sin costo?» (y el cuerpo viaja como USD 0 sin pesos
   ni T.C.); un costo en $0.0000 ⇒ error; devolución y ajuste siguen exigiendo
   costo. Ojo con el TEXTO: una entrada a $0 no fija precio, así que en un
   producto que YA tiene una compra con costo las salidas siguen con ese
   precio — `textoConfirmarEntradaSinCosto` decide con `tieneCostoVigente`
   (`tieneCostoVigenteDe(item)` sobre `costo_vigente` de la lista/detalle,
   API 0.0.36): `false` ⇒ el texto del alta; `true` ⇒ «las salidas siguen
   usando el último precio de compra…»; ausente (API previo) ⇒ los dos casos.
   Toast `textoEntradaRegistradaSinCosto`; ayuda del campo
   `HINT_COSTO_ENTRADA_PENDIENTE` (el asterisco de «Costo unitario» ya no sale
   en ENTRADA).
5. **Abierta/cerrada va aparte del cuerpo** (en los dos diálogos:
   `sinCostoAbierto` + el cuerpo capturado). Con `open={cuerpo !== null}` el
   texto se vaciaba durante la animación de salida; y el clic en «Registrar
   sin costo» toma el cuerpo SOLO si el cuadro sigue abierto ⇒ un doble clic
   no crea dos productos/entradas.

- **Lo que se comprobó y NO rompe**: sin confirmación no hay manera de crear
  la entrada pendiente en el alta; «0» explícito pide confirmación; costo > 0
  en MXN sigue exigiendo T.C. en el alta (el movimiento, como antes, lo deja
  opcional); la entrada pendiente llega como `{moneda:"USD",
  costo_unitario_usd:0}` y sale en el banner (`sin_costo=true` ⇒
  `costo_unitario_usd = 0`) y con «Sin costo» en Compras (`sin_costo` del API
  = ENTRADA con costo ≤ 0). El panel no manda `client_request_id` en el alta
  ni en el movimiento (tampoco antes); lo nuevo no agrega reintentos, así que
  no hay caminos de duplicado más allá del doble clic ya cerrado.
- Pruebas nuevas: bloque «un costo > 0 que se guardaría en $0» y
  «clasificarCostoEntrada» en `lib/admin/__tests__/inventario-entrada-inicial.test.ts`,
  «revisión adversaria» en `inventory/__tests__/entrada-sin-costo.test.tsx`
  (render del movimiento en ENTRADA/SALIDA/DEVOLUCIÓN + cableado) y el cuerpo
  del movimiento en `app/admin/inventory/__tests__/entrada-sin-costo-action.test.ts`.

## Seguimiento de la cotización: ajustes por cobrar o agregar (29-sep-2026, API 0.0.43)

Pedido del cliente con la captura del detalle del vuelo #358, señalando la
columna derecha bajo «Pasajeros»: «me ayudan agregando un apartado aquí como
para poner unas notas que se deben agregar a la cotización. Ejemplo: Pablo ya
terminó el vuelito de hoy y los pax pidieron un transporte el cual no está
incluido en la cotización pero se necesita cobrar». Objetivo: que la oficina
anote el ajuste en el vuelo y le dé SEGUIMIENTO hasta reflejarlo en la
cotización — nada de esto se puede olvidar en el cierre mensual. Contrato con
el API 0.0.43 (tabla `vuelo_seguimiento`, migración `20260929000002`).

- **No duplica lo que ya existía**: `vuelo.notas` (PDF), `vuelo.notas_internas`
  (texto libre de «Editar datos») y `escala.notas` (piloto) siguen igual;
  ninguno tiene estado. Esto es OTRA cosa: notas con estado **PENDIENTE →
  RESUELTA** (quién, cuándo y «¿cómo se resolvió?»), reabrir y baja
  (soft delete en el API).
- **Card «Seguimiento de la cotización»**
  (`components/admin/flights/flight-seguimiento-card.tsx`, ancla
  `#seguimiento-cotizacion` = `ANCLA_SEGUIMIENTO`): columna derecha del detalle
  del vuelo, DEBAJO de «Pasajeros» y antes de «Notas». Descripción «Ajustes
  que se deben cobrar o agregar a la cotización (transporte, extras, cambios)
  y su seguimiento.». Lista con PENDIENTES arriba (ámbar) y RESUELTAS abajo
  (verde, «Resuelta por Mari · 29 sep 2026, 17:30» + «↳ resolución»), cada una
  con «Itzi · <fecha Cancún>» y «· Solo seguimiento» cuando no afecta la
  cotización; contador «N pendientes» en el título. Formulario: textarea
  (placeholder «Ej. Los pax pidieron transporte terrestre; no está en la
  cotización, hay que cobrarlo.», ≤1000, Ctrl/⌘+Enter agrega) + switch
  **«Debe reflejarse en la cotización» ENCENDIDO por defecto** + «Agregar
  nota». Acciones: «Marcar resuelta» (diálogo con «¿Cómo se resolvió?
  (opcional)», ≤500), «Reabrir» (directo: no es destructivo) y bote de basura
  que **solo abre** la confirmación «¿Eliminar esta nota de seguimiento?» —
  si la nota sigue pendiente y afecta la cotización, el texto dice que dejará
  de avisarse en la cotización y en el pre-cierre y que lo correcto es
  «Marcar resuelta» (`confirmacionEliminarSeguimiento`).
- **Cabecera del vuelo**: badge ámbar «⚠ N ajustes pendientes de cotizar»
  (`textoBadgeCabecera`, solo las que afectan la cotización) que es un enlace
  al ancla de la card — en el celular la columna derecha queda muy abajo.
- **Cotizador** (`components/admin/quotes/quote-seguimiento-banda.tsx`,
  montada en `quote-workspace.tsx` ARRIBA del papel, junto a las demás
  bandas): banda ÁMBAR **no plegable ni ocultable** «N ajuste(s) pendiente(s)
  por reflejar en esta cotización» con los textos (recortados a 240, completos
  en el `title`), quién/cuándo, «y N más en el detalle del vuelo» y
  «Ver el seguimiento en el vuelo →» (`<Link>` interno: con cambios sin
  guardar, `useCambiosSinGuardar` pregunta). **Desaparece SOLA** cuando ya no
  hay pendientes que afecten la cotización. Vive FUERA del `QuoteCalculator`:
  no toca el guard de CONFIRMADO/RESERVA ni los ids ancla.
- **Pre-cierre** (`reportes/pre-cierre-card.tsx`): el aviso NO bloqueante lo
  arma el API (clave `seguimiento_cotizacion_pendiente` =
  `CLAVE_PRECIERRE_SEGUIMIENTO`, `vuelos[].notas` ADITIVO); el panel solo
  cambia sus chips: «#358 (2 ajustes)» y el enlace va DIRECTO a la card
  (`hrefSeguimientoVuelo`). Un folio 0 se pinta «vuelo», nunca «#0».
- **FUENTE ÚNICA** `lib/admin/seguimiento.ts` (PURA): roles
  (`puedeEditarSeguimiento`: ADMIN/COORDINADOR/FACTURACION escriben; SOCIO y
  ANALISTA leen sin formulario ni acciones; sin rol —`/me` falló— se ofrece,
  el gate real es el API), límites (`TEXTO_NOTA_MAX`, `RESOLUCION_MAX`,
  espejo de los CHECK), `ordenarSeguimiento` (PENDIENTE primero, luego
  `created_at` desc; un estado desconocido cuenta como abierto),
  `contarSeguimiento`, `conteoSeguimientoVuelo` (la LISTA manda; si no cargó,
  los contadores del snapshot; sin ninguno, null — nunca un 0 inventado),
  `bannerSeguimiento` (contador de la COTIZACIÓN manda; el del snapshot solo
  respalda; detalle topado en 20 con «y N más»), `estadoSeguimientoUi`,
  `textoAutoria` (hora Cancún; usuario borrado ⇒ «Alguien») y todos los
  textos. Tipos 1:1 con el API en `types/seguimiento.ts`; aditivos en
  `FlightSnapshot` y `PersistedQuote` (`SeguimientoContadores` +
  `seguimiento_pendientes_detalle`).
- **Red**: `getFlightSeguimiento` (`lib/api/flights-server.ts`) NUNCA lanza y
  distingue tres desenlaces: `ok` (lista, acepta también `{data: []}`),
  `no-disponible` (404 = API previo; 401/403 = rol sin acceso ⇒ la card NO se
  pinta, en silencio) y `error` (502/red/500 ⇒ la card dice «No se pudieron
  cargar las notas de seguimiento.» + Reintentar — **jamás «Sin notas»**).
  Server actions en `app/admin/flights/actions.ts`
  (`crearSeguimientoAction`, `actualizarSeguimientoAction`,
  `eliminarSeguimientoAction`): validan uuid y texto antes del API, mandan
  solo lo que cambió (resolución vacía = `null`), nunca lanzan y revalidan el
  detalle del vuelo **y** `/admin/quotes/:id` (el banner depende de los
  pendientes).
- **Tolerancia (skew de deploy)**: sin contadores en la cotización ni en el
  snapshot ⇒ sin banner ni badge. Con el API nuevo sin la migración, la lista
  llega `[]` y escribir responde 503 `SEGUIMIENTO_NO_DISPONIBLE` (su mensaje
  en es-MX sale en el toast).
- **Pruebas**: `lib/admin/__tests__/seguimiento.test.ts` (roles, orden,
  conteos, respaldo del snapshot, textos, banner que aparece/desaparece/no sale
  con API previo, confirmación de borrado),
  `components/admin/flights/__tests__/flight-seguimiento-card.test.tsx` (orden y
  badges en el marcado, contador, formulario por rol con el switch encendido,
  vacío vs fallo, `cursor-pointer`, y el CABLEADO: el DELETE sale una sola vez
  y solo desde «Eliminar» del diálogo; la card bajo «Pasajeros»; cabecera y
  pre-cierre al ancla) y
  `components/admin/quotes/__tests__/quote-seguimiento-banda.test.tsx` (banner
  con y sin detalle, «y N más», recorte, que no es plegable, que desaparece, y
  que el workspace lo monta antes del cotizador sin condicionarlo a editar).
- **Orden de deploy**: migración → API 0.0.43 → panel (en otro orden no se
  rompe nada: sin contadores no hay banner y sin la ruta no hay card).
- **Revisión adversaria (29-sep-2026)**:
  - El API marca el renglón del pre-cierre con `lectura_fallida: true` y
    `count: 0` cuando no pudo leer las notas. La card filtraba `count > 0` y
    lo escondía, así que el periodo parecía en orden sin haberse verificado.
    Ahora se filtra con `itemPreCierreVisible` y el conteo se pinta con
    `textoConteoPreCierre` («· sin verificar»). Ambos viven en
    `lib/admin/pre-cierre-items.ts` y sirven para cualquier renglón con esa
    bandera.
  - Nota que otra persona ya eliminó (404 `SEGUIMIENTO_NO_EXISTE`): borrar,
    marcar resuelta y reabrir ya no dejan el diálogo abierto repitiendo el
    error. Avisan con `AVISO_NOTA_INEXISTENTE`, cierran y hacen
    `router.refresh()` (`esNotaInexistente`).
- **Pendiente**: que el PILOTO deje la nota desde la app (Flutter, fuera de
  este alcance); editar el texto de una nota ya guardada (el API lo acepta en
  el PATCH; hoy se elimina y se vuelve a anotar); sin QA visual en navegador
  (los diálogos viven en un portal).

## Conciliación: cargo devuelto ↔ su devolución (30-sep-2026, API 0.0.44)

Pregunta del cliente (captura de Conciliación · GASTOS GNRAL): «¿Cómo puedo
conciliar los cargos reembolsados?». Caso real en prod: el 21-sep hay 8 cargos
«ASUR CANCUN» de $825.13 (1 con su gasto, 7 «sin candidato») y el 23-sep 7
abonos «CARGO INDEBIDO 21 SEP 355xx» por el mismo monto (misma referencia). Un
cargo devuelto y su devolución se anulan: NO son gasto ni ingreso. La única
salida era clasificar a mano cada uno de los 14.

- **La regla es del API** (migración `20260930000001_movimiento_bancario_reverso`:
  `movimiento_bancario.reverso_de_id` en el ABONO → el CARGO que devuelve,
  único por cargo, trigger que valida tipo/cuenta/monto ±0.005 y que ninguno
  de los dos tenga gasto/cobro/ingreso; los dos quedan con la clasificación
  canónica «Reverso de un cargo»). El panel NO decide quién empareja con quién:
  pinta candidatos, llama y dice el resultado.
- **Contrato** (todo aditivo; sin él la pantalla queda como antes):
  `GET movimientos/:id/reverso-candidatos` (id = ABONO; cargos pendientes de
  abono.fecha − 60 a abono.fecha), `POST movimientos/:abonoId/reverso
  {cargo_id}` → `{abono, cargo}` (409 `REVERSO_INVALIDO` con `details.motivo`),
  `DELETE movimientos/:id/reverso` (id = cualquiera de los dos ⇒ los dos a
  pendiente), `POST reversos/auto {cuenta_bancaria_id?, desde?, hasta?}` →
  `{emparejados, sin_candidato, ambiguos, detalle[]}`; en `GET movimientos`,
  `reverso_de_id` + `reverso_de {id, fecha, descripcion}` (abono) y
  `revertido_por` (cargo). «Cruzar pendientes» gana el criterio `REVERSO`
  (`por_criterio.REVERSO`, y el conteo `reversos` si el API lo manda aparte).
- **Candidatos desde un CARGO** («Lo devolvió el banco»): el contrato solo
  define el GET para el abono, así que el panel los arma con la lista de ABONOS
  pendientes de la cuenta (`GET movimientos?tipo=ABONO&conciliado=false&desde=
  cargo.fecha&hasta=+60&limit=500`, parámetros que el DTO acepta desde el
  24-sep) filtrada por monto (±0.005) y sin liga/clasificación/pareja; orden:
  devolución cuya pista de fecha es la del cargo → devolución → los demás.
  Desde un ABONO, los cargos del día que dice la descripción («21 SEP») van
  primero (el API ordena fecha desc).
- **FUENTE ÚNICA** `lib/admin/conciliacion-reverso.ts` (PURA): `PATRONES_DEVOLUCION`
  (ESPEJO de la lista del API: CARGO INDEBIDO · DEVOLUCION · REVERSO ·
  CONTRACARGO · ABONO POR ACLARACION · RECLAMACION — si cambia allá, cambia
  aquí), `esDescripcionDevolucion`, `pistaFechaDevolucion`,
  `ordenarCargosParaAbono`, `abonosCandidatosParaCargo`,
  `esConciliadoPorReverso` (sin aditivos ⇒ false), `textoParejaReverso`
  («devuelve el cargo del 21 sep · ASUR CANCUN» / «devuelto el 23 sep · …»),
  `tituloParejaReverso` («Conciliado con: Reverso de un cargo · …»), textos del
  menú, del diálogo, de la confirmación y del toast («Cargo del 21 sep y su
  devolución conciliados»), `mensajeErrorReverso` (404 «Cannot …» = API previo
  ⇒ `apiSinRuta`), `resumenReversosAuto`, `CONFIRMAR_EMPAREJAR_AUTO` (texto
  EXACTO del contrato) y `pistaPendienteDevolucion`. El nombre de la
  clasificación sale de `CLASIFICACION_REVERSO` (`ingresos-ui.ts`).
- **Dónde se ve**:
  - Menú ⋯ de la fila (`movimiento-actions.tsx`): ABONO pendiente ⇒ «Es la
    devolución de un cargo»; CARGO pendiente ⇒ «Lo devolvió el banco». Los dos
    abren `reverso-dialog.tsx` (se monta solo al abrir): lista tipo radio con
    fecha · descripción · ref. · monto, el primero preseleccionado, chip
    «Coincide con la fecha de la descripción» / «Devolución», aviso cuando los
    candidatos son idénticos (los 7 «ASUR CANCUN»: da lo mismo cuál), sin
    candidatos «No hay cargos pendientes por $825.13 en los últimos 60 días» y,
    solo entonces (o con el API previo), «Clasificar solo este abono/cargo como
    «Reverso de un cargo»» (el camino de siempre, un solo lado). Una lectura
    fallida dice «no se pudo» + Reintentar — JAMÁS «no hay candidatos».
  - Fila emparejada (`movimientos-table.tsx`): «Reverso de un cargo» + la otra
    fecha y descripción; tooltip «Conciliado con: …» + las notas del API. Su
    menú ofrece SOLO «Quitar emparejamiento» (editar la clasificación de uno
    rompería la pareja) con confirmación «El cargo del 21 sep y su devolución
    del 23 sep vuelven a quedar Pendientes de conciliar (los dos…)».
  - ABONO pendiente que dice devolución: bajo «Pendiente», la pista «Parece
    devolución» (el API no calcula motivo para abonos).
  - «**Emparejar devoluciones**» (`emparejar-devoluciones-button.tsx`) junto a
    «Cruzar pendientes» en Conciliación y en Ingresos → «Por conciliar»:
    confirma ANTES con el texto del contrato + el alcance (cuenta/rango de la
    vista) y canta el resultado (emparejadas · sin cargo · ambiguas).
  - Ingresos → «Por conciliar»: «Es el reverso de un cargo» pasó a «Es la
    devolución de un cargo» y abre el MISMO diálogo (antes clasificaba solo el
    abono y el cargo se quedaba pendiente para siempre).
  - «Cruzar pendientes» y la importación nombran las devoluciones emparejadas
    (`resumenAutoMatch` / `resumenImportJob`; criterio «devolución de un
    cargo»). El Excel de conciliación lo arma el API (columna «Conciliado
    con»): el panel solo ajustó la descripción del diálogo.
- **Dinero**: nada cambia — los movimientos bancarios no entran al Libro
  Dinero ni al pre-cierre; un abono emparejado queda clasificado y por eso ya
  no aparece en «Por conciliar» ni cuenta como ingreso (lo filtra el API).
- **Pruebas**: `lib/admin/__tests__/conciliacion-reverso.test.ts` (detección
  con las descripciones REALES, pista de fecha, orden de candidatos con los
  movimientos de prod, textos, errores, lote, criterio en «Cruzar pendientes»),
  `app/admin/conciliacion/__tests__/reverso-actions.test.ts` (rutas, cuerpos,
  filtros de la lista para el CARGO, ids inválidos sin llamar al API, error con
  code/status/details) y `components/admin/conciliacion/__tests__/reverso.test.tsx`
  (la tabla pinta la pareja y la pista; API previo intacto; CABLEADO: quitar y
  el lote solo tras confirmar, el botón junto a «Cruzar pendientes», el menú
  de Ingresos ya empareja, `cursor-pointer`).
- **Orden de deploy**: migración → API 0.0.44 → panel. Con el panel nuevo y el
  API previo: el diálogo desde un abono dice «falta actualizar el API» y ofrece
  clasificar solo ese movimiento; desde un cargo lista candidatos pero
  «Emparejar» responde lo mismo; «Emparejar devoluciones» lo dice en el toast.
- **Revisión adversaria (30-sep-2026)** — lo que se corrigió:
  - **La IA de Ingresos clasificaba SOLO el abono.** La propuesta
    `CLASIFICAR_REVERSO` (las de REGLA van marcadas en el lote) dejaba el cargo
    pendiente para siempre —justo la pregunta del cliente— y sacaba el abono
    del alcance de «Emparejar devoluciones». `aceptarPropuestaAbonoAction`
    ahora EMPAREJA: lee `reverso-candidatos` y usa el `sugerido` del API o el
    ÚNICO candidato (`cargoParaEmparejarSolo`); con varios y sin sugerencia NO
    adivina (`textoVariosCargosPosibles`: «emparéjala a mano»). Sin cargo
    pendiente, con el API previo (404 «Cannot GET») o sin la migración (503)
    queda el camino de antes (clasificar el abono). La etiqueta pasó a «Es la
    devolución de un cargo: emparejar con su cargo». Prueba:
    `app/admin/ingresos/__tests__/aceptar-reverso-propuesto.test.ts`.
  - **«Cruzar pendientes» decía el DOBLE.** `reversos` del API cuenta
    MOVIMIENTOS (`ConteoCruce`: el cargo y su devolución suman 2) y el panel lo
    leía como parejas («14 devoluciones emparejadas» por 7). Ahora
    `lineaReversos`: «14 movimientos conciliados como cargo devuelto o su
    devolución».
  - **Migración pendiente = API previo.** El API nuevo sin
    `20260930000001` responde 503 `REVERSOS_NO_DISPONIBLE`; el diálogo lo
    trataba como un fallo cualquiera (sin salida). `esApiSinReverso` lo junta
    con el 404 «Cannot …» y los dos ofrecen «Clasificar solo este…». Y desde un
    CARGO (cuya lista sale de la lectura de siempre) el choque llega al pulsar
    «Emparejar»: el diálogo pasa al estado de error con esa salida, no se queda
    en un toast.
  - **Errores técnicos en inglés**: «Bad Gateway», «fetch failed», «Failed to
    fetch» o un `PARSE_ERROR` de Railway se pintaban tal cual; ahora «El
    servidor no respondió…». `MOVIMIENTO_YA_LIGADO` / `MOVIMIENTO_EN_REVERSO`
    dicen «Este movimiento ya está conciliado» y refrescan la lista.
  - **Detección = espejo EXACTO del API**: frase como INICIO de palabra (el
    panel la buscaba en cualquier parte) + el prefijo del banco «REV …»
    (`patronReverso`: «REV ASUR MERIDA»), que el panel no conocía: la pista
    «Parece devolución» callaba abonos que el lote sí empareja. La pista de
    fecha acepta los meses largos del API («5 SEPTIEMBRE»).
  - Preselección = el `sugerido` del API (el que elegiría el lote; entre
    cargos idénticos, el más antiguo), no el primero de la lista
    (`candidatoPreseleccionado`).
  - El menú ofrece «Es la devolución…/Lo devolvió el banco» solo con
    `conciliado !== true` (un dato viejo conciliado sin liga respondería 409).
  - Textos: los candidatos idénticos desde un CARGO ya no hablan de
    «devoluciones»; clasificar solo un CARGO recomienda ESPERAR la devolución
    del siguiente estado de cuenta (`ayudaClasificarSoloUno`); la
    confirmación del lote sin rango dice «abonos de los últimos 90 días»
    (default del API).

## Conciliación: 1 cargo ↔ N gastos (2-oct-2026)

Caso real (prod, 2-oct): 29 gastos «Pago VIP SAESA» (OPERACIONES,
TRANSFERENCIA, MXN, sin proveedor ni lugar: el nombre vive en las notas;
59,569.87) y 7 SPEI del 24-sep en GASTOS GNRAL que pagan VARIAS facturas a la
vez: 8,404.20 = 3 × 2,801.40; 4,462.75 = 2,231.37 + 2,231.38 (o 2 × 2,231.37 +
0.01: SAESA factura 2,231.375); 2,236.25 = 2 × 1,118.12 + 0.01. Hasta hoy un
cargo solo se ligaba a UN gasto y esos cargos quedaban «Pendientes» para
siempre. Contrato con el API 0.0.52 (migración
`20261002000002_conciliacion_partes.sql`, tabla puente
`movimiento_bancario_gasto`).

- **La regla es del API y de la BD** (`conciliacion_ligar_cargo_gastos`,
  `recalcular_gasto_conciliado`, `tolerancia_lote`): cada gasto entra por lo
  que le FALTA, todos en la moneda de la cuenta, y la suma cuadra con el cargo
  con `tolerancia_lote(N) = min(1.00, max(0.02, 0.01 × N))` (N=2 ⇒ 0.02, N=29
  ⇒ 0.29). Con UN gasto se conserva la regla de hoy (tolerancia 1.00, pago
  parcial, 1↔1 cruzado USD↔MXN). El panel NUNCA decide si un lote cuadra: la
  suma en pantalla es GUÍA visual.
- **Ligado a gasto = `gasto_id != null || gastos_n > 0`**: con 2+ partes
  `gasto_id` y el embed `gasto` vienen NULL (son ESPEJO solo con una parte).
  Nadie vuelve a preguntar `gasto_id` a solas: se usa `tieneGastoLigado` /
  `numeroGastosDe` / `esCargoConLote` / `gastoUnicoDe`. `estaPendiente` de
  `conciliacion-reverso.ts` ya lo hace (el gate principal sigue siendo
  `conciliado`).
- **Campos ADITIVOS** (`types/conciliacion.ts`, todos opcionales; ausentes =
  API previo ⇒ la pantalla de siempre): en `MovimientoBancario` `gastos_n`,
  `gastos[]` (cada uno con `monto_parte`, `lugar`, `notas_primera_linea`;
  `moneda` es la del GASTO), `gastos_suma`, `gastos_diferencia` (el centavo
  del lote: |monto| − Σ partes; jamás se ajusta el gasto) y, solo en la
  respuesta del PATCH, `gastos_estado[]`; en `GastoCandidato` `cruzado`,
  `nota`, `capturado_por`; `GastosCandidatosResponse`;
  `ConciliacionResumenCuenta.diferencia_lotes`.
- **FUENTE ÚNICA** `lib/admin/conciliacion-lote.ts` (PURA, sin engordar
  `conciliacion-parcial.ts`): `toleranciaLote`, la lectura de la liga,
  `estadoLoteCargo` + `textoSumaLote` (verde cuadra / ámbar faltan / rojo se
  pasa; con UN gasto mayor que el cargo es «pago parcial», ámbar),
  `fichaCandidatoGasto` (la `nota` del API → `notas_primera_linea`: sin eso
  los 29 SAESA eran indistinguibles en `descripcionCandidatoGasto`),
  `motivoVetoLote` / `bloqueoDeFila` / `idsParaVincular` (un gasto cruzado o
  de otra moneda se liga SOLO; marcado él se apagan los demás; con 2+ los
  vetados nunca viajan), `normalizarBusquedaMonto` («2,801.40» / «$ 2801.40»
  ⇒ «2801.40»), `estadoBuscadorGastos` (el ERROR va ANTES que el vacío),
  `mensajeErrorBusquedaGastos`, `mensajeErrorVincularGastos` (despacha
  `CARGO_NO_CUADRA` ⇒ `textoCargoNoCuadra`, `LOTE_MONEDA_DISTINTA`,
  `MOVIMIENTO_CON_LOTE`, `GASTO_YA_CUBIERTO` + `details.gasto_id`,
  `API_SIN_LOTE`/`RUTA_NO_DISPONIBLE` ⇒ `MSG_LOTE_API_VIEJO`;
  `CONCILIACION_PARTES_NO_DISPONIBLE` ⇒ `MSG_LOTE_SIN_MIGRACION`), `toastVinculoGastos` («3 gastos vinculados ·
  $8,404.20» + «Todos cubiertos» / «2 cubiertos · 1 parcial (faltan $X)»; con
  uno, `toastVinculoGasto` de siempre), los textos del menú/confirmación,
  `resumenLoteFila` y `textoBusquedaGastos` (columna y búsqueda de la tabla).
  Ningún componente redacta estas frases.
- **Errores técnicos = UNA regla**: `lib/admin/errores-tecnicos.ts`
  (`RE_TEXTO_TECNICO`, `esErrorTecnico`, `MSG_SERVIDOR_NO_RESPONDIO`), movida
  desde `conciliacion-reverso.ts` (que la reutiliza sin cambiar sus textos).
  Quien necesite decidir «¿esto se puede pintar tal cual?» importa de ahí.
- **Red**: `gastosCandidatosMovimiento(movId, {q?, dias?, limite?})`
  (`lib/api/conciliacion-server.ts`, `cache: 'no-store'`, solo viajan los
  parámetros presentes). Actions (`app/admin/conciliacion/actions.ts`, nunca
  lanzan): `gastosCandidatosAction` (uuid; `q` normalizado y recortado a 80;
  `dias` 1..180 y `limite` 1..300 o no viajan; 404 «Cannot GET» ⇒
  `RUTA_NO_DISPONIBLE`; cualquier otro fallo ⇒ `{ok:false, status, code,
  error}` y JAMÁS `data: []`) y `linkMovimientoGastosAction(movId, ids)`
  (uuid y dedupe antes de la red, tope 50; cuerpo `{gasto_ids}` SIN
  `gasto_id`; 400 «property gasto_ids should not exist» ⇒ `API_SIN_LOTE`;
  copia code/status/details; revalida Conciliación).
  `linkMovimientoAction(id, null)` sigue igual = desligar TODO (también un
  lote).
- **Diálogo «Vincular gasto» del CARGO**
  (`components/admin/conciliacion/vincular-gasto-dialog.tsx`, `sm:max-w-xl`):
  `movimiento-actions.tsx` lo monta solo al abrir, como `ReversoDialog`
  (`{openVincularGasto && <VincularGastoDialog …/>}`); el diálogo de ABONO
  (cobros y sobres) se quedó como estaba y ya solo atiende abonos. UNA lista
  con CASILLAS (`max-h-72`): los candidatos del servidor («Gastos candidatos
  · ±30 días», botón «Ampliar a 120 días»), buscador con debounce de 300 ms y
  turno (`pedidoRef`: una respuesta vieja no pisa a la nueva), placeholder
  «Busca por monto (2801.40), proveedor o nota». Cada fila =
  `etiquetaCandidatoGasto` + `descripcionCandidatoGasto` (fecha · monto ·
  vuelo #folio · nota); los marcados suben al principio aunque no coincidan
  con la búsqueda; una fila vetada lleva `input disabled`, `cursor-not-allowed
  opacity-60` y `title`. Debajo, la línea de suma (guía). «Sugerir con IA» NO
  trae su propia lista: marca ★ el sugerido y lo preselecciona (si no venía en
  la lista, entra al frente con su ficha de `sugerencia.candidatos`). Pie
  «Vincular 1 gasto» / «Vincular 3 gastos» con `disabled={pending ||
  marcados.length === 0}` (NUNCA por la suma local); con 1 marcado viaja
  `linkMovimientoAction(id, gasto_id)` y con 2+ `linkMovimientoGastosAction`.
  Un rechazo legítimo (no cuadra, ya cubierto) vuelve a pedir la lista sin
  perder lo marcado; `MOVIMIENTO_CON_LOTE`/`MOVIMIENTO_YA_LIGADO` cierran y
  refrescan. **API previo** (404 de la ruta, 400 del DTO o 503 sin la
  migración): la lista precargada de siempre (`SearchableSelect`, un solo
  gasto, con los candidatos de la IA arriba si ya contestó) + `MSG_LOTE_API_VIEJO`.
- **Columna «Conciliación»** (`movimientos-table.tsx`): rama NUEVA, ANTES de
  las demás, con `conciliado && tieneGastoLigado && numeroGastosDe >= 2`:
  «3 gastos · $8,404.20» + hasta 3 líneas «Operaciones · $2,801.40 · vuelo
  #315» (segunda línea proveedor ?? lugar ?? nota · fecha), cada una con su
  `<Link>` + «y N más» + «diferencia $0.01» cuando `gastos_diferencia ≠ 0`.
  Sin `gastos[]` (skew) ⇒ «3 gastos conciliados» sin ligas y tooltip «detalle
  no disponible: recarga» — JAMÁS «Pendiente». Con UNA parte el marcado es
  IDÉNTICO al de antes (lo congela el test). La búsqueda rápida encuentra el
  cargo por categoría, proveedor, lugar, nota, folio o monto de sus gastos.
- **Menú ⋯**: `vinculadoAGastoOCobro = tieneGastoLigado(m) || vinculadoACobro`;
  con lote, «Desvincular los 3 gastos» → confirmación «¿Desvincular los 3
  gastos?» + «El cargo vuelve a quedar pendiente… (vuelven a «Gastos sin
  banco»; si alguno tiene otros cargos ligados, se queda como pago parcial)»
  → `linkMovimientoAction(id, null)`. «Lo devolvió el banco» sigue oculto con
  `conciliado === true`.
- **Deuda documentada**: `page.tsx` conserva la precarga de 200 gastos SOLO
  como respaldo del diálogo con un API previo (retirarla cuando todo prod
  tenga el 0.0.52). `sugerencias-lote-dialog.tsx` sin cambio (la IA de lotes,
  el motivo `SUMA_DE_VARIOS` y 1 abono ↔ N cobros siguen pendientes en el API).
- **Pruebas**: `lib/admin/__tests__/conciliacion-lote.test.ts` (todo helper
  con los montos SAESA reales, errores técnicos y `estaPendiente` con dato
  inconsistente), `app/admin/conciliacion/__tests__/lote-actions.test.ts`
  (rutas, searchParams, `no-store`, 404 ⇒ `RUTA_NO_DISPONIBLE`, 502 ⇒
  `ok:false` sin data, `q` > 80, dedupe/uuid, cuerpo `{gasto_ids}` sin
  `gasto_id`, 400 ⇒ `API_SIN_LOTE`, 409 copia details, revalidate,
  `linkMovimientoAction(id, null)` intacto) y
  `components/admin/conciliacion/__tests__/lote.test.tsx` (la fila con 3 y 5
  partes, el centavo, el skew sin «Pendiente», 1 parte idéntica, el diálogo
  en render estático y el CABLEADO por regex sobre el fuente).
- **Orden de deploy**: migración → API 0.0.52 → panel ENSEGUIDA (un panel
  viejo pinta un lote como «Pendiente» y ofrece «Vincular gasto»; el API
  responde 409 `MOVIMIENTO_CON_LOTE`, no destruye nada). Al revés también
  aguanta: 404/400/503 ⇒ `MSG_LOTE_API_VIEJO` y la lista de siempre.
- **Revisión del 2-oct-2026 (correcciones)**:
  - **Lo que dice el botón es lo que se liga.** Las fichas de «Sugerir con
    IA» (`sugerir` del API) NO traen `cruzado`, solo `tc_implicito` (> 0 solo
    en los USD contra cuenta MXN): `esCandidatoCruzado` cuenta las dos cosas
    y lo usan `motivoVetoLote` y `estadoLoteCargo`. El diálogo guarda la
    moneda de la cuenta en `monedaRef` para los callbacks de la IA. Y si aun
    así hay un vetado entre varios marcados, `vincular()` NO manda nada y
    avisa con `textoVetadosAlVincular` («Quita el gasto en otra moneda: se
    vincula solo…»): antes `idsParaVincular` lo quitaba en silencio y el
    botón decía «Vincular 3 gastos» para ligar 2.
  - **La IA preselecciona SOLO si no había nada marcado**
    (`marcadosTrasSugerencia`); si ya había, el sugerido solo lleva ★ y la
    caja de la IA lo dice (`textoSugeridoSinMarcar`). Sumarlo armaba un lote
    [A, B] que nadie pidió.
  - **Búsqueda por monto**: `normalizarBusquedaMonto` convierte la coma
    decimal («2.801,40» / «2801,40» ⇒ «2801.40») y redondea a centavos sobre
    el texto («2801.405» ⇒ «2801.41»): el API solo entiende 0–2 decimales y
    lo demás lo buscaba como TEXTO («Ningún gasto pendiente coincide…»).
  - **Errores**: `RE_TEXTO_TECNICO` reconoce «Failed to find Server Action…
    older or newer deployment» (Next con la pestaña abierta durante un
    deploy) ⇒ «El servidor no respondió…» (también en reversos); un 404
    «Movimiento … not found» ⇒ `MSG_MOVIMIENTO_NO_EXISTE` («Ese movimiento
    ya no existe: recarga la página», al vincular cierra y refresca); el 503
    `CONCILIACION_PARTES_NO_DISPONIBLE` dice que falta la BASE DE DATOS
    (`MSG_LOTE_SIN_MIGRACION`, vía `mensajeApiSinLote`), no el API, también
    en el aviso del respaldo; «Desvincular los N gastos» fallido pasa por
    `mensajeErrorBusquedaGastos` (un 502 ya no pinta «Bad Gateway»).
- **Pendientes conocidos**: sin QA visual en navegador (el diálogo vive en un
  portal); el Excel de conciliación y `diferencia_lotes` los arma el API (el
  panel solo declara el tipo).

## Tramo operativo vs tramo del cliente (30-sep-2026, API 0.0.46)

Pregunta del cliente sobre el vuelo #364 (captura de la app): «subí un vuelito
para mañana Cancún, Toledo, que aparece como Toledo a Pulticub, y luego
Pulticub a Cancún, pero en el último tramo aparece "interno (no del cliente)".
¿Por qué aparece ese aviso? ¿A qué se refiere? … aparece como tramo 100».
Itzi dio de alta `CUN→CET` y `CET→PTU` (ferry, 0 pax) y Pablo agregó desde la
app `PTU→CUN` con 4 pax. `POST /v1/flights/:id/operational-legs` guardaba
SIEMPRE `solo_operativa = true` y `orden ≥ 100`, aunque el tramo llevara a los
pasajeros del cliente: quedaba fuera de la cotización, del precio, del reparto
y de «Actualizar la cotización con la operación».

- **Modelo** (contrato API ⇄ panel ⇄ app): tramo DEL CLIENTE = `solo_operativa
  false`, `orden` 1..n (se cotiza, se cobra, reparte, sale en el PDF); tramo
  OPERATIVO = `solo_operativa true`, `orden ≥ 100` (ferry, posicionamiento o
  parada técnica: no se cobra ni entra a la cotización). Desde el API 0.0.46
  «Agregar tramo» decide con `ubicarTramoAgregado`
  (`vuelatour-api/src/modules/flights/tramo-agregado.util.ts`, fuente única):
  **operativo si es FERRY o parada de SERVICIO SIN pasajeros**; una parada de
  servicio CON pasajeros es del cliente (en prod #150, #84 y #57 dejan el avión
  en el taller con el cliente a bordo y están cotizados). Lo demás entra como
  tramo del cliente con el siguiente orden comercial y la cotización lo avisa
  sola (`divergenciasDeOperacion`: «hay un tramo 3 PTU → CUN que no se
  cotizó») y «Actualizar la cotización con la operación» lo incluye.
  **Freno de cronología** (horas sagradas: la cadena de tacómetros camina por
  `orden`): si ya hay un operativo VIVO en `orden ≥ 100` que voló, está volando
  (salida no DEDUCIDA) o sale ANTES que el nuevo, el tramo del cliente queda
  OPERATIVO y la respuesta lo dice en `aviso`. La respuesta trae los aditivos
  `comercial: boolean` y `aviso: string | null`.
- **FUENTE ÚNICA** `lib/admin/tramo-operativo.ts` (PURA, prueba
  `__tests__/tramo-operativo.test.ts`), textos IGUALES a los de la app:
  `ETIQUETA_TRAMO_OPERATIVO` «Operativo · no cotizado» (antes «Interno»),
  `AYUDA_TRAMO_OPERATIVO` «Posicionamiento, ferry o parada técnica: no se cobra
  ni entra a la cotización», `CHIP_OPERATIVO_CON_PAX` «Lleva pasajeros y no
  está cotizado: revisa la cotización» (su `title`, `AYUDA_OPERATIVO_CON_PAX`,
  dice qué revisar SIN afirmar que el precio no lo incluye: en el #364 lo
  cotizado sí lleva un PTU→CUN de 4 pax, pero «Actualizar la cotización con la
  operación» NO lo trae), `AVISO_TRAMO_NUEVO_COMERCIAL` / `_OPERATIVO` /
  `_CLIENTE_OPERATIVO`, `tramoNuevoEsOperativo` + `tipoTramoNuevo` (ESPEJO
  EXACTO de `ubicarTramoAgregado`, freno incluido; si allá cambia, aquí
  también), `avisoTramoNuevo`, `operativoConPasajeros` y `mensajeTramoAgregado`
  (lee la RESPUESTA: `comercial` del API y, con un API previo, `solo_operativa`
  de la escala creada — nunca lo que se pidió).
- **Chip ámbar** (`operativoConPasajeros`): operativo, vivo, no ferry (la card
  ya dice «Ferry · vacío») y pax > 0 — **y NUNCA en un vuelo con
  `itinerario_operativo = true`** (revisión adversaria): ahí las escalas son la
  ruta REAL a propósito y la cotización es otra ruta que no se cruza por tramo
  (`divergenciasDeOperacion` devuelve `[]`). En prod los 7 operativos con
  pasajeros de esos vuelos (#129, #147, #213, #251, #282, #283, #290) SÍ están
  en lo cotizado: el chip habría dicho «no está cotizado» en falso. El dato
  viaja en `FlightSnapshot.itinerario_operativo` (el snapshot del API esparce
  la fila del vuelo; opcional = API previo ⇒ se evalúa como siempre) y la
  página lo pasa a las dos cards como `itinerarioOperativo`. Hoy el único caso
  vivo en prod es el #364.
- **Marcas** (`flights/tramo-operativo-badges.tsx`: `TramoOperativoBadge` +
  `TramoOperativoConPaxBadge`, ninguna redacta texto): «Tacómetros por tramo»
  (`escalas-card.tsx`) y «Asignación por tramo» (`flight-tramos-card.tsx`:
  antes no distinguía el operativo, justo donde se agrega). **Las dos numeran
  por POSICIÓN** (lista ordenada por `orden`, canceladas incluidas — la misma
  regla de la app): «Tramo 3» / «3.», nunca el `orden` crudo. La card de
  tacómetros ponía «·» en vez de número al operativo; desde la revisión
  adversaria también lo numera («3.»): con la etiqueta ya no hace falta
  esconder el número y así las dos cards y la app nombran igual el tramo.
  Avisa, nunca bloquea.
- **«Agregar tramo»** (`flights/operational-leg-sheet.tsx`): ya no se titula
  «Agregar tramo operativo» ni promete que «NO se cobra al cliente». Pie
  INFORMATIVO siempre a la vista (`data-aviso-tramo`) con los MISMOS insumos
  que viajan en el POST (ferry, parada de servicio, pasajeros, fecha) + las
  escalas del vuelo (prop `escalas`, para el freno): ferry o servicio sin pax ⇒
  «Tramo operativo: no se cotiza.» (gris); del cliente ⇒ «Este tramo es del
  cliente: la cotización mostrará que la operación difiere para adoptarlo.»
  (azul); del cliente frenado ⇒ `AVISO_TRAMO_NUEVO_CLIENTE_OPERATIVO`
  («…quedará como operativo y no entrará a la cotización. Si hay que cobrarlo,
  agrégalo como ajuste o extra…», ámbar). Arranca en ferry. Toast:
  «Tramo del cliente agregado» + el `aviso` del API, o «Tramo operativo
  agregado (no se cotiza)»; **si un operativo trae `aviso` (freno) el aviso
  SIEMPRE se dice, con `toast.warning` de 12 s** (antes se tragaba y la
  oficina no se enteraba de que había que cobrarlo). En vuelo COMPLETADO
  conserva «Tramo agregado; el vuelo vuelve a EN VUELO» y aclara cuál quedó.
  `createOperationalLegAction` devuelve `TramoAgregado` (`FlightEscala` +
  `comercial?`, `aviso?`, `idempotente?`).
- **Banda «Ruta operativa» del cotizador** (`quotes/quote-ruta-operativa.tsx`):
  en lectura numera por posición («3.», nunca «100.») y el tag del operativo
  es «operativo · no cotizado» con la ayuda en el `title`; en edición
  (itinerario operativo) un operativo con pasajeros se nombra «T4 operativo»,
  ya no «T4 ferry». Es croma: los fixtures no cambian.
- **Pruebas**: `lib/admin/__tests__/tramo-operativo.test.ts` (textos, regla
  con servicio con/sin pax, freno de cronología caso por caso, chip con
  itinerario operativo, toast con API nuevo y previo y con el aviso del
  freno), `lib/admin/__tests__/tramos-cotizados.test.ts` (bloque «#364» con
  los datos de prod: con orden 3 la cotización avisa y «adoptar» trae los 3
  tramos; con el legado orden 100 el cotizador no lo ve) y
  `components/admin/flights/__tests__/tramo-operativo-ui.test.tsx` (las dos
  cards con el #364 numeradas 1-2-3, sin «Interno» ni «100», ámbar solo con
  pax y nunca con itinerario operativo; el sheet con su título, el aviso por
  defecto y el CABLEADO a los helpers, a la página y al toast ámbar; la banda
  del cotizador en lectura y en edición).
- **Orden de deploy: API 0.0.46 antes que el panel.** Con el panel nuevo y el
  API previo, el pie promete «del cliente» pero el tramo entra operativo: el
  toast lo dice tal cual («Tramo operativo agregado (no se cotiza)») porque lee
  la respuesta.

## Fotos de bucket privado: la URL firmada VENCE (1-oct-2026, API 0.0.48)

Reporte de la oficina (capturas de Gastos): «las fotos de las facturas no
están cargando» — la miniatura de la columna «Comp.» salía como una rayita
blanca y el visor como una franja delgada. Los archivos de `gasto-fotos`
estaban sanos y la firma funcionaba: la página firma las URLs al renderizar
(`POST /v1/expenses/photo-urls`, 1 h) y la oficina deja la pestaña abierta más
de una hora. Al vencer, Supabase responde **HTTP 400 JSON `InvalidJWT ·
"exp" claim timestamp check failed`** y el navegador pinta la imagen rota
(una miniatura que ya cargó no se ve afectada; fallan las que se MONTAN
después: página 2 de la tabla, la búsqueda, el visor, el diálogo «Verificar»).

- **API 0.0.48**: las firmas que alimentan miniaturas pasan a **8 h** y nace
  `POST /v1/storage/firmar {bucket, paths[≤100]}` → `{urls: {path: url},
  expira_en_s}` con LISTA BLANCA de buckets (gasto-fotos, taco-fotos,
  cobro-vouchers, planes-vuelo, facturas, estados-cuenta, documentos-flota,
  ingresos, inventario-fotos) y roles de oficina (PILOTO/MECANICO solo
  gasto-fotos y taco-fotos). La vigencia larga evita el parpadeo; lo que
  sigue es la red para cuando aun así vence.
- **`ImagePreview` renueva su URL** (`components/admin/image-preview.tsx`,
  props nuevas `bucket`, `path`, `firmadaEn?`):
  - **al fallar** (`onError` de la miniatura o del visor) pide otra firma y
    reintenta **UNA** vez; si la nueva también falla, la miniatura es un
    **placeholder gris** (ícono de foto, `title` «No se pudo cargar la foto ·
    clic para reintentar», clic = reintentar) y el visor dice «No se pudo
    cargar la foto» + **«Reintentar»**. Nunca se vuelve a pintar una URL que
    ya falló. Un `onLoad` exitoso devuelve el reintento automático, pero
    **nunca antes de 5 min** (`ESPERA_ENTRE_RENOVACIONES_MS`) desde la
    renovación automática anterior. Revisión adversarial: sin ese freno, una
    miniatura que CARGA y un visor que FALLA con la MISMA URL (archivo que el
    navegador no decodifica, etc.) hacían ping-pong de firmas sin fin — cada
    «cargó» devolvía el reintento. Una firma de 8 h que falla a los minutos no
    venció: volver a firmar no lo arregla. «Reintentar» (el clic) sí pide
    siempre;
  - **antes de usarla**: al ABRIR el visor y al DESCARGAR, si la URL es vieja
    se renueva primero (el visor dice «Cargando la foto…»). «Vieja» la decide
    el `exp` que trae el propio token de Supabase (menos de 10 min ⇒ renueva);
    sin token legible, la edad: más de 50 min desde `firmadaEn` o, sin ella,
    desde el montaje. Por eso las páginas NO necesitan pasar `firmadaEn`: el
    token dice la hora exacta del servidor que firmó (y con 8 h no se renueva
    a la hora en balde);
  - **sin `bucket`/`path`** no hay a quién pedir otra firma: al fallar,
    placeholder SIN llamadas (y «Reintentar» vuelve a probar la MISMA URL);
  - props nuevas (el `router.refresh()` de `RefreshOnFocus` vuelve a firmar
    todo al recuperar el foco) reinician la foto sin cerrar el visor.
- **TODO caller pasa `bucket` + `path`**. `ComprobantePreview` exige `bucket`
  (tipo `BucketFirmable`): Gastos, gastos personales, combustibles, gastos del
  vuelo, verificar gasto, caja chica y pagos de compras = `gasto-fotos`;
  comprobante del cobro = `cobro-vouchers`. Tacómetros: el detalle del vuelo
  usa el path de la escala (`foto_taco_*_url`); taco-live y el histórico del
  avión solo reciben la URL y el path se DERIVA con `pathDeUrlFirmada(url)`
  (`/object/sign/<bucket>/<path>?token=`; si el token trae la llave exacta,
  gana). Un caller nuevo con foto de bucket privado nace con bucket + path.
- **Enlaces a archivos firmados** (`EnlaceArchivoFirmado`, en
  `comprobante-preview.tsx`): el PDF/XLSX/CSV de `ComprobantePreview`, el
  «HEIC» del comprobante de cobro y «Ver foto del plan de vuelo»
  (`flight-meta-sheet.tsx`, bucket `planes-vuelo`, path derivado de la URL;
  una URL legada que no es firmada se abre tal cual). Si su URL ya es vieja,
  pide otra en el MISMO clic (`abrirArchivoFirmado`: abre la pestaña y luego
  le pone la URL); con URL fresca es el `<a target="_blank">` de siempre.
  Regla (la misma del API): toda URL que la página firma al RENDERIZAR y el
  operador usa DESPUÉS (miniatura, visor o href) pasa por `ImagePreview` o
  por `EnlaceArchivoFirmado`.
- **Un path inválido no tumba el lote**: el API rechaza la solicitud ENTERA
  (400 `PATH_INVALIDO`) si UN path trae URL completa, `/` inicial, `\`,
  `.`/`..` o caracteres de control. `esPathFirmable` (espejo de
  `motivoPathInvalido` del API) filtra en la server action (ese path no
  viaja ni recibe URL; los demás del lote sí) y en `ImagePreview` /
  `EnlaceArchivoFirmado` (path inválido = sin path: placeholder sin llamadas
  / enlace tal cual). Hoy (1-oct, SELECT en prod) los 617 `gasto.foto_url`,
  400 `foto_taco_*_url` y el voucher son llaves limpias; el filtro es para el
  primer valor legado que aparezca.
- **Lote, no N llamadas**: la firma nueva va por la server action
  `refrescarUrlsFirmadasAction` (`app/actions/storage.ts`, nunca lanza; un API
  previo con 404 ⇒ `{ok:false}` ⇒ placeholder con gracia) a través de
  `pedirUrlFirmada` (`lib/storage/url-firmada.ts` = `crearPedidorDeUrls`): las
  peticiones de un mismo instante se juntan en UNA llamada por bucket (tope
  100, el del API). Las server actions de Next se despachan UNA POR UNA
  (`docs/01-app/01-getting-started/07-mutating-data.md`): 50 miniaturas
  vencidas en la página 2 de Gastos eran 50 viajes en fila con un «Guardar»
  de la oficina esperando detrás.
- **Las imágenes NO pasan por Vercel** (decisión: Active CPU limitado en el
  plan Hobby): solo la FIRMA va por la server action; el navegador sigue
  bajando la foto directo de Supabase.
- **FUENTE ÚNICA** `lib/admin/foto-firmada.ts` (PURA, sin React ni red):
  `BUCKETS_FIRMABLES`/`esBucketFirmable` (espejo de la lista blanca),
  `pathDeUrlFirmada`, `vencimientoDeUrlFirmada`, `debeRenovarUrl`,
  `crearFotoFirmada` (la máquina de estados que `ImagePreview` conecta con
  `useSyncExternalStore`: una sola firma en vuelo aunque fallen miniatura y
  visor a la vez; la respuesta de una configuración vieja se descarta) y
  `crearPedidorDeUrls`.
- **Pruebas**: `lib/admin/__tests__/foto-firmada.test.ts` (onError ⇒ refresca
  y reintenta una vez; segundo fallo ⇒ placeholder; apertura con URL vieja ⇒
  renueva; `exp` del token vs `firmadaEn`; sin bucket/path ⇒ sin llamadas;
  API viejo; lote por bucket, dedupe y tope; `pathDeUrlFirmada`; freno
  anti ping-pong; `esPathFirmable`), `app/actions/__tests__/storage-action.test.ts`
  (contrato de `POST /v1/storage/firmar`, paths inválidos fuera del lote,
  bucket fuera de la lista blanca sin llamada, 404/403/red ⇒ `{ok:false}` sin
  lanzar) y
  `components/admin/__tests__/image-preview.test.tsx` (marcado de cada estado:
  nunca `<img>` en fallo, placeholder con su tooltip y `cursor-pointer`,
  «Reintentar» del visor, enlace del PDF y del plan de vuelo, y el CABLEADO:
  todo `<ImagePreview>` del panel lleva `bucket`). Un test que renderice algo
  con foto hace `vi.mock("@/app/actions/storage", …)` (la server action
  importa la sesión).
- **Fuera de alcance (no vencen)**: fotos de inventario y de aviones (buckets
  públicos, `getPublicUrl`). Facturas, pólizas y estados de cuenta ya se
  firman al CLIC (`abrirArchivoFirmado`), no al renderizar.
- **Orden de deploy**: API 0.0.48 antes que el panel (con el API previo el
  panel funciona igual que hoy: al fallar la foto, placeholder con
  «Reintentar» en vez del `<img>` roto).

## Combustibles: editar o eliminar una carga + aviso de saldo de IA (1-oct-2026)

Dos pedidos del mismo día. (1) Captura de `/admin/combustibles`: «no puedo
editar un ticket ya subido??? Me apoyan porfa para poder editar» — la tabla
solo ofrecía «Asignar avión» y «Ligar a vuelo». (2) «Me dice que Claude no
está disponible»: el saldo ESTIMADO de créditos de IA estaba en ≈ $0.87 USD
(checkpoint $21.39 del 5-sep − $20.52; $7.44 en la semana) y Anthropic ya
respondía 400 «credit balance is too low»; Configuración pintaba el número sin
ninguna alerta. Solo panel (sin API ni migración).

### Combustibles: el MISMO menú ⋯ de Gastos

- Cada carga lleva `ExpenseActions` en la ÚLTIMA columna (noLink) con el gasto
  COMPLETO (`FuelLoadRow.gasto`, el JSON de `/v1/expenses?categoria=GAS` tal
  cual): «Verificar / editar» y «Eliminar» con su confirmación «¿Eliminar este
  gasto?». No hay un editor propio de combustibles: dos editores del mismo
  gasto es donde se cuela el dato que no cuadra. La cabecera dice
  `AYUDA_EDITAR_CARGA` («Edita o elimina una carga desde el menú ⋯ de su
  renglón.»).
- **Las CUATRO acciones del menú revalidan también `/admin/combustibles`**
  (`verifyGastoAction`, `deleteGastoAction`, `dismissDuplicadoAction`,
  `vistoBuenoGastoAction`): una acción nueva del menú nace con esa línea o la
  tabla de Combustibles se queda vieja tras guardar.
- **Dos catálogos de aviones a propósito**: el menú recibe TODAS las aeronaves
  (`aircraftMenu`, igual que Gastos: una carga de un avión dado de baja
  conserva su matrícula en el selector en vez de aparentar «Sin asignar») y
  «Asignar avión» solo las ACTIVAS. Los proveedores se cargan con
  `degradado.opcional("los proveedores", …)` como en Gastos.
- **Fecha de la carga = UNA regla** (`lib/admin/combustibles.ts`, PURA): una
  carga trae `fecha_gasto` (manda en el mes, el filtro y el Balance) y, si la
  app o la carga masiva la sellaron, `fecha_hora_carga` (la hora; regla del
  API: su día Cancún ES `fecha_gasto`, `combustible-masivo.service.ts`). El
  diálogo «Verificar / editar» solo cambiaba `fecha_gasto` y la carga se mudaba
  de mes con el renglón diciendo la fecha vieja. Ahora:
  - `camposCargaParaPatch(gasto, values)` agrega al PATCH, si cambió
    `fecha_gasto` y la carga tiene hora, `fecha_hora_carga` = la MISMA hora
    Cancún en el día nuevo (`fechaHoraCargaEnDia`, vía
    `isoToCancunInput`/`cancunInputToIso`), en cualquier categoría;
  - el renglón, el orden y «Ligar a vuelo» leen `fechaVisibleCarga` /
    `claveOrdenCarga` / `momentoParaSugerirVuelo`: la hora solo si cae el MISMO
    día que `fecha_gasto`; si no (una carga desfasada vieja), `fecha_gasto`.
- **Tipo y lugar se corrigen en el MISMO diálogo** (bloque GAS, junto a
  Litros): «Tipo de combustible» (`TIPOS_COMBUSTIBLE`, mismas etiquetas que la
  tabla vía `etiquetaTipoCombustible`) y «Lugar» (`normalizarLugarCarga`: sin
  espacios sobrantes y en MAYÚSCULAS; en prod hay IATA y texto como «ASA
  MERIDA»). Viaja SOLO lo que cambió y solo en GAS; vaciar el lugar manda
  `null` (quitarlo). `GastoVerifySchema` ganó `tipo_combustible`, `lugar` y
  `fecha_hora_carga` (zod tira las llaves que no declara: sin ellas el PATCH
  llegaba sin esos campos). El API ya los aceptaba (`UpdateGastoDto` hereda del
  create y `update()` los pasa tal cual).
- **Roles del menú** (`lib/admin/gasto-acciones.ts`, PURA): «Eliminar» solo a
  `ROLES_ELIMINAN_GASTO` (espejo del `@Roles` de `DELETE /v1/expenses/:id`) y
  «Dar visto bueno» solo a `ROLES_VISTO_BUENO_GASTO` (espejo de `POST
  :id/visto-bueno`). Combustibles la ven ADMIN/COORDINADOR/FACTURACION: a
  FACTURACION le salía el toast en inglés «Required role: … Current:
  FACTURACION». Prop OPCIONAL `rol` en `ExpenseActions`; **sin rol no se
  esconde nada** (el API sigue siendo el candado). Gastos y Combustibles la
  pasan desde `getMe().catch(() => null)`; el detalle del vuelo y caja chica
  todavía no (ahí queda la red de abajo). Y `fail()` de
  `app/admin/expenses/actions.ts` traduce el 403 del RolesGuard con
  `mensajeErrorAccionGasto` («Tu rol no tiene permiso para esta acción. Pide a
  un administrador que la haga.»); los demás mensajes del API pasan tal cual.
- **El botón ⋯** lleva `cursor-pointer` (Tailwind 4 deja los `<button>` con la
  flecha), `title` «Más acciones» y un nombre accesible que dice DE QUÉ gasto
  son las acciones (`etiquetaAccionesGasto`: «Acciones del gasto de $4,250.50
  MXN del 01 oct 2026»); los renglones del menú también llevan la manita.
- **Pruebas**: `lib/admin/__tests__/combustibles.test.ts` (fechas Cancún con
  cruce de medianoche UTC, desfasadas, orden, payload y schema),
  `lib/admin/__tests__/gasto-acciones.test.ts`,
  `components/admin/expenses/__tests__/combustibles-editar-carga.test.tsx`
  (cableado tabla/página: un menú por carga, catálogos, rol de `/me`, columna
  Fecha, revalidaciones) y
  `components/admin/expenses/__tests__/expense-actions-menu.test.tsx` (el
  `ExpenseActions` REAL: trigger de Base UI con manita y nombre accesible;
  ítems por rol; «Eliminar» solo ABRE la confirmación).

### Aviso de saldo de créditos de IA (Configuración → Créditos de IA)

- **FUENTE ÚNICA `lib/admin/ia-saldo.ts`** (PURA): nivel, texto, COLOR y
  etiquetas. La sección solo pinta. Niveles (`estadoSaldoIa(saldo, consumo7d)`):
  - `agotado` — ≤ $0 AL CENTAVO ⇒ banda ROJA `role="alert"`;
  - `critico` — menos de `UMBRAL_SALDO_IA_CRITICO_USD` ($1) o no alcanza ni un
    día al ritmo de la semana ⇒ banda ROJA: «…La estimación no cuenta las
    lecturas que fallan, así que la lectura de tickets puede estar fallando
    ya…». Es el caso REAL del 1-oct ($0.87 con $7.44/semana). Con menos de $1
    manda el monto aunque el ritmo diga «días»: cuando la IA ya rechaza por
    saldo, el consumo registrado CAE y el ritmo deja de servir;
  - `bajo` — menos de `UMBRAL_SALDO_IA_BAJO_USD` ($5) ⇒ banda ÁMBAR
    `role="status"` con «unos N días al ritmo de la última semana»;
  - `atencion` — menos de `UMBRAL_SALDO_IA_ATENCION_USD` ($50, el aviso previo
    «acordado» que antes vivía suelto en el componente) ⇒ número ámbar SIN
    banda + «Al ritmo de la última semana alcanza para unos N días.»;
  - `ok` / `desconocido` (sin saldo capturado: `TEXTO_SALDO_IA_DESCONOCIDO`,
    con el vocabulario del panel, nunca «checkpoint»).
- **UN solo color**: `tonoSaldoIa(nivel)` (rojo · ámbar · neutro · apagado)
  pinta el número de la tarjeta Y la banda. Antes el número tenía sus propios
  umbrales ($20 rojo / $50 ámbar) y con $0.87 salía rojo bajo una banda ámbar.
  El rojo a $20 se retiró: rojo = la IA falla o está por fallar.
  `muestraBandaSaldoIa(nivel)` decide la banda.
- **Regla de días congelada** (`textoDiasRestantesIa`): menos de un día ⇒
  «menos de 1 día» (nunca «0 días»), uno ⇒ «alrededor de 1 día», más ⇒ «unos N
  días» (`floor(saldo / (consumo7d / 7))`); sin consumo medible no se inventa
  duración.
- **UN nombre para la captura**: `ETIQUETA_ACTUALIZAR_SALDO_IA` = «Actualizar
  saldo» en la banda, la tarjeta y el estado vacío (era «Registrar el nuevo
  saldo» en la banda: dos verbos para el mismo diálogo). La banda lleva
  además «Recargar en Anthropic» (consola de billing).
- **Consumo de 7 días**: el API no lo manda. `app/admin/configuracion/page.tsx`
  lo saca del `por_dia` del mes en pantalla si ese mes contiene los últimos 7
  días Cancún (`rangoUltimosDiasIa(todayCancun())` + `rangoCubre`); si no (otro
  mes, o días 1–6), una lectura aparte en el MISMO `Promise.all`. Lectura
  fallida ⇒ `null` ⇒ el aviso sale sin «N días» (nunca 0). `diaMas` se
  reutiliza de `conciliacion-auto.ts`.
- **El saldo es una ESTIMACIÓN que se queda alta** (checkpoint capturado a mano
  − consumo registrado; las llamadas que fallan no se registran): por eso el
  nivel crítico existe. El aviso NO recarga créditos: alguien recarga en la
  consola de Anthropic y captura el saldo nuevo con «Actualizar saldo».
  pyservices traduce el 400 de Anthropic a «Sin saldo de créditos de IA en
  Anthropic…» (`app/services/ia_errores.py`).
- **Pruebas**: `lib/admin/__tests__/ia-saldo.test.ts` (caso real, umbrales,
  crítico con y sin ritmo, tonos, banda, etiqueta) y
  `components/admin/configuracion/__tests__/ia-creditos-saldo.test.tsx` (banda
  por nivel, posición, «el número y la banda dicen el MISMO color» para 0.87,
  −0.42, 3.5, 15 y 60, una sola etiqueta, cableado de la página).

### Pendientes conocidos

- Sin QA visual en navegador (menú y banda solo probados como HTML).
- El menú del detalle del vuelo y de caja chica aún no recibe `rol` (muestran
  todo; un 403 ya sale en español).
- Al guardar desde «Verificar / editar» la carga queda sellada como verificada
  por oficina, igual que en Gastos.

## Pagos a socios: CUENTA CORRIENTE de cada socio (v2, 1-oct-2026, API 0.0.50)

Aclaración del cliente (audio del 1-oct-2026, sobre la v1 de esa misma
tarde): «cuando el socio dice: necesito que me adelanten 70,000 pesos de mis
utilidades, necesitamos poder grabarlo en algún lado y que se lleve el
HISTÓRICO de cuánto se le ha ido repartiendo a los socios, cuánto falta por
repartir, cómo se le repartió (transferencia o efectivo), la fecha de la
entrega y algún comprobante escaneado». No es un estatus por mes y avión (la
v1, retirada): es una CUENTA CORRIENTE por socio. Contrato con el API 0.0.50
(tablas `reparto_pago` + `reparto_cuenta_socio`, migraciones
`20261001000001` y `20261002000001`, bucket privado `reparto-comprobantes`).

- **Atajo desde el reparto por avión (2-oct-2026)**: en la tabla «Socio · %
  · Utilidad del periodo» de cada tarjeta, el NOMBRE del socio y el «Ver
  cuenta ›» a su lado llevan a `/admin/profit-sharing/socios/<id>` (donde
  está «Registrar entrega»). Pedido del cliente: «al lado del nombre del
  socio puede mandar al detalle para pagar al socio». Quién lo ve lo decide
  `hrefCuentaSocioDesdeReparto({rol, usuarioId}, socioId)`
  (`lib/admin/reparto-pagos.ts`): ADMIN/ANALISTA/FACTURACION todos; un SOCIO
  solo el suyo (la de otro socio responde 403); COORDINADOR, campo y «sin
  rol», texto plano. La tarjeta (`avion-reparto-card.tsx`) recibe `rol` y
  `usuarioId` de la página. Pruebas: `reparto-pagos.test.ts` y
  `cuentas-socios.test.tsx` (render + cableado).
- **El dinero es del API**: saldo = saldo inicial + Σ utilidades (por MES y
  avión, `compute()` mes a mes desde el arranque de la cuenta hasta el mes en
  curso) − Σ entregas. Generado, entregado, por entregar, saldo corrido,
  estado (`AL_CORRIENTE` |saldo| ≤ $1 · `POR_ENTREGAR` · `ADELANTADO` saldo <
  −$1) y el equivalente en USD de una entrega en pesos llegan calculados. El
  panel solo pinta; `estadoCuentaSocio` es un ESPEJO para un estado que no
  reconoce y `generadoPorSocioEnPeriodo` solo SUMA (en centavos) lo que ya
  está en las tarjetas del reparto.
- **Un adelanto NO es un error**: es una entrega que deja el saldo en
  negativo (azul «Adelantado», a favor de VuelaTour; se descuenta de las
  siguientes utilidades). El 409 `PAGO_EXCEDE_SALDO` se vuelve la
  confirmación «Esta entrega de $X USD supera lo que hay por entregar ($Y
  USD). Se registrará como ADELANTO y el saldo quedará a favor de VuelaTour
  por $Z USD. ¿Registrar?» (X, Y, Z del `details` del API;
  `confirmacionAdelanto`), que reintenta con `aceptar_exceso` y la MISMA
  `client_request_id`. La decisión tras guardar es PURA
  (`pasoTrasGuardarEntrega`).
- **Convención de columnas (la del API, `reparto-cuenta.util.ts`)**:
  `cargo_usd` SUMA a lo por entregar (utilidad —negativa en un mes con
  pérdida— o saldo inicial a su favor) y `abono_usd` RESTA (entregas o saldo
  inicial ya adelantado). El panel las rotula «Generó (+)» y «Entregado (−)»
  (`importesMovimiento` → `{suma, resta}`), nunca «cargo/abono».
- **Pantallas**:
  1. Menú «Pagos a socios» en Tesorería (`/admin/profit-sharing/socios`,
     ADMIN · FACTURACION · ANALISTA · SOCIO). FACTURACION entra aunque no vea
     el reparto. El sidebar marca el href MÁS LARGO (`itemNavActivo`): sin
     eso «Reparto de utilidades» y «Pagos a socios» salían activos a la vez.
  2. `/admin/profit-sharing/socios` (`SociosCuentaTable`, tabla de RESUMEN
     con totales): Socio (aviones y %, avisos del API, «Cuenta sin
     configurar») · Generado («incluye $X de <mes> (en curso…)») · Entregado ·
     Saldo por entregar (con signo; «adelantado» en azul debajo cuando lo
     está) · Estatus · Última entrega · «Registrar entrega» / «Ver cuenta» /
     «Configurar cuenta». KPIs: por entregar (solo saldos a favor
     de los socios: un adelanto no compensa a otro), adelantado, socios por
     entregar y adelantados. Banner de cuentas sin configurar.
  3. `/admin/profit-sharing/socios/[id]` (estado de cuenta): encabezado con
     generado / entregado / **por entregar HOY** (o «Adelantado (a favor de
     VuelaTour)» sin signo, `kpiSaldoCuenta`) / estatus (los `totales` del
     API son de TODA la cuenta hoy aunque el filtro sea otro), avisos,
     banner de cuenta sin configurar POR ROL, filtro Desde/Hasta en meses en
     la URL (`?desde=YYYY-MM&hasta=YYYY-MM`), movimientos con saldo corrido (`MovimientosCuenta`:
     saldo inicial/anterior, una utilidad por mes y avión, el mes en curso
     marcado, cada entrega con monto/T.C./≈USD · método · entregó ·
     recibió/factura · referencia · «corresponde a» · notas · comprobante,
     «Editar» y «Eliminar») y «Por mes» (`ResumenMesesCuenta`). Un id que no
     es uuid o un socio inexistente ⇒ `notFound()`; un SOCIO viendo otra
     cuenta ⇒ «Solo puedes ver tu propia cuenta».
  4. Reparto de utilidades: «Socios · por entregar»
     (`SociosPorEntregarSection`) con CUALQUIER periodo: Socio · «Generó en
     <Mes>» (o «Generó del … al …») · Saldo por entregar (acumulado) ·
     Estatus · «Registrar entrega» (con un mes completo, prellena ese mes en
     «Corresponde a») · «Ver cuenta». La tabla de cada avión volvió a
     «Socio · % · Utilidad del periodo» (`SociosSection`, sin contexto de
     pagos); el atajo «Mes pasado» y el selector de mes se quedan.
- **Diálogo «Registrar entrega»** (`entrega-socio-dialog.tsx`, UNO solo para
  las tres pantallas, `BotonRegistrarEntrega`): socio fijo, «Por entregar
  hoy: $X USD» (o «Adelantado: $X USD a favor de VuelaTour»), monto
  prellenado con lo por entregar si es positivo, USD; al pasar a MXN el monto
  prellenado se vacía y el T.C. se prellena con el oficial de HOY
  (`getContextoRegistro` → `getTipoCambioOficial`; sin dato, vacío); fecha =
  hoy Cancún calculado AL ABRIR (no futura); método SIN prellenar; «Entregó»
  = yo; recibió, folio de factura, referencia, notas; «Corresponde a» mes y
  avión OPCIONALES (informativos: «Sin mes (a cuenta)» / «Sin avión»;
  desde el Reparto con un MES completo llega prellenado con ese mes; en la
  edición también se corrigen — el PATCH del API acepta
  `aeronave_id`/`mes`, `null` los quita). Un `client_request_id` por
  apertura; no se cierra mientras guarda o sube. Tras registrar, PASO 2
  «Entrega registrada» con el saldo que quedó y «Adjuntar comprobante»
  (del navegador directo al API, `lib/api/reparto-pagos-browser.ts`); si la
  subida falla, la entrega SÍ quedó y se reintenta ahí o desde su renglón.
- **«Configurar cuenta»** (`cuenta-socio-dialog.tsx`, ADMIN/FACTURACION,
  `PUT /socios/:id/cuenta`): mes de arranque (últimos 36 meses, espejo de
  `MESES_CUENTA_MAX`) + saldo inicial USD (negativo = ya se le había
  adelantado; máximo 2 decimales, se RECHAZA en vez de redondear) + notas.
  Sin configurar, el API arranca en septiembre 2026 con saldo 0
  (`configurada:false`). Cambiar una cuenta YA configurada pide confirmación
  (el saldo se recalcula; las entregas no cambian).
- **Eliminar una entrega**: diálogo con MOTIVO 5–300 (`EliminarEntregaDialog`,
  el DELETE sale solo de ahí; soft delete en el API).
- **Carga** (`getSociosCuenta`, `getEstadoCuentaSocio`, nunca lanzan):
  `disponible:false` / 404 «Cannot GET» / 503 `CUENTA_SOCIO_NO_DISPONIBLE` ⇒
  «Disponible cuando se actualice el servidor»; 401/403 ⇒ sin permiso; 404
  `SOCIO_NO_EXISTE` ⇒ no existe; red / 500 / el 503 de un deploy ⇒
  `TarjetaErrorCarga` (jamás «sin socios»). `getContextoRegistro` (lista de
  «Entregó» = `/v1/users`, solo ADMIN, y T.C. oficial) es ACCESORIO y solo
  se pide para quien registra.
- **Errores** (`mensajeErrorCuentaSocio`): el texto del API en español gana;
  el panel redacta lo técnico/inglés y los casos en que refresca solo
  (`errorPideRefrescar`: PAGO_NO_EXISTE, PAGO_CAMBIO_CONCURRENTE,
  COMPROBANTE_CAMBIO).
- **Pre-cierre**: `socios_por_entregar` y `socios_adelantados` (no
  bloqueantes) listan los socios con su saldo (`lineasPreCierreSocios`) y
  «Resolver →» lleva a «Pagos a socios». El conteo es de SOCIOS
  (`textoConteoPreCierre`, «sin verificar» con la lectura fallida).
- **Fuente única** `lib/admin/reparto-pagos.ts` (PURA); tipos 1:1 en
  `types/reparto-pagos.ts`; actions en `app/admin/profit-sharing/actions.ts`
  (revalidan reparto, lista y estado de cuenta). Pruebas:
  `lib/admin/__tests__/reparto-pagos.test.ts`,
  `app/admin/profit-sharing/__tests__/cuenta-socios-actions.test.ts`,
  `components/admin/profit-sharing/__tests__/cuentas-socios.test.tsx`,
  `components/admin/profit-sharing/__tests__/entrega-socio-dialog.test.tsx`
  y `lib/api/__tests__/reparto-pagos-browser.test.ts`.
- **Retirado de la v1**: `PagosSociosSection`, `PagosFueraDelRepartoSection`,
  `PagosSocioDetalle`, `PagoSocioDialog`, `EstadoPagoBadge`, la regla de
  «mes completo», los estados PENDIENTE/PARCIAL/PAGADO/SIN_UTILIDAD y el
  pre-cierre `pagos_socios_pendientes` / `pagos_socios_sobrepagados` (el API
  0.0.50 responde 410 `PAGOS_POR_MES_RETIRADO` al `?mes=` de la v1).
- **Orden de deploy**: API 0.0.50 → panel. Con el API 0.0.49 o sin la
  migración 2 el panel dice «Disponible cuando se actualice el servidor».
- **Revisión adversaria (1-oct-2026)** — lo que se corrigió:
  - **Entregas fechadas ANTES del arranque** (un dedazo de año, o «Configurar
    cuenta» que mueve el arranque después de entregas que ya existen): el
    API las suma en el renglón SALDO_ANTERIOR del `desde` por defecto y no
    tenían renglón (ni Editar, ni Eliminar, ni comprobante).
    `escondeEntregasAntesDelArranque` lo detecta (con `desde ≤ arranque`, un
    SALDO_ANTERIOR solo puede ser eso), la página pide
    `getEntregasAntesDelArranque` (`GET /pagos?socio_id&hasta=<día previo
    al arranque>`, nunca lanza; null ⇒ ventana de 36 meses) y pinta
    `AvisoEntregasPrevias` con «Ver entregas anteriores al arranque» →
    `?desde=<mes de la más antigua>`. El selector arranca en el mes MÁS VIEJO
    entre el arranque, el `desde` que se ve y esa entrega
    (`opcionesFiltroMeses`). El diálogo avisa bajo la fecha
    (`avisoFechaAntesDelArranque`, no bloquea).
  - **Un `?desde=`/`?hasta=` que el API rechaza no deja la pantalla en un
    error eterno**: `filtroMesesCuenta(desde, hasta, mesHoy)` recorta lo
    futuro a hoy, descarta un `hasta` SUELTO y sube el `desde` al tope de
    120 meses; y si aun así llega 400 `RANGO_INVALIDO`,
    `getEstadoCuentaSocio` vuelve a pedir UNA vez sin filtro (`filtroIgnorado`
    ⇒ `TEXTO_FILTRO_MESES_IGNORADO`). El selector manda SIEMPRE los dos meses
    (`destinoFiltroMeses`).
  - **Banner de cuenta sin configurar por ROL** (`textoCuentaNoConfigurada`,
    `BannerCuentaNoConfigurada`): la instrucción «configura…» solo a
    ADMIN/FACTURACION; ANALISTA/SOCIO leen un texto informativo («la oficina
    la ajusta»; «Tu cuenta…» si es la propia). Igual el `title` de la
    etiqueta «Cuenta sin configurar» de la tabla.
  - **Adelantado sin signo raro**: el KPI dice «Adelantado (a favor de
    VuelaTour)» con el monto en positivo; las tablas conservan el signo bajo
    «Saldo por entregar» con la marca azul «adelantado»; el saldo corrido de
    los movimientos se colorea (`claseTextoSaldoCorrido`).
  - **«A cuenta», no «adelanto»**: una entrega sin mes es «A cuenta (sin
    mes)» (`TEXTO_A_CUENTA`, opción «Sin mes (a cuenta)») y su renglón dice
    «Entrega a cuenta (sin mes)» / «Entrega · corresponde a Septiembre 2026 ·
    N4142R» (`conceptoEntregaCuenta`, sustituye en pantalla al `concepto` del
    API, que repetía monto/T.C. y decía «Adelanto a cuenta»). «Adelanto»
    queda solo para el saldo < −$1 y el 409. PENDIENTE del API: que su
    `conceptoEntrega` diga «Entrega a cuenta» (lo usa el Excel/PDF).
  - **«Por entregar hoy» dice cuánto es del mes EN CURSO** (diálogo y KPI;
    `ContextoEntrega.mesEnCursoUsd/mesEnCurso`, números del API).
  - **Pre-cierre**: «Mauricio Roque · por entregar hasta Septiembre 2026:
    $1,395.94 USD» (`item.mes` del API o el mes del periodo) / «adelantado
    hoy: $X USD» y `notaPreCierreSocios` explica que «Pagos a socios» enseña
    el saldo de HOY (suma el mes en curso).
  - **Selectores con nombre accesible**: `SearchableSelect` acepta `id`,
    `aria-label` y `aria-labelledby` (los pasa al disparador), así `Field` y
    `<Label htmlFor>` ya nombran al combo; el filtro Desde/Hasta liga sus
    etiquetas. Las pruebas exigen que toda `<label for>` tenga su `id`.
  - **«Por mes»**: la columna es «Entregado (por fecha de entrega)» y la
    descripción lo explica (`AYUDA_POR_MES_CUENTA`).
  - **Piezas renderizadas en prueba**: `estado-cuenta-partes.tsx`
    (`KpisCuenta`, `KpisCuentasSocios`, `BannerCuentaNoConfigurada`,
    `SinPermisoCuenta`, `TarjetaCuentasNoDisponibles`,
    `AvisoEntregasPrevias`) se renderizan en `cuentas-socios.test.tsx`.
- **Pendientes conocidos**: el PDF/Excel del reparto no imprimen las
  entregas; sin QA visual en navegador (marcado probado con
  `react-dom/server`).

## Modelo de IA configurable (2-oct-2026, API 0.0.51)

Pedido del cliente (captura de Configuración → Créditos de IA): «dejar una
opción en la configuración para adaptar el modelo que quieran utilizar,
aunque ahorita dejaremos por default el que estamos usando actualmente». Sin
migración: el API guarda la elección en `configuracion_sistema.ia_modelo`
(upsert) y la manda a pyservices en la cabecera `X-IA-Modelo` SOLO cuando hay
modelo elegido; sin elección, pyservices usa su `ANTHROPIC_MODEL`
(`claude-opus-4-8`). En prod arranca SIN elegir: nada cambia hasta que un
ADMIN guarde.

- **Dónde**: tarjeta «Modelo de IA» (`configuracion/modelo-ia-card.tsx`)
  DENTRO de «Créditos de IA (Anthropic)», arriba del saldo y del consumo
  (también en el estado vacío). La página es solo ADMIN. «Modelo en uso:
  Claude Opus 4.8 (claude-opus-4-8)» + «default del servidor» / «elegido en
  Configuración», quién y cuándo lo cambió, su tarifa (o el aviso ámbar si
  está fuera del catálogo). Selector (`SearchableSelect`) con el catálogo
  —nombre, descripción y «$5 / $25 por millón de tokens»— y «Otro (escribir
  id)» que abre un campo; la nota del ELEGIDO (tarifa o aviso ámbar) solo sale
  cuando es un cambio. El error del campo «Otro» sale hasta que el operador
  SALE del campo (`errorCampoOtroModeloIa`): mientras escribe solo se apaga
  «Guardar». «Guardar» (apagado si no cambia nada) y «Volver al del
  servidor» (solo con elección, manda `null`) **confirman** con los textos de
  `textosConfirmacionModeloIa` (título, cuerpo del contrato, botón y, con un
  id FUERA del catálogo, el aviso ÁMBAR de que si no existe TODAS las
  lecturas con IA fallarán, dentro de la descripción); el `PUT` sale
  únicamente de la confirmación. `abierto` va aparte de la última
  confirmación: al cerrar, el diálogo conserva sus textos durante la
  animación de salida. Tras guardar, toast + el `aviso` del API como warning
  + `router.refresh()`; la tarjeta lleva `key` = el configurado.
- **FUENTE ÚNICA** `lib/admin/ia-modelo.ts` (PURA): `CATALOGO_MODELOS_IA`
  (COPIA literal del de `vuelatour-api/src/common/ia-modelo.util.ts`;
  pyservices NO lleva catálogo, solo comparte la regex: hoy Opus 4.8 · Sonnet
  4.6 · Haiku 4.5 — Sonnet 5 y Opus 5.5 salieron en la revisión del API
  porque corren thinking adaptativo y truncaban las lecturas con los
  `max_tokens` de pyservices; se eligen por «Otro», con su aviso y tarifa),
  `TARIFAS_IA_POR_PREFIJO` (copia de `TARIFAS` de `ia-uso.service.ts`;
  `tarifaModeloIa` con la MISMA regla de prefijo —gana la PRIMERA
  coincidencia, por eso `claude-opus-5-5` (4/20) va antes que
  `claude-opus-5` (5/25)—: desconocido ⇒ sin tarifa = costo 0),
  `REGEX_ID_MODELO_IA` (`^claude-[a-z0-9.-]{3,80}$`, la misma del API y
  pyservices), `normalizarIdModeloIa` (trim + minúsculas),
  `avisoModeloIa` (ESPEJO del API) y todos los textos (los del 400
  `MODELO_INVALIDO`, «fuera del catálogo» y «sin tarifa» son COPIA de los del
  API). Tipos 1:1 en `types/ia-modelo.ts`.
- **Red**: `getModeloIa()` (`lib/api/configuracion-server.ts`) NUNCA lanza:
  `ok` · `no-disponible` (404 = API previo, 401/403 ⇒ la tarjeta no se
  monta) · `fallo` (red/5xx/forma rara ⇒ la tarjeta dice «No se pudo
  cargar…», jamás se esconde). **Va por STREAMING**: el API espera hasta 5 s
  a pyservices (`GET /ia/modelo`), así que la página arranca la lectura junto
  con las demás pero FUERA del `Promise.all` y solo la tarjeta la espera
  (`TarjetaModeloIa` en `<Suspense key={mes}>` con `ModeloIaCardCargando`;
  `IaCreditosSection` la recibe ya armada en `tarjetaModelo`). El `key` hace
  que un cambio de mes enseñe el esqueleto en vez de frenar la navegación.
  `setModeloIaAction(modelo | null)` (`app/admin/configuracion/actions.ts`)
  normaliza y valida ANTES de la red, responde los errores ya en es-MX
  (`mensajeErrorModeloIa`: el 401 de sesión vencida dice «Tu sesión
  venció…», nunca el inglés del API) y revalida Configuración.
  `ConfiguracionClient` filtra la clave `ia_modelo` (no es un switch).
- **Aviso honesto**: con modelo elegido y `default_servidor: null`
  (pyservices viejo o caído) la tarjeta dice que el servidor de IA podría
  seguir usando el suyo (`TEXTO_SERVIDOR_SIN_CONFIRMAR`).
- **Pruebas**: `lib/admin/__tests__/ia-modelo.test.ts` (paridad con la tabla
  del contrato y, si el repo del API está al lado, contra su código: PARSEA
  `CATALOGO_BASE` y `TARIFAS` renglón por renglón y los compara completos
  —orden, cruces y altas—, más la regex y los textos; selección, textos y
  errores),
  `app/admin/configuracion/__tests__/modelo-ia-action.test.ts` (PUT, `null`,
  id inválido sin red, errores; lectura ok/no-disponible/fallo) y
  `components/admin/configuracion/__tests__/modelo-ia-card.test.tsx`
  (estados con esqueleto, posición en la sección y CABLEADO: el PUT solo
  tras confirmar, la tarjeta por streaming fuera del `Promise.all`).
- **Orden de deploy**: pyservices → API → panel; tolerante en cualquier
  orden (API previo ⇒ 404 ⇒ sin tarjeta).

## Pilotos: «Editar datos» del piloto + tarjetas (2-oct-2026, API 0.0.52)

Pedido de la oficina: la coordinación cambia la tarjeta corp. y los datos de
contacto de los PILOTOS sin esperar a un ADMIN. El API abrió
`PATCH /v1/users/:id` a COORDINADOR, ACOTADO (invariante 41 del API): solo
nombre, teléfono, nombre corto y tarjeta de un piloto de base o externo; un
usuario de oficina que también vuela (Pablo Canales, ADMIN + `es_piloto`)
sigue siendo solo de ADMIN ⇒ 403 `SOLO_ADMIN_EDITA_USUARIOS`; otro campo ⇒ el
mismo 403; una tarjeta de OTRA persona ⇒ 403 `TARJETA_DE_OTRO_USUARIO`
(«Esa tarjeta es de <nombre>: un ADMIN la reasigna desde Tarjetas corp.»).
**El candado es el API**; el panel solo OFRECE el botón.

- **La tarjeta del gasto se SELLA al capturarlo**: cambiar la del piloto NO
  toca los gastos anteriores (el diálogo lo dice). Procedimiento: alta de la
  tarjeta nueva en Tesorería → Tarjetas corp. (ADMIN) → vincularla al piloto
  aquí → INACTIVAR la vieja (nunca editar su terminación).
- **FUENTE ÚNICA** `lib/admin/pilotos-edicion.ts` (PURA, prueba
  `__tests__/pilotos-edicion.test.ts`): `puedeEditarPiloto(rol, destino?)`
  (ADMIN y SIN rol —`/me` falló— se ofrece; COORDINADOR solo si el destino
  es `rol = PILOTO` o externo, espejo de `esDestinoEditablePorCoordinador`
  del API), `puedeCambiarAccesoPiloto(rol)` (solo ADMIN o sin rol), textos
  (`BOTON_EDITAR_PILOTO`, `tituloDialogoPiloto`, `DESCRIPCION_DIALOGO_PILOTO`,
  `HINT_TARJETA_PILOTO`, `TOAST_PILOTO_ACTUALIZADO`,
  `HINT_ES_PILOTO_NO_DISPONIBLE`), el cuerpo del PATCH en los DOS modos del
  diálogo (`tarjetaParaPayload`, `payloadModoPiloto`, `payloadModoUsuario`,
  `cuerpoActualizarPiloto`), `opcionesTarjetaPiloto` (en modo piloto solo
  tarjetas libres o ya suyas; `CardOption.usuario_id` es aditivo),
  `usuarioParaEdicion` (solo campos de `User` cruzan al cliente) y
  `mensajeErrorEditarPiloto` (403 de negocio ⇒ texto del API; 403 sin código
  de negocio —RolesGuard de un API viejo— ⇒ «Tu usuario todavía no puede
  editar datos de pilotos (falta actualizar el servidor)…»; técnico ⇒ «El
  servidor no respondió…»).
- **`UserFormDialog` gana `modo?: 'usuario' | 'piloto'`** (default
  `usuario`, idéntico a antes salvo lo de abajo). En `piloto`: resolver
  `PilotoDatosSchema` (= `UserFormSchema.pick({nombre, apodo, telefono,
  tarjeta_terminacion})`, en `app/admin/users/schema.ts`), solo esos campos
  en pantalla (sin Rol/Estado/switches), textos del helper y guardado por
  `updatePilotAction`. **En AMBOS modos**: `tiene_fondo_caja` NUNCA viaja
  (salió del schema y de los defaults: lo mantiene Caja chica); `es_piloto` /
  `es_piloto_externo` viajan SOLO si cambiaron; y si `user.es_piloto` es
  `undefined` (API previo en la lista de pilotos) el switch «También es
  piloto» se pinta DESHABILITADO con su hint y el campo jamás viaja.
  `types/users.ts`: `es_piloto?: boolean`.
- **`updatePilotAction(id, raw)`** (`app/admin/pilots/actions.ts`, nunca
  lanza): uuid antes de la red, valida con el `pick` (zod descarta lo demás),
  `cuerpoActualizarPiloto` (sin `""`, conserva el `null` de quitar), revalida
  `/admin/pilots`, `/admin/pilots/<id>` y `/admin/users`, y devuelve
  `status`/`code` (aditivos en su `ActionResult`) con el error traducido.
- **Botón «Editar datos»** (`components/admin/pilots/editar-datos-piloto.tsx`,
  `cursor-pointer`, monta el diálogo solo al abrir): en la card de la lista y
  en la cabecera del detalle, SOLO con `puedeEditarPiloto(me?.rol)`. Las dos
  páginas leen `/me` con `degradado.opcional("tu usuario", getMe(), null)` +
  `<AvisoDegradado>` y pasan el piloto recortado con `usuarioParaEdicion`.
- Pruebas: `lib/admin/__tests__/pilotos-edicion.test.ts`,
  `app/admin/pilots/__tests__/pilot-actions.test.ts`,
  `components/admin/users/__tests__/user-form-dialog-modo.test.tsx` (modo
  piloto sin Rol/Estado/switches, modo usuario idéntico salvo
  `tiene_fondo_caja`, switch deshabilitado con control negativo, cableado) y
  `components/admin/pilots/__tests__/editar-datos.test.tsx` (botón por rol y
  cableado de las dos páginas).
- **Orden de deploy: API antes que panel.** Con el panel nuevo y el API
  previo, el COORDINADOR ve el botón y al guardar recibe «falta actualizar el
  servidor» (403 del RolesGuard); el ADMIN guarda como siempre.
- **Correcciones de la revisión (2-oct-2026)**:
  - **BLOQUEANTE corregido**: con zod 4 el `.default(false)` de `es_piloto` /
    `es_piloto_externo` se aplicaba también en `UserFormSchema.partial()` y
    `updateUserAction` mandaba `false` en CADA guardado de Usuarios (Pablo y
    Alejandro Canales perdían el doble rol; los 4 externos quedaban
    `es_piloto_externo = false` ⇒ INVITADO). Ahora las dos banderas son
    `.optional()` SIN default y la action solo reenvía las llaves que el
    diálogo mandó (`soloCamposEnviados`). **Nunca un `.default()` en un
    schema que re-valida un PATCH parcial.** Prueba del body real:
    `app/admin/users/__tests__/update-user-action.test.ts` (schema del
    resolver → `payloadModoUsuario` → action → `apiServer`).
  - «Editar datos» se decide POR PILOTO: la coordinación ya no lo ve con
    Pablo/Alejandro Canales (ADMIN que vuelan; el API respondía siempre 403).
  - «Acceso» (`AccessToggle`, prop aditiva `puedeCambiar`) solo con
    `puedeCambiarAccesoPiloto`: la coordinación ve el estado SIN botón.
  - `mensajeErrorEditarPiloto`: 404 ⇒ «Ese piloto ya no existe: recarga la
    página.»; 400 de class-validator en inglés (must be / should not exist /
    must match; el del apodo conserva su rama) ⇒ «Revisa los datos: alguno no
    tiene el formato esperado.».
- **Pendientes conocidos**: «Invitar piloto» de BASE sigue visible para la
  coordinación y `POST /v1/users` es solo ADMIN (el externo sí funciona); sin
  QA visual en navegador.

## Cotización: fecha nueva ⇒ modal para mover el vuelo operativo (5-oct-2026)

Pedido del cliente: «al momento de actualizar/editar la fecha de una
cotización y cuando se guarde de manera correcta, aparezca un pequeño modal
que diga: se actualizó la fecha de cotización, ¿desea que la fecha del vuelo
operativo se actualice también? Mostrar la fecha del vuelo operativo al
momento… mencionar que esto será solo para fecha, y que las horas de los
tramos se tienen que editar desde el vuelo operativo. Sobre todo necesito que
esto no agregue nada a la estructura de la hoja de cotización». Contrato con
el API 0.0.55 (`POST /v1/flights/:id/tramos/alinear-fecha`, ADMIN/COORDINADOR).

- **Por qué**: `revise` escribe `vuelo.fecha_vuelo` (la «Fecha del vuelo» del
  PDF) pero NO mueve los tramos (`escala.fecha_salida_plan`, con hora): el
  panel manda la fecha de la escala VIVA y el API la conserva. La cotización
  decía el día nuevo y la operación (tramos, app del piloto, calendario)
  seguía en el viejo. `revise` NO cambió.
- **Cuándo sale** (`decidirPreguntaReagendar({ antes, despues })`, PURA):
  `antes` = la cotización que se abrió (`quote` del workspace), `despues` = la
  que devolvió el guardado (`RevisedQuote`, trae `escalas` ya escritas). Solo
  si el DÍA Cancún de `fecha_vuelo` cambió y hay día nuevo, el vuelo NO está
  CANCELADO (el API daría 409), NO ha volado (`estadoVueloVolado` de `antes` o
  `despues`, espejo del API) y la fecha operativa —`fecha_salida_plan` del
  primer tramo VIVO por `orden` con fecha (`fechaOperativaDe`, la misma
  referencia del API)— cae en OTRO día. Motivos para no preguntar:
  `sin_cambio` · `cancelado` · `ya_volo` · `sin_tramos` · `mismo_dia`. Sin
  `escalas` en la respuesta (API previo) se usan las de `antes`.
- **FUENTE ÚNICA** `lib/admin/quote-fecha-operativa.ts` (PURA): `diaCancunDe`
  (día de pared vía `isoToCancunInput`; un «YYYY-MM-DD» ya es pared),
  `fechaLargaCancun` («7 de octubre de 2026» vía `fechaLargaDia` +
  `MESES_LARGOS_ES` de `lib/datetime.ts` — tabla ÚNICA para textos nuevos; sin
  `Date` ni `toLocaleDateString`), `fechaOperativaDe`, la decisión, los textos
  (`TITULO_REAGENDAR`, `textoReagendar`, `NOTA_SOLO_FECHA`, `BOTON_MOVER`,
  `BOTON_MOVIENDO`, `BOTON_SOLO_COTIZACION`, `TOAST_NO_MOVIDO`,
  `TOAST_YA_ESTABA`, `toastReagendado`) y `mensajeErrorReagendar`
  (`VUELO_YA_VOLO`/`VUELO_CANCELADO` ⇒ texto del API con respaldo IDÉNTICO al
  del API, `alinear-fecha.util.ts`, con su prueba; 404 «Cannot
  POST» ⇒ «Falta actualizar el servidor: mueve la fecha desde el detalle del
  vuelo»; 401/403 ⇒ sesión/permiso; técnico ⇒ `MSG_SERVIDOR_NO_RESPONDIO` de
  `errores-tecnicos.ts`; inglés de validación ⇒ genérico; otro español del API
  ⇒ tal cual). Tipos de la respuesta: `AlineacionFechaTramos`.
- **Toast tras mover**: «Vuelo operativo movido: 3 tramos ahora salen el 7 de
  octubre de 2026» (singular con 1); si los tramos quedan en días distintos
  (viaje multi-día) dice «a partir del …»; `delta_dias = 0` o nada movido ⇒
  «El vuelo operativo ya estaba en esa fecha».
- **Action** `alinearFechaTramosAction(vueloId)` (`app/admin/flights/actions.ts`,
  nunca lanza): uuid antes de la red, `POST` con body `{}` (el día objetivo es
  la `fecha_vuelo` que el guardado acaba de persistir), copia `code` y
  **`status`** (campo ADITIVO de `ActionResult`; `fail()` no cambió) y revalida
  `/admin/flights/:id`, `/admin/flights`, `/admin/quotes/:id` y
  `/admin/calendar`.
- **Diálogo** `components/admin/quotes/reagendar-tramos-dialog.tsx`
  (`AlertDialog`, `{ abierto, nuevaFecha, fechaOperativa, vueloId, onCerrar,
  contexto? }`; `contexto` ADITIVO: `"cotizacion"` por omisión, `"vuelo"` desde
  la banda; todos los textos de `textosDialogoReagendar`). «Sí, mover el vuelo
  operativo» ⇒ `moverVueloOperativo(() => alinearFechaTramosAction(id))`, que
  **NUNCA lanza** (revisión 5-oct-2026: un `await` directo a la action dentro de
  `startTransition` mandaba la cotización entera al error boundary si la
  server action reventaba — «Failed to find Server Action» tras un deploy de
  Vercel, red caída) ⇒ `toast.success` ⇒ cerrar ⇒ `router.refresh()`. Mientras
  guarda, los dos botones apagados; si falla, se QUEDA abierto con el motivo en
  rojo (`role="alert"`, token `text-destructive`). Si el error PUDO dejar
  tramos movidos (`errorPuedeHaberMovido`: 503 `TRAMOS_NO_MOVIDOS`, cualquier
  5xx, técnico/red — la respuesta se perdió después de escribir) también hace
  `router.refresh()` y el cierre sin mover dice `TOAST_REVISA_TRAMOS` («Revisa
  las fechas de los tramos del vuelo: puede que algunos ya se hayan movido»)
  en lugar de afirmar que no cambió (`toastAlCerrarSinMover`). Sin ese tipo de
  error, «No, solo la cotización» o Esc ⇒ `TOAST_NO_MOVIDO`; desde el vuelo,
  «Ahora no» cierra sin toast. Botones con `cursor-pointer`.
- **Después del refresh**: el cotizador, con el form limpio, se resetea con las
  escalas vivas. Un guardado posterior NO revierte las fechas movidas porque
  `tramosCotizadosDeCotizacion` hereda la `fecha_salida_plan` de la escala viva
  del mismo `orden` — también cuando la ruta del tramo ya no es la cotizada
  (excepción del 5-oct-2026 arriba; antes esos tramos mandaban la fecha del
  snapshot y `replaceEscalas` la reescribía). Con un formulario SUCIO el
  refresh no lo pisa: si la oficina guarda encima, manda lo que tiene en
  pantalla.
- **Banda del detalle del vuelo** (`components/admin/flights/fecha-operativa-banda.tsx`,
  revisión 5-oct-2026): si contestaron «No», el modal no vuelve a salir (la
  cotización ya tiene la fecha nueva y la decisión da `sin_cambio`), así que
  `/admin/flights/[id]` pinta una banda ÁMBAR —«La cotización dice el 7 de
  octubre de 2026, pero el vuelo operativo (sus tramos) sigue programado para
  el 5 de octubre de 2026.»— con el botón «Mover el vuelo operativo a la fecha
  de la cotización» que abre el MISMO diálogo (`contexto="vuelo"`) con la MISMA
  action. Regla: `decidirBandaFechaOperativa(snapshot)`, que comparte
  `motivoSinDesfase` con el modal (cancelado ⇒ ya voló ⇒ sin tramos con fecha ⇒
  mismo día; sin `fecha_vuelo` ⇒ `sin_fecha`). Botón solo para ADMIN y
  COORDINADOR (`puedeMoverVueloOperativo`, los roles del endpoint); los demás
  ven la banda con `NOTA_BANDA_SIN_PERMISO`. En prod (5-oct-2026) ningún vuelo
  vivo sin volar tenía hoy ese desfase: la banda no sale por datos viejos.
- **Montaje**: `quote-workspace.tsx`, FUERA del cotizador y de la hoja (después
  del `CobroFormSheet`). `onGuardado={alGuardarCotizacion}` (antes
  `() => undefined`) es el ÚNICO que lo abre; el cotizador ya llamaba
  `onGuardado(res.data)` DESPUÉS del `toast.success` del guardado y ANTES de su
  `router.refresh()` (síncrono: el modal no lo frena). `abierto` va aparte de
  las fechas para que el texto no se vacíe durante la animación de salida.
  **No se tocó** `quote-calculator.tsx`, ningún `quote-sheet*.tsx` (cliente ni
  interna), sus fixtures ni su CSS.
- **Pruebas**: `lib/admin/__tests__/quote-fecha-operativa.test.ts` (día
  Cancún con cruce de medianoche UTC, decisión por caso, textos, toasts,
  errores, banda, variante «vuelo» y `moverVueloOperativo` con la action
  mockeada: éxito, throw de la server action, 503 parcial, red, 409/404/403),
  `lib/__tests__/datetime-fecha-larga.test.ts`,
  `components/admin/flights/__tests__/fecha-operativa-banda.test.tsx` (render y
  cableado de la banda), `lib/admin/__tests__/tramos-cotizados.test.ts` (fecha
  heredada con ruta distinta), `app/admin/flights/__tests__/alinear-fecha-action.test.ts` (ruta,
  body `{}`, revalidación, uuid, 409/404 con `status`) y
  `components/admin/quotes/__tests__/reagendar-tramos-dialog.test.tsx` (render
  estático con las dos fechas, la nota y los dos botones; cableado por regex:
  solo `onGuardado` abre el modal, va fuera del cotizador, el cotizador lo
  llama tras el toast y antes del refresh, ninguna hoja ni el cotizador
  importan el diálogo o la decisión, una sola llamada a la action).
- **Orden de deploy: API 0.0.55 antes que panel.** Con el API previo el «Sí»
  responde 404 «Cannot POST» ⇒ «Falta actualizar el servidor: mueve la fecha
  desde el detalle del vuelo» y el diálogo se queda abierto para salir con
  «No».
- **Pendientes conocidos**: sin QA visual en navegador (el diálogo vive en un
  portal); solo el cambio de día de la SALIDA (`fecha_vuelo`) dispara el modal
  — cambiar únicamente el «Regreso» (`fecha_traslado_final`) no pregunta, y el
  API solo mueve el regreso si estaba alineado con el último tramo: falta que
  el cliente diga si el «Regreso» también debe preguntar (contrato aparte).
  Otras tablas de meses (`quote-sheet*.ts`, `reparto-pagos.ts`, calendario)
  siguen con la suya: migrarlas a `MESES_LARGOS_ES` queda fuera (tocan la hoja
  o formatos distintos).

## Combustible por aeronave: la carga se ajusta al combustible del avión (5-oct-2026, API 0.0.56)

Caso real: Luis capturó desde la app 74 L para el XB-PEV (vuelo #280,
Chetumal, tarjeta ****0585) y eligió «Turbosina»; el PEV (Cessna 205, pistón)
solo carga gasavión y el Balance del PEV salió con «Combustible TURBOSINA».
Decisión del cliente: cada avión dice qué combustible usa y, al capturar una
carga, el sistema la ajusta al del avión y la marca para revisión si se eligió
otro. Contrato con el API 0.0.56 (migración `20261005000001_aeronave_combustible`:
`aeronave.combustible` AVGAS|TURBOSINA, default AVGAS; N58BT y N621TX en
TURBOSINA). **El ajuste lo hace el API** (`resolverTipoCombustible`: corrige,
nota «⚠ … — revisar», `requiere_visto_bueno`, aviso a oficina); el panel
captura el dato del avión, PRELLENA y AVISA.

- **FUENTE ÚNICA** `lib/admin/combustibles.ts` (sección «Combustible de la
  AERONAVE», PURA, prueba `__tests__/combustible-aeronave.test.ts`):
  `COMBUSTIBLE_AERONAVE_OPCIONES` (gasavión primero: es el default),
  `COMBUSTIBLE_AERONAVE_DEFAULT`, `etiquetaCombustibleAeronave` («—» sin el
  campo), `apiConCombustible`, `AvionCatalogoGasto` + `avionCatalogoGasto`,
  `combustibleDeAeronave`, `avisoCombustibleDistinto`,
  `tipoCombustibleSugerido`, `pasoPrellenadoCombustible` +
  `eleccionManualCombustible` (el paso de los efectos, PURO),
  `encabezadoAvisosCargaMasiva` + `renglonAvisoCargaMasiva`, más los textos
  (`ETIQUETA_/AYUDA_/ERROR_COMBUSTIBLE_AERONAVE`,
  `ETIQUETA_TIPO_COMBUSTIBLE`, `PLACEHOLDER_TIPO_COMBUSTIBLE`).
- **Etiquetas = las del selector «Tipo de combustible»** (`TIPOS_COMBUSTIBLE`):
  el panel dice «Gasavión» / «Turbosina» en la ficha, en el aviso y en el
  selector. El contrato decía «Avgas», pero un aviso «carga Avgas» bajo un
  selector que ofrece «Gasavión» confunde al operador; si se decide «Avgas» en
  todo el sistema, se cambia en UN solo renglón (`TIPOS_COMBUSTIBLE`). La app
  también dice «Gasavión». OJO: los textos que ARMA el API dicen «Avgas»
  (aviso a oficina, advertencias/avisos de la carga masiva, que el panel pinta
  tal cual) y la nota del gasto lleva el valor crudo («⚠ … carga AVGAS …»);
  alinearlo es decisión pendiente (lo barato: la etiqueta del API).
- **Ficha del avión** (`aircraft-form-dialog.tsx`, `schema.ts`): campo
  «Combustible» junto a «Modelo» (select, alta con gasavión). **El campo solo
  viaja si el API lo conoce**: en edición lo decide el propio avión
  (`combustible` ausente = API previo ⇒ «—» y no se manda; el API corre con
  `forbidNonWhitelisted`); en el alta lo decide la flota
  (`apiConCombustible(aircraft)` ⇒ prop `combustibleDisponible` de
  `AircraftCreateButton`). El schema omite «» (preprocess). El detalle
  (`aircraft/[id]/page.tsx`) pinta «Combustible: Gasavión» en Especificaciones.
  La tabla de flota NO gana columna (no engordar el pizarrón).
- **Catálogo de aviones de los diálogos de gasto**: las páginas lo armaban con
  `{ id, matricula }` y el combustible se perdía antes de llegar al diálogo.
  Ahora TODA página que alimenta `ExpenseCreateDialog` o el menú ⋯
  (`ExpenseActions`) mapea con `.map(avionCatalogoGasto)` (Gastos, gastos
  personales, Combustibles `aircraftMenu`, caja chica, detalle del vuelo ×2) y
  las props intermedias se tipan `AvionCatalogoGasto[]`. Todas leen la flota
  COMPLETA (activas e inactivas): el detalle del vuelo pedía
  `activa: true` y una carga GAS del XB-IJP (inactivo) no prellenaba ni
  avisaba; ahora pide la flota completa y deriva `flotaActiva` (mismo filtro
  `activa === true`) para asignar/cambiar avión y la ficha del avión del vuelo.
- **Prellenado** (los dos diálogos, efecto con `getValues()` — fresco tras el
  `reset` y el prellenado por matrícula): con GAS y avión, un tipo VACÍO (o que
  puso el sistema, ref `tipoAuto`) toma el del avión; la IA solo llena si el
  avión no dice nada (y si lee otro, manda el avión); lo elegido a mano o
  GUARDADO manda. Cambiar de avión re-prellena solo lo que puso el sistema.
  El efecto NO decide nada: corre `pasoPrellenadoCombustible` (valor + marca
  `auto`) y el `onChange` del selector, `eleccionManualCombustible`; la
  secuencia completa (PEV ⇒ AVGAS, N58BT ⇒ TURBOSINA, a mano y cambiar de
  avión ⇒ se conserva y avisa, IA tardía) se prueba sobre esas dos funciones.
  El alta gana el selector «Tipo de combustible» junto a Litros y el tipo
  viaja solo en GAS. `GastoTicketIA.tipo_combustible` es ADITIVO (hoy la
  lectura de gastos no lo manda).
- **Aviso ámbar** (mismo patrón que el de matrícula): «El XB-PEV carga
  Gasavión: al guardar se corregirá a Gasavión y quedará marcado para
  revisión.» — no bloquea. En «Verificar / editar», `camposCargaParaPatch`
  manda SOLO lo que cambió, también el tipo: el API reaplica su ajuste en
  todo PATCH de un gasto GAS que traiga `categoria`, `aeronave_id`,
  `vuelo_id`, `escala_id` o `tipo_combustible`, y la categoría SIEMPRE viaja
  (el payload parte de todos los valores del formulario), así que el aviso se
  cumple sin forzar el tipo. Forzarlo cambiaba la nota de auditoría: con el
  tipo en el PATCH el API escribe «se capturó …»; sin él, la redacción de un
  cambio de avión, «el gasto traía …» (revisión 5-oct-2026).
- **Carga masiva**: el preview pinta las `advertencias` del API tal cual (ahí
  llega «La fila dice … se guardará como …»). El resultado
  (`ResultadoCargaCombustibles`, exportado para probarlo renderizado) pinta en
  ámbar los `avisos` del API (filas CREADAS con el combustible del avión;
  llave ADITIVA y opcional en `CargaCombustibleResultado`), con
  `encabezadoAvisosCargaMasiva` y `renglonAvisoCargaMasiva`. API previo: sin
  la llave ⇒ sin bloque.
- **Pruebas**: `lib/admin/__tests__/combustible-aeronave.test.ts` y
  `components/admin/expenses/__tests__/combustible-aeronave-ui.test.tsx`
  («Verificar / editar», la ficha y el resultado de la carga masiva REALES
  renderizados, cableado de los dos diálogos y de las páginas). El runner no
  tiene DOM (los `useEffect` no corren en `renderToStaticMarkup`): por eso la
  lógica del prellenado vive en funciones puras y su secuencia se prueba ahí.
- **Orden de deploy**: migración → API 0.0.56 → panel. Con el API previo no
  hay `combustible` en la flota: ni prellenado, ni aviso, ni campo que viaje.

## Conciliación: el NÚMERO DE FACTURA del gasto ligado (5-oct-2026, API 0.0.57)

Pedido del cliente (captura del Excel de conciliación, columna «Notas»
vacía): «al momento de la conciliación me apoyan a poner el número de la
factura con la que se enlaza el movimiento. Aquí en notas estaría perfecto».
El Excel lo arma el API (columna «Notas» = «Factura FEACZM-72128 · <notas del
banco>»); el panel lo enseña también AL CONCILIAR.

- **El folio lo resuelve el API, nunca el panel**: `folio_comprobante`
  (ADITIVO, opcional) en `MovimientoGasto` (el `gasto` 1↔1 y cada `gastos[]`
  del lote) y en `GastoCandidato` (`gastos-candidatos` y `sugerir`). Fuente
  única del API `folioComprobanteDeGasto`: serie-folio del CFDI de la factura
  recibida ligada ⇒ `folio_ticket` ⇒ folio leído por la IA ⇒ «CFDI <uuid>».
  Muchos gastos viejos no tienen ninguno: ahí no se pinta nada (la oficina
  puede capturar el folio en el gasto).
- **FUENTE ÚNICA del rótulo** `lib/admin/conciliacion-folio.ts` (PURA, prueba
  `__tests__/conciliacion-folio.test.ts`): `etiquetaFolioComprobante(folio)`
  ⇒ «Factura FEACZM-72128» o null (el «CFDI <uuid>» se acorta a «Factura CFDI
  …1A2B3C4D»; `tituloFolioComprobante` lleva el completo al tooltip). Ningún
  componente redacta «Factura …» a mano.
- **Dónde se ve**: (1) columna «Conciliación» de `movimientos-table.tsx`:
  debajo del proveedor/fecha del gasto 1↔1 y, en un lote, debajo de la línea
  de CADA gasto (`LineaGastoLote.factura`/`facturaTitulo`); en un lote de
  más de `MAX_LINEAS_LOTE` (3) gastos, «y N más» lleva en su tooltip
  (`ResumenLoteFila.masTitulo`) la factura de cada gasto oculto, uno por
  renglón; sin el campo el marcado es IDÉNTICO al de antes; (2) la búsqueda
  rápida de la tabla encuentra el cargo por el folio (`textoBusquedaGastos`);
  (3) diálogo «Vincular gasto»: `descripcionCandidatoGasto` agrega «Factura …»
  justo después de la tarjeta (la línea se recorta: va pronto) — lo heredan el
  respaldo con API previo y «Sugerir con IA (pendientes)». El `<span>` de esa
  línea lleva `title={tituloDescripcionCandidatoGasto(ficha, bloqueo)}`:
  PRIMERO el motivo del veto de `bloqueoDeFila` (el `title` del `<span>` tapa
  el del `<label>`, y ese motivo es lo único que explica la casilla apagada) y
  luego la línea con el folio ENTERO (`tituloFolioComprobante`: «Factura CFDI
  <uuid completo>»). JAMÁS `title={desc}` a secas. En «Sugerir con IA» la línea
  no se recorta: el tooltip solo aparece cuando difiere (CFDI acortado). El
  buscador del API ya busca por `folio_ticket` (no se tocó).
- **Facturas recibidas** (`recibidas/recibidas-table.tsx`): columna «Folio»
  después de Emisor (`celdaFolioRecibida`): serie-folio del CFDI con la MISMA
  regla del API («A-0411»; solo con `folio`, reutiliza `etiquetaSerieFolio`);
  sin folio todavía (el cron del API relee el XML) o CFDI sin Serie/Folio ⇒
  «…últimos 8 del UUID», como la referencia de facturas emitidas; solo PDF ⇒
  «—»; **API que no manda `serie` ni `folio` (previo o sin la migración
  `20261005000002`) ⇒ «—»**. Tooltip con el UUID completo; el buscador suma la
  serie-folio (`PLACEHOLDER_BUSCAR_RECIBIDA`). `FacturaRecibida.serie?`/
  `folio?` son aditivos.
- **Pruebas**: `lib/admin/__tests__/conciliacion-folio.test.ts`,
  `components/admin/conciliacion/__tests__/folio.test.tsx` (1↔1 por `gasto`
  o solo por `gastos[]`, CFDI, lote con un folio por gasto y el tooltip de «y N
  más», API previo idéntico, cableado de la tabla y de los diálogos con el
  motivo del veto) y `components/admin/recibidas/__tests__/recibidas-folio.test.tsx`.
- **Orden de deploy**: pyservices → migración → API 0.0.57 → panel. Con el
  panel nuevo y un API previo nada cambia (sin `folio_comprobante` no se pinta
  nada y la columna «Folio» dice «—»).

## Conciliación: vincular un gasto en EFECTIVO con justificación (6-oct-2026, API 0.0.63)

Caso real: el cargo de $212.00 del 07-sep (ASUR CANCUN) se liga al
estacionamiento del 28-sep en EFECTIVO que Mari facturó, SIN cambiar su medio
de pago y con la razón por escrito; la regla es del API. Fuente única PURA
`lib/admin/conciliacion-no-bancario.ts` (errores y `excluidos` en
`conciliacion-lote.ts`). El interruptor «Incluir gastos en efectivo y otros
medios» arranca APAGADO, solo aparece con un API que lo demuestra y manda
`incluir_no_bancarios: true` (el API acepta «true» o «1»); encenderlo SIN
búsqueda busca el monto del cargo (la lista se corta en 100) y apagarlo la
devuelve; bajo el vacío, `excluidos` dice por qué no sale un gasto del mismo
monto y «Mostrar estos gastos» enciende el interruptor con ese monto.
`justificacion` (10–300) viaja solo con un no bancario marcado. El
toast lee `vinculo_no_bancario.notas_anotadas`: `false` ⇒ aviso ámbar fijo con
la razón y «Copiar la razón» (se desvincula y se vuelve a vincular: el panel
no edita las notas de un cargo ligado). La insignia «Efectivo» lleva SOLO la
línea de ESE gasto (`lineasVinculoDeGasto`: «gasto 3f9a1c2e» o fecha +
monto); «Verificar / editar» no toma la línea «⚠ Conciliado con el cargo
bancario del …» por discrepancia (`lib/admin/notas-gasto.ts`); la lista de
respaldo no ofrece efectivo; el 409 `GASTO_BODEGA` se lee de
`details.gastos_bodega` y su mensaje. Pruebas: `*no-bancario*`,
`notas-gasto` y `discrepancia-vinculo-ui`. Deploy: API 0.0.63 → panel.

## Reportes: «Balance mensual» y «Balance general» (6-oct-2026, API 0.0.64)

La card «Balance general VuelaTour» de `/admin/reportes` es ahora «Balance
mensual y balance general»: dos `ExcelExportButton` contra la MISMA ruta
`/v1/aircraft/balance-general.xlsx` con `modo=mensual` (el libro de siempre,
`balance-mensual-vuelatour-<desde>-a-<hasta>.xlsx`) y `modo=general` (hoja de
vuelos resumida a costo total y costo por hora = costo total ÷ tiempo volado ÷
TC ÷ 1.16, `balance-general-vuelatour-…`); título, una línea por libro, nota,
etiquetas, archivo y query salen SOLO de `lib/admin/reportes-balance.ts` (PURO;
`reportes-balance.test.ts` prueba textos, paridad de modos con el API y la
página pintada). Deploy: pyservices → API 0.0.64 → panel (el 0.0.63 responde
400 a `modo` por `forbidNonWhitelisted`).

## Conciliación: filtro de fechas de la vista (12-oct-2026)

Pedido del cliente (captura de `/admin/conciliacion`): «necesitamos agregar un
filtro de fecha, es decir de tal fecha a tal fecha». Solo panel: el API ya
aceptaba `desde`/`hasta` en la lista (DTO del 24-sep-2026), en `resumen`, en
`gastos-sin-banco` y en `cobros-sin-banco`.

- **UN rango para toda la vista**, en la URL (`?desde`/`?hasta`, días de pared
  Cancún `YYYY-MM-DD`): lo aplican la lista de movimientos, las tarjetas por
  cuenta y las pestañas «sin banco»; lo heredan «Cruzar pendientes»,
  «Emparejar devoluciones», «Sugerir con IA», el reporte Excel (el diálogo
  arranca con el rango de la vista) y la auditoría Paywise (que ya leía esos
  parámetros y conserva sus propios Desde/Hasta en su pestaña: por eso la
  barra no se pinta ahí). Sin rango la vista sigue como siempre.
- **Barra** `components/admin/conciliacion/rango-fechas-bar.tsx`
  (`RangoFechasConciliacion`, cliente): «Desde» / «Hasta» (`type="date"`,
  topados a hoy), periodos rápidos «Este mes · Mes anterior · Últimos 90
  días» (mismos cortes que Ingresos) y «Limpiar». LEE el rango con
  `useSearchParams` (regla de las tablas: nunca `useState(propDelServer)`) y
  conserva `?f` y `?cuenta` al navegar. Una línea debajo dice qué periodo se
  está viendo y a qué aplica.
- **FUENTE ÚNICA** `lib/admin/conciliacion-vista.ts` (PURA, prueba
  `__tests__/conciliacion-vista.test.ts`): `rangoVistaConciliacion(desde,
  hasta, hoy)` (solo días válidos `YYYY-MM-DD` —el DTO de la lista rechaza un
  ISO con hora—, invertido se corrige, «hasta» futuro se recorta a hoy y
  «desde» futuro se descarta), `rangoParaSinBanco` (con solo «hasta» manda
  `desde = hasta − 90`: el default del API es «hoy − 90» y `cobros-sin-banco`
  responde 400 si `desde > hasta`), `hrefConciliacion` (sustituye al
  `hrefVista` inline de la página; desde el 13-oct-2026 acepta además `mov`,
  `gasto` —validados con `uuidFiltro`— y `buscar` ⇒ `?mvq=` recortado a 80,
  AL FINAL y en ese orden: f, cuenta, desde, hasta, mov, gasto, mvq; sin
  ellos la URL es la de antes), `filtroConciliacionDeUrl`,
  `textoRangoVista`, `textoVentanaSinBanco` (las descripciones de «sin banco»
  ya no dicen «últimos 90 días» a secas), `textoListaRecortada` (la lista trae
  `count`: cuando el tope deja movimientos fuera, la tarjeta lo dice y
  manda a acotar el periodo — antes el recorte era mudo) y
  `periodosRapidosConciliacion`.
- `ListConciliacionQuery` (`lib/api/conciliacion-server.ts`) declara `desde`,
  `hasta` y `tipo`; `conciliacionGastosSinBanco(desde?, hasta?)` acepta el
  rango. El estado vacío distingue «Sin movimientos en el periodo» de «Sin
  movimientos».
- **Tarjetas por cuenta (`conciliacionResumen`) con aviso si fallan**
  (revisión del lote 2, 14-oct-2026): el API pagina el resumen por la PK
  (antes, sin fechas, PostgREST lo cortaba en 1000 filas sin avisar y las
  tarjetas contaban de menos) y con más de 20,000 movimientos responde 400
  `RESUMEN_MUY_GRANDE` en vez de un total recortado. La página ya no lo
  traga con `.catch(() => [])` (un `[]` callado se leía como «no hay
  cuentas»): va por `degradado.opcional("el resumen por cuenta", …, [])` y
  sale en el aviso de degradación de siempre.

### Sin tope de 300: la lista se carga COMPLETA (13-oct-2026)

Pedido de la oficina con la captura «Se muestran los 300 movimientos más
recientes de 782»: «¿tenemos una forma de no limitar a los 300?». La bandeja
pedía UNA página de 300 y la búsqueda rápida de la tabla (filtra en el
navegador) no encontraba lo que quedaba fuera. Solo panel: el API ya
aceptaba `limit` ≤ 500 y `desde`/`hasta`.

- **`listMovimientosBancariosTodos(query)`** (`lib/api/conciliacion-server.ts`)
  trae TODA la lista de la vista: páginas de `PAGINA_MOVIMIENTOS_API` (500 =
  el `@Max` del DTO) hasta los `count` del API, con tope
  `TOPE_MOVIMIENTOS_VISTA` (2,000: la tabla recibe las filas completas y el
  payload RSC no debe crecer sin límite; hoy toda la historia son ~1,000).
  Una página fallida LANZA (el dato del dinero nunca a medias).
- **Por ventana de FECHA, jamás con `offset`**: el API ordena por `fecha desc,
  created_at desc` y una importación inserta su estado de cuenta en UN lote
  (mismo `created_at`); con `LIMIT/OFFSET` el orden de los empates puede
  cambiar entre páginas y salen movimientos repetidos o SALTADOS. Cada página
  pide `hasta` = la fecha más vieja de la anterior (INCLUSIVA) y lo repetido
  se descarta por `id`. Regla PURA `fusionarPaginaMovimientos`
  (`lib/admin/conciliacion-vista.ts`): un día con más movimientos que una
  página (o una página sin nada nuevo) corta y marca `truncado`, nunca un
  bucle. `textoListaRecortada` sigue avisando cuando el tope deja fuera algo
  (números con separador de miles).
- Pruebas: `lib/admin/__tests__/conciliacion-vista.test.ts` y
  `lib/api/__tests__/conciliacion-movimientos-todos.test.ts` (API simulado que
  BARAJA los empates en cada llamada: llegan los 782 una sola vez; CONTROL:
  con ese mismo API, `offset` sí pierde movimientos; tope, filtro de pestaña,
  día con > 500 y página fallida).

## Balances EN PANTALLA: el mismo libro que el Excel (12-oct-2026, API 0.0.68)

Pedido del cliente: «dale prioridad a la vista de Excel de cada reporte,
porque lo que queremos hacer después es que se pueda editar la celda y
afecte a lo relacionado… el dueño está muy acostumbrado al Excel y
necesitamos el mismo formato, con los mismos colores y estructura para que
dé la impresión de que está trabajando sobre el Excel». Fase 1 (esta): ver.
Fase 2 (pendiente): editar una celda y que el registro ligado cambie.

- **El libro en pantalla ES el que se descarga.** pyservices exporta el
  MISMO libro openpyxl como JSON (`libro_json`, versión 1) y el API lo
  transporta en `GET /v1/aircraft/balance-general/libro?desde&hasta&modo` y
  `GET /v1/aircraft/:id/balance/libro?desde&hasta` (ADMIN/ANALISTA, los
  mismos DTOs y roles que los `.xlsx`; el payload se arma UNA vez en el API).
  Cada celda llega con su número (`v`), su texto YA formateado como lo
  mostraría Excel (`t`), su fórmula visible (`f`), su estilo (índice en
  `estilos`) y su nota (`n`); la hoja, con anchos, altos, combinadas,
  paneles inmovilizados, cuadrícula y color de pestaña. **El panel no
  calcula, no formatea y no decide un solo número**: pinta.
- **Tipos** `types/libro-excel.ts` (COPIA 1:1 de `pyservices/
  libro-vista.types.ts` del API) + las respuestas `BalanceGeneralLibroResponse`
  / `BalanceAvionLibroResponse`. **Red** `lib/api/balance-libro-server.ts`
  (`getBalanceGeneralLibro`, `getBalanceAvionLibro`, `cache: "no-store"`).
- **Modelo de pantalla** `lib/admin/libro-excel.ts` (PURO, prueba
  `__tests__/libro-excel.test.ts`): `letraColumna`/`referenciaCelda`,
  medidas de Excel (`anchoColumnaPx`: 7 px por carácter + 5 ⇒ 8.43 = 64 px;
  `altoFilaPx`: pt × 96/72 ⇒ 15 pt = 20 px), `cuadriculaHoja` (solo filas y
  columnas VISIBLES; las combinadas resueltas en `colSpan`/`rowSpan` sobre
  su primera celda visible; `leftPx`/`topPx` de las fijas; relleno mínimo de
  40 filas × 14 columnas para que la hoja termine en cuadrícula),
  `estiloCeldaCss` (relleno, color, negrita/cursiva/subrayado, tamaño en
  pt, alineación —«general» de Excel: números a la derecha, booleanos al
  centro, texto a la izquierda—, ajuste, sangría y bordes),
  `desbordaTexto` (el texto sin ajuste asoma sobre la celda vacía de la
  derecha, como en Excel; nunca sobre una con valor ni sobre una combinada),
  `contenidoBarraFormulas` (fórmula o valor crudo), `tituloCelda` (nota +
  fórmula) y `desplazarSeleccion` (flechas sobre lo visible).
- **Componente** `components/admin/reportes/libro-excel.tsx` (`LibroExcel`,
  cliente) + `styles/libro-excel.css`: barra de fórmulas (cuadro de nombres
  «B7» + fx), la cuadrícula con letras y números grises, `position: sticky`
  para las letras, los números y los paneles inmovilizados, combinadas,
  triángulo rojo de nota con tooltip, fórmula en el tooltip y en
  `data-formula`, selección con clic y flechas (verde #217346), pestañas
  abajo con el color de la hoja, y el botón de descarga, que baja
  EXACTAMENTE ese libro. Letra Calibri 11 (la de Excel), fondo blanco: es un
  papel, no cambia con el tema del panel.
- **Página** `app/admin/reportes/balance/page.tsx` (`dynamic`,
  **`maxDuration = 300`**: el libro lo arma pyservices y el general tarda
  decenas de segundos): `?modo=mensual|general` o `?avion=<uuid>` +
  `?desde&hasta`, con el MISMO `PeriodSelector` de Reportes (cambiar el
  periodo re-arma el libro) y chips para pasar de un libro de la flota al
  otro. Parámetros, enlaces, títulos, descarga y errores en
  `lib/admin/balance-vista.ts` (PURO, prueba `__tests__/balance-vista.test.ts`):
  `parametrosVistaBalance` (regla de `url-params`: lo inválido se ignora,
  nunca tumba la pantalla; `avion` solo uuid y gana sobre `modo`; rango
  invertido se corrige), `hrefVistaBalance`, `descargaVistaBalance` (= la
  ruta, el archivo y los parámetros del botón de Reportes: el libro en
  pantalla y el descargado son el mismo; la prueba lo cruza con
  `librosBalanceVuelaTour`) y `errorVistaBalance`: 401/403 ⇒ «Tu usuario no
  puede abrir los balances» (ADMIN y ANALISTA, como la descarga), 404
  «Cannot GET» ⇒ «Disponible cuando se actualice el servidor», otro 404 ⇒
  «Ese avión no existe», 400 ⇒ el periodo con el texto del API, lo demás ⇒
  `TarjetaErrorCarga` con Reintentar. **Jamás un libro vacío que parezca un
  balance en ceros.**
- **Enlaces «Ver en pantalla»** (`components/admin/reportes/ver-en-pantalla-link.tsx`,
  fuente única): en cada tile de la card «Balance mensual y balance general»
  y en cada tile de «Balance por avión», ANTES del botón de descarga, con el
  periodo de la página (desde el 12-oct el selector de avión es una grilla
  de tiles con «Excel»: ver «Reportes: los balances a un clic»).
- **Pruebas**: `lib/admin/__tests__/libro-excel.test.ts`,
  `lib/admin/__tests__/balance-vista.test.ts` y
  `components/admin/reportes/__tests__/libro-excel.test.tsx` (marcado con un
  libro chico: números formateados, `colSpan`, estilos en línea, nota, letras
  y anchos, fijas con `top`/`left`, pestañas, descarga; y el CABLEADO de la
  página, de los enlaces y del cliente del API).
- **Orden de deploy**: pyservices (`libro_json`, f407786) → API 0.0.68 → panel.
  Con un API previo la página dice «Disponible cuando se actualice el
  servidor» y manda a descargar; Reportes no cambia de forma.
- **Fase 2 (edición) — lo que ya está preparado**: cada celda puede traer
  `vinculo {tipo, id, campo}` (pyservices lo anota con `libro_json.vincular`
  y el tipo lo transporta); la selección y la barra de fórmulas ya existen.
  Falta: que pyservices anote los vínculos en los balances, un PATCH por tipo
  de registro en el API y, en el panel, la edición en la celda + regenerar
  el libro. (Desde el 13-oct-2026 las celdas de costos traen además
  `vinculos`, una LISTA de solo lectura para llegar a la celda de un gasto
  desde Conciliación: ver «Desde Conciliación: el libro abre en la celda del
  gasto». No es el `vinculo` de edición.) **16-oct-2026: la PRIMERA celda
  editable es el costo real AFAC por vuelo** (`vinculo` `afac_real`): ver
  «AFAC por vuelo (16-oct-2026, API 0.0.89)» al final.

### Vista compacta (12-oct-2026, tarde)

Pedido del cliente, textual, sobre la captura del «Balance mensual» de
septiembre: «ajustar que se vea en grande el "Excel" y hacer muy sutil el
título y filtro de fechas para que eso en el navbar ocupe lo menos posible y
se muestre más de la pantalla del "excel"». Antes, encima del libro iban
apilados el BackLink, «Tesorería · Reportes», el H1 grande, el párrafo con el
periodo y la descripción larga, los chips y el `PeriodSelector` en su Card
(~40 % de la pantalla), y el marco del libro topaba en `calc(100vh - 290px)`.

- **Cabecera de UNA línea** (`app/admin/reportes/balance/page.tsx`, sigue
  siendo server component; envuelve en pantallas angostas): «← Reportes»
  (`BackLink`, `hrefReportesDesdeVista`) · `<h1>` chico (`text-sm
  font-semibold`, `tituloVistaBalance`) · ícono de información
  (`InformationCircleIcon` dentro de un `<span role="img" tabIndex={0}>` con
  `title` + `aria-label` = `textoPeriodoVista` + `DESCRIPCION_VISTA_BALANCE`;
  va FUERA del `<h1>` para no engordar el nombre del encabezado, y es
  enfocable porque el `title` solo sale con el ratón: con teclado el lector
  de pantalla lo anuncia al tabular) · chips «Balance mensual | Balance
  general» (solo libros de la flota; `hrefVistaBalance`, `aria-current`,
  `cursor-pointer`, size sm) · `PeriodSelector compacto
  etiquetaGrupo="Periodo del libro"`. Se quitaron «Tesorería · Reportes» y
  el párrafo: la descripción larga y el periodo ya NO ocupan renglón. La raíz
  lleva `-mt-3 -mb-3 lg:-mt-5 lg:-mb-5`: recorta el padding VERTICAL de
  `<main>` (py-6 lg:py-8) a 12 px arriba y 12 abajo; el horizontal se
  conserva. Las tarjetas de error quedaron como estaban.
- **`PeriodSelector` gana `compacto?: boolean`** (ADITIVA; default false ⇒
  byte a byte lo de siempre, lo usan Reportes, Reparto y Tableros) y
  `etiquetaGrupo?: string` (nombre accesible del grupo compacto; default
  «Periodo», neutro porque el componente es compartido): sin Card, un `<div
  role="group">` en línea con los dos `<Input type="date">` chicos (`h-8
  w-[9.5rem] px-2 text-base md:text-xs`: 16 px en el celular porque iOS
  Safari hace zoom al enfocar un campo con letra menor, 12 px desde `md`)
  separados por un guion, `<Label className="sr-only">` para cada uno y SIN
  atajos de mes (`atajoMesPasado` se ignora). Los dos campos se escriben UNA
  sola vez (`campos`) y los usan las dos variantes: toda la mecánica del
  borrador (`value={visible.desde}`, `onBlur={() => onSalir(…)}`,
  `setTimeout(…, ESPERA_APLICAR_MS)`) es la misma y
  `periodo-selector.test.ts` la sigue vigilando en el fuente.
- **`LibroExcel` gana `pantalla?: boolean`** (ADITIVA): clase
  `xl-libro--pantalla` en la raíz y, en `styles/libro-excel.css`,
  `.xl-libro--pantalla .xl-marco { max-height: calc(100dvh -
  var(--xl-pantalla-offset, 221px)); min-height: 60vh; }`. **El offset por
  default (221 px) sale de MEDIR** lo que queda encima y debajo del marco en
  esa página, sobre las clases de cada pieza: 64 (barra superior del shell,
  `h-16`) + 24 (padding vertical de `<main>` que queda tras los márgenes
  negativos: 12 + 12) + 32 (la cabecera de una línea: su hijo más alto son
  los inputs h-8) + 8 (gap cabecera → libro) + 2 (bordes del libro) + 41
  (`.xl-barra`: 6 + 28 del botón size sm + 6 + 1 de borde) + 38
  (`.xl-pestanas`: 1 de borde + 31 de pestaña [4 + 18 de línea a 12 px con
  line-height 1.5 + 8 + 1] + 6 de padding) = 209, más 12 px de margen de
  seguridad. La cuenta está escrita en el CSS junto a la regla. **Esa cuenta
  vale con la cabecera en UNA línea** (~833 px con los chips de la flota:
  cabe desde `xl`, donde el contenido mide ≥ 976 px con el sidebar de 256 y
  el padding de 48); cuando envuelve, cada línea extra suma a lo sumo 38 px
  (32 del input + 6 de gap-y), así que la página fija la variable por
  breakpoint en su raíz y el marco la hereda: `[--xl-pantalla-offset:297px]`
  (tres líneas, teléfono) · `sm:[--xl-pantalla-offset:259px]` (dos) ·
  `xl:[--xl-pantalla-offset:221px]` (una). En md/lg con la cabecera ya en
  una línea sobran como mucho 38 px, nunca faltan: la página no desplaza.
  Otra pantalla que monte el libro con `pantalla` fija su propio
  `--xl-pantalla-offset`. En una ventana de ~950 px visibles (monitor de
  1080 px) el libro ocupa ~85 % del alto. `100dvh` y no `100vh` por la barra
  de direcciones del celular. Sin la prop, el CSS de siempre
  (`calc(100vh - 290px)`, mínimo 360 px) no cambia.
- **La raíz del libro lleva `zona-clara`** (siempre, con o sin `pantalla`):
  es una isla BLANCA dentro del admin oscuro y sin re-escopar los tokens
  (globals.css, `.dark .zona-clara`) los controles de la barra —`Button
  outline` de descarga y de pantalla completa, el «N hojas» en
  `text-muted-foreground`— heredaban los colores del dark mode sobre
  `#fafafa` (texto casi blanco al pasar el ratón, ~2.5:1). La cuadrícula no
  cambia: usa sus propios `--xl-*` y colores fijos.
- **Botón «Pantalla completa»** (⤢ `ArrowsPointingOutIcon`; activo: ⤡ +
  «Salir», nombre accesible «Salir de pantalla completa») en
  `.xl-barra-acciones`, antes de la descarga y SOLO con `pantalla`:
  Fullscreen API sobre el contenedor `.xl-libro` (`requestFullscreen` /
  `exitFullscreen`; la promesa rechazada nunca tumba la página).
  `fullscreenchange` dice si el que está a pantalla completa es este libro,
  así Esc y F11 también actualizan el botón. Sus textos
  (`ETIQUETA_PANTALLA_COMPLETA`, `ETIQUETA_SALIR_PANTALLA_COMPLETA`,
  `NOMBRE_SALIR_PANTALLA_COMPLETA`, `TITULO_PANTALLA_COMPLETA`,
  `TITULO_SALIR_PANTALLA_COMPLETA`) viven en `lib/admin/libro-excel.ts`
  (PURO, junto a `textoHojas`) y NO en el componente "use client": un server
  component que los importara de ahí recibiría una referencia de cliente.
  Bajo `sm` no se pinta (`hidden sm:inline-flex`): en un teléfono la barra
  de fórmulas ya va justa de ancho y el iPhone no tiene pantalla completa de
  elementos. El soporte se lee con `useSyncExternalStore`
  (`document.fullscreenEnabled`): en el servidor se ASUME (todo navegador de
  escritorio lo tiene) para que el botón salga en el HTML y no brinque al
  hidratar; donde no existe, React lo retira al hidratar. Es una desviación
  consciente del contrato «si no la soporta no se pinta»: la alternativa
  (omitirlo en el servidor) haría que el botón apareciera tras hidratar y
  moviera la barra en CADA carga de escritorio, que es donde lo usa el
  cliente. En `:fullscreen`, `.xl-libro` pasa a columna flex sin borde y
  `.xl-libro:fullscreen .xl-marco { max-height: calc(100vh - 41px - 38px) }`
  (barra de fórmulas + pestañas).
- **Pruebas**: `components/admin/reportes/__tests__/libro-excel.test.tsx`
  (cableado de la página: `compacto` + `etiquetaGrupo`, `pantalla`, tooltip
  sin párrafo ni «Tesorería · Reportes», ícono enfocable, las tres variables
  por breakpoint y que la de `xl` sea el MISMO fallback que la regla del
  CSS; render con `pantalla`: clase + `zona-clara` + botón con nombre
  accesible, `cursor-pointer`, `hidden sm:inline-flex` y ANTES de la
  descarga, y sin la prop ni clase ni botón; el CSS: la regla con `100dvh` +
  `60vh`, que la cuenta del comentario vaya de la barra superior del shell a
  las pestañas y cierre con el mismo número que el fallback —sin amarrar la
  prosa—, la de `:fullscreen`, y el marco de siempre intacto) y
  `components/admin/profit-sharing/__tests__/period-selector-compacto.test.tsx`
  (render estático del compacto: sin Card, dos inputs con nombre accesible,
  `text-base md:text-xs`, etiquetas `sr-only`, grupo «Periodo» o el
  `etiquetaGrupo` que llegue, sin atajos aunque llegue `atajoMesPasado`; y
  la variante de siempre con su Card, etiquetas visibles y atajos).
- **Pendiente**: sin QA visual en navegador (el offset está medido sobre las
  clases, no sobre píxeles reales). El tooltip del ícono no se ve con tacto
  (iPad): el lector de pantalla y el teclado sí lo tienen. En un teléfono
  bajo (menos de ~743 px de alto visible) el `min-height: 60vh` del marco
  gana a `100dvh - 297px` y la página desplaza unos píxeles: es el mínimo
  que pidió el contrato, no un error de la cuenta.

### Encabezados con nota en el panel fijo (14-oct-2026)

Reporte del cliente con la captura del Balance general («reporte horas
FLOTA»): «TOTAL PARA PROVEEDOR (PESOS)» y «REMANENTE VENTA MENOS COMPRA
(PESOS)» bajaban «como un escalón» sobre las filas 3 y 4 y tapaban sus
valores. Eran justo los encabezados con nota (triángulo rojo).

- **Causa**: `.xl-celda.xl-con-nota { position: relative }` iba DESPUÉS de
  `.xl-celda.xl-fija-fila, .xl-celda.xl-fija-col { position: sticky }` con
  la misma especificidad y le ganaba. Con `relative`, el `top`/`left` en
  línea de la celda fija la RECORRÍA en vez de anclarla, y además dejaba de
  quedarse fija al hacer scroll.
- **Regla**: la nota solo pone `relative` a celdas NO fijas
  (`:not(.xl-fija-fila):not(.xl-fija-col)`). Una celda sticky ya es un
  ancestro posicionado y el triángulo (`::after` absoluto) se ancla igual.
  **Ninguna regla de `.xl-celda` le cambia el `position` a una celda fija**:
  lo vigila la prueba «guardia del escalón» de
  `components/admin/reportes/__tests__/libro-excel.test.tsx`, que falla con
  la regla vieja.
- Verificado en Chrome headless (antes: los dos encabezados desplazados;
  después: alineados y con su triángulo en la esquina).

### «Actualizar datos» sin recargar la página (14-oct-2026)

Pedido del cliente: «al lado del botón de "Pantalla completa" necesito un
botón para refrescar la información sin que se refresque toda la página…
porque me mueve la celda que tengo seleccionada cuando recargo toda la
página». Con F5 se perdían la hoja, la celda seleccionada y el
desplazamiento.

- **Botón** `BotonActualizarLibro` (en `libro-excel.tsx`, SOLO con la vista
  «pantalla», ANTES de «Pantalla completa»): `router.refresh()` dentro de
  `useTransition`. Next vuelve a correr la página del servidor (el libro se
  pide otra vez al API) y React CONSERVA el estado del componente (hoja,
  celda, franja) y el scroll del marco: la `key` de la página (gasto · título
  · archivo) no cambia con un refresh y el efecto de llegada no se repite.
  Mientras llega gira («Actualizando…», `aria-busy`, deshabilitado: un clic a
  la vez) y al terminar avisa «Datos actualizados» (solo el refresh pedido
  con el botón; el de `RefreshOnFocus` no avisa). Bajo `sm` queda el ícono
  con su nombre accesible. Nunca `location.reload()`.
- **La hoja se recuerda por NOMBRE** (`resolverHojaIdx`, puro): un libro
  puede ganar o perder una hoja al actualizar («otros ingresos aviones» solo
  sale con filas); se enseña la misma por nombre, si no la misma posición y
  si no la primera. Estado `hojaSel = { idx, nombre }` (ya no `hojaIdx`).
- Si el servidor falla al actualizar, la página pinta su tarjeta de error de
  siempre (con Reintentar), igual que al entrar: nunca un libro a medias.
- Textos en `lib/admin/libro-excel.ts`; pruebas en
  `lib/admin/__tests__/libro-excel.test.ts` y
  `components/admin/reportes/__tests__/libro-excel.test.tsx` (marcado, orden
  en la barra y cableado: refresh en la transición, sin recarga, toast solo
  del botón, hoja por nombre).

### Ajustar el ancho de las columnas como en Excel (14-oct-2026)

Pedido del cliente, con la captura del Balance general (pestaña «otros
movimientos»: la columna F cortaba «TUAs + extras con IVA · 2 concept…»):
«Y hace falta en el "Excel" que si das doble clic entre las columnas se pueda
abrir a lo ancho del contenido para alcanzar a leer todo como lo hacemos con
el excel». Solo panel: el `.xlsx` descargado, los números, la selección, el
teclado, la llegada desde Conciliación, la pantalla completa y el marcado de
las celdas NO cambian.

- **La manija**: cada `<th>` de letra (también los de columnas inmovilizadas)
  lleva DESPUÉS de la letra un `<button type="button" tabIndex={-1}
  class="xl-manija">` con `aria-label` «Ajustar el ancho de la columna F»
  (`nombreManijaColumna`) y `title` «Doble clic: ajustar al contenido ·
  Arrastra para cambiar el ancho» (`TITULO_MANIJA_COLUMNA`), textos en
  `lib/admin/libro-excel.ts`. Sin tab stop (son decenas de columnas); el
  `<th>` lleva `aria-label` = su letra para que el lector no le sume el
  nombre de la manija. Cursor `col-resize` y NO `cursor-pointer`: es su
  promesa y se cumple (doble clic y arrastre). Activada con teclado o lector
  (`click` con `detail` 0) ajusta como el doble clic; un clic suelto del
  ratón no hace nada (es el inicio de un arrastre).
- **CSS** (`styles/libro-excel.css`): `.xl-manija` absoluta DENTRO del `<th>`
  sticky —un sticky ya es bloque contenedor de un hijo absoluto: al `<th>`
  NO se le pone `relative` (sería el «escalón» de las notas)—, `right: -1px;
  width: 8px` (7 px del relleno + el borde: no tapa la letra centrada y no se
  sale del `<th>`, cuyo vecino es otro contexto de apilamiento y taparía lo
  que asomara), `touch-action: none` y una línea verde de 2 px al pasar el
  ratón. `.xl-libro--redimensionando` (en la raíz, solo mientras se arrastra,
  AL FINAL de la hoja para ganar por orden): `col-resize` en todo el libro y
  `user-select: none`.
- **Doble clic ⇒ al contenido** (`autoajustarColumna`, delgada):
  `celdasParaAutoajuste(vista, c)` (PURO) dice qué celdas cuentan —el texto
  que SE VE (`celda.t`), en filas visibles, sin vacías y sin combinadas que
  abarcan varias columnas (regla de Excel; una combinada vertical sí
  cuenta)— y dónde está su `<td>` (`iFila`/`iCelda`, cotejado con
  `data-ref`). El componente mide cada renglón (saltos de línea explícitos,
  `renglonesTexto`) con UN canvas reutilizado (`ctx.font =
  fuenteCanvas(getComputedStyle(td))`: familia, tamaño, negrita y cursiva
  reales) y su caja horizontal real (`cajaHorizontalPx`: relleno + borde; la
  sangría ya va ahí porque `estiloCeldaCss` la pinta como `padding-left`).
  La regla PURA `anchoAutoajustePx`: máx(renglón más largo + caja) +
  `HOLGURA_AUTOAJUSTE_PX` (5), hacia arriba, entre `ANCHO_MINIMO_COLUMNA_PX`
  (12) y `ANCHO_MAXIMO_COLUMNA_PX` (1000) —una INMOVILIZADA, hasta
  `topeAnchoColumnaPx` (ver «Revisión»)—; sin nada medible ⇒ `null` ⇒ la
  columna vuelve al ancho original del libro. Como en Excel, un texto con
  ajuste (`wr`) cuenta por sus renglones explícitos y el autoajuste también
  puede ANGOSTAR.
- **Arrastre** (pointer capture): `pointerdown` (botón principal) guarda
  columna, x y ancho en una REF; `pointermove` solo anota la x y pide UN
  `requestAnimationFrame`; el cuadro aplica `anchoArrastrePx` (puro: ancho +
  desplazamiento, entero, entre mínimo y tope, con los límites que
  `limitesArrastre` mide al empezar —ver «Revisión»—) si cambió;
  `pointerup`, `pointercancel` y `lostpointercapture` cancelan el cuadro
  pendiente y aplican el último. `onMouseDown` con `preventDefault`: no le
  roba el foco al marco ni empieza a seleccionar texto. La manija vive en el
  `<thead>`: ni el arrastre ni el doble clic tocan la selección ni el
  scroll.
- **El ancho NO recalcula celdas**: `cuadriculaHoja` se partió. La parte
  barata (anchos ⇒ `leftPx` de lo inmovilizado y `anchoTablaPx`) es
  `acomodarColumnas`, FUENTE ÚNICA de `cuadriculaHoja` y de
  `aplicarAnchos(vista, anchos)` (PURO): columnas y ancho de tabla nuevos
  REUSANDO `filas` (misma referencia); sin anchos o sin cambios devuelve la
  MISMA vista. En el componente `vistaBase = useMemo(cuadriculaHoja…, [hoja,
  libro])` y `vista = useMemo(aplicarAnchos(vistaBase, anchosHoja), …)`:
  `geometriaCelda`, `scrollParaVerCelda` y `filasPorPagina` leen los anchos
  nuevos. Y desde la revisión del mismo día las filas del cuerpo son `memo`
  con el clic delegado: un cuadro del arrastre ya no repinta las celdas (ver
  «Revisión»).
- **Estado**: `anchosManuales` en `useState` (ningún efecto), llave
  `claveAnchosHoja(claveAnchos, hoja.nombre)` ⇒ `{ [c]: px }`. Prop ADITIVA
  `claveAnchos` (default `""`); la página pasa `claveAnchosVistaBalance(destino)`
  (`lib/admin/balance-vista.ts`): «mensual» | «general» | «avion», por TIPO
  de libro (un ancho del «balance» del general no se aplica al «balance» de
  un avión; los aviones comparten: es el mismo libro con otros datos).
  Sobreviven a «Actualizar datos» y a RefreshOnFocus (`router.refresh()`
  conserva el estado), al cambio de hoja y, sin `?gasto=`, al de periodo o de
  libro (sin `key` el componente no se remonta); con `?gasto=` la `key`
  remonta y se pierden, y siempre al recargar. Sin localStorage a propósito:
  un ancho viejo caería en la columna equivocada si pyservices cambia las
  columnas.
- **Ayuda**: `DESCRIPCION_VISTA_BALANCE` (tooltip del ⓘ) termina con «Doble
  clic en la línea entre dos letras de columna ajusta el ancho al
  contenido.».
- **Pruebas**: `lib/admin/__tests__/libro-excel.test.ts` (`aplicarAnchos`:
  misma vista sin cambios, filas reusadas, `leftPx` = suma de los anchos
  NUEVOS con `geometriaCelda` cuadrando, `scrollParaVerCelda` con anchos
  nuevos, límites; `celdasParaAutoajuste` con combinadas horizontal y
  vertical, vacías, fila oculta y renglones; `anchoAutoajustePx` con
  holgura, máximo, sangría, `null` sin contenido, tope, mínimo y no finitos;
  `anchoArrastrePx`, `conAnchoColumna`, `claveAnchosHoja`, `fuenteCanvas`,
  `cajaHorizontalPx` y los textos exactos), `balance-vista.test.ts` (la llave
  por tipo y la frase de ayuda) y
  `components/admin/reportes/__tests__/libro-excel.test.tsx` (marcado: una
  manija con nombre accesible y `title` en CADA letra, también la
  inmovilizada, ninguna en la esquina, la numeración ni las celdas, sin tab
  stops nuevos, HTML idéntico con o sin `claveAnchos`; cableado por regex:
  doble clic ⇒ `autoajustarColumna`, un solo canvas, la fuente real, arrastre
  con pointer capture y un cuadro, nada toca la selección, `cuadriculaHoja`
  solo con hoja y libro, sin localStorage, sin efectos nuevos, la prop en la
  página; CSS: la manija absoluta dentro del sticky, ningún `<th>` con otro
  `position`, la clase del arrastre al final). Las dos pruebas de letras que
  exigían `>A</th>` ahora exigen la letra seguida SOLO de su manija; las de
  celdas no cambiaron. La revisión sumó las suyas (ver abajo).
- **Revisión (14-oct-2026, mismo día: tres hallazgos)**:
  1. *Filas inmovilizadas que se enciman.* En una tabla CSS el alto del
     `<tr>` es un MÍNIMO: una celda con ajuste (`wr`) que el navegador parte
     en más renglones agranda su fila, pero el `top` sticky de las fijas de
     abajo sale de los altos NOMINALES y al desplazar se le pegaban ENCIMA (el
     «escalón» otra vez). Ya pasaba con los anchos del libro —en «cobranza»
     la fila 4 medía 72 px de 40 en Chrome con Arial y la 5 le tapaba 32 px—
     y la manija lo agravaba (A a 60 px: 108 px y 68 tapados). **INVARIANTE:
     una fila inmovilizada con OTRA fija debajo nunca crece, haga lo que haga
     el operador.** `cuadriculaHoja` da a cada celda `altoRecortePx`
     (`altoRecorteCeldaPx`: ajuste + texto + fila fija con otra fija debajo
     de su span ⇒ el alto del span menos sus bordes de arriba y de abajo,
     `GROSOR_BORDE_CELDA_PX`; `.xl-celda` no tiene relleno vertical, y una
     prueba del CSS lo vigila) y el texto va en `<div class="xl-recorte">`
     con `estiloRecorteCss`: `max-height: max(round(down, Npx, 1lh),
     min(Npx, 1lh))`, renglones COMPLETOS con el interlineado real (sin la
     tajada del renglón que no cabe) y `.xl-recorte { display: block;
     overflow: hidden }`. Como Excel con una fila de alto fijo, se recorta:
     mientras cabe, el bloque mide su texto y la alineación vertical de la
     celda lo acomoda como siempre; si no cabe, se ven los PRIMEROS renglones
     (Excel, centrado, enseña los de en medio; aquí manda el arranque del
     encabezado y la manija o el doble clic lo dejan leer completo). La
     ÚLTIMA fija NO se recorta: nada fijo se le encima y recortarla quitaría
     renglones que hoy se leen («HORAS\nVOLADAS» de «RESUMEN flota», alto
     automático que Excel también agranda). Solo cambia el marcado de esas
     celdas (hoy, los encabezados de la fila 4 de «cobranza», «combustible»,
     «otros gastos», «repartidos a aviones» y «otros ingresos aviones»);
     `desbordaTexto` no se toca (una celda `wr` nunca desborda). Verificado en
     Chrome headless con el libro mensual REAL de pyservices: «cobranza» fila
     4 = 40/40 px con los anchos del libro y con A a 60 px; «otros gastos»
     fila 4 = 20/20 con B a 80 px; ninguna fija se les encima al desplazar.
     Queda, preexistente y no lo causa el operador: la fila 1 del título (14
     pt en una fila de 15 pt) mide 23.4 px y al desplazar la 2 le tapa 3.4 px
     de los rasgos de abajo (salida: que pyservices le dé alto a esa fila); y
     la ÚLTIMA fija y las que se desplazan pueden crecer («El marco sigue a la
     selección → Pendientes»).
  2. *El cuerpo se repintaba en cada cuadro del arrastre.* Ahora cada fila es
     `FilaHoja` (memo) y pinta sus celdas en DOS tramos `TramoFila` (memo):
     el de las columnas inmovilizadas (siempre las primeras) y el de las que
     se desplazan, que recibe `SIN_FIJAS`. Comparan la `fila` por identidad
     (`aplicarAnchos` la reusa), la columna seleccionada de ESA fila y el
     `left` de las fijas por VALOR (`mismasColumnasFijas`, PURO; `fijas =
     useMemo(vista.columnas.filter(fija), [vista])`). Sin manejadores en las
     filas: el clic se DELEGA en el `<tbody>` (`alClicCuerpo`: el `<td>` más
     cercano dentro del cuerpo, su `data-ref` ⇒ `coordenadaDeReferencia`,
     PURO, la inversa de `referenciaCelda`) y va por `seleccionar` con la
     `vista` de ESE render; un `onClick` memorizado por celda movería el
     marco con los anchos viejos. Medido en Chrome headless con el libro
     mensual real («reporte horas FLOTA»: 100 vuelos = 5,169 `<td>`, 200 =
     9,769): un re-render de `LibroExcel` que no toca filas pasó de 5.4–10.5
     ms a 0.3–0.7 ms; arrastrar F deja 0 mutaciones en el `<tbody>` (antes
     cada `<td>` recibía estilo nuevo y `onclick`) y el cuadro queda en lo que
     cuesta el layout de la tabla (la línea base del DOM solo); arrastrar A
     (fija, con B y C a su derecha) repinta SOLO las celdas fijas (su
     `left`). La otra opción del hallazgo —`left: var(--xl-left-*)` con las
     variables en la `<table>`— se MIDIÓ y se descartó: cambiar una variable
     heredada recalcula el estilo de toda la tabla, 19–31 ms de estilo +
     layout por cuadro contra 9.7–10.7 ms de escribir el `left` de las 414
     celdas fijas. Mover la selección repinta solo los tramos que la tocan
     (antes, la tabla entera por tecla). El marcado no cambia.
  3. *Tope contra el marco.* Con el puntero capturado, soltar fuera del marco
     dejaba una columna INMOVILIZADA de hasta 1,000 px: su manija fuera de
     alcance, toda la zona que se desplaza tapada y el marco sin seguir a →
     (`ejeParaVer` no se mueve con lo fijo más ancho que el marco); solo se
     salía con F5. `topeAnchoColumnaPx(vista, c, clientWidth)` (PURO): una
     fija llega a lo sumo a `clientWidth` − numeración − las OTRAS fijas −
     `ANCHO_LIBRE_MINIMO_PX` (64 = una columna de Excel por omisión), entre
     mínimo y tope; una que se desplaza o un marco sin medidas, el tope de
     siempre (su manija vuelve al desplazar). `limitesArrastre` (PURO, medido
     UNA vez al empezar con `getBoundingClientRect().left`, `clientLeft` y
     `clientWidth`): la x cuenta hasta el borde derecho VISIBLE del marco
     menos `MARGEN_ARRASTRE_MARCO_PX` (8, la manija) y el ancho hasta el
     tope; `anchoArrastrePx(…, limites)` nunca angosta por sí solo (agarrada
     pegada al borde, o ya más ancha que el tope: solo se puede angostar). El
     doble clic: `anchoAutoajustePx(medidas, topeAnchoColumnaPx(…))`.
     Verificado en Chrome: marco de 1,045 px (laptop de 1366), B arrastrada
     2,000 px ⇒ 575 px, lo fijo = 981 y quedan 64 libres con su manija a la
     vista; doble clic en C con un texto larguísimo ⇒ no pasa del tope; F (se
     desplaza) arrastrada 3,000 px ⇒ su manija se queda 4 px dentro del
     borde. Queda: si el marco se ACHICA después (salir de pantalla completa
     tras ensanchar una fija, achicar la ventana, zoom), lo fijo puede volver
     a llenarlo; salida: pantalla completa otra vez (o alejar el zoom) y
     angostarla, o recargar.
  Pruebas: `lib/admin/__tests__/libro-excel.test.ts` (`altoRecortePx`: span,
  bordes, combinada vertical, sin ajuste/texto, la última fija, un span que
  llega a ella, las que se desplazan, que un ancho no lo cambia;
  `estiloRecorteCss`; `coordenadaDeReferencia` ida y vuelta y entradas
  malas; `mismasColumnasFijas`; `topeAnchoColumnaPx` con la PROPIEDAD de que
  lo fijo deja siempre la zona libre y el marco sigue a la selección;
  `limitesArrastre`; `anchoArrastrePx` y `anchoAutoajustePx` con límites) y
  `components/admin/reportes/__tests__/libro-excel.test.tsx` (marcado del
  recorte —y que el libro de las demás pruebas no lleva ninguno—, el clic
  delegado, las filas memo en dos tramos sin manejadores y un solo `<td>` en
  el fuente, el tope en el doble clic y el arrastre, el CSS del recorte y la
  guardia de las cuentas de bordes).
- **Pendiente**: QA a mano en el panel (lo de arriba se verificó en Chrome
  headless con libros reales, no en `/admin`). En
  `/admin/reportes/balance?modo=general`, pestaña «otros movimientos»: doble
  clic en el borde derecho de la F ⇒ se lee el concepto completo; arrastrar
  la manija de una columna inmovilizada ⇒ las fijas siguen pegadas, el marco
  sigue a la selección y la fija no pasa del borde; doble clic en una
  columna vacía ⇒ ancho del libro; «Actualizar datos» y cambiar de hoja ⇒
  los anchos se quedan; ir al balance de un avión ⇒ los del libro; en
  «cobranza», bajar con la rueda ⇒ la fila 5 no tapa los encabezados de la
  4; el arrastre fluido en la hoja más grande, también en las PC de la
  oficina.

### El marco sigue a la selección (13-oct-2026)

Pedido del cliente: al moverse con las flechas por el Excel en pantalla, la
celda activa se perdía bajo el borde del marco o bajo los paneles
inmovilizados. Causa: `onKeyDown` hacía `e.preventDefault()` —que además
suprime el scroll NATIVO de la `div.xl-marco` con las flechas— y solo
cambiaba `seleccion`; nada movía el marco. Solo panel.

- **Fuente única PURA** en `lib/admin/libro-excel.ts`: `geometriaCelda(vista,
  sel)` (rectángulo de la celda en px dentro de la tabla: `x` acumula
  `anchoPx` desde `ANCHO_NUMERACION_PX` y `y` acumula `altoPx` desde
  `ALTO_LETRAS_PX`, la MISMA cuenta que da `leftPx`/`topPx` a lo fijo en
  `cuadriculaHoja`; el ancla de una combinada suma su `colSpan`/`rowSpan`;
  una coordenada TAPADA por una combinada —que no tiene `<td>`— se trata como
  1×1; oculta ⇒ `null`) y `scrollParaVerCelda(vista, sel, marco)` (dadas
  `{scrollLeft, scrollTop, clientWidth, clientHeight}` del marco —las MISMAS
  propiedades del DOM: el componente pasa el elemento tal cual— devuelve el
  scroll nuevo SOLO si la celda queda fuera de la zona visible no tapada por
  lo sticky —numeración + columnas inmovilizadas a la izquierda; letras +
  filas inmovilizadas arriba—, justo lo necesario: pegada a lo fijo si
  estaba a la izquierda/arriba, pegada al borde si estaba a la
  derecha/abajo, alineada al inicio si no cabe en la zona libre; una celda en
  columna/fila fija no mueve ese eje; ya visible, inexistente o marco sin
  medidas (SSR, `clientWidth` 0) ⇒ `null`; nunca negativos). **Nunca mira el
  DOM**: la geometría sale de la vista, justo porque la celda tapada no
  existe ahí.
- **Componente** (`libro-excel.tsx`): `ref` al `div.xl-marco` (`raiz` es
  `.xl-libro` y no es el contenedor con scroll) y UNA función
  `seleccionar(sel)` = `setSeleccion` + `scrollParaVerCelda` + asignación
  directa de `el.scrollLeft`/`el.scrollTop` (scroll INSTANTÁNEO estilo Excel:
  nada de `scrollIntoView`, que movería también la página e ignora lo
  sticky, ni de animación suave; `styles/libro-excel.css` deja
  `scroll-behavior: auto` en `.xl-marco` porque el `smooth` de globals.css es
  de `html` y no se hereda). La usan `onKeyDown` (flechas, con el
  `preventDefault` de siempre y el `seleccion` del render en vez del updater
  funcional: keydown es un evento discreto y React lo procesa síncrono) y el
  clic en una celda (un clic en una celda medio tapada también la enseña
  completa, como Excel), DELEGADO en el `<tbody>` desde la revisión del
  14-oct-2026 (`alClicCuerpo` + `coordenadaDeReferencia`: las filas son memo
  y no llevan manejadores; ver «Ajustar el ancho de las columnas…»). **Va en
  el manejador y NO en un efecto a
  propósito**: el `router.refresh()` de `RefreshOnFocus` recrea
  `libro`/`vista` y un efecto con `[vista, seleccion]` volvería a saltar a
  la celda activa aunque el operador hubiera hecho scroll con la rueda
  (Excel nunca hace eso). El marcado estático no cambió (`ref` y `onClick`
  no se serializan): las pruebas de marcado siguen byte a byte.
- **Pruebas**: `lib/admin/__tests__/libro-excel.test.ts` (geometría real con
  fijas, combinadas, oculta, bordes exactos, celda más ancha que la zona
  libre, SSR sin medidas, nunca negativos, y que la geometría nueva coincide
  con `leftPx`/`topPx`) y
  `components/admin/reportes/__tests__/libro-excel.test.tsx` (cableado por
  regex: el `ref` en `.xl-marco`, una sola llamada a `scrollParaVerCelda`
  dentro de `seleccionar`, teclado y clic por el mismo camino, sin
  `scrollIntoView`/smooth/efecto alrededor del scroll, el marcado intacto, y
  el CSS: `.xl-marco` con `scroll-behavior: auto` y el `smooth` solo en
  `html`).
- **Revisión del 13-oct-2026 (mismo día)**: (1) PageUp/PageDown/Home/End ya
  MUEVEN la selección (`esTeclaNavegacionHoja`, `desplazarSeleccion` con
  `{ filasPorPagina, conControl }`): antes eran scroll nativo sin mover la
  selección y la SIGUIENTE flecha devolvía el marco de golpe a la celda
  activa (PageDown, PageDown, ↓ terminaba donde empezó). PageUp/PageDown
  saltan las filas que caben ENTERAS en la zona libre del marco de HOY
  (`filasPorPagina(vista, marco, r, dirección)`, puro: `clientHeight` menos
  letras y filas inmovilizadas, desde la fila actual; mínimo 1), así el marco
  avanza justo una pantalla y la selección viaja con él; Home/End van a la
  primera/última columna de la fila y con Ctrl/⌘ a A1 / la última celda
  visible (no se replica el «modo Fin» de Excel). (2) El cuadro de nombres
  (`.xl-nombre`, «B7») y la barra de fórmulas (`.xl-formula`) son regiones
  vivas (`aria-live="polite"` + `aria-atomic`): al moverse, el lector anuncia
  la celda y su valor (antes, silencio). Es el mínimo sin tocar la
  cuadrícula; lo completo —`id` por `<td>`, `aria-activedescendant` en el
  marco, `aria-selected` en la celda y `role=row/gridcell` (un `<table>`
  dentro de `role="grid"` es estructura ARIA inválida, preexistente)— queda
  pendiente.
- **Pendientes**: la coordenada tapada por una combinada se resolvió el
  19-oct-2026 (ver «La celda seleccionada se ve», abajo). **El alto de fila es
  NOMINAL**: en una
  tabla CSS la `height` del `<tr>` es un mínimo y `.xl-celda` no acota la
  altura, así que una celda con ajuste (`wr`) cuyo texto el navegador parte
  en más renglones que los que estimó pyservices (`14 × líneas + 4`, por
  conteo de caracteres; Carlito/Arial son más anchas que Calibri) agranda la
  fila y corre las siguientes: `geometriaCelda` y los `topPx` de lo
  inmovilizado quedan cortos y, al bajar con ↓, la celda puede quedar
  recortada por abajo. Desde el 14-oct-2026 una fila inmovilizada con OTRA
  fija debajo ya no crece (su texto con ajuste va en `.xl-recorte`, ver
  «Ajustar el ancho de las columnas…»): las fijas ya no se enciman; siguen
  pudiendo crecer la ÚLTIMA fija y las que se desplazan. Envolver el
  contenido de TODA celda en un bloque de alto fijo rompería `desbordaTexto`
  (el recorte solo envuelve celdas con ajuste, que nunca desbordan); la
  salida barata es que pyservices escriba SIEMPRE el alto o lo mida mejor
  (decisión aparte, no de este lote). Sin QA visual en navegador (vitest sin
  DOM): en
  `/admin/reportes/balance` mantener → y ↓ pulsadas y comprobar que el
  contorno nunca se mete bajo numeración/letras ni bajo lo inmovilizado (ni
  se «salta» celdas con la tecla mantenida); PageDown dos veces y ↓ sigue
  desde ahí; hacer scroll con la rueda, cambiar de pestaña y volver
  (RefreshOnFocus), y ver que la vista NO salta a la celda activa.

### La celda seleccionada se ve (19-oct-2026)

Pedido del cliente con la captura de «otros gastos» (D56 seleccionada): «hacer
que la celda que está seleccionada se pueda ver marcada, porque se ve muy
tenue y se pierde». El contorno de 2 px se confundía con los bordes negros que
trae el libro. Solo panel.

- **Celda** (`styles/libro-excel.css`, `.xl-celda.xl-seleccionada`): contorno
  `outline` de 3 px con `outline-offset: -2px` (2 por dentro y 1 sobre la línea
  de la cuadrícula, como Excel) y un tinte verde translúcido como
  `background-image` (`--xl-seleccion-tinte`, 18 %): queda ENCIMA del
  `background-color` en línea (el relleno del libro sigue debajo) y bajo el
  texto. Ninguna regla toca `position` (lo sticky y el «escalón» de las notas)
  ni `box-shadow` (lo usa la celda editable del AFAC). El cuadro del costo
  real AFAC (`.xl-editor-afac`) lleva el MISMO contorno.
- **Letra y número de fila** (`.xl-encabezado-activo` en el `<th>` de su
  columna y de su fila): verde claro `--xl-encabezado-activo` con texto verde
  oscuro en negrita (6.9:1) y una raya verde de 3 px hacia la celda
  (`box-shadow` inset), como Excel. Una combinada resalta TODAS sus letras y
  filas visibles. Qué se resalta lo decide `encabezadosDeSeleccion`
  (`lib/admin/libro-excel.ts`, PURO); `FilaHoja` (memo) recibe `filaActiva` y
  compara con `mismasPropsFilaHoja` (= `filaActiva` + `mismasPropsFila`): al
  mover la selección solo se repintan las filas que cambian.
- **Combinadas como en Excel** (`bloqueDeCelda`, PURO): la selección SIEMPRE
  queda en el ANCLA de lo que se ve. `desplazarSeleccion` sale de una
  combinada por su BORDE (→ desde A1:C1 va a D1; ↓ desde A3:A5 va a A6) y una
  coordenada tapada lleva a su ancla (↑ desde B2 entra a A1:C1). Antes la
  selección quedaba en B1, sin `<td>`: el contorno desaparecía y el cuadro de
  nombres decía «B1». Si un libro nuevo cambia sus combinadas y la selección
  queda tapada, el contorno va en el `<td>` del ancla (`anclaSeleccion`).
- Pruebas: `lib/admin/__tests__/libro-excel.test.ts` («la celda seleccionada
  no se pierde en una combinada») y
  `components/admin/reportes/__tests__/libro-excel.test.tsx` (letra y número
  resaltados en el HTML de la llegada, el CSS y el cableado de `FilaHoja`).

### Desde Conciliación: el libro abre en la celda del gasto (13-oct-2026, API 0.0.75)

Punto 5 del lote 2 del 13-oct-2026: desde un cargo conciliado, abrir en una
pestaña nueva el balance del avión o el general EN LA CELDA del gasto. Tres
piezas aditivas: pyservices anota los gastos de cada celda en el libro JSON,
el API dice en `GET /v1/conciliacion/movimientos` en qué libro y en qué mes
vive cada gasto ligado, y el panel pinta los enlaces y la llegada. SIN
migración. **Ningún número cambia**: vínculos y `balance` son metadatos que
se derivan en cada render y el panel no suma ni decide nada con ellos.

- **Contrato del libro** (`types/libro-excel.ts`, COPIA 1:1 de
  `LibroVistaVinculo` del API y de `libro_json.py`): `LibroExcelCelda.vinculos?:
  LibroExcelVinculo[]` (`{tipo:'gasto', id, rol, monto_mxn?, gasto_mxn?,
  parte?:'reparto'|'remanente', fila?, columna?}`) y la raíz
  `vinculos_gasto?: true` (= el libro marca las celdas de los gastos). Roles:
  `fila` = la celda ES el monto de la fila del gasto (MONTO MXN de las hojas
  de gastos y combustible, VENTA AL AVIÓN de inventario); `suma` = la celda
  lo suma con otros (OPERACIONES/PILOTO/OTROS de la hoja de vuelos; TOTAL
  PARA PROVEEDOR (PESOS) en la variante general, con la unión por id);
  `nota` = solo va en la nota (TUA o extensión de horario trasladadas): no
  suma; `sin_tc` = USD sin T.C.: todavía no suma. `monto_mxn` = lo que ESE
  gasto aporta a la celda (pesos); `gasto_mxn` = el gasto completo cuando la
  celda lleva una parte (operación + FBO de una factura). No se anotan
  TOTALES, COSTO TOTAL, COMISIONES, AFAC, «otros movimientos» ni «balance».
- **Contrato de Conciliación** (`types/conciliacion.ts`): `MovimientoGasto.balance?:
  UbicacionBalanceGasto | null` en `gasto` y en cada `gastos[]` =
  `{periodo:{desde,hasta} (mes calendario), eje:'vuelo'|'gasto', aviones:[{id,
  matricula|null}] (por matrícula), general, hoja_avion?, hoja_general?}`.
  Ausente = API previo o lectura fallida (sin enlaces); `null` = el gasto no
  vive en ningún balance (COMISION_VENDEDOR, PERSONAL_DUENO, TUAS sin vuelo,
  gas sin avión, PERMISO/INDIRECTO de un externo sin avión, el hueco #255).
  La regla «a qué libro y a qué mes» es SOLO del API
  (`common/ubicacion-balance-gasto.util.ts`, espejo de los libros).
- **URL**: `/admin/reportes/balance?avion=<uuid>|modo=mensual|general&desde&hasta&gasto=<uuid>`.
  `parametrosVistaBalance` devuelve `gasto` SOLO con un uuid válido (si no,
  ni la llave); `hrefVistaBalance(destino, desde, hasta, { gasto })` lo pone
  AL FINAL y sin `extra` la URL es byte a byte la de antes
  (`VerEnPantallaLink` no cambió). `gasto` NO viaja al API: el libro es el
  mismo. Lo conservan el `PeriodSelector` (copia los params) y los chips
  «Balance mensual | Balance general» (`{ gasto }`): del mensual al general
  el salto cae en TOTAL PARA PROVEEDOR (PESOS).
- **La llegada** (`lib/admin/libro-vinculos.ts`, PURO, FUENTE ÚNICA):
  `buscarCeldaDeGasto` recorre hojas y celdas y gana la de menor (prioridad
  del rol `fila` > `suma` > `nota` > `sin_tc` > desconocido, hoja, fila,
  columna); `llegadaAGasto` (null si no es uuid); `textoFranjaGasto` (los
  textos de la franja: «Gasto $1,899.09 MXN · hoja «reporte horas N4142R» ·
  fila #430 · Beh Kay · OPERACIONES · la celda suma 3 gastos», «… · en esta
  celda $67.14 MXN · … · otra parte en OTROS», reparto/remanente, nota, USD
  sin T.C., «aparece en N renglones de este libro»); `franjaDeLlegada` y
  `claveSalto`. **«la celda suma N gastos» cuenta SOLO los vínculos `suma`**
  (`sumanEnCelda`): una TUA anotada (`nota`) o un USD sin T.C. van en la
  celda pero no suman, y contarlos diría un número falso en todo vuelo con
  TUA (`enCelda` sigue contando todos).
- **Componente** (`LibroExcel`, prop ADITIVA `gastoInicial`): la hoja, la
  selección y la franja nacen en **inicializadores perezosos** de `useState`
  (una vez por montaje y TAMBIÉN en el servidor: el HTML ya trae la pestaña,
  la celda `xl-seleccionada`, el cuadro de nombres y la franja; sin mismatch
  de hidratación). El marco se desplaza en el **ÚNICO efecto de llegada**:
  `const alLlegar = useEffectEvent(…)` + `useEffect(() => { alLlegar(); }, [])`,
  SIN setState y sin depender de `vista`/`libro`. Es la única excepción a «el
  scroll va en el manejador»: `seleccionar` = `setSeleccion` +
  `desplazarMarcoA`, y `desplazarMarcoA` lleva la ÚNICA llamada a
  `scrollParaVerCelda`. Por qué así: `react-hooks/set-state-in-effect` es
  ERROR en eslint-plugin-react-hooks 7.1.1 (la variante que ponía la
  selección en el efecto no pasa el lint) y `useEffectEvent` lo soportan
  React 19.2.4 y @types/react 19.2.14 (si alguien bajara React, el fallo es
  ruidoso). Si algún día se activa `cacheComponents` (hoy NO: las páginas se
  desmontan al navegar), `<Activity>` re-ejecuta los efectos al volver a
  mostrar la página y la llegada se repetiría: revisar entonces.
- **La `key`** del libro en la página = `claveSalto(gasto, libro)` (gasto ·
  título · archivo; sin gasto, sin key): cambiar de periodo, de avión o de
  chip cambia el título o el archivo ⇒ remonta y vuelve a saltar. Un
  `router.refresh()` (RefreshOnFocus) trae un objeto nuevo con lo mismo ⇒
  misma key ⇒ React conserva el estado y NO salta (el operador pudo haber
  hecho scroll o «Quitar aviso»).
- **La franja** (`.xl-franja`, PRIMER hijo de `.xl-libro`, antes de
  `.xl-barra`): 28 px EXACTOS con su borde (`ALTO_FRANJA_PX`), `role="status"`
  (ya es región viva: las `aria-live=` siguen siendo 2), texto con elipsis y
  el completo en `title`, botón «Quitar aviso» (×, `cursor-pointer`).
  Tres estados honestos: verde con la celda; ámbar
  `TEXTO_GASTO_NO_ENCONTRADO` («… puede ser de otro mes o del otro balance…»)
  si el libro marca gastos y no está; ámbar `TEXTO_LIBRO_SIN_VINCULOS` («…
  falta actualizar el servidor…») si el libro no trae la bandera. El marco
  le cede los 28 px SOLO mientras existe (`.xl-libro--pantalla:has(.xl-franja)
  .xl-marco` y `.xl-libro:fullscreen:has(.xl-franja) .xl-marco`): la cuenta
  297/259/221 de `--xl-pantalla-offset` y las clases de la página NO cambian.
- **Enlaces de Conciliación** (`lib/admin/conciliacion-balance.ts`, PURO,
  FUENTE ÚNICA de URLs y textos; `components/admin/conciliacion/enlaces-balance-gasto.tsx`,
  sin hooks): «Ver en balance del avión N4142R» (máximo `MAX_ENLACES_AVION`
  = 2; el resto, «y N aviones más» con las matrículas en el tooltip) y «Ver
  en balance general» (`modo=mensual`: es el libro con OPERACIONES/PILOTO/
  OTROS), con `title` «Abre en una pestaña nueva el balance de N4142R (del 01
  oct 2026 al 31 oct 2026, mes del vuelo) en la celda de este gasto». Son
  `<a target="_blank" rel="noopener noreferrer">` NATIVOS (pestaña nueva sin
  prefetch por fila) con `cursor-pointer` y « (se abre en una pestaña nueva)»
  en `sr-only`, HERMANOS del `<Link>` de la línea del gasto (`<Fragment>` en
  el lote, `<>` en el 1↔1) y NUNCA dentro: un `<a>` en otro es HTML
  inválido. Cada `LineaGastoLote` trae `balances`. Sin `balance`, con
  `balance: null`, id que no es uuid, periodo inválido o avión sin uuid ⇒
  nada: el marcado de la celda es byte a byte el de antes.
- **Corte por rol**: `MovimientosTable` gana `abreBalances?` (default true);
  la página lee `/me` con `degradado.opcional("tu usuario", getMe(), null)`
  (cacheado por petición: sin HTTP extra) y pasa
  `abreBalances={puedeAbrirBalances(me?.rol)}`. Conciliación es
  ADMIN/FACTURACION y los libros ADMIN/ANALISTA: FACTURACION no ve enlaces
  (abrirían un 403; abrirle los balances es decisión del cliente). Sin rol se
  ofrecen.
- **Skew** (los tres órdenes son seguros): panel nuevo + API previo ⇒ sin
  `balance`, sin enlaces, marcado idéntico; API nuevo + pyservices previo ⇒
  sin bandera ⇒ con `?gasto=` la franja ámbar «todavía no marca…» (la
  verdad); panel previo ⇒ ignora `balance` y `vinculos`.
- **Pruebas**: `lib/admin/__tests__/libro-vinculos.test.ts` (prioridad y
  desempates, conteos, otras columnas, TODOS los textos exactos, tres
  estados, `claveSalto`), `conciliacion-balance.test.ts` (casos reales de
  prod: #430 de N4142R, el INDIRECTO de $16,240 al 50/50, el OTRO de $890 a 5
  aviones, matrícula null, fechas e ids inválidos), `balance-vista.test.ts`
  (ampliada: `gasto` y `extra`), `components/admin/conciliacion/__tests__/balance-links.test.tsx`
  (hermanos sin `<a>` anidado, target/rel/`gasto=`, lote, corte por rol,
  marcado idéntico sin `balance`, cableado de la página) y
  `components/admin/reportes/__tests__/libro-excel.test.tsx` (adaptadas «UN
  solo camino…» e «instantáneo y en el manejador»; cableado de la página;
  llegada en SSR con pestaña, celda, cuadro de nombres y franja en los tres
  estados; CSS de la franja y de `:has`).
- **Verificado en navegador** (Chrome headless contra `next dev`, con un
  libro de prueba de 80 × 30 con paneles fijos, ruta temporal NO
  commiteada): llega a la pestaña y a la celda (Y60, dentro del marco, el
  marco desplazado), la franja mide 28 px, «Quitar aviso» la quita y el marco
  crece EXACTAMENTE 28 px sin volver a saltar, sin errores de hidratación;
  sin `gasto` el libro de siempre; un gasto que no está ⇒ ámbar.
- **Pendiente**: QA con datos reales tras el deploy (ADMIN en
  `/admin/conciliacion`, cargo del gasto 2a3e7a09 de #430 de N4142R: los dos
  enlaces, la celda OPERACIONES de #430 con «la celda suma 3 gastos», el chip
  «Balance general» en TOTAL PARA PROVEEDOR (PESOS), septiembre ⇒ ámbar,
  volver a la pestaña ⇒ no salta, el Excel descargado el de siempre, el gasto
  12f38801 de #255 sin enlaces y FACTURACION sin enlaces). El alto de fila
  NOMINAL (ver arriba) puede dejar la celda destino recortada abajo.

## Reportes: el selector de periodo ya no «se traba» (12-oct-2026)

Pedido del cliente: «en los filtros de fecha de Reportes como que se traba el
calendario de filtro de fecha». Dos causas, dos arreglos:

- **Cada tecla navegaba.** El `<input type="date">` empujaba a la URL cada
  cambio, también los incompletos («0002-10-01» a medio teclear), y al
  responder el servidor el input se RE-MONTABA (`key={initial.desde}`) con la
  fecha validada, pisando lo que el operador seguía escribiendo. Ahora
  `PeriodSelector` (`components/admin/profit-sharing/period-selector.tsx`,
  también Reparto y Tableros) guarda un BORRADOR contra el periodo de la URL
  con el que se escribió (patrón de `CierreRepartoSection`, sin efectos que
  sincronicen estado) y solo navega con una fecha COMPLETA (año de 4 cifras ≥
  2000, día real) tras una pausa de `ESPERA_APLICAR_MS` (450 ms) o al salir
  del campo / Enter; un rango invertido arrastra la otra fecha como siempre.
  Reglas PURAS en `lib/admin/periodo-selector.ts` (`fechaCompleta`,
  `periodoAlCambiar`, `periodoCambia`, `queryDePeriodo`), prueba
  `__tests__/periodo-selector.test.ts` (incluye el cableado: sin `key`, sin
  `defaultValue`, aplica al salir).
- **El pre-cierre frenaba la página.** `PreCierreCard` es la lectura PESADA
  de `/admin/reportes` y, en el mismo render, cambiar el periodo esperaba a
  todo. Va en `<Suspense key={desde:hasta} fallback={<PreCierreCardCargando />}>`
  (`components/admin/reportes/pre-cierre-card-cargando.tsx`): el resto de la
  página se pinta al instante y el pre-cierre llega después con su esqueleto.

## «Inventario/Tienda» (12-oct-2026)

Pedido del cliente: «debemos cambiar el nombre a “Inventario/Tienda”». El
ítem del menú (`lib/admin/nav-items.ts`) y el H1 de `/admin/inventory` dicen
«Inventario/Tienda» (la bodega también es la tienda que vende refacciones a
los aviones). Rutas, roles y el resto de los textos no cambian.

## Candidatos de cobro: fecha del vuelo junto a la del cobro (12-oct-2026, API 0.0.69)

Pedido del cliente: «agregar la fecha del vuelo y la fecha de cobro porque por
ejemplo el vuelo es del 04 de octubre y el 06 se cobró y solo estamos viendo
el del cobro». El API manda `fecha_vuelo` (ADITIVO, invariante 54) en los
candidatos de cobro/sobre (`CandidatoCobroVuelo`, `CandidatoSobreGrupo`), en
las fichas de la IA (`CandidatoAbonoFicha`) y en los candidatos del 409
`ABONO_TIENE_COBRO_CANDIDATO` (`CandidatoCobroConflicto`, que ahora lo lee).
FUENTE ÚNICA de la frase: `lib/admin/ingresos-ui.ts#fechasCandidatoCobro` ⇒
«vuelo 4 oct 2026 · cobro 6 oct 2026» (acepta el cobro como instante o como
día Cancún); con un API previo solo «cobro …». La usan «Vincular» de Ingresos
(`vincular-abono-dialog.tsx`), «Vincular a un cobro» de Conciliación
(`movimiento-actions.tsx`, lista y resumen del elegido),
`descripcionFichaCandidato` (IA; un INGRESO sigue con su fecha) y los
candidatos del 409 en `registrar-ingreso-dialog.tsx`. Pruebas:
`ingresos-ui.test.ts` y `ingresos/__tests__/fechas-candidato-cobro.test.ts`
(cableado).

## Conciliación: los ABONOS tienen el mismo menú que Ingresos (12-oct-2026)

Pedido del cliente: «la sección de ingresos sí tenemos muchas opciones para
conciliar ese ingreso, pero en Conciliación no vienen las mismas opciones,
necesitamos las mismas opciones en Conciliación también», «en los cargos
cuando le das en sugerir con IA te busca cosas similares pero en los abonos
no tiene la opción de sugerir con IA» y «eliminamos la opción de “Es el pago
de un vuelo…” porque es lo mismo que “Vincular a un cobro o ingreso”».

- **Fuente única del menú: `components/admin/ingresos/abono-acciones.tsx`
  (`AbonoAcciones`)**. La bandeja de Conciliación (`movimiento-actions.tsx`)
  lo monta para todo ABONO sin identificar (`esAbonoPendiente`) cuando la
  página le pasa `abonos` (catálogos + cuentas): Vincular a un cobro o
  ingreso · Es un anticipo · Registrar como otro ingreso · Es un traspaso ·
  Es la devolución de un cargo · **Sugerir con IA** (la IA de abonos por
  renglón, la misma de Ingresos) y, por `extras`, el «Clasificar (no es de
  un vuelo)» que es de Conciliación. El diálogo de clasificar
  (`dialogoClasificar`) se monta en los dos caminos. Sin catálogos (la
  página no pudo cargar cuentas) sigue el menú de siempre, con «Conciliar en
  Ingresos».
- **`MovimientoBancario` ⇒ `AbonoPendiente`**: `lib/admin/conciliacion-abonos.ts`
  (PURO, prueba `__tests__/conciliacion-abonos.test.ts`):
  `abonoPendienteDeMovimiento` traduce lo que la bandeja sabe (cuenta,
  fecha, monto, bruto/comisión, descripción, referencia, notas) y deja en
  null lo que solo calcula `abonos-pendientes` (motivo, candidatos,
  duplicado, sugerencias) — nunca se inventa un motivo; `esAbonoPendiente`,
  `cuentasDeAbonos`, `AbonosConciliacion`. La página
  (`app/admin/conciliacion/page.tsx`) carga clientes y aeronaves con
  `degradado.opcional` (los piden «otro ingreso» y «anticipo») y arma
  `abonosConciliacion`; `MovimientosTable` lo pasa a cada fila.
- **«Es el pago de un vuelo (registrar su cobro)» ya no es un renglón**:
  vive DENTRO de «Vincular a un cobro o ingreso» como el botón «¿No está el
  cobro? Regístralo» (`vincular-abono-dialog.tsx`, prop `onRegistrarCobro`),
  que abre el MISMO `CobroDesdeAbonoDialog` (título «Registrar el cobro del
  vuelo desde este abono»). Es la salida cuando el cobro todavía no existe:
  no se borró la capacidad, se quitó el renglón que el cliente leía como
  duplicado. El aviso del alta de ingreso ya manda ahí.
- Pruebas: `conciliacion/__tests__/abonos-menu.test.ts` (cableado: la fila
  monta `AbonoAcciones` + Clasificar, la tabla y la página pasan `abonos`,
  el menú de Ingresos sin el renglón y en su orden, Vincular con el botón).
  Los tests de Conciliación que montan la fila apagan los módulos de red del
  navegador como `ingresos-pantalla.test.tsx`.
- **El reporte Excel sale en el orden del estado de cuenta** (API 0.0.70,
  invariante 55, migración `20261012000001` pendiente de aplicar): lo arma
  el API; el panel no cambia.

## Conciliación: 1 abono ↔ N cobros («un pago para varios vuelos», 12-oct-2026, API 0.0.71)

Pedido del cliente: «al momento de vincular un cobro o ingreso puedas
seleccionar 2 para un solo cobro… hicieron un pago para el vuelo 379 y 380».
Contrato con el API 0.0.71 (migración `20261012000002`, PENDIENTE de aplicar;
invariante 56 del API): la liga vive en una puente y `movimiento_bancario`
trae `cobros_n` (espejo); `cobro_id`/`cobro` quedan como ESPEJO solo con UNA
parte (con 2+ vienen NULL).

- **La regla es del API**: 1 cobro = la liga de siempre; 2+ cobros en la
  moneda de la cuenta y Σ netos (monto − comisión) = abono ± tolerancia (1 ¢
  por cobro, 0.02–1.00); un sobre de grupo o un ingreso van SOLOS. El panel
  NUNCA decide si cuadra: la suma en pantalla es GUÍA. **Desde el API 0.0.78
  (invariante 77) un cobro también acepta VARIOS abonos**: en un lote cada
  cobro entra por lo que le FALTA fuera de ese abono (su neto si no tiene
  otros abonos) y, con UN cobro marcado, manda el veredicto `al_vincular`
  del API (un abono menor deja el cobro «Conciliado parcial», con
  confirmación; uno mayor apaga el botón con la razón). Ver «Cobros: un
  cobro con varios abonos…» al final.
- **FUENTE ÚNICA `lib/admin/conciliacion-cobros-lote.ts`** (PURA, prueba
  `__tests__/conciliacion-cobros-lote.test.ts`): `numeroCobrosDe`,
  `tieneCobroLigado`, `esAbonoConLote`; la selección del diálogo
  (`alternarSeleccion`: varios cobros; sobre/ingreso desplazan lo marcado y
  lo dicen; `seleccionInicial` con los `cobro_ids` que el abono ya paga;
  `coincideOpcion` con el buscador único); la suma guía (`estadoLoteAbono`,
  `textoSumaLoteAbono`); `botonVincularAbono`, `toastVinculoCobros`;
  `resumenLoteCobrosFila` y `textoBusquedaCobros` (bandeja); los textos de
  desvincular; `mensajeErrorVincularCobros` (`ABONO_NO_CUADRA`,
  `LOTE_MONEDA_DISTINTA`, `COBRO_YA_CONCILIADO` ⇒ recarga, `COBRO_DE_GRUPO`,
  `MOVIMIENTO_CON_LOTE`, `API_SIN_LOTE_COBROS` y el 503
  `CONCILIACION_COBROS_NO_DISPONIBLE` ⇒ «vincúlalo a un solo cobro»).
- **Diálogo «Vincular a un cobro o ingreso»**
  (`ingresos/vincular-abono-dialog.tsx`, Ingresos y Conciliación): lista con
  CASILLAS + buscador local; los cobros que el abono YA paga llegan marcados
  (`movimiento.cobro_ids`); UN cobro sin lote previo sigue por
  `ligarAbonoCobroAction({cobro_id})` (funciona con un API previo); 2+ (o
  editar un lote) por `ligarAbonoCobrosAction(cobro_ids)`
  (`app/admin/ingresos/actions.ts`; el 400 «property cobro_ids should not
  exist» de un API previo se traduce a `API_SIN_LOTE_COBROS`). Conserva
  «¿No está el cobro? Regístralo».
- **Bandeja** (`movimientos-table.tsx`): rama NUEVA antes de las de siempre
  para `esAbonoConLote` — «2 cobros · $3,500 MXN» + una línea por cobro con
  liga al vuelo («Vuelo #379 · Maqar», fechas y monto; desde el 0.0.78 con
  «· parcial: faltan $X» o «· completa el cobro (2 abonos)» según el cobro)
  + «diferencia $0.01»; sin `cobros[]` (skew) «2 cobros conciliados», JAMÁS
  «Pendiente». La
  búsqueda rápida encuentra el abono por folio o cliente de sus cobros. El
  menú ⋯ (`movimiento-actions.tsx`) ve el lote como «vinculado a cobro»,
  ofrece «Desvincular los 2 cobros» con confirmación y `esAbonoPendiente`
  (`conciliacion-abonos.ts`) ya no cuenta un lote como pendiente.
- **Tipos ADITIVOS** (`types/conciliacion.ts`): `MovimientoCobroParte`,
  `MovimientoBancario.cobros_n/cobros/cobros_suma/cobros_diferencia/
  cobros_estado`, `CandidatosCobroResponse.movimiento.cobros_n/cobro_ids`.
- Pruebas: `lib/admin/__tests__/conciliacion-cobros-lote.test.ts` y
  `ingresos/__tests__/vincular-abono-lote.test.tsx` (cableado). Orden de
  deploy: API 0.0.71 → migración → panel (con el panel nuevo y un API previo,
  marcar 2+ responde el aviso de «versión nueva del servidor»).

## Búsqueda «tipo Algolia, sin contratar Algolia» (12-oct-2026)

Pedido del cliente: «en los buscadores podemos ampliar capacidades de
búsqueda». FUENTE ÚNICA `lib/admin/busqueda.ts` (PURA, prueba
`__tests__/busqueda.test.ts`): `normalizarTexto` (sin acentos ni
mayúsculas, signos como separadores, «$2,801.40» ⇒ «2801.40»), `tokensDe`,
`coincideBusqueda(texto, consulta)` (TODAS las palabras, en cualquier orden;
cada una por palabra exacta, inicio de palabra, pedazo o PARECIDA —un error
de dedo en palabras de 5+ letras: letra cambiada, de más, de menos o dos
invertidas—), `puntuacionBusqueda` (exacta 3 · prefijo 2 · pedazo 1 ·
parecida 0.5) y `filtrarPorBusqueda` (filtra y ordena por relevancia, orden
original en empates). La usan la lista de candidatos de «Vincular a un cobro
o ingreso» y, desde la misma fecha, `DataTable` (búsqueda rápida:
`coincideBusqueda`, SIN reordenar — el orden lo decide el padre) y
`SearchableSelect` (prop `filter` del Combobox de Base UI sobre etiqueta +
descripción). Cableado vigilado en `lib/admin/__tests__/busqueda-cableado.test.ts`.

## Comprobante con VARIAS hojas (12-oct-2026)

Pedido del cliente: «un proveedor de gasolina nos emite como 5 comprobantes
en PDF, y ahorita solo nos deja subir un solo PDF… que sea general». Sin
cambios en el API: el gasto guarda UN archivo principal (`foto_url`, la hoja
que lee la IA) y las hojas 2..N en `valor_ia_extraido.fotos_adicionales`,
el MISMO campo que usa la app para una factura multi-hoja y que el API lee
al reanalizar (invariante 46, `folio-relectura.util.ts`).

- **FUENTE ÚNICA** `lib/admin/comprobante-hojas.ts` (PURA, prueba
  `__tests__/comprobante-hojas.test.ts`): `hojasDe(gasto)` (sin repetir la
  principal ni vacíos), `archivosDelComprobante`, `valorIaConHojas(valorIa,
  hojas)` (funde las hojas en el jsonb SIN perder la lectura de la IA; sin
  hojas quita la llave; sin nada ⇒ undefined), `aceptarArchivosComprobante`
  (tipos del bucket, 10 MB, tope `MAX_HOJAS_COMPROBANTE` = 10; lo rechazado
  se DICE, nunca se descarta en silencio), `hojasCambiaron`, `textoHojas`
  («+2 hojas»), `tituloHojas`, `etiquetaHoja`, `textoArchivosZona`,
  `toastGastoConComprobante` y los textos de los diálogos.
- **Alta** (`expense-create-dialog.tsx`): el input y el arrastre admiten
  VARIOS archivos; la lista «Hoja 1 de N…» con ✕ por archivo y «Agregar
  hojas». La IA lee SOLO la hoja principal (la primera; al quitarla, la
  siguiente pasa a serlo y se lee). Al guardar se suben en orden (si una
  falla no se crea nada a medias): la primera ⇒ `foto_url`, el resto ⇒
  `fotos_adicionales` dentro de `valor_ia_extraido` (con la lectura de la IA).
- **«Verificar / editar»** (`expense-verify-dialog.tsx`): bloque «Hojas del
  comprobante» con las guardadas (miniatura con URL firmada pedida al abrir
  vía `pedirUrlFirmada`: la página solo firma la principal), las nuevas por
  nombre («nueva · se sube al guardar»), «Agregar hojas» (o «Agregar
  comprobante» sin ninguna: la primera pasa a ser `foto_url`, por eso
  `GastoVerifySchema` ganó `foto_url`) y «Quitar hoja» de una guardada CON
  confirmación. Al guardar viaja la lista completa SOLO si cambió, encima de
  la lectura de la IA (fresca o guardada); quitar la última manda `{}`.
- **Tablas** (`expenses-table.tsx`, `flight-gastos-table.tsx`): junto a la
  miniatura, «+N hojas» con tooltip. Desde el 16-oct-2026 es un BOTÓN que
  abre el comprobante completo con visor (ver «Varias facturas por gasto»).
- `lib/storage/gasto-fotos.ts` importa el cliente de Supabase del navegador
  de forma DIFERIDA (exige sus variables al cargar el módulo y ahora lo
  importan diálogos que se renderizan en pruebas sin ellas).
- Cableado vigilado en `expenses/__tests__/comprobante-hojas-ui.test.ts`.

## Conciliación: «¿No está el gasto? Créalo» (12-oct-2026)

Pedido del cliente: «crear gasto desde la opción de vincular el gasto… que ya
venga una opción para crearlo rápido, incluso si está prellenado» y «que se
confirme bien que no está el gasto… alguna alerta… que con IA te ayude a
validar que no esté ya registrado para no duplicar… validando que tú das el
visto bueno». Solo panel.

- **FUENTE ÚNICA** `lib/admin/gasto-desde-cargo.ts` (PURA, prueba
  `__tests__/gasto-desde-cargo.test.ts`): `prefillGastoDesdeCargo(mov,
  monedaCuenta)` (monto positivo a 2 decimales, moneda de la cuenta, fecha
  del cargo, `TARJETA_CORP` + terminación SOLO con referencia de 8+ dígitos
  —la regla del auto-cruce del API—, si no `TRANSFERENCIA`; notas =
  descripción · ref.), `duplicadosDeCandidatos` / `duplicadosDeRespuesta`
  (mismo monto o faltante ±0.01), `veredictoIa(sugerencia, cargando)`
  (pendiente · sugiere —`alta` desde 70 %— · sin_match · no_disponible),
  `botonCrear` («Crear de todos modos» si la IA está segura),
  `casillaConfirmacion` (más dura si la IA está segura), `puedeCrear` (casilla
  marcada y sin la búsqueda de duplicados en curso; la IA NO bloquea),
  `textoTrasCrear`, `textoContextoCrear`, `CatalogosGastoDesdeCargo` y
  `MOTIVO_NO_BANCARIO_SIN_VINCULO`.
- **Diálogo «Vincular gasto» del CARGO** (`vincular-gasto-dialog.tsx`): en
  el pie, a la izquierda, «¿No está el gasto? Créalo» (solo con
  `catalogosGasto`). Abre el PASO PREVIO (`PasoCrearGasto`): resumen del
  cargo, «Posibles duplicados (mismo monto, ±120 días)» —candidatos del API
  con `q` = el monto, `dias` 120 e `incluir_no_bancarios` (si el API no lo
  sabe, se repite sin él), con «Ya conciliado», la insignia de efectivo y
  los `excluidos` explicados debajo (`VacioCandidatos` ahora admite `texto`
  null)—, el veredicto de la IA (`sugerir` del cargo, pedido UNA vez al
  entrar; rojo si está segura, ámbar si duda, gris si no hay o no está) y la
  casilla de confirmación explícita. «Crear el gasto» abre el MISMO
  `ExpenseCreateDialog` en modo CONTROLADO y ANIDADO (Base UI apila
  diálogos), prellenado y con la nota de contexto; al guardar, `trasCrear`
  liga el gasto nuevo con `linkMovimientoAction(mov.id, gasto.id)` y cierra
  (la liga fallida se avisa: el gasto SÍ quedó). En EFECTIVO u otro medio no
  bancario NO se liga solo (el API exige justificación): se dice cómo.
- **`ExpenseCreateDialog` en modo controlado** (props ADITIVAS `abierto`,
  `onAbiertoChange`, `prefill`, `onCreado`, `titulo`, `contexto`): sin botón
  propio, prellenado al ABRIR encima de los defaults y aviso con el gasto
  creado antes de cerrar. Sin `abierto`, el diálogo de siempre. Desde el
  14-oct-2026 también `conciliarConMovimientos`, `clientRequestId`,
  `textoExito` y `textoError` («Créalo por la suma» de varios cargos: ver
  «Conciliación: omitir la conciliación y varios cargos → un gasto»).
- **Página**: `app/admin/conciliacion/page.tsx` carga los proveedores
  (`degradado.opcional`) y arma `catalogosGasto` (aviones con su combustible
  vía `avionCatalogoGasto`, como Gastos) → `MovimientosTable` →
  `MovimientoActions` → `VincularGastoDialog`. Sin aeronaves cargadas no se
  ofrece crear.
- Cableado vigilado en `conciliacion/__tests__/crear-gasto-desde-cargo.test.ts`.


## Refacción: «Directo al avión» o «A Inventario/Tienda» (12-oct-2026, API 0.0.72)

Pedido del cliente: «si se selecciona un avión al dar de alta un gasto de un
artículo de inventario, una nota visual: entra a inventario pero se
asignará/venderá a ese avión, quedando la traza del artículo»; «el gasto
asignado directo al avión se va al avión sin cambiar el precio de venta;
desde inventario debe pedir precio de venta obligatorio; el gasto REFACCION
crea el ítem si no existe». Contrato: invariante 57 del API (`POST
/v1/expenses` con el bloque `inventario`, solo REFACCION y solo al crear).

- **FUENTE ÚNICA** `lib/admin/refaccion-inventario.ts` (PURA, prueba
  `__tests__/refaccion-inventario.test.ts`): `destinoRefaccionInicial`
  (desde «Gastos del vuelo» arranca «Directo al avión»; en el alta general,
  «A Inventario/Tienda»), los textos del segmento y las notas
  (`NOTA_DIRECTO_AVION`: no pasa por la bodega ni cambia el precio de venta
  de ningún artículo; `NOTA_INVENTARIO_SIN_AVION`; `notaInventarioConAvion`
  = la TRAZA: «entra a Inventario/Tienda y, al guardar, sale vendida a
  XA-VGV a $450 MXN c/u: en su cardex queda la traza (entrada + salida) y el
  avión recibe el cargo de bodega»), el sub-formulario
  (`formInventarioVacio`, `formAlElegirArticulo` —prellena el precio de
  venta de la ficha—, `opcionesArticulos` con «＋ Artículo nuevo (se crea al
  guardar)» primero), `payloadInventario` (artículo o nombre nuevo, unidades
  > 0, precio de venta CAPTURADO —0 = a costo—, `vender_al_avion` solo con
  avión; sin cadenas vacías), `hojaDestinoRefaccionInventario`,
  `toastRefaccionInventario` (verde con compra #, artículo nuevo y la venta;
  ámbar con los `avisos` del API cuando una etapa falló: el gasto SÍ quedó)
  y `mensajeErrorInventario` (el 400 «property inventario should not exist»
  de un API previo ⇒ «guarda la refacción Directo al avión o crea la
  compra desde el menú ⋯»).
- **Alta** (`expense-create-dialog.tsx`): con categoría REFACCION, el
  bloque «¿A dónde va la refacción?» con dos botones (`aria-pressed`):
  «Directo al avión» (el gasto indirecto de siempre; exige el avión al
  guardar) y «A Inventario/Tienda» (artículo de la bodega —
  `listArticulosRefaccionAction`, activos, una página de 300 — o nuevo con
  nombre, nº de parte y categoría; unidades; precio de venta unitario +
  moneda, OBLIGATORIO; con avión, el switch «Vender al avión al guardar»
  encendido y la nota de la traza). El bloque `inventario` se valida ANTES
  de subir el comprobante y viaja en el POST; el API quita el avión del
  gasto de compra (el avión paga por la salida de bodega, hoja
  Refacciones) — por eso el hint de la categoría dice «Inventario/Tienda
  (compra recibida) · el avión recibe el cargo de bodega por su salida»
  (`CategoriaDestinoHint` gana la prop `hoja`). El toast dice qué pasó por
  etapa (`result.data.inventario`, tipo `GastoInventarioResultado` en
  `types/expenses.ts`).
- **Lo que NO cambia**: la refacción «Directo al avión» es byte a byte el
  alta de siempre (sin `inventario`); «Verificar / editar» no toca la bodega
  (un gasto ya en una compra enseña su liga); la app Flutter sigue igual.
- Cableado vigilado en `expenses/__tests__/refaccion-inventario-ui.test.ts`.
  Orden de deploy: API 0.0.72 → panel (con un API previo, «A
  Inventario/Tienda» responde el aviso de «guarda Directo al avión»).

## Reportes: los balances a un clic (12-oct-2026)

Pedido textual del cliente: «esta pantalla de la ruta
https://vuelatour-next.vercel.app/admin/reportes mejoremos la UI para que
sea más limpio e intuitivo acceder a las opciones de balance por avión y
general que son las 2 cosas que más se consultan aquí». Hasta hoy los dos
balances vivían al FONDO de siete cards apiladas, detrás de un pre-cierre de
12+ renglones y de un dropdown de avión. Solo panel: sin API, sin migración,
sin tocar `pre-cierre-card.tsx`, `pre-cierre-card-cargando.tsx`,
`period-selector.tsx`, `download.ts` ni `balance/page.tsx`
(`report-downloads.tsx` solo gana el `vePdf` del gating de abajo).

- **Criterio**: lo que más se consulta va ARRIBA y a UN clic; «Ver en
  pantalla» va PRIMERO en cada tile (la posición es la jerarquía: prioridad a
  la vista, pedido del 12-oct). Con el periodo por defecto, el balance de un
  avión o el general = 1 clic (pantalla o Excel); «Mes pasado» = +1 clic.
- **Orden de la pantalla** (`app/admin/reportes/page.tsx`): cabecera →
  card del periodo (`PeriodSelector`, sin cambios) + atajos-enlace
  «Este mes · Octubre 2026» / «Mes pasado · Septiembre 2026» → aviso de
  degradación (solo si un catálogo no cargó) → `<h2>` **BALANCES** (con el
  periodo en palabras UNA vez: «Del 01 oct 2026 al 12 oct 2026») [card
  «Balance mensual y balance general» con 2 tiles; card «Balance por avión»
  con un tile por avión; plegable cerrado «¿Qué trae cada libro?» con las
  tres descripciones largas, SIEMPRE en el DOM] → `<h2>` **CIERRE DEL MES**
  [el pre-cierre ENTERO, mismo `<Suspense>` byte a byte, justo encima de
  «Cierre y reparto del periodo», cuya descripción arranca con «Revisa
  primero el pre-cierre de arriba.»] → `<h2>` **OTROS REPORTES** [«Reporte
  por vuelo» y «Exports de operación», dos columnas desde `lg`].
- **Fuentes únicas**: `lib/admin/reportes-ui.ts` (PURA, prueba
  `__tests__/reportes-ui.test.ts`): rótulos, textos de la card del avión y
  del cierre, etiquetas de degradación («los aviones», «los vuelos
  recientes», «tu usuario» — el texto de la card del avión que no cargó ES
  `textoDegradado([…])`, una sola voz con el aviso de arriba), el tile
  (`AvionBalanceItem`, `avionBalanceDeAeronave`: solo 5 campos
  serializables, color vacío ⇒ null), el orden (`ordenarAvionesBalance`:
  activos A–Z, inactivos al final, COPIA, nunca filtra) y los atajos
  (`atajosPeriodoReportes`: href, etiqueta, activo por coincidencia exacta,
  `title` con `textoPeriodoVista`). `reportes-balance.ts` gana `resumen`
  (la línea corta del tile) y `TITULO_DETALLE_LIBROS`. `balance-vista.ts`
  gana `ROLES_ABREN_BALANCES` / `puedeAbrirBalances` /
  `TEXTO_BALANCES_SIN_PERMISO` (título = el del 403 de `errorVistaBalance`).
  La descarga de un avión es ÚNICAMENTE `descargaVistaBalance` (la misma
  ruta, archivo `balance-<matricula>-<desde>-<hasta>.xlsx` y query que la
  vista); `components/admin/texto-plegable.tsx` (`TextoPlegable`,
  server-safe, `<details>` cerrado sin memoria) es reutilizable.
- **`aircraft-balance-picker.tsx` ya es una GRILLA** (mismo archivo y mismo
  export `AircraftBalancePicker`; sin `"use client"`, sin `useState`, sin
  `SearchableSelect`, sin `descargarDelApi` ni toast propio): un `<li
  data-avion>` por avión con punto de color (solo con hex, `ring-1
  ring-border`), matrícula mono, modelo, Badge `secondary` «Inactiva» (con
  `title`; SIN `opacity`: parece deshabilitado y el muted cae por debajo de
  AA; la frase del `title` va también en un `sr-only` para teclado, táctil
  y lector), «Ver en pantalla» (`aria-label` «Ver en pantalla · XB-PEV») y
  «Excel» (`ExcelExportButton` con `title`/`aria-label` «Descargar el
  balance de XB-PEV en Excel»; el único toast de descarga de BALANCES es su
  «No se pudo exportar»: Reparto y el reporte por vuelo tienen el suyo). La
  `<ul>` lleva `role="list"` (el preflight de Tailwind quita las viñetas y
  VoiceOver deja de anunciar la lista sin el rol; la de la flota también,
  con `aria-labelledby` del título de la card) y las columnas son `sm:2 /
  xl:3 / 2xl:4`: con el sidebar de 256 px, 3 columnas en `lg` o 4 en `xl`
  dejan ~200 px útiles y parten «Ver en pantalla» + «Excel» (~223 px) en dos
  renglones; por eso «Excel» se queda corto (con «Descargar Excel» también
  se partirían a 640 y a 1536 px; el nombre largo va en `title`/`aria-label`).
  NO marca `en_taller` ni atenúa inactivos a propósito: es una pantalla de
  CONSULTA, no un selector donde se ELIGE un avión para operar (la regla
  «marcar, nunca deshabilitar» es para esos selectores). Sin foto. Pinta el
  orden que recibe. `disponibles=false` ⇒ «No se pudieron cargar los
  aviones…» con `role="status"`; `[]` ⇒ «No hay aviones dados de alta…».
  Jamás «Sin aeronaves» por un 502.
- **Atajos = `<Link>` PUROS** (`reportes/atajos-periodo-reportes.tsx`) a
  `/admin/reportes?desde&hasta`: navegación de servidor, cero estado, cero
  carrera con los botones, `aria-current` en el activo, el mismo aspecto
  del chip «Mes pasado» de Reparto (`secondary` activo / `outline`
  inactivo; nunca `bg-brand-600`, que es el rojo de la casa). `hoy` sale
  del servidor (`todayCancun()`, UNA vez; también es el default del
  periodo vía `periodoDefaultVista(hoy)` — `currentMonth()` se borró de
  esta página). `PeriodSelector` NO se tocó ni recibe `atajoMesPasado`: el
  `<select>` nativo de `MesReporteSelect` sigue siendo la excepción
  histórica, solo en el cierre.
- **Degradar por tarjeta**: `/me`, vuelos y aviones van con
  `degradado.opcional` (adiós a los dos `try/catch` mudos) +
  `<AvisoDegradado>`. `null` = NO cargó ≠ `[]` = no hay: la grilla recibe
  `disponibles`, el selector de vuelo recibe `fallo` (prop aditiva de
  `FlightReportPicker`: dice «Los vuelos no cargaron: recarga la página» en
  vez de «Sin vuelos en el rango reciente»). Un 401/403 degrada en silencio
  (sin aviso arriba; la card del avión sigue diciendo «No se pudieron cargar
  los aviones…»: `GET /v1/aircraft` no lleva `@Roles` y un 401 lo atrapa el
  layout, así que ese caso hoy no ocurre; si el API restringiera la lista,
  tocaría un tercer estado «sin permiso» sin «recarga para reintentar»).
- **Gating por rol** (espejo del `@Roles(Rol.ADMIN, Rol.ANALISTA)` de los 4
  endpoints de balance del API, paridad congelada en
  `balance-vista.test.ts`): FACTURACION entra a Reportes por el menú y el
  API le responde 403, así que en lugar del hero ve UNA card con candado
  «Tu usuario no puede abrir los balances» (+ descripción que no lo manda a
  «pedirlo a la oficina»: FACTURACION ES la oficina — y que NO promete
  descargas que el rol no puede usar); el subtítulo de la cabecera cambia a
  `SUBTITULO_REPORTES_SIN_BALANCES` (no invita a abrir lo que la sección
  niega). `rol` viaja a `CierreRepartoSection` (prop aditiva) →
  `ReportDownloads`, cuyo gating ya existía y ahora cubre también «PDF
  socios» (`vePdf`: ADMIN, ANALISTA y SOCIO, espejo del `@Roles` de
  `GET /v1/profit-sharing/pdf`; FACTURACION ve solo «Cierre (zip)»).
  «Horas por piloto» (`@Roles(ADMIN, COORDINADOR)` en
  `dashboards.controller.ts`) se pinta solo con `puedeExportarHorasPiloto(rol)`
  (`reportes-ui.ts`, paridad con el API en `reportes-ui.test.ts`): ANALISTA y
  FACTURACION ya no ven un botón que siempre les respondía 403. Sin `/me` se
  ofrece todo: el API es el candado.
- **Props ADITIVAS**: `ExcelExportButton` (`title`, `aria-label`; con
  `aria-label` el nombre accesible en carga es «Generando… <nombre>» y el
  botón lleva `aria-busy`), `VerEnPantallaLink` (`aria-label`),
  `FlightReportPicker` (`fallo`), `CierreRepartoSection` (`rol`). Sin ellas,
  el marcado es byte a byte el de antes: Reparto, Exports, Inventario y la
  vista de balance no cambian. El `<summary>` de `TextoPlegable` mide 24 px
  de alto (`min-h-6`, WCAG 2.5.8) sin mover el texto.
- **El pre-cierre solo bajó de posición, ENTERO**: no se pliega ni se
  resume con conteos. Los conteos y el «qué bloquea» viven dentro del
  componente async (la única lectura de `/v1/profit-sharing/pre-cierre`);
  un resumen «siempre visible» exigiría una segunda llamada al endpoint
  pesado o un ESPEJO en el panel de la lista `bloqueantes` del API — un
  cálculo paralelo de la regla que decide el cierre. Queda para un lote con
  decisión del cliente y, mejor, con un campo aditivo `resumen` en la
  respuesta del API pintado por un envoltorio nuevo (reutilizando
  `TextoPlegable`), no editando `pre-cierre-card.tsx`.
- **Pruebas**: `lib/admin/__tests__/reportes-ui.test.ts`,
  `reportes-balance.test.ts` (la página con mocks: los 6 `ExcelExportButton`
  en orden, el hero antes del cierre, aviones ordenados, 502/403 de aviones,
  502 de vuelos, FACTURACION/ANALISTA/COORDINADOR/`/me` caído, tokens del
  fuente),
  `balance-vista.test.ts` («quién abre los balances» + paridad con el API),
  `components/admin/reportes/__tests__/balances-hero.test.tsx` (la grilla,
  los atajos, el plegable, el `aria-label` del enlace) y
  `components/admin/__tests__/excel-export-button-nombre.test.tsx`. Ajeno
  pero necesario para el gate «suite completa en verde»: el `it` del botón ⋯
  real de `expenses/__tests__/expense-actions-menu.test.tsx` tiene 20 s (su
  `await import` de Base UI corre DENTRO del test y, con la suite completa
  en paralelo, expiraba a los 5 s por defecto). Deploy: solo panel.

## Cotizaciones: filtro de fechas de la lista (13-oct-2026)

Pedido del cliente: «Desde / Hasta» en `/admin/quotes`, sobre la FECHA DEL
VUELO. Solo panel; el API agrega `desde`/`hasta` a `ListQuotesQuery` (y por
`OmitType` a `/vecinos`) en su propio lote, y mientras no esté desplegado el
panel DEGRADA sin mentir.

- **El rango vive en la URL** (`?desde`/`?hasta`, día Cancún `YYYY-MM-DD`) y
  **forma parte de `FILTROS_LISTA`** (`lib/admin/quote-navegacion.ts`, AL
  FINAL para que las URLs de antes se escriban igual): viaja a
  `GET /v1/quotes`, a `GET /v1/quotes/:id/vecinos`, al `href` de cada fila, a
  «‹ Anterior»/«Siguiente ›» y al `BackLink`, SIN tocar el detalle ni el
  workspace. Si no viajara a `/vecinos`, la flecha brincaría a un vuelo fuera
  de lo que la lista enseña.
- **Validación** `rangoListaCotizaciones(desde, hasta)` (PURA): solo días
  reales `YYYY-MM-DD` (`esDiaValido`; un ISO con hora se ignora, el DTO lo
  rechaza), inválido se ignora (regla de `url-params`), invertido se
  intercambia, un solo extremo vale y **NUNCA se recorta a hoy**: la fecha es
  la del vuelo y hay vuelos por venir. Por lo mismo **«Este mes» = del 1 al
  ÚLTIMO día del mes** (`periodosRapidosCotizaciones`: Este mes · Mes pasado
  · Próximos 30 días), a diferencia de Conciliación/Ingresos (1 → hoy). No
  «alinearlo»: es deliberado.
- **Barra** (`components/admin/quotes/quotes-filter-bar.tsx`, props ADITIVAS
  `hoy?` y `rangoIgnorado?`; sin `hoy` el marcado es byte a byte el de antes):
  fila `role="group" aria-label="Periodo del vuelo"` con `cot-desde` /
  `cot-hasta` (`type="date"`, SIN `max`, `cursor-pointer`, etiquetas ligadas),
  3 chips `aria-pressed` y la nota `data-nota-rango`. LEE el rango de la URL
  viva con la MISMA función del servidor (nunca `useState(propDelServer)`).
  Los campos usan el BORRADOR de `periodo-selector` (`fechaCompleta` +
  `ESPERA_APLICAR_MS`; reglas puras `pasoCampoFecha`, `pasoAlSalirCampoFecha`,
  `valorVisibleCampoFecha`): tecleando el año nada navega; solo una fecha
  completa tras la pausa, al salir del campo o con Enter; vaciar el campo y
  salir limpia ese extremo. **Si el extremo nuevo invierte el rango, el otro
  lo sigue** (`rangoAlCambiarCampo`, la regla de `periodoAlCambiar` del
  selector de Reportes): con el intercambio, pasar de 01–15 a 20–31 tecleando
  primero «Desde = 20» dejaba 15–20 y el borrador podía quedar enseñando un
  valor distinto del aplicado. «Limpiar» (ahora con `cursor-pointer`) suelta
  también `desde`/`hasta` y `hasFilters` cuenta el rango.
- **Navegaciones encadenadas** (revisión 13-oct-2026): `useSearchParams`
  sigue devolviendo la URL ANTERIOR mientras una navegación está en vuelo
  (la página es `force-dynamic` y espera al servidor), así que «Desde = 20»
  + Enter, Tab y «Hasta = 31» dentro de esa latencia se armaban los dos
  sobre la URL vieja y el segundo pisaba al primero (la lista quedaba 01–31
  y el 20 desaparecía sin aviso; con un chip y una corrección a mano el
  rango colapsaba a un día). La barra guarda en un `useRef` la última
  consulta PEDIDA con la URL viva que había al pedirla (`ConsultaPendiente`)
  y `pushQuery`/`aplicar` parten de `consultaBaseParaNavegar(viva,
  pendiente)` (PURA): mientras la URL no se mueva, de esa consulta; en cuanto
  se mueve, de la viva. Vale también para Estado/Cliente/Buscar (la misma
  carrera, preexistente). La misma consulta ya pedida no se vuelve a pedir
  (el blur tras Enter). Lo que se VE sigue saliendo de la URL viva y de los
  borradores. Prueba: la secuencia completa, simulada sin DOM, en
  `quote-navegacion.test.ts`; el cableado en `quotes-filter-bar.test.tsx`.
  **Caducan** (revisión del 14-oct-2026, la misma regla que la barra de
  Gastos): la consulta pendiente se suelta en cuanto la URL viva deja su base
  (`pendienteVigente`, en un efecto sobre `params`) y un borrador en cuanto la
  URL de SU campo cambia (`borradoresVigentes`, ajuste guardado en el
  render). Antes revivían cuando la URL regresaba por FUERA de la barra
  (Atrás, «Limpiar» del vacío): el siguiente clic se perdía («la misma
  consulta ya pedida») o traía de vuelta lo quitado.
- **Red** (`lib/api/quotes-server.ts`): `ListQuotesQuery` += `desde?`/`hasta?`
  (solo viajan si existen: `buildUrl` omite `undefined`, así que sin rango un
  API previo no ve nada nuevo). `listQuotesAll` devuelve `{data, count,
  rangoIgnorado}`: ante el 400 «property desde should not exist»
  (`esApiSinRangoFechas`, espejo de `esApiSinTramosBase`: status 400 + «desde|
  hasta» + «should not exist/property», tolera mensaje en lista) con rango en
  la consulta, RELEE sin rango (`sinRango`) y marca `rangoIgnorado: true`. Es
  un GET deliberado con OTROS parámetros, no el reintento automático de
  `apiFetch` (prohibido en 4xx); un 400 de otro campo o un 502 se relanzan
  como siempre. `getQuoteVecinos` hace lo mismo para que las flechas recorran
  la MISMA lista degradada (404/403 siguen en `null`).
- **Página** (`app/admin/quotes/page.tsx`): `hoy = todayCancun()` una vez;
  pasa `desde`/`hasta` a `listQuotesAll`; con `rangoIgnorado` pinta el banner
  ámbar `role="status" data-aviso="rango-api-viejo"` con `MSG_RANGO_API_VIEJO`
  (nunca la pantalla rota ni «Sin cotizaciones») y los textos hablan del
  rango APLICADO (`rangoAplicado = rangoIgnorado ? {} : rango`): encabezado
  `textoEncabezadoCotizaciones` («12 cotizaciones con fecha de vuelo del 01
  oct 2026 al 31 oct 2026.» / «312 cotizaciones (todas las fechas).»), vacío
  `textoVacioCotizaciones` («Sin cotizaciones en el periodo» + «Limpiar»; sin
  rango, los textos de siempre). Con rango el API EXCLUYE las cotizaciones sin
  fecha de vuelo: el banner «Hay N sin fecha» no sale porque N = 0 y la nota
  de la barra lo explica (`notaRangoCotizaciones`); con el API previo sale
  como siempre.
- **Pruebas**: `lib/admin/__tests__/quote-navegacion.test.ts` (los 6 filtros,
  validación sin recorte, ida y vuelta con el rango, periodos con cruce de
  año y febrero bisiesto, `rangoAlCambiarCampo`, textos congelados,
  `esApiSinRangoFechas`, la secuencia del borrador sin DOM),
  `lib/api/__tests__/quotes-server-rango.test.ts` (contrato con `apiServer`
  simulado: sin rango no viaja; con rango en todas las páginas; relectura
  sin rango con los demás filtros; 400 de otro campo y 502 se relanzan;
  `/vecinos` con 404/403/500), `components/admin/quotes/__tests__/
  quotes-filter-bar.test.tsx` (marcado con y sin `hoy`, con rango, invertido,
  inválido y `rangoIgnorado`; cableado por regex) y `quote-navegacion.test.tsx`
  (las flechas conservan el rango; la página y `quotes-server` cableados).
- **Orden de deploy**: API (desde/hasta en `ListQuotesQuery`, nombres
  EXACTOS `desde`/`hasta` con `YYYY-MM-DD`) antes que el panel; en cualquier
  orden el panel no se rompe. Tras desplegar el API, verificar con
  `curl '/v1/quotes?desde=2026-10-01&hasta=2026-10-31&limit=1'` (200): con
  otros nombres el panel degradaría para siempre diciendo «cuando se actualice
  el servidor». Pendientes: sin QA visual en navegador (el borrador se prueba
  sobre las funciones puras); el campo «Buscar» sigue siendo `defaultValue` y
  no se vacía solo al pulsar «Limpiar» (como antes de este lote).

## Tablas: fila activa y teclado ↑/↓/Enter/Esc (13-oct-2026)

Pedido del cliente (lote del 13-oct-2026): al hacer clic en una fila que
quede «activa» (resaltada, distinta del hover) y poder auditar renglón por
renglón con ↑/↓, Enter abre el detalle y Esc quita el resaltado. Aplica a
TODA `DataTable` (48 tablas, sin interruptor ni props nuevas) y a las dos
tablas de resumen auditables del reparto (`profit-sharing/desglose-section.tsx`
—vuelos y gastos— y `movimientos-cuenta.tsx`). Solo panel.

- **Fuente única**: `lib/admin/filas-activas.ts` (PURO: `accionDeTeclaFila`,
  `indiceFilaSiguiente`, `filaDeEntrada`, `atributosFila`,
  `indiceEnlaceDeFila`, `scrollParaVerFila`, el ESTADO `crearEstadoFilaActiva`
  + `instantaneaFila` + `atributosDeInstantanea`, constantes de los atributos
  y selectores) + `lib/admin/desplazamiento-visible.ts`
  (`desplazamientoParaVer`, la cuenta 1-D del scroll «justo», COMPARTIDA con
  el LibroExcel: `ejeParaVer` de `libro-excel.ts` delega en ella, un solo
  cálculo para los dos) + hook `hooks/use-filas-activas.ts`
  (`useFilasActivas(claves)` ⇒ `propsCuerpo` para el <tbody>, `estado` y
  `claves`) + `components/admin/fila-navegable.tsx` (`<FilaNavegable filas
  clave href?>`: el <tr> navegable, que envuelve `TableRow` tal cual). Sin
  `useEffect` ni `useRef`: la fila destino ya existe cuando se pulsa la tecla.
  **La activa NO es estado de React de la tabla** (revisión 13-oct-2026): con
  un `useState` en el hook cada ↓, clic o foco repintaba la tabla ENTERA
  (Gastos: 100 filas × 13 columnas, dos `Menu.Root` de Base UI y una
  miniatura por fila, también con la tecla mantenida a ~30/s). Vive en
  `crearEstadoFilaActiva` (un valor + suscriptores, creado UNA vez con un
  `useState` perezoso que nunca se re-asigna) y cada `FilaNavegable` se
  suscribe POR FILA con `useSyncExternalStore` sobre `instantaneaFila` (un
  número: bit 1 activa, bit 2 entrada del Tab): al cambiar la activa solo se
  repintan las filas cuya instantánea cambia, y sus celdas (`children`) son
  los MISMOS elementos del render del padre, así que React no entra en ellas.
  En el servidor la instantánea sale del mismo estado (sin activa): HTML
  determinista, sin mismatch de hidratación.
- **Decisión ARIA**: la tabla sigue siendo una `<table>` NATIVA. Cada `<tr>`
  de datos (hijo DIRECTO del <tbody>) lleva `data-fila="<clave>"` + `tabindex`
  ROVING (exactamente UNA fila con 0 por tabla: la activa si está pintada, si
  no la primera; −1 el resto); la activa lleva `aria-current="true"` +
  `data-fila-activa=""` y las demás NO llevan `aria-current`; con enlace de
  fila, `data-fila-href="<href>"`. **NO `role="grid"`** (ni `row`, `gridcell`,
  `aria-activedescendant`): un grid exige navegación por celda, quita el
  modo tabla de NVDA/VoiceOver y rompe «los <Link> de cada celda siguen siendo
  navegables como hoy». **`aria-current`, no `aria-selected`** (revisión
  13-oct-2026): Chromium solo expone el estado «selected» de una fila cuando
  su tabla es grid/treegrid (`AXObject::IsSubWidget`), así que en una
  `<table>` nativa `aria-selected` NO llegaba al árbol de accesibilidad y
  NVDA/JAWS con Chrome nunca decían «seleccionado»; `aria-current` es global
  y los tres motores lo exponen («actual»). Nada más lleva `aria-selected`.
- **Teclas (solo con el foco dentro de ESA tabla; la escucha es DELEGADA en el
  <tbody>, nunca en window)**: ↑/↓ mueven la activa entre las filas VISIBLES
  de la página (sub-filas incluidas, orden DOM) y **en el borde se queda: NO
  cambia de página** (la paginación escribe la URL y haría desaparecer la
  fila bajo el dedo; los botones siguen siendo el camino); Home/End primera/
  última; **Enter con el foco EN el <tr>** hace `.click()` sobre el `a[href]`
  de la fila cuyo href es EXACTAMENTE `data-fila-href` (el MISMO clic del
  mouse: pasa por `useCambiosSinGuardar` y por el <Link> de Next); sin
  `data-fila-href` no hace nada (la mayoría de las tablas no tienen `rowHref`
  y sí enlaces sueltos: nunca se navega a algo no elegido); con el foco en un
  enlace o botón Enter es el nativo. Esc suelta el resaltado SOLO si hay
  activa (sin activa no se traga la tecla); el foco se queda.
- **Cuándo NO**: modificadores, `defaultPrevented`, foco en INPUT/TEXTAREA/
  SELECT/contenteditable (un INPUT **checkbox** NO cuenta como campo,
  14-oct-2026: con el foco en la casilla de la selección de Conciliación,
  ↑/↓/Home/End mueven la activa y Esc la suelta —`ContextoTeclaFila.tipoEntrada`,
  que el hook llena con el `type` del INPUT—; Espacio sigue siendo de la
  casilla), roles con flechas propias (listbox, option,
  combobox, menu*, slider, spinbutton, radio*, tab*, tree*, grid*, textbox,
  searchbox, scrollbar), disparadores `[aria-haspopup]` (el ⋯, un select, un
  combobox, un diálogo o un popover de Base UI; un `aria-expanded` SUELTO —el
  botón de plegar «Ver los pagos de la compra» de Gastos— NO veta: ahí las
  flechas no significan nada y siguen moviendo la activa, revisión
  13-oct-2026), y **←/→ JAMÁS** (el atajo del detalle de cotización,
  `direccionDeTecla`, queda intacto; la prueba de cableado lo congela). Los
  menús y diálogos de Base UI viven en portales y React les burbujea los
  eventos por el árbol de componentes: por eso el PRIMER chequeo de los tres
  handlers es `currentTarget.contains(target)` (Esc dentro de un diálogo
  abierto desde una fila NO suelta la activa; ↓ dentro de un menú no mueve
  filas).
- **Activación**: clic en cualquier celda (si no cae en un control, el <tr>
  recibe el foco para que Enter funcione de inmediato; un clic en un enlace/
  botón/campo NO roba el foco); foco en la fila O en cualquier control de la
  fila (el resaltado sigue al Tab por los enlaces y al ⋯; Tab que entra a la
  tabla activa la fila de entrada; Esc la suelta). **El renglón pegado
  (`data-fila-hija`) cuenta para la fila ANTERIOR** (revisión 13-oct-2026):
  `filaDe` del hook resuelve un objetivo en `tr[data-fila-hija]` a su
  `previousElementSibling` `tr[data-fila]`, así clic, foco (Tab hasta
  «Editar»/«Eliminar»/comprobante de la entrega del socio), ↑/↓/Home/End y
  Esc desde la hija activan y mueven la entrega correcta —antes el resaltado
  se quedaba en OTRO movimiento— y el clic en sus controles tampoco roba el
  foco (rol, desplegable y control se miran en el renglón real). **No
  persiste**: ni URL ni localStorage (un estado por instancia; Conciliación y
  las 6 tablas de Paywise tienen cada una su activa; al volver del detalle no
  se recuerda). SSR determinista: sin activa ⇒ sin mismatch de hidratación.
- **Scroll**: al mover por teclado, `destino.focus({preventScroll:true})`,
  scroll INSTANTÁNEO del `div[data-slot="table-container"]` con
  `scrollParaVerFila` (descuenta el `<thead>` sticky; geometría por
  `getBoundingClientRect` relativa al marco) y después
  `scrollIntoView({block:"nearest", behavior:"instant"})` para la ventana
  (`html` lleva desplazamiento suave por CSS; nada sticky tapa filas en el
  shell).
- **Resaltado**: regla en `globals.css` FUERA de las capas a propósito, con
  tokens PROPIOS definidos en `:root`, `.dark` y `.dark .zona-clara`:
  `--fila-activa` = `color-mix(in srgb, var(--ring) 8%, transparent)` en
  claro (≈ brand-50 sobre blanco) y 14 % en oscuro, y `--fila-activa-marca` =
  `var(--ring)` (rojo de la casa). (1) El TINTE es una CAPA:
  `[data-filas-activas] > tr[data-fila-activa]` (y `+ tr[data-fila-hija]`) ⇒
  `background-image: linear-gradient(var(--fila-activa), …)`, NUNCA
  `background-color`: el fondo de `rowClassName` (sky de «en cotización»,
  ámbar de `?resaltar`, brand de la compra, muted del pago) y el del hover
  siguen DEBAJO y no se pierden mientras la fila está activa (revisión
  13-oct-2026: con `--accent` opaco la pista de color desaparecía bajo el
  cursor). (2) La MARCA va celda por celda (`> *`, `:first-child`,
  `:last-child`, con variables `--fila-marca-*`; una sombra en el `<tr>` no
  se pinta igual en todos los navegadores): barra de 4 px a la izquierda, 1 px
  a la derecha y 1 px arriba/abajo; con hija pegada el contorno abraza a las
  dos (`:has(+ tr[data-fila-hija])`). (3) En OSCURO `--accent` era el mismo
  navy que el hover (1.14:1) y la barra de 3 px no llegaba a 3:1; ahora el
  tinte difiere del hover por MATIZ (rojizo vs azul) y la marca mide ≥ 3:1
  contra la card, contra el fondo activo y contra la vecina con hover —lo
  CALCULA `filas-activas-cableado.test.ts` con los tokens finales del CSS
  (WCAG 1.4.11); la activa con el mouse encima queda en ~2.9:1, aceptado: el
  hover ya dice dónde está el puntero—. Razón de la regla sin capa:
  `hover:bg-muted/50` (TableRow) y `hover:bg-muted/40` (filas con href)
  compilan a `.x:hover` con especificidad (0,2,0) y le ganan a cualquier
  utilidad (0,1,0) al pasar el mouse, y los fondos de `rowClassName` viven en
  @layer utilities; una regla sin capa gana a todo lo que está en capas.
  **Nunca `data-state="selected"`** (su `bg-muted` del primitivo es el tono
  del hover) ni clases Tailwind para la activa. `tr:focus-visible {
  outline-offset: -2px }` sigue.
- **Cómo se suma una tabla de resumen**: `const f = useFilasActivas(claves)`
  (claves = las filas PINTADAS en orden) → `<TableBody {...f.propsCuerpo}>` +
  `<FilaNavegable filas={f} clave={clave} href={href?} className=… data-…>`
  en cada fila navegable (sustituye al `<TableRow>`; las demás props pasan
  tal cual); un renglón pegado no navegable sigue siendo un `<TableRow>` con
  `data-fila-hija=""` JUSTO DESPUÉS de su fila (el detalle de la entrega del
  socio); nunca en thead/tfoot ni en la fila «Sin resultados»; el
  href de `propsFila` y el del `<Link>` salen de UNA función (`hrefVuelo` en
  el desglose: Enter abre ese MISMO enlace). Un panel plegado que conserva el
  contenido en el DOM lleva `inert` cerrado (`desglose-section.tsx`: sin él,
  sus enlaces y las filas con tabindex eran paradas de Tab invisibles,
  defecto previo). `ui/table.tsx` no cambió: el hook localiza el marco por
  `data-slot="table-container"` y la cabecera por `table.tHead`.
- **Pruebas**: `lib/admin/__tests__/desplazamiento-visible.test.ts`,
  `filas-activas.test.ts` (teclas, índice, entrada, atributos con
  `aria-current`, el veto solo `[aria-haspopup]`, el estado y la
  instantánea: al mover la activa de la fila 7 a la 8 solo cambian dos
  números de cien), `filas-activas-cableado.test.ts` (regex sobre DataTable,
  el hook —sin useEffect/useRef/setActiva, la hija resuelta a su fila—,
  `FilaNavegable`, las dos tablas de resumen, el CSS fuera de capas, como
  capa y sin hex, los tokens en los tres temas, el CONTRASTE calculado con
  los tokens finales, `ui/table.tsx` y `direccionDeTecla` intactos,
  `ejeParaVer` delegando), `hooks/__tests__/use-filas-activas.test.tsx`
  (arnés con `renderToStaticMarkup` y `FilaNavegable`: reposo, con activa
  `inicial` —opción SOLO para pruebas—, activa no pintada),
  `components/admin/__tests__/data-table-filas-activas.test.tsx` (con/sin
  rowHref, subRows, vacía, dos tablas) y
  `profit-sharing/__tests__/filas-activas-resumen.test.tsx` (incluida la hija
  pegada a su fila). Las existentes siguen sin tocarse (`busqueda-cableado`,
  `items-table-orden`, `aircraft-table`, `lote`, `cuentas-socios`,
  `quote-navegacion`, `libro-excel`).
- **Revisión del 13-oct-2026 (mismo día), lo que se corrigió**: (1) la
  tabla entera se repintaba con cada ↓/clic/foco ⇒ estado fuera de React +
  `FilaNavegable` suscrita por fila; (2) `aria-selected` inerte en Chrome ⇒
  `aria-current`; (3) en oscuro el resaltado era el tono del hover y la
  barra < 3:1 ⇒ tokens propios, tinte por matiz y marca de contorno ≥ 3:1,
  verificada en prueba; (4) el fondo de `rowClassName` desaparecía bajo la
  activa ⇒ tinte como capa (`background-image`); (5) el detalle de la
  entrega del socio (`data-fila-hija`) no activaba su movimiento desde
  «Editar»/«Eliminar» ⇒ la hija resuelve a la fila anterior; (6) un
  `aria-expanded` suelto («Ver los pagos de la compra») vetaba las flechas ⇒
  el veto es solo `[aria-haspopup]`.
- **QA manual pendiente** (sin DOM en el runner): Chrome Windows (el de la
  oficina) en `/admin/expenses` (↓ en el ⋯ abre el menú y no mueve filas; Esc
  dentro de un diálogo abierto desde una fila NO suelta la activa),
  `/admin/conciliacion` (cada tabla con su activa), `/admin/flights` (↓ en una
  tabla alta no deja la fila bajo el thead sticky; Enter abre el vuelo y pasa
  por el guard de cambios sin guardar donde aplique) y el desglose del
  reparto (Tab no entra al panel plegado; Enter en un vuelo abre el folio);
  en `/admin/expenses` pulsar «▸ Ver los pagos de la compra» y enseguida ↓
  (baja a la siguiente fila) y, con 100 filas por página, mantener ↓ pulsada
  (fluido: solo se repintan dos filas); en el estado de cuenta del socio,
  Tab hasta «Editar» de una entrega (esa entrega queda activa, ↓ pasa a la
  siguiente, Esc suelta; al cerrar el diálogo el foco vuelve a «Editar» con
  esa misma entrega activa); VoiceOver + Safari y NVDA + Chrome (al enfocar
  una fila se lee su contenido y «actual»); en oscuro, la fila activa se
  distingue de la vecina con hover por el tinte rojizo y el contorno rojo
  (barra 4 px + 1 px alrededor), y el sky/ámbar/brand de `rowClassName`
  sigue viéndose debajo; el `outline` del foco de la fila en
  Chrome/Firefox/Safari. Un tab stop nuevo por tabla y activación al
  enfocar: tabular por la página deja resaltada la fila de entrada de cada
  tabla que se cruza (Esc la suelta); si molesta, se cambia en
  `filaDeEntrada` sin tocar consumidores.

## Conciliación: concepto del SPEI, completar al re-subir y «Factura NNNN» (13-oct-2026, API 0.0.75)

Caso real (VIP SAESA): los SPEI de septiembre entraron con la leyenda del
banco sola («SEL TRANSF. INTERBANCARIA SPEI»): la IA no juntó los renglones
de abajo (banco, beneficiario y el CONCEPTO que tecleó quien pagó, «fact vip
7360»), así que nadie podía decir qué factura pagó cada cargo. pyservices
ahora lee esos renglones, el API completa el concepto de las filas YA
importadas al re-subir el PDF (sin duplicar nada) y lee el número de factura
de cada concepto (invariante «CONCEPTO DEL SPEI…» del API; el número de la
invariante lo fija el carril del API). SIN migración.

- **El número lo lee SOLO el API** (`factura-concepto.util.ts`): el panel
  NO parsea, rotula lo que llega en `factura_concepto` (ADITIVO). Fuentes
  únicas: `lib/admin/conciliacion-factura-concepto.ts` (chip, cuadro de
  candidatos, renglón ★, búsqueda) y `lib/admin/conciliacion-importacion.ts`
  (vista previa, botones, detalle del job, `movimientosParaImportar`, textos
  fijos); `resumenImportJob` (`conciliacion-auto.ts`) suma las ramas nuevas.
  Ningún componente redacta estas frases.
- **Chip «Factura 7360»** (`components/admin/conciliacion/factura-concepto-chip.tsx`,
  sin hooks) bajo la descripción de `movimientos-table.tsx`: gris = lo que
  dice el banco (en un cargo pendiente el tooltip avisa que los gastos con
  esa factura salen con ★); verde «· coincide» = el gasto ligado tiene esa
  factura; ámbar «· el gasto dice 7361» / «· falta 7360» = posible gasto
  equivocado (con montos iguales puede ser el de otro vuelo); gris
  SIN_FOLIO con cómo capturarla. «Prefactura» cuando el tipo lo es (en
  Corner la prefactura es el folio de la factura). Es un `<a target="_blank"
  rel="noopener noreferrer">` con `cursor-pointer` y nombre accesible: abre
  Conciliación ±7 días (de la fila y sus repetidas) buscando el número en
  `?mvq=` (`hrefConciliacion({…, buscar})`; la tabla lee la búsqueda AL
  MONTAR, por eso pestaña nueva). 2.º chip ámbar «también en otro pago» /
  «también en N pagos más» con fecha · monto · cuenta de cada una: un pago en
  partes está bien, si no es un posible pago doble. `repetida_en` null = NO
  verificado (no se pinta nada, jamás «no se repite»).
- **Celda «Descripción»**: dos renglones (`line-clamp-2`, sin `truncate`: el
  concepto va AL FINAL del texto) con el texto completo en el `title`; la
  búsqueda rápida suma `textoBusquedaFacturaConcepto` («factura 7360»
  encuentra la fila aunque el banco diga «fact»).
- **«Vincular gasto»** (`vincular-gasto-dialog.tsx`): con
  `factura_concepto` en la respuesta, un cuadro `data-factura-concepto`
  arriba de la lista (`avisoFacturaEnCandidatos`): «El banco dice: Factura
  7360 (VIP)», «★ 1 gasto tiene esa factura…» en verde, los gastos con esa
  factura que NO salen aquí (`otros_gastos`, misma forma que `excluidos`:
  se pintan con el MISMO `VacioCandidatos` + `textoExcluidosCandidatos`, que
  dice con qué cargo ya está conciliado) y, si nadie la tiene capturada,
  cómo capturarla. Cada candidato con `coincide_factura` lleva «★ » y el
  renglón «★ Su folio coincide con el concepto del banco (Factura 7360)»
  (tooltip: es una señal, no una prueba). Es SEÑAL dentro de su nivel de
  monto: el ORDEN lo da el API (nunca brinca sobre uno que cuadra), NUNCA
  marca ni preselecciona (no toca `setMarcados` ni
  `marcadosTrasSugerencia`) y el auto-cruce no la usa.
- **Importar un periodo ya importado** (`import-dialog.tsx` +
  `import-dialog-partes.tsx`, piezas sin hooks): con cuenta y archivo leído
  el diálogo pide `vistaPreviaImportAction` (`POST importar/vista-previa`,
  solo cuenta + movimientos, sin el archivo; turno + `.catch`, clave =
  cuenta|archivo|total|lectura) y pinta «Antes de importar: 98 líneas» ARRIBA
  de la tabla: cuántas ya estaban, a cuántas se les agregará el concepto,
  cuántas no (gemelos del mismo día y monto, cargos ligados a efectivo) y
  las nuevas, con «misma fecha y monto» marcado. Botones según el caso
  (`botonesImportacion`, el principal al final): sin vista previa o nada ya
  importado ⇒ «Importar y conciliar»; todo ya estaba ⇒ «Completar
  conceptos»; nuevas y ya estaban ⇒ «Solo completar conceptos (no agrega
  las N nuevas)» como principal si TODAS las nuevas son de misma fecha y
  monto (relecturas), si no «Importar y conciliar». **Mientras corre la
  vista previa NO se puede importar** (revisión del lote 2, 14-oct-2026: el
  botón de siempre ya estaba activo y un clic rápido metía las relecturas
  como movimientos nuevos): los botones van `disabled` con `revisandoVista`
  y el principal dice `TEXTO_BOTON_REVISANDO` («Revisando…»). Si la vista
  previa FALLA por algo que no es un API previo (500, red, el 400 de
  «impórtalo por partes») se dice en ámbar (`avisoVistaPreviaFallida` ⇒
  `MSG_VISTA_PREVIA_FALLO`, `data-aviso="vista-previa-fallida"`); con
  `RUTA_NO_DISPONIBLE`, como siempre, nada.
- **`solo_enriquecer`** (`importarMovimientosAsyncAction`, viaja SOLO en
  true): el API completa conceptos y NO inserta, no cruza ni empareja
  reversos; lo que no encuentre lo lista sin agregarlo. Un API previo
  responde 400 «property solo_enriquecer should not exist» ⇒
  `API_SIN_ENRIQUECER` con `MSG_API_SIN_ENRIQUECER`.
- **El diálogo se queda abierto** (`debeQuedarseAbierto`: LISTO con filas
  sin concepto, no encontradas o nuevas de misma fecha y monto): sin
  cerrar, `router.refresh()` + `toast.info`, el bloque del job pinta
  `DetallesImportacion` (gemelos con qué facturas dice el archivo y cómo
  resolverlo —Folio o «fact NNNN»—, vínculos, CAS/errores, no encontrados y
  «Ojo: nuevos con la misma fecha y monto…») y el pie queda solo con
  «Cerrar». El aviso de re-cruce es `TEXTO_SUGERIR_RECRUCE` (re-importar no
  duplica ni reintenta el cruce: solo completa conceptos) y la descripción
  suma `DESCRIPCION_IMPORT_REPETIDO` (desde la revisión del lote 2 ya no
  promete «no se duplica nada» a secas: «lo que el sistema reconoce no se
  duplica… Una línea que la IA leyó distinto puede entrar como nueva: la
  revisión de antes de importar te lo avisa.»).
- **Advertencias de la lectura** (`ParsedStatement.advertencias`, ya
  llegaban y se perdían): recuadro ámbar «Revisa antes de importar:» (hasta
  10) bajo el archivo, p. ej. «N transferencia(s)… se leyeron SIN su
  concepto». La tabla de la vista previa pinta la descripción PRIMERO y la
  referencia después, con el texto completo en el `title`.
- **Folio en transferencias** (`lib/admin/gasto-folio.ts`, `hintFolioGasto`
  en «Folio / remisión del ticket» de alta y Verificar): con TRANSFERENCIA
  el hint pide el número de la factura que se paga. Una factura ↔ un gasto ⇒
  «Folio»; una factura ↔ varios gastos ⇒ «fact NNNN» en la PRIMERA línea de
  las notas de cada uno (`uq_gasto_folio_ticket_norm` es único desde 4
  caracteres: el 2.º gasto con el mismo folio rebota). Ni el schema ni el
  payload cambian.
- **API previo** (≤ 0.0.74): sin `factura_concepto` no hay chip ni cuadro
  ni ★; la vista previa responde 404 «Cannot POST» ⇒ `RUTA_NO_DISPONIBLE`
  (no se pinta el cuadro y quedan los botones de siempre); sin las llaves
  nuevas `resumenImportJob` es BYTE-IDÉNTICO (golden en
  `conciliacion-auto.test.ts`).
- **Pruebas**: `lib/admin/__tests__/conciliacion-factura-concepto.test.ts`,
  `conciliacion-importacion.test.ts`, `gasto-folio.test.ts`,
  `conciliacion-auto.test.ts` y `conciliacion-vista.test.ts` (ampliadas),
  `app/admin/conciliacion/__tests__/vista-previa-action.test.ts`,
  `components/admin/conciliacion/__tests__/factura-concepto.test.tsx` y
  `import-vista-previa.test.tsx`; `excluidos.test.tsx` ahora admite el 3.er
  uso de `textoExcluidosCandidatos` (el de `otros_gastos`).
- **Orden de deploy**: API 0.0.75 → pyservices → **panel** (siempre después
  del API). En otro orden nada se rompe ni se cuenta dos veces: con el panel
  antes, la vista previa no aparece y «Solo completar conceptos» nunca se
  ofrece.

## Conciliación: compras en dólares contra el T.C. oficial del día (lote 2 del 13-oct-2026, API 0.0.75)

Caso real (Aircraft Spruce): el auto-cruce ligaba un gasto en USD a un cargo
en MXN solo porque el cociente caía en la banda 15–25 y el candidato era
único. El tubo Michelin (422.86 USD) quedó ligado a «ASA CANCUN» $8,939.38
de COMBUSTIBLE (T.C. 21.14 contra un oficial de 17.01, +24.3 %) y las bujías
(794.61 USD) a «ASA CANCUN I\CARR CANC» $14,197.17 (+2.3 %), mientras sus
cargos reales «AIRCRAFT SPRUCE AND SP» seguían pendientes. La corrección de
datos YA se aplicó en prod (13-oct-2026, 21:40 Cancún; hoy las 6 ligas
cruzadas quedan entre −0.4 % y +1.5 %). Este lote impide que vuelva a pasar
y hace visible lo sospechoso. SIN migración.

- **La regla es del API** (invariante «GASTO EN DÓLARES ↔ CARGO EN PESOS…»;
  el número lo fija el carril del API): `auto-cruce.util.ts` compara el T.C.
  implícito con el T.C. OFICIAL del día del cargo (±2 %, respaldo de 7 días)
  y el auto-cruce solo liga con oficial, a ±2 %, con la leyenda del banco que
  COINCIDE con el gasto y sin otro cargo que cuadre igual (recíproco). El
  panel solo PINTA: texto y tooltip del T.C. llegan ya redactados en
  `tc_cruce`; el `tc_gasto` lo sigue derivando solo la BD. Nada se corrige
  solo.
- **Contrato ADITIVO**: raíz `tc_oficial` de `gastos-candidatos` (SIEMPRE
  presente desde 0.0.75, aunque sea null: es la CAPACIDAD, pegajosa en el
  diálogo como `apiOfreceNoBancarios`), `tc_cruce` en cada candidato cruzado
  y en cada fila CARGO con exactamente una parte cruzada, `motivo_detalle` en
  los cargos pendientes (lo lee `motivoPendienteDe`: reemplaza el texto
  genérico en AMBIGUO / SE_PUEDE_CRUZAR, se agrega en SIN_CANDIDATOS, se
  ignora en ERROR) y el item del pre-cierre `gastos_usd_tc_fuera_de_lugar`
  (`ligas[]`, `sin_verificar`, `lectura_fallida`; NO bloquea). Tipos
  `TcCruceUsd` (copia 1:1 del API), `TcOficialDelDia` y `LigaUsdTcPreCierre`
  en `types/conciliacion.ts`.
- **Fuentes únicas**: `lib/admin/conciliacion-tc.ts` (`apiCruzaConOficial`,
  `lineaTcCandidato`, `marcaLigaCruzada`, `avisoVincularCruzado`,
  `sufijoMonedaLigada`, placeholder, nota y botón) y
  `lib/admin/pre-cierre-tc-usd.ts` (`lineasLigasUsdTc`,
  `hrefLigasUsdTcPeriodo`, clave copiada del API). `NOTA_VENTANA_CARGO(dias,
  incluyeNoBancarios, cruzaUsd)` agrega `NOTA_COMPRAS_USD` (sin el 3.er
  argumento, byte a byte la de antes) y `descripcionCandidatoGasto` /
  `tituloDescripcionCandidatoGasto` aceptan `{sinTc}` (la pieza del T.C. es
  `tc_cruce.texto` o, con un API previo, el «T.C. 17.06» crudo).
- **«Vincular gasto»** (`vincular-gasto-dialog.tsx`): con la capacidad y en
  una cuenta en pesos (`cruzaUsd`), placeholder «Busca por monto en pesos o
  en dólares (2801.40), proveedor o nota» y la nota de las compras en
  dólares. Un candidato cruzado lleva una 3.ª línea SIN recortar con
  «T.C. 17.06 · oficial 17.01 (+0.3 %)» y su tooltip exacto (ámbar si queda
  LEJOS o fuera de banda); la 2.ª va sin el T.C. Marcar EXACTAMENTE UN
  cruzado LEJOS pinta un aviso ámbar (`role="status"`) y el botón dice
  «Vincular de todos modos»: NO bloquea, liga como siempre (una compra
  legítima con sobreprecio del banco > 2 % existe). El ORDEN es el del API
  (7 niveles: los que cuadran con el oficial salen antes del corte de 100);
  la lista de respaldo (API previo) no cambia. **Lectura FALLIDA del oficial
  ≠ «sin dato»** (revisión del lote 2, 14-oct-2026; ADITIVOS del API: raíz
  `tc_oficial_lectura_fallida` y `tc_cruce.lectura_fallida`): antes el tubo
  del caso Aircraft Spruce salía en gris como «sin T.C. oficial del día»,
  sin aviso. Hoy la 3.ª línea va en ámbar («T.C. 21.14 · no se pudo leer el
  T.C. oficial del día»), marcar UNO pinta `AVISO_VINCULAR_SIN_LECTURA` con
  «Vincular de todos modos», el diálogo dice `AVISO_TC_SIN_LECTURA`
  (`avisoTcSinLectura`, `data-aviso="tc-sin-lectura"`) y el placeholder pasa
  a `PLACEHOLDER_BUSCAR_GASTO_SIN_TC` (no promete la búsqueda en pesos).
- **Bandeja** (`movimientos-table.tsx`): el gasto 1↔1 dice su moneda
  («Refacción · $422.86 USD») y, con `tc_cruce`, la marca bajo el
  proveedor/fecha: tenue si cuadra, «⚠ T.C. 21.14 · oficial 17.01 (+24.3 %):
  lejos del oficial» ámbar si quedó fuera de lugar (tooltip: el pre-cierre
  lista estas ligas y el sistema no corrige nada). Una fila en pesos queda
  byte a byte como antes (golden en `tc-cruce.test.tsx`).
- **Pre-cierre** (`reportes/pre-cierre-card.tsx`): «Resolver →» va a
  Conciliación, pestaña conciliados, del periodo; un renglón por liga con el
  texto del API (tooltip = el T.C. exacto) y DOS enlaces con `cursor-pointer`:
  «Ver el cargo» (conciliados, su cuenta y su día) y «Ver el vuelo #N» /
  «Ver el gasto»; «y N más…» contra `count`. La visibilidad sigue en
  `itemPreCierreVisible` (count 0 ⇒ oculto; lectura fallida ⇒ «sin
  verificar»).
- **Pruebas**: `lib/admin/__tests__/conciliacion-tc.test.ts`,
  `pre-cierre-tc-usd.test.ts` (fixtures reales en `tc-cruce.fixtures.ts`, que
  no es un archivo de pruebas), `conciliacion-auto.test.ts` (T.C. en la línea
  y `motivo_detalle`), `components/admin/conciliacion/__tests__/tc-cruce.test.tsx`
  y `components/admin/reportes/__tests__/pre-cierre-ligas-usd-tc.test.tsx`;
  `folio.test.tsx` y `no-bancario.test.tsx` siguen las nuevas firmas
  (`opts`, `cruzaUsd`).
- **Orden de deploy**: API 0.0.75 → panel; seguro en los dos sentidos (un
  panel nuevo con el API previo no pinta nada nuevo; un panel viejo ignora
  los campos y pinta el item del pre-cierre con el renderer genérico).

## Gastos: «conciliación al revés» desde el badge «Banco» (13-oct-2026, API 0.0.75)

Pedido de la oficina: desde el GASTO, ver con qué cargo del banco se
concilió, de qué cuenta y de qué estado de cuenta (para descargarlo), y si no
se concilió, por qué y dónde buscarlo; el Excel de gastos con el detalle del
banco y sin el corte de 1,000 filas. El API lo arma en `GET
/v1/conciliacion/gastos/:id` (lector único de la puente; invariante
«CONCILIACIÓN AL REVÉS DE UN GASTO» del API, el número lo fija su carril).
SIN migración.

- **Fuentes únicas**: `lib/admin/gasto-banco.ts` (roles, TODOS los textos,
  fichas de cada cargo, «¿Qué hacer?», cobertura importada, errores, URLs y
  el título del Excel), `lib/admin/conciliacion-estado.ts`
  (`GastoParaBanco`, `abreDetalleBanco`, `tituloBancoConClic`) y la ruta del
  API (`conciliacionDeGasto` en `lib/api/conciliacion-server.ts` +
  `conciliacionDeGastoAction`: uuid antes de la red ⇒ `GASTO_INVALIDO`; 404
  «Cannot GET» ⇒ `RUTA_NO_DISPONIBLE`; nunca lanza). Tipos 1:1 en
  `types/conciliacion.ts` (`ConciliacionDeGasto`, `CargoDeGasto`…).
- **La regla**: el panel JAMÁS suma ni recalcula. Estado, suma y faltante
  (la vista `v_gasto_conciliacion`), lo que aporta cada cargo
  (`monto_parte`), la diferencia del lote y el T.C. (el GUARDADO en el
  gasto) vienen del API. Un cruzado (USD pagado en pesos) tiene `suma` 0 por
  definición: la hoja jamás dice «suman $0.00». Nunca viajan ni se pintan el
  número de cuenta, la CLABE ni el `storage_path`.
- **Espejo de PARCIAL** (`estadoBancoGasto`): algo ligado (`monto_vinculado`
  > 0) y sin conciliar ⇒ «Parcial», EXACTO como el API (antes un desfasado
  caía en «Sin conciliar» mientras el Excel decía «Parcial»; la hoja lo
  explica con la alerta ESTADO_DESFASADO). Un efectivo ligado a medias pasa
  de «—» a «Parcial».
- **Roles**: ADMIN y FACTURACION (`ROLES_DETALLE_BANCO_GASTO`, espejo de
  `ROLES_CONCILIACION` del API y del menú «Conciliación»). Sin rol conocido
  (`/me` falló) se ofrece: el API es el candado y su 403 tiene texto. Para
  COORDINADOR, ANALISTA y SOCIO el badge queda exactamente como antes.
- **El badge** (`BancoBadge` con `alAbrir`): Conciliado / Parcial / Sin
  conciliar se pintan como `<button>` (Base UI `render`) con el mismo color,
  `cursor-pointer`, `title` «… Clic para …», `aria-haspopup="dialog"` (↑/↓
  con el foco ahí no mueven la fila activa) y un nombre accesible que EMPIEZA
  con el texto visible. «—» nunca es botón. La columna lleva `noLink`.
- **La hoja** (`components/admin/expenses/gasto-banco-sheet.tsx`, UNA por
  tabla): `useDetalleBancoGasto` pide con TURNO y `.catch` (jamás un `await`
  desnudo en una transición: un «Failed to find Server Action» tras un deploy
  mandaba la pantalla al boundary); cerrar no vacía el texto durante la
  animación; el cuerpo (`gasto-banco-detalle.tsx`, PRESENTACIONAL, se prueba
  con `renderToStaticMarkup`) se carga con `next/dynamic` sin SSR al primer
  clic. Muestra: el gasto y con qué se pagó; la frase del estado (9 ramas) y
  las alertas; una tarjeta por cargo (fecha y monto, cuenta y si es
  pasarela, leyenda y referencia, lo que aporta, el T.C. guardado de un
  cruzado, la justificación de un efectivo, el lote COMPLETO con «(este
  gasto)» sin enlace y la diferencia de centavos, el estado de cuenta con
  «Descargar» o el motivo REAL de que no haya archivo, quién registró la liga
  y «Ver en Conciliación»). Con SIN_CONCILIAR / PARCIAL (o conciliado sin
  cargos) agrega «¿Qué hacer?»: causas, hasta qué día hay estado de cuenta
  importado por cuenta (PAYWISE ⇒ solo PASARELA), «Buscar el cargo en
  Conciliación» (pendientes ±30 días con el monto en `?mvq=`; en PARCIAL el
  faltante y la cuenta de sus cargos; en USD sin monto) y «Ver los cargos ya
  conciliados de esas fechas» (±7 días: si sale ligado a OTRO gasto, es un
  posible duplicado). Todas las ligas en pestaña nueva con `cursor-pointer`.
- **«Registró la liga»** solo para partes creadas desde el 2-oct-2026 00:00
  Cancún (las anteriores son del backfill, que copió el `updated_by` del
  cargo): «Liga anterior al 2 oct 2026: el sistema todavía no guardaba quién
  la hizo.» En ESPEJO (sin la migración de partes) no se dice nada.
- **«Sin archivo»** por `origen` y día Cancún: los 124 movimientos sin
  archivo de prod son IMPORTADOS del 16-jul-2026 (en UTC dicen 17) ⇒ «Sin
  archivo guardado: este cargo se importó el 16 jul 2026 por Jimmy Chi…»;
  jamás «capturado a mano» salvo con origen MANUAL.
- **Descarga** del estado de cuenta: `estadoCuentaUrlAction` (POST
  `estados-cuenta/:id/url`, enlace de 1 h firmado al clic) con
  `abrirArchivoFirmado`: la pestaña se abre en el MISMO clic (Safari no la
  bloquea); si el navegador no la abrió, toast con «Descargar».
- **Conciliación con el cargo enfocado** (`?mov=` y `?gasto=`, mismo nombre
  y significado que `?gasto=` del balance): «Ver en Conciliación» acota
  cuenta + día del cargo; la página pone esa fila PRIMERO (`filasConFoco`,
  solo en Todos / Pendientes / Conciliados), `MovimientosTable` le pone el
  anillo ámbar de «Por facturar» (`CLASE_FILA_ENFOCADA` por `rowClassName`)
  y la trae a la vista; en un lote la línea de ese gasto se resalta con «·
  el que abriste» aunque fuera la 4.ª (`resumenLoteFila(m, {destacar})`). Una
  franja dice «Primero en la lista y resaltado…» con «Quitar resaltado»; si
  no está en la vista, «No encontramos en esta vista el cargo…» con «Ver
  todos los movimientos» (jamás se inventa la fila). SIN `mvq` (la búsqueda
  es difusa y la tabla solo la lee al montar). DataTable NO se toca.
- **Compras** (`compra-pagos-card.tsx`): el MISMO `BancoBadge` (adiós a «✓
  Conciliado»); el clic con `rolUsuario` (la página pasa `getMe()` que puede
  fallar), y como Compras es de ADMIN y COORDINADOR solo ADMIN lo tiene. El
  API de compras no manda lo ligado: un pago parcial se ve «Sin conciliar» y
  la hoja dice la verdad (`estadoCambio` solo compara «cubierto» sin los
  aditivos: no avisa en falso). Un pago en efectivo pasa a «—».
- **Excel de gastos**: el API lo pagina (ya no se corta en 1,000) y a ADMIN /
  FACTURACION les agrega «Factura», «Cargo del banco», «Estado de cuenta» y
  la pestaña «Cargos del banco»; el botón lleva `title` =
  `tituloExcelGastos(rol)` (solo a quien lo recibe; los demás, el marcado de
  siempre).
- **API previo**: la hoja dice «El servidor todavía no tiene este detalle
  (falta actualizar el API). Mientras, búscalo en Conciliación.» con el
  enlace de búsqueda; `?mov=`/`?gasto=` ya funcionan (son solo del panel).
- **Mecánica COMPARTIDA con la hoja de una entrada de dinero** (API 0.0.78;
  ver «Ingresos: «Conciliado» abre su conciliación con el banco»):
  `useDetalleBancoGasto` es el hook GENÉRICO
  `components/admin/banco/use-detalle-banco.ts` con el gasto; lo que no
  depende de la entidad (roles con `puedeVerDetalleBanco`, textos fijos, la
  descarga, `archivoDeMovimiento`, `montoParaBusquedaTabla`) se MUDÓ a
  `lib/admin/hoja-banco.ts` y `gasto-banco.ts` lo re-exporta con el mismo
  nombre (`ROLES_DETALLE_BANCO_GASTO` y `puedeVerDetalleBancoGasto` son
  alias); el marcado común (`EnlaceNuevaPestana`, `ArchivoEstadoCuenta`)
  vive en `components/admin/banco/partes-hoja.tsx`. La hoja de Gastos sale
  igual (`gasto-banco-sheet.test.tsx`; `banco-cableado.test.ts` apunta al
  hook genérico). Conciliación ganó `?cobro=` junto a `?mov=` y `?gasto=`.
- **Pruebas**: `lib/admin/__tests__/gasto-banco.test.ts` (fixtures reales en
  `gasto-banco.fixtures.ts`), `conciliacion-vista.test.ts` y
  `conciliacion-lote.test.ts` (ampliadas),
  `components/admin/expenses/__tests__/banco-badge.test.tsx` (ampliada),
  `gasto-banco-sheet.test.tsx`, `banco-cableado.test.ts`,
  `components/admin/conciliacion/__tests__/enfoque.test.tsx` y
  `app/admin/conciliacion/__tests__/conciliacion-gasto-action.test.ts`.
- **Orden de deploy**: API 0.0.75 → panel (seguro en los dos sentidos: con el
  panel antes, la hoja degrada con su aviso; con el API antes, solo cambian
  el Excel de ADMIN/FACTURACION y el aditivo de los no bancarios).

## Conciliación: corregir la fecha del gasto desde «Vincular gasto» (14-oct-2026, API 0.0.76)

Pedido de la oficina en `/admin/conciliacion?f=pendientes`: «poder editar
desde esa pantalla la fecha del gasto, solo para ajustar bien». Decisión del
13-oct-2026: **la fecha del gasto es la FECHA DEL PAGO** (la del cargo / el
SPEI), no la de la factura; el cruce automático sigue a ±3 días
(`MATCH_DAYS` del API) y no se amplía.

- **Fuente única**: `lib/admin/conciliacion-fecha-gasto.ts` (PURO, con
  prueba `lib/admin/__tests__/conciliacion-fecha-gasto.test.ts`): quién
  ofrece «Fecha», validación, avisos, el mapa de fechas corregidas, cómo se
  lee cada respuesta del API y TODOS los textos. Server action
  `corregirFechaGastoAction` (`app/admin/conciliacion/actions.ts`) y diálogo
  anidado `components/admin/conciliacion/corregir-fecha-gasto-dialog.tsx`
  (`next/dynamic` sin SSR, montado SOLO al abrirse con `key` = id del gasto,
  DENTRO del árbol de «Vincular gasto»). Ruta del API: `PATCH
  /v1/expenses/:id/fecha` (invariante 74 del API).
- **Reglas**: solo gastos BANCARIOS (tarjeta, transferencia, PayWise, pago
  domiciliado; sin `medio_pago` ⇒ no se ofrece: falla cerrado) — en
  efectivo la fecha decide qué reposición de caja chica lo cubre y se
  corrige en Gastos. El campo nace con la fecha del CARGO
  (`fechaInicialCorregirFecha`), salvo una TARJETA a 3 días o menos del
  cargo (`esDesfaseTarjetaTolerado`), que nace con la del TICKET y ofrece el
  atajo «Usar la fecha del cargo»; su descripción tampoco dice «(la del
  cargo del banco)» (revisión del 14-oct-2026, caso Winjet: el camino por
  default hacía lo que la nota de tarjeta pide no hacer; ticket o banco
  sigue siendo decisión del cliente). La MISMA fecha que ya tiene se dice
  en gris (no es error) y «Guardar fecha» queda apagado. Nunca futura ni de
  hace más de 365 días (el mismo borde del API, cuenta a mediodía UTC). El
  API bloquea sacar un gasto con vuelo del mes de su vuelo (409
  `FECHA_GASTO_FUERA_DEL_MES_DEL_VUELO`, caja roja); desde el 0.0.76 la
  ficha del candidato trae ese candado (`candado_mes_vuelo { vuelo_dia,
  vuelo_folio }`, solo cuando aplica) y el diálogo lo dice ANTES de guardar
  con el MISMO texto del API (`bloqueoMesDelVuelo` dentro de
  `bloqueoNuevaFechaGasto`; el panel no decide qué categorías lo tienen:
  sin la llave, decide el API). Pide confirmación con SU texto cuando la
  fecha mueve dinero de mes o cambia un mes que ya terminó (409
  `FECHA_GASTO_CONFIRMAR` ⇒ caja ámbar y «Sí, pasarlo a octubre 2026» / «Sí,
  cambiar la fecha», que reenvía con `confirmar: true`). Un gasto que otra
  persona concilió mientras el diálogo seguía abierto ⇒ 409
  `FECHA_GASTO_YA_CONCILIADO`: sale de la lista como uno borrado
  (`no_existe`: se desmarca y se vuelve a pedir). **SIN auto-cruce**:
  guardar NO liga el gasto; liga la persona con «Vincular».
  `fecha_hora_carga` (combustible) la mueve el API al día nuevo y el toast
  lo dice SOLO con `fecha_hora_carga_movida: true` (la de la fila puede ya
  caer en el día nuevo sin tocarse). Avisos del diálogo (no bloquean): el
  cargo es mayor que el gasto (caso Winjet: $345.00 contra $321.54, «con la
  fecha no basta»), fecha de hace más de 60 días, cambio de mes, fuera de la
  ventana de la lista, pago parcial y, con tarjeta a 3 días o menos, «el
  cruce ya lo tolera». Bajo un renglón MARCADO a más de 3 días del cargo,
  «Si este cargo es su pago, corrígela con «Fecha»» — salvo que el candado
  del vuelo rechace la fecha del cargo (no se invita a algo que no se
  puede; caso vivo: TAXI del vuelo #109 del 31-jul contra el Tren Maya del
  10-ago); los motivos SIN_CANDIDATOS y FUERA_DE_VENTANA
  (`conciliacion-auto.ts`) también mandan a «Fecha».
- **Por qué no `verifyGastoAction`**: no valida el uuid, no devuelve
  code/status/details y su PATCH dispara el auto-cruce en segundo plano (con
  montos repetidos —VIP SAESA— podía ligar OTRO cargo sin que el panel se
  enterara). Y como ahora hay DOS escritores de la fecha, «Verificar /
  editar» manda `fecha_gasto` SOLO si se cambió en su formulario (como
  `estatus_facturacion`): mandar la que tenía al abrirse revertía en
  silencio la que corrigió Conciliación y disparaba el auto-cruce con la
  fecha vieja (vigilado en `components/admin/expenses/__tests__/verificar-fecha-ui.test.ts`).
- **Por qué el botón va FUERA del `<label>`**: un botón dentro de la etiqueta
  sería HTML inválido, ensuciaría el nombre accesible de la casilla y un clic
  podría marcarla. Como hermano no hereda `opacity-60` ni el `title` del veto
  de un renglón apagado (la fecha no tiene que ver con armar un lote). Dice
  «Fecha» también en el teléfono (revisión del 14-oct-2026: la ayuda y el
  aviso dicen «corrígela con «Fecha»» y en pantalla táctil no hay tooltip).
  Su `aria-label`/`title` dice CUÁL gasto (`etiquetaBotonFecha`: la etiqueta
  del renglón + vuelo + la nota recortada): con varios gastos del mismo día,
  la lista de botones de un lector de pantalla ya los distingue.
- **Por qué el mapa `fechasCorregidas` y no `setRecarga`**: volver a pedir
  la lista esconde los no marcados mientras carga y pierde el orden que el
  operador estaba viendo. El mapa (`FechasCorregidas`: id ⇒ `{ fecha,
  reemplaza }`, `registrarFechaCorregida`) corrige en sitio las filas que
  todavía pintan una fecha que ya NO es la vigente (los marcados y el
  sugerido de la IA se pintan con su copia guardada; una respuesta pudo
  venir en camino al guardar) y CEDE ante una lectura nueva del servidor
  con otra fecha (revisión del 14-oct-2026: antes le ganaba siempre y el
  diálogo mandaba como `fecha_anterior` una fecha que ya no existía ⇒ 409, o
  «Es la misma fecha» y «Guardar fecha» apagado). Un 409
  `FECHA_GASTO_CAMBIO` (también el de «Deshacer») anota la VIGENTE. La copia
  guardada de un MARCADO sigue sin refrescar el resto de sus datos
  (previo). Un 404 `GASTO_NO_EXISTE`, un 409 `FECHA_GASTO_YA_CONCILIADO` o un
  resultado INCIERTO vuelven a pedir la lista.
- **La página NO se repinta mientras «Vincular gasto» está abierto**
  (revisión del 14-oct-2026): en Next 16 cualquier `revalidatePath` dentro
  de una server action repinta la página abierta, y con el buscador de la
  tabla de movimientos filtrando por motivo («sin candidato», justo lo que
  los MOTIVOS mandan a corregir) el cargo pasaba a «Se puede cruzar», su
  fila salía del filtro y se desmontaba «Vincular gasto» con lo marcado, la
  búsqueda y la sugerencia de la IA. Por eso `corregirFechaGastoAction` YA
  NO revalida: `SelectorGastos` anota que algo cambió
  (`refrescarAlCerrarRef`) y al DESMONTARSE (se cerró el diálogo por
  cualquier camino) hace UN `router.refresh()` (motivo del cargo, «Gastos
  sin banco»). «Deshacer» con el diálogo ya cerrado refresca de una vez
  (`ponerAlDia`). Las demás pantallas son `force-dynamic` y se leen frescas
  al entrar.
- **Red o 5xx = no se sabe si se guardó** (`esResultadoIncierto`): el PATCH
  pudo llegar y escribir antes de perderse la respuesta (las mutaciones no
  se reintentan). El diálogo dice «No se pudo confirmar si la fecha se
  guardó…» (nunca «La fecha no se cambió», que queda solo para los 4xx) y la
  lista se vuelve a pedir para pintar la VIGENTE; «Deshacer» dice «No se pudo
  confirmar si se deshizo el cambio de fecha». Un 401 dice «Tu sesión
  expiró…» (`MSG_SESION_EXPIRADA`, el mismo de la búsqueda de gastos) y
  cualquier otro 404 o texto en inglés del API se traduce: ningún texto del
  AuthGuard llega al operador. «Load failed» (Safari) es técnico
  (`errores-tecnicos.ts`).
- **«Deshacer»** (toast de 10 s) reenvía la fecha anterior con
  `confirmar: true` por la MISMA action y lee la respuesta con
  `resultadoCorregirFecha` (como el diálogo); si el API lo bloquea (otro mes,
  alguien la cambió, ya se concilió) el toast «No se pudo deshacer el cambio
  de fecha» dice por qué. **API previo** (0.0.75): 404 «Cannot PATCH» ⇒ «El
  servidor todavía no corrige fechas desde Conciliación…»: no se escribe
  nada.
- **El chunk del diálogo anidado se PRECARGA** al abrir «Vincular gasto»
  (`precargarCorregirFecha`, en paralelo con los candidatos): sin eso el
  primer «Fecha» en una red lenta no pintaba nada y un Esc en ese lapso
  cerraba «Vincular gasto» (todavía no existía el diálogo de arriba).
- **«Gastos sin banco» cuando la carga falla** (mismo día): la página
  montaba `GastosSinBancoTable` con cero filas aunque la lectura hubiera
  fallado (`.catch(() => null)`) — una lista de dinero vacía que decía «no
  falta nada». Ahora las dos pestañas «sin banco» montan la tabla SOLO con la
  lectura buena y, si no, `AvisoListaSinBancoNoCargo`
  (`components/admin/conciliacion/lista-sin-banco-no-cargo.tsx`, texto en
  `conciliacion-vista.ts`) con «Reintentar» (`router.refresh()`).
- **Cableado vigilado** en `components/admin/conciliacion/__tests__/fecha-gasto.test.tsx`
  (botón fuera del `<label>` y con «Fecha» visible, `type="button"`,
  `aria-haspopup`, `cursor-pointer`, `dynamic` sin SSR y la precarga, el mapa
  en el `useMemo` de `filas`, «Deshacer» con `confirmar: true`,
  `.catch(sinConexion)` y `resultadoCorregirFecha`, el `router.refresh()` al
  desmontar y la action sin `revalidatePath`, formulario `noValidate`, la
  tarjeta que abre con la fecha del ticket, el candado del vuelo antes de
  guardar y ningún texto literal en el diálogo),
  `app/admin/conciliacion/__tests__/fecha-gasto-action.test.ts`,
  `app/admin/conciliacion/__tests__/sin-banco-carga.test.tsx` y
  `components/admin/expenses/__tests__/verificar-fecha-ui.test.ts`.
- **Orden de deploy**: API 0.0.76 → panel. Con el panel antes, «Fecha» abre
  el diálogo y guardar dice «falta actualizar el API» (nada escrito).

## Conciliación: omitir la conciliación y varios cargos → un gasto (14-oct-2026, API 0.0.77)

Pedido textual: «Necesitamos una opción de pendientes de conciliar venga una
opción de Omitir la conciliación.» y «Necesitamos poder seleccionar varias
filas de conciliaciones pendientes para todo eso ponerlas a un solo gasto…».
Invariantes 75 y 76 del API. Este bloque documenta la SELECCIÓN y «Omitir»
(pasos 3a/3b del despliegue), «Vincular a un gasto…» con varios cargos
(paso 3c) y «¿No está el gasto? Créalo por $X» (paso 4).

- **Qué es un omitido**: la clasificación canónica «Omitido de la
  conciliación» + la línea firmada al inicio de las notas, escritas SOLO por
  las RPC del API (todo o nada). El panel NO arma la línea ni decide estados
  ni riesgos: pinta la `omision {motivo, por, fecha}` que el API manda en
  CADA fila (`MovimientoBancario.omision`) y traduce las respuestas.
  **Skew**: el panel detecta el API nuevo por la PRESENCIA de la llave
  (`apiConOmision`); sin ella (API ≤ 0.0.76) no hay casillas, ni «Omitir…»,
  ni «Deshacer…», ni `esperado_clasificacion_id`, y la tabla sale byte a byte
  como antes (golden). Una ruta nueva que responde 404 «Cannot POST …» o un
  400 «property … should not exist» ⇒ `RUTA_NO_DISPONIBLE` con «Esta opción
  todavía no está activa: avisa a sistemas.»; el 503
  `CONCILIACION_OMITIR_NO_DISPONIBLE` (API nuevo sin la migración) dice lo
  mismo.
- **Fuentes únicas (PURAS, con prueba)**: `lib/admin/conciliacion-seleccion.ts`
  (predicado ÚNICO `esSeleccionable(m, 'lista'|'omitidos')` —pendiente y
  LIBRE / trae su omisión— que comparten la casilla, «Seleccionar los N…»,
  la poda y el ⋯; tope 200 = `OMITIR_MAX`; `seleccionVigente` derivada en
  render; resumen por tipo y moneda EN CENTAVOS —MXN primero, nunca suma
  monedas, «(moneda desconocida)» si no cargaron las cuentas—;
  `accionesDeSeleccion` con cada motivo; los textos) y
  `lib/admin/conciliacion-omision.ts` (la fila, el motivo 10–300, el diálogo,
  `mensajeErrorOmision` por código, la pestaña, las tarjetas y la validación
  de las server actions). `conciliacion-omision` importa de
  `conciliacion-seleccion`, nunca al revés. Paridad con el API (nombre
  canónico, topes, textos del DTO) cuando el repo hermano está al lado.
- **Tabla** (`movimientos-table.tsx`, prop ADITIVA `seleccion {vista,
  monedaPorCuenta}` y, desde el 15-oct, `monedaPorCuenta` PROPIA para todas
  las pestañas): columna `sel` PRIMERA (casilla NATIVA solo en filas
  seleccionables, `aria-label` único de `etiquetaCasillaMovimiento`; marcada,
  la CELDA se tiñe con su FONDO —`has-checked:bg-brand-50
  dark:has-checked:bg-brand-900/30` en el `cellClassName`, debajo de la marca
  de la fila activa—; la línea `rowClassName` no se toca); grupo «Selección
  de movimientos» arriba con «Seleccionar los N pendientes de la búsqueda /
  de la lista» (SUMA a lo marcado lo que deja la búsqueda en todas las
  páginas ∩ seleccionables; con todas ya marcadas se queda montado con
  `aria-disabled` y dice «Los N … ya están seleccionados») y «Quitar
  selección»; `alCambiarFiltradas` solo con la selección; rama «Omitido»
  (badge gris + motivo, tooltip «Omitido por … el …: …») ANTES de la de
  clasificación; `searchText` con «Omitido <motivo> <por>»; hueco al final
  del alto MEDIDO de la barra mientras se ve. Sin selección devuelve la
  `DataTable` TAL CUAL (sin envoltura: cambiaría los ids de `useId` del ⋯).
- **Barra** (`barra-seleccion-movimientos.tsx`): región «Movimientos
  seleccionados», fija abajo al centro (z-40, bajo los diálogos), ANTES de la
  tabla en el DOM; el conteo NO es región viva (la permanente vive en la
  tabla) y reporta su alto (`alMedir`). No decide: lee los helpers; ningún
  botón se apaga por regla de negocio (el motivo se ve y el clic lo repite en
  `toast.info`). Lista: «Vincular a un gasto…», «Omitir…» y «Limpiar»;
  Omitidos: «Deshacer la omisión…» y «Limpiar». Los diálogos los monta la
  TABLA con una copia CONGELADA de la selección.
- **«Vincular a un gasto…»** (paso 3c, invariante 76): con UN cargo la tabla
  abre el «Vincular gasto» de siempre (`vincular-gasto-dialog.tsx`, sin
  editarlo); con 2..50 cargos de UNA moneda (la barra ya lo exige con sus
  motivos), `vincular-cargos-gasto-dialog.tsx` (`next/dynamic` sin SSR,
  montado solo al abrirse). La SUMA, los candidatos, su orden y el resultado
  CUBRE/PARCIAL/EXCEDE de cada gasto los calcula el API
  (`gastosCandidatosDeCargosAction`, al abrir y con cada búsqueda a 300 ms,
  «Ampliar a ±120 días»): el encabezado pinta `cargos` DEL API (mientras no
  llega, solo el conteo: el panel no suma dinero que decide) y la guía
  verde/ámbar/roja NUNCA apaga el botón. Avisos ámbar: cargos con su PROPIO
  gasto (`cargos_con_candidato_propio` del API, caso Cozumel 62.91 × 2; con
  `null`, nota gris «No se pudo revisar…») y cuentas distintas. Se elige UN
  gasto (radio; nada viene marcado, ni el que «Queda cubierto»: los falsos
  positivos de sumas existen y elige la persona); el resumen visible («Se vincularán 2 cargos ($400.00) al
  gasto «…»…») y «Vincular los 2 cargos» SON la confirmación (sin AlertDialog
  extra, como «Mover a…»). La liga es UNA transacción del API
  (`ligarCargosAGastoAction`, todo o nada; un re-envío idéntico es
  `idempotente`). Éxito ⇒ toast con cómo quedó el gasto (`gasto_estado`),
  cerrar, limpiar la selección y UN `router.refresh()`. 4xx ⇒ caja roja con
  el texto del API + «No se vinculó ningún cargo.» y la lista se vuelve a
  pedir sin perder lo elegido; MOVIMIENTO_NO_PENDIENTE / MOVIMIENTO_NO_EXISTE
  / SOLO_CARGOS / MOVIMIENTO_OMITIDO ⇒ «Quitar esos N de la selección» (con
  uno solo, «Con un solo cargo usa «Vincular gasto»…») y refresh al cerrar;
  red o 5xx ⇒ «No se pudo confirmar si se vincularon…» + refresh; ruta
  inexistente o 503 de la migración ⇒ «Esta opción todavía no está activa…».
  La lectura que falla dice «No se pudo cargar la lista de gastos…» con
  «Reintentar» (jamás el vacío). Los gastos del monto de la suma que NO
  entraron (`excluidos`, que el API manda siempre) se pintan bajo el vacío o
  cuando ninguno de la lista queda cubierto, con
  `textoExcluidosCandidatos(…, { variosCargos: true })`: «de los cargos» y el
  efectivo se liga cargo por cargo (nunca «Mostrar estos gastos»). Textos y
  reglas PUROS en `lib/admin/conciliacion-cargos-gasto.ts`.
- **«¿No está el gasto? Créalo por $X»** (paso 4, invariante 76): enlace a la
  izquierda del pie, SOLO con `catalogosGasto` (la tabla se los pasa) y la
  SUMA DEL API (sin respuesta no se sabe por cuánto). Abre el paso previo
  «Crear el gasto con la suma» dentro del MISMO diálogo
  (`PasoCrearGastoSuma`): los cargos con la suma del API (ámbar
  `avisoCargosConCandidatoPropioCrear`: «quizá ya está capturado por
  separado»), «Posibles duplicados (mismo monto, ±120 días)» =
  `gastosCandidatosDeCargosAction(ids, {q: la suma, dias: 120})` →
  `estadoDuplicadosSuma` (los del MISMO monto con `duplicadosDeCandidatos`,
  la regla del «Créalo» de un cargo, y en ámbar los `excluidos`: efectivo, ya
  conciliados…); si la lectura falla —o viene SIN `excluidos`: no se
  revisaron el efectivo ni los conciliados— «No se pudieron revisar los
  posibles duplicados…» + «Reintentar» y la casilla queda BLOQUEADA (jamás
  «no hay ninguno»). Luego la nota de la IA (revisa un cargo a la vez), la
  casilla obligatoria («…crearlo por $752.84 y vincularle los 2 cargos»), el
  aviso si los cargos son de días o meses distintos (la fecha del gasto
  quedó en la del ÚLTIMO pago) y la nota de todo o nada. «Crear el gasto»
  nunca se apaga: el clic dice por qué no (`motivoNoCrearSuma`). Abre,
  ANIDADA, el alta de SIEMPRE (`ExpenseCreateDialog`, `next/dynamic` sin SSR
  y precargada al entrar al paso) en modo controlado con
  `prefillGastoDesdeCargos` (monto = la suma del API; moneda de las cuentas;
  fecha = `fecha_max`; «Pago domiciliado» si TODOS los cargos son
  automáticos, si no tarjeta SOLO con la `terminacion_comun` que validó el
  API, si no transferencia; notas «Pagado en 2 cargos del banco (HSBC
  Pesos): 30-sep … $649.00 · …», ≤ 10 + «y N más», ≤ 2,000), `titulo`,
  `contexto` y las props ADITIVAS `conciliarConMovimientos`,
  `clientRequestId` (UNA llave por sesión del diálogo: nace al entrar la
  primera vez al paso y se repite en cada «Guardar», así un reintento —o
  «vuelve a pulsar Guardar» de GASTO_SIN_VINCULAR— no duplica; cerrar el
  diálogo da otra), `textoExito` («Gasto registrado y vinculado a 2 cargos ·
  quedó cubierto» / «… · quedó PARCIAL: faltan $X de $Y», de `conciliacion`
  de la respuesta) y `textoError` (`mensajeErrorCrearSuma`: red o 5xx ⇒ «No
  se pudo confirmar si se registró el gasto: vuelve a pulsar «Guardar» (con
  esta misma captura no se duplica).»; 503 / DTO previo ⇒ «Esta opción
  todavía no está activa…»; GASTO_SIN_VINCULAR y GASTO_NO_REGISTRADO con su
  texto; 4xx con el texto del API «No se registró el gasto: …»). El API crea
  el gasto SIN auto-cruce y le liga los cargos en la MISMA petición; si la
  liga falla, lo RETIRA. Éxito ⇒ el alta avisa, este diálogo cierra, la
  selección se limpia y UN `router.refresh()`. Error ⇒ el alta sigue abierta
  con su caja roja; cargos no pendientes ⇒ refresh al cerrar; si pudo quedar
  un gasto (incierto, GASTO_SIN_VINCULAR, llave en uso) se releen los
  duplicados y la lista. Quitar cargos de la selección regresa a la lista
  (cambia la suma).
- **El alta con los cargos** (`expense-create-dialog.tsx`, SOLO con
  `conciliarConMovimientos`): las dos llaves viajan en el payload; la
  refacción va SOLO «Directo al avión» (sin el segmento ni el sub-formulario
  de la bodega, con `notaRefaccionDesdeCargos`: el API rechaza `inventario`
  con 400 INVENTARIO_NO_DESDE_CARGOS); la llamada va con `.catch` (nunca al
  error boundary); el fallo del API se queda en una caja roja
  (`data-error-alta-cargos`, se limpia en cada «Guardar» y al cerrar) en vez
  del toast, y no se cierra a medio guardar. **Sin las props el alta es BYTE
  A BYTE la de siempre** (golden `alta-gasto.golden.json`, congelado con el
  código ANTES del cambio: botón, modo controlado, refacción con «A
  Inventario/Tienda», gasto general y alta del vuelo). `createGastoAction`
  con `conciliar_con_movimientos` NO revalida (la llama un diálogo que sigue
  abierto) y su fallo conserva code/status/details (`failConCodigo`); sin la
  llave, la de siempre (revalida lo mismo y falla con `{ ok, error }`). El
  schema (`GastoCreateSchema`) acepta las dos llaves con los textos del DTO
  del API (2..50 uuid sin repetir) y exige la llave con los cargos.
- **«Omitir la conciliación…»** (`omitir-movimientos-dialog.tsx`, `next/dynamic`
  sin SSR, montado solo al abrirse; desde la barra con N y desde el ⋯ de un
  pendiente libre —también en los `extras` del abono— con 1): al abrir pide la
  revisión de riesgos al API (`revisarOmisionAction`) y pinta riesgos y
  no-pendientes; «Quitar esos N de la selección» (solo desde la barra) y la
  casilla «También omitir estos N…» (vale para los avisos que se VIERON: si
  cambian, se vuelve a marcar). Sin la casilla, el botón omite SOLO los que no
  tienen aviso y lo dice («Omitir 12 (sin los 2 con aviso)»); con ella viajan
  en `aceptar_riesgo_ids`. Motivo obligatorio con chips; desde 20, «Revisé la
  lista…» (atada al número a omitir). Éxito ⇒ toast con «Deshacer» (10 s,
  revierte lo que el mismo usuario acaba de omitir), cerrar, limpiar la
  selección y UN `router.refresh()`. 409 OMITIR_CON_RIESGO ⇒ se pintan los
  avisos y se CONSERVAN motivo y selección; 409 MOVIMIENTO_NO_PENDIENTE / 404
  ⇒ el texto del API + «Quitar esos N…» y refresh al cerrar; red o 5xx ⇒ «No
  se pudo confirmar si se omitieron…» + refresh (jamás «no se omitió»).
- **«¿Deshacer la omisión…?»** (`quitar-omision-dialog.tsx`, AlertDialog):
  desde la barra de «Omitidos» o el ⋯ de una fila omitida (rama `) : omitido
  ? (` ANTES del par de reverso, con SOLO esa opción). Corre solo desde
  `AlertDialogAction` con `preventDefault`.
- **Server actions** (al FINAL de `actions.ts`): `revisarOmisionAction`,
  `omitirMovimientosAction`, `quitarOmisionAction`,
  `gastosCandidatosDeCargosAction` y `ligarCargosAGastoAction`. NO revalidan
  (lección de la fecha del gasto); validan lista (1..200 para omitir, 2..50
  cargos para un gasto), motivo, avisos y el uuid del gasto antes de la red
  con los textos del DTO; conservan code/status/details; nunca lanzan. Toda
  llamada del cliente va con `.catch(sinConexion)`.
- **Página**: pestaña «Omitidos (N)» (N = Σ `omitidos` del resumen o el de la
  cuenta filtrada; sin dato, sin número: el resumen caído ahora es `null`,
  no `[]`) con `solo_omitidos=true` del API; si la lista falla, «Esta
  pestaña todavía no está activa…» (400 de la llave) o «No se pudo consultar
  la lista de omitidos…» (lo demás), jamás el vacío ni el error de página.
  Tarjetas «386/624 conciliados · incluye 14 omitidos» (el número enlaza a
  la pestaña de esa cuenta). El Excel desde «Omitidos» preselecciona
  «Conciliados» (`filtroReporteDeVista`). `<MovimientosTable key={claveVista}
  seleccion={…}>` en Todos/Pendientes/Omitidos: cambiar de pestaña, cuenta o
  fechas reinicia la selección. La línea `pestanaDeLista` no cambia
  («Omitidos» no participa del `?mov=`).
- **«Clasificar»** (de paso): el selector filtra la canónica, la lectura
  caída dice «No se pudieron cargar las clasificaciones: cierra y vuelve a
  abrir.» (nunca «Aún no hay clasificaciones») y, con el API nuevo, manda
  `esperado_clasificacion_id` (lo que el panel VIO, CAPTURADO al abrir el
  diálogo o la confirmación de «Quitar clasificación»; regla PURA
  `esperadoClasificacionDe`); 409 MOVIMIENTO_CAMBIO / MOVIMIENTO_OMITIDO ⇒
  el texto del API, cerrar y refresh.
- **Pruebas**: `lib/admin/__tests__/conciliacion-seleccion.test.ts`,
  `conciliacion-omision.test.ts`, `conciliacion-cargos-gasto.test.ts` (con
  el paso 4 y su paridad con el API),
  `app/admin/conciliacion/__tests__/omitir-cargos-actions.test.ts`,
  `components/admin/conciliacion/__tests__/seleccion.test.tsx` (golden
  `seleccion.golden.html` congelado ANTES del cambio + fixtures
  `seleccion.fixtures.ts`), `omitir.test.tsx`, `vincular-cargos.test.tsx`
  (con el paso previo y el cableado del alta anidada),
  `app/admin/expenses/__tests__/crear-con-cargos-action.test.ts` (schema y
  action con y sin la llave) y
  `components/admin/expenses/__tests__/alta-con-cargos-ui.test.tsx` (golden
  `alta-gasto.golden.json` del alta sin las props + el modo con los cargos).

### Revisión adversaria (15-oct-2026)

Hallazgos corregidos (API 0.0.77 sin cambios; ningún número del dinero se
mueve):

- **Vincular N cargos sin una confirmación falsa** (alta): el gasto elegido
  se guarda CON los cargos para los que el API calculó su ficha
  (`ElegidoSuma {idsClave, candidato}`; `fichaElegidaVigente` la da por
  buena solo con los MISMOS cargos). «Quitar ese cargo de la selección» lo
  suelta (`setElegido(null)`): con otra suma su `resultado` decía «queda
  cubierto» cuando el API lo dejaba PARCIAL. «Vincular los N cargos» no llama
  al API con la lista cargándose, sin gasto de estos cargos o sin el resumen
  a la vista (`motivoNoVincularCargos`: «Espera a que termine de cargar la
  lista de gastos.» / «Elige el gasto…» / «Espera a que se actualice la suma
  de los cargos y vuelve a elegir el gasto.»); el botón nunca se apaga. Con
  un cargo, los textos van en singular («Vincular 1 cargo a un gasto»,
  «1 cargo seleccionado», «Vincular el cargo»); «¿No está el gasto? Créalo…»
  y «Ampliar a ±120 días» con `dark:text-brand-400` (≥ 4.5:1 en oscuro).
- **La PODA es de verdad** (`podaSeleccion`, ajuste guardado en el render:
  `if (poda.sel !== sel) setSel(poda.sel)`): lo marcado que deja de calificar
  SALE de la selección. Antes solo se escondía y, con «Deshacer» del toast,
  «Deshacer la omisión…» o «Desvincular gasto», la fila reaparecía MARCADA y
  el siguiente «Omitir…» la incluía. Lo retirado se dice en la barra y en la
  región viva hasta la siguiente acción del operador.
- **«Seleccionar los N…» SUMA** (`seleccionarTodas(filas, sel, vista)`):
  reemplazaba y soltaba en silencio lo marcado en otra búsqueda. El tope de
  200 cuenta lo ya marcado (`estadoSeleccionarTodas().cupo`); «ya están
  todas» es SUBCONJUNTO, no igualdad.
- **Foco** (teclado y lector): el grupo de herramientas está SIEMPRE montado
  (`role="group"`, `tabIndex=-1`) y es el lugar estable. «Quitar selección» y
  «Limpiar» llevan el foco a «Seleccionar los N…» (o al grupo); los tres
  diálogos de la barra van con `finalFocus={false}` y la tabla, DESPUÉS del
  commit (un efecto que lee `focoPendienteRef`), devuelve el foco al botón
  que los abrió si sigue ahí (cancelar) o al grupo (éxito: el refresh puede
  quitar las filas). Si la barra desaparece sola con el foco en <body> (la
  poda tras «Vincular gasto» de UN cargo), también al grupo.
- **Región viva PERMANENTE** (`<p aria-live="polite" aria-atomic="true"
  class="sr-only">` dentro del grupo, `textoAnuncioSeleccion`): una región que
  nace ya con su texto no se anuncia (NVDA + Chrome): la primera selección,
  «Seleccionar los N…» y el vaciado («Ningún movimiento seleccionado.») ahora
  se oyen.
- **La barra no tapa**: se mide con un ResizeObserver (74 px en escritorio,
  hasta 170 px en teléfono) y su alto + 32 px (`huecoBarraSeleccionPx`) da el
  hueco al final de la tabla y, mientras se ve, el `scroll-padding-bottom`
  del documento (efecto con limpieza): el `scrollIntoView` de ↑/↓ deja la
  fila activa ENCIMA de la barra (simulado en Chrome: de 33/57 px tapados por
  paso a 0, y el paginado del teléfono libre). La barra va ANTES de la tabla
  en el DOM: sus acciones siguen al grupo en el orden del Tab.
- **Celda marcada**: el tinte es `background-color` de la celda; la capa
  absoluta de antes se pintaba ENCIMA de la sombra de la fila activa y la
  barra roja bajaba a 2.4:1 (medido en Chrome con el CSS compilado: ahora
  3.14:1 contra la celda y 4.0:1 contra la card).
- **«Clasificar»**: el esperado se captura al abrir (un `router.refresh()`
  con el diálogo abierto —RefreshOnFocus— lo cambiaba y el 409 nunca
  saltaba: se pisaba el cambio de otra persona o se deshacía una omisión
  ajena) y NO viaja para un movimiento conciliado SIN clasificación (con
  `null` el API respondía 409 siempre y esa fila ya no se podía clasificar).
- **Omitir**: «Quitar esos N de la selección» de la revisión marca el refresh
  al cerrar (las filas que ya no estaban pendientes se quedaban como
  «Pendiente»); el aviso de «todos con aviso» sabe si hay selección
  (`textoFaltaAceptarRiesgos`: desde el ⋯, «Este movimiento tiene aviso: …
  o cancela.»).
- **Vincular con UN cargo sin la moneda de las cuentas**: aplica (el diálogo
  de siempre la lee del API); el motivo «No se pudo leer la moneda…» solo con
  2 o más.
- **Moneda en «Conciliados»**: «Deshacer la omisión…» del ⋯ de una omitida
  decía «$19.72» de un cargo en dólares; la página pasa `monedaPorCuenta` a
  la tabla en todas las pestañas.
- **Pre-cierre**: el renglón INFORMATIVO `movimientos_omitidos` del API lleva
  «Revisar los omitidos →» a Conciliación → «Omitidos» DEL PERIODO
  (`lib/admin/pre-cierre-omitidos.ts`; sin las fechas no cuadraba con el
  «· N»).
- **Pruebas**: `conciliacion-seleccion.test.ts` (SUMA, subconjunto y cupo,
  la poda pendiente → omitida → pendiente, UN cargo sin moneda, región viva,
  hueco), `conciliacion-omision.test.ts` (`textoFaltaAceptarRiesgos`,
  `esperadoClasificacionDe`), `conciliacion-cargos-gasto.test.ts`
  (singulares, `fichaElegidaVigente`, `motivoNoVincularCargos`),
  `seleccion.test.tsx` (grupo y región viva, celda, cableado de la poda, el
  foco, la barra antes de la tabla, la moneda y —fuera de
  `filas-activas-cableado.test.ts`, que no se toca— el `tipoEntrada` del
  hook), `omitir.test.tsx`, `vincular-cargos.test.tsx`,
  `pre-cierre-omitidos.test.ts(x)`.
- **No hecho**: el «Vincular gasto» de UN cargo abierto desde la barra no
  recibe `finalFocus` (es `vincular-gasto-dialog.tsx`); la red de seguridad
  del foco lo cubre cuando la barra desaparece. El texto de «¿Ligar la
  factura…?» en la tarjeta de los marcados (`pfm`) sigue diciendo «sale de
  «Por facturar»» (anterior a este lote).

## Repartir entre aviones desde «Verificar / editar» (14-oct-2026)

Caso real (STARLINK, gasto `e23b5587`, 1-sep-2026, $4,733.76 MXN INDIRECTO
repartido 3 × $1,577.92 entre N4142R, N621TX y N990GG): el diálogo
prellenaba N990GG con la matrícula que leyó la IA, la mandaba en el PATCH y
el API rechazaba el guardado («El gasto está repartido entre aviones…»). El
reparto solo se veía y cambiaba desde el menú ⋯ / Otros gastos. Desde hoy se
ve, se crea, se edita y se quita AQUÍ, en el mismo «Guardar». **Solo panel**:
sin API ni migración (funciona con el API 0.0.75 y con el 0.0.76; la Fase 2
del API —códigos estructurados del candado, base en el PUT, RPC atómica— es
opcional y va en otro lote).

- **Fuentes únicas**: `lib/admin/reparto-gasto.ts` (PURA: estado, selección,
  sumas GUÍA, planificador, confirmación, resultados y TODOS los textos;
  ningún componente redacta estas frases),
  `components/admin/expenses/reparto-aviones-editor.tsx` (`RepartoAvionesEditor`
  y `RepartoResumen`, presentación sin hooks) y, en
  `app/admin/expenses/actions.ts`, `guardarGastoConRepartoAction` +
  `patchVerificacion` (el PATCH de siempre, compartido con
  `verifyGastoAction`).
- **Las cuentas en pantalla son GUÍA**: Σ ≤ monto y el remanente («lo absorbe
  VuelaTour») los decide el API. El techo es el total pagado del FORMULARIO
  (ticket + propina, `techoRepartoCents`) y todo se compara en centavos.

### Bloque «Avión»: dos modos

- `configAvionGasto({ categoria, vueloSel, repartoGuardado })` decide: con
  categoría repartible (`CATEGORIAS_REPARTIBLES`) o con reparto guardado, el
  campo «Avión» lleva dos botones (`role="group"`, `aria-pressed`, `title`
  por categoría, `cursor-pointer`): **«Un avión»** («Sin avión» en Gasolina y
  Visita) y **«Repartir entre aviones»**, deshabilitado —con el motivo a la
  vista— si la categoría no se reparte o el gasto lleva vuelo («Un gasto
  ligado a un vuelo no se reparte: para repartirlo, cambia «Vuelo» a «Sin
  vuelo».»). Sin modos (categoría no repartible y sin reparto) queda el campo
  de siempre con la etiqueta de `etiquetaCampoAvionSinModos`: «Avión
  (resuelve pendiente)» SOLO si la categoría necesita avión
  (`categoriaLlevaAvion`, espejo de la bandeja del API); en la «Comisión del
  vendedor (VuelaTour)», «Avión (solo referencia)»; en el gasto personal del
  dueño NO hay selector (`HINT_AVION_PERSONAL`: el guardado lo desliga y un
  selector cuya elección se tira sería un no-op mentiroso).
- **«Un avión»**: el selector con «Sin avión (gasto de VuelaTour)» y la ayuda
  por categoría (`ayudaModoUno`: un INDIRECTO con un avión resta en su
  balance pero NO en su reparto a socios; un FIJO se prorratea; en OTRO y
  NÓMINA el avión es solo referencia). Sobre un gasto repartido, el guardado
  QUITA el reparto: aviso ámbar (`avisoRepartoSeQuita`) y confirmación.
- **«Repartir»**: con reparto guardado, el RESUMEN de solo lectura
  (`RepartoResumen`: partes por matrícula —«¿?» si el API no la manda—,
  «Asignado $X de $Y del total pagado · VuelaTour absorbe $Z», «Editar
  reparto» y «Quitar el reparto»); sin reparto o al editar, el EDITOR en
  línea (`RepartoAvionesEditor`): los aviones ACTIVOS
  (`listAvionesActivosAction`, pedidos SOLO al mostrar el editor; nunca la
  prop `aircraft`, que trae inactivos y el PUT los rechaza), casilla y monto
  por avión (`aria-label` «Monto de N4142R»), «Dividir en partes iguales»
  (Σ exacta; el primero absorbe el residuo, como el RepartoDialog), la línea
  viva (roja si se pasa) y los avisos de sin monto / inactivo. La PRIMERA vez
  arranca con el avión del formulario al 100 % del total pagado
  (`seleccionInicialAlRepartir`) y un recuadro dice qué cambia
  (`textoQueCambiaAlRepartir`; en un FIJO, además `AVISO_REPARTO_FIJO`).
- En modo reparto el gasto **no lleva vuelo** (selector deshabilitado,
  `HINT_VUELO_EN_REPARTO`) y no hay prellenado por matrícula, sugerencia de
  vuelo ni «Usar este avión» (en su lugar `avisoMatriculaFueraDeReparto`: «El
  comprobante trae la matrícula X y el reparto no la incluye…»). «Total
  pagado» lleva la cola del reparto (`lineaTotalPagadoReparto`), «Con lo
  elegido cae en:» dice `hojaDestinoReparto` (prop `hoja` de
  `CategoriaDestinoHint`) y la descripción del diálogo es
  `descripcionVerificarGasto({ enReparto, categoria })`, POR CATEGORÍA del
  formulario (revisión del 14-oct-2026): «el avión es opcional… repartirlo»
  solo en las repartibles («No lleva avión» en Gasolina y Visita); «la
  bandeja de pendientes» solo donde sin avión el gasto SÍ cuenta ahí; el
  personal del dueño y la comisión (VuelaTour) dicen lo suyo. Una guarda
  recorre TODAS las categorías contra `categoriaLlevaAvion`.
- **Teclado y foco** (revisión del 14-oct-2026): Enter dentro del editor
  NUNCA envía el formulario (el «Guardar» implícito): en un monto salta al
  siguiente avión marcado (`siguienteMontoMarcado`) y en la casilla solo se
  come. «Editar reparto» lleva el foco a la primera casilla del editor;
  «Quitar el reparto», a «Un avión» (el botón pulsado se desmonta y Base UI
  lo regresaba al contenedor del diálogo); el «Reintentar» de los aviones, a
  «Repartir entre aviones», y el de la lectura fallida, a «Un avión» (los
  dos persisten mientras se carga; el texto «Cargando…» se desmonta). Siempre
  en el manejador, en el siguiente tick (`enfocarDespues`), jamás en un efecto.
- Notas en línea: el monto cambia con el reparto intacto
  (`notaMontoConReparto`: «…VuelaTour absorbería $X…»), reclasificar entre
  dos repartibles (`notaCategoriaEntreRepartibles`), la moneda no cambia con
  un reparto que se conserva (`textoRepartoMoneda`), cambiar el dinero de un
  gasto conciliado o parcial (`NOTA_DINERO_BLOQUEADO`, vía `estadoBancoGasto`)
  y el mes ya terminado (`notaRepartoMesTerminado`) cuando no hay
  confirmación que lo diga.

### Estados del reparto (`EstadoRepartoDialogo`)

`SIN_REPARTO` · `REPARTIDO` · `POR_CONFIRMAR` · `LECTURA_FALLIDA`. Nacen del
embed `repartos` de la lista (`estadoRepartoInicial`, inicializadores
perezosos: el HTML ya trae el modo y el resumen). Un gasto repartible SIN
embed queda POR_CONFIRMAR y lee `GET …/reparto` al abrir («Leyendo el
reparto del gasto…», «Repartir» apagado mientras); si falla, «No se pudo leer
el reparto de este gasto.» + «Reintentar» — **jamás «sin reparto» por una
lectura fallida**. El editor relee el reparto vigente al mostrarse: si cambió
y no se tocó nada, base y selección se reemplazan en silencio; si ya se tocó,
solo la base, con un banner ámbar (`textoRepartoActualizado`). Si el PATCH de
siempre rebota por reparto (`esRechazoPorReparto`: el prefijo «El gasto está
repartido entre aviones»; embed viejo), se relee y se pasa a «Repartir» con
el banner `textoRepartoDescubierto`.

### Guardar: UN clic, el planificador decide el orden

- **Sin cambio de reparto**: el camino de siempre (`verifyGastoAction`); en
  modo reparto el PATCH va sin `aeronave_id` (o `null` si el gasto guardado
  aún trae avión) y con `vuelo_id`/`escala_id` null. **Ninguna server action
  del diálogo llega al error boundary** (revisión del 14-oct-2026): el cuerpo
  del guardado es `ejecutar()` dentro de `try/catch` en la transición
  (`TEXTO_SIN_RESPUESTA_GUARDAR`; el diálogo sigue abierto con lo
  capturado), la 2.ª llamada (ligar el vuelo) va con `llamarSinLanzar`
  (`TEXTO_VUELO_SIN_RESPUESTA`) y «Retirar confirmación» lleva `.catch`
  (`TEXTO_RETIRAR_SIN_RESPUESTA`).
- **Con cambio** (crear, editar o quitar): `guardarGastoConRepartoAction(id,
  raw, { base, nuevo }, { riesgoConciliado })`, que NUNCA lanza — y el
  diálogo la llama con `llamarSinLanzar`: una server action que revienta en
  el cliente («Failed to find Server Action» tras un deploy) no llega al
  error boundary. (1) Valida sin red (uuid, ≤ 20 aviones sin repetir, montos
  > 0 con 2 decimales; el formulario con `GastoVerifySchema`); (2) relee el
  reparto (`no-store`); (3) distinto de la base del diálogo ⇒
  `REPARTO_CAMBIO` sin escribir; (4) `planGuardadoReparto` ordena PATCH y PUT
  para que ninguno choque con los candados del API (el PATCH con reparto
  guardado rechaza un monto bajo la suma, una categoría que no se reparte, un
  vuelo, otra moneda o un avión individual; el PUT valida contra lo GUARDADO,
  también el PUT []); (5) ejecuta: tras CUALQUIER falla del PUT relee y
  clasifica (`estadoRepartoTrasFalla`: igual a lo pedido ⇒ sigue; igual a la
  base; distinto; no se sabe) y un PATCH con red/5xx es INCIERTO (pudo
  escribir); (6) refuerzo del avión; (7) revalida Gastos, Otros gastos y Caja
  chica. Un PATCH INCIERTO (red o 5xx: pudo escribir) también revalida, con
  `revalidarVerificacion()` —la misma lista que `verifyGastoAction`—: sin
  eso, cerrar y reabrir el gasto enseñaba la fila de ANTES.

| Caso | Orden |
|---|---|
| Crear, o editar con monto final ≥ suma vigente | PATCH → PUT |
| Editar con monto final < suma vigente (el PUT cabe en el monto viejo) | PUT → PATCH |
| Quitar sin choque | PATCH → PUT [] |
| Quitar con choque (avión elegido, vuelo, categoría que no se reparte, otra moneda o monto bajo la suma) | PUT [] → PATCH |
| Conciliado con un plan que empezaría por PUT · otra moneda con un reparto que se conserva · reparto guardado mayor que el monto guardado · incompatible · Σ > monto final | BLOQUEO: solo el GET, nada se escribe |

  Lo congela un fuzz determinista de 20,000 casos contra un simulador
  ESTRICTO del API (`reparto-gasto.test.ts`, semilla 20261014): 0 rechazos
  en el 2.º paso.
- **Resultado** (`mensajeResultadoGastoReparto`, textos exactos): OK ·
  BLOQUEO · LECTURA · REPARTO_CAMBIO · GASTO · GASTO_INCIERTO ·
  PARCIAL_SIN_REPARTO · PARCIAL_SOLO_REPARTO · SIN_NADA_REPARTO y
  SIN_RESPUESTA (la llamada reventó: se relee con `getRepartoAction` para
  decir cómo quedó). Éxito: «Gasto verificado y repartido entre 3 aviones» /
  «Gasto verificado y reparto actualizado (2 aviones)» / «Gasto verificado y
  reparto quitado: quedó en N4142R» / «…: lo absorbe VuelaTour» (SOLO si la
  categoría no necesita avión: una que lo necesita dice «…: queda pendiente
  de avión (pestaña «Pendientes»)» o, con vuelo, «…: queda en la hoja de su
  vuelo»; el personal del dueño, «…: queda fuera de los balances (gasto
  personal del dueño)») / en un FIJO
  «…: el gasto fijo vuelve al prorrateo entre los aviones activos». Las
  fallas parciales y la falta de respuesta van en toast de 15 s
  (`TOAST_LARGO_MS`) y en un banner del bloque «Avión» (`data-reparto-aviso`)
  que se limpia al siguiente guardado y al reabrir; cuando el reparto quedó
  distinto o solo se guardó el reparto, el banner ofrece «Regresar el reparto
  anterior» (confirmado: «¿Regresar el reparto anterior?», PUT con lo de
  antes; si falla, se relee). Con el gasto ya guardado (parcial), el
  reintento no vuelve a subir las hojas ni reenvía la lectura de la IA.
- **Refuerzo del avión**: si el PATCH devolvió `aeronave_id` y quedó un
  reparto, GET + `PATCH { aeronave_id: null }` (el PUT limpia el avión, pero
  el API no lee el error de esa limpieza); si no se puede, aviso de 10 s
  (`textoRefuerzoAvion`) y el siguiente «Guardar» lo autocorrige.
- **Errores en pantalla** (antes de la red, `errorRepartoEnPantalla`):
  aviones cargando con cambios, ninguno marcado, un marcado sin monto, un
  inactivo marcado, Σ > total pagado y la moneda cambiada con un reparto
  guardado. Y, en `onSubmit`, **quitar el reparto pasando a «Gasavión /
  Turbosina» sin avión** (`errorQuitarRepartoSinAvion`, con el texto del ALTA
  del API, `MSG_COMBUSTIBLE_NECESITA_AVION`): el planificador pondría el PUT [] primero
  y el PATCH rebotaría con el reparto ya quitado. Solo cuenta el avión del
  formulario (el vuelo viaja en la 2.ª llamada, DESPUÉS del PATCH).

### La UNA confirmación

`confirmacionRepartoAlGuardar` (regla del cliente: lo destructivo confirma,
en cualquier mes): **quitar** el reparto («¿Quitar el reparto de este
gasto?», con el reparto de hoy, a dónde pasa el gasto —`destinoTrasQuitar`;
sin avión ni vuelo, una categoría que necesita avión va a
`DESTINO_PENDIENTE_DE_AVION` («la bandeja de «Pendientes»…»), jamás «lo
absorbe VuelaTour»—,
la nota de socios de un INDIRECTO con un avión y la del prorrateo de un
FIJO) o un cambio que **baja o saca** a un avión, **sustituye** al avión
guardado o es el **primer reparto de un FIJO** («¿Guardar el cambio del
reparto?», con «Bajan o salen del reparto: N4142R ($1,577.92 MXN → $0.00
MXN)…»). El primer reparto sin avión y subir o agregar no preguntan. El mes
ya terminado va como párrafo de la confirmación. «Revisar» no guarda; «Sí,
guardar» deja el cuadro abierto con «Guardando…» hasta terminar. Vive DENTRO
del `DialogContent` (Base UI: Esc cierra solo el de arriba) y, después, si
aplica, sigue la confirmación de la TUA que se borra. Un guardado nuevo nunca
hereda la confirmación del anterior.

### IA y prellenado

- `debePrellenarAvionPorMatricula`: la matrícula de la IA se prellena SOLO en
  un gasto sin reparto (sabido), en «Un avión», sin avión, sin el veto de
  «Sin avión» elegido a mano, en una categoría que lleva avión y a lo más UNA
  vez por apertura. Jamás en REPARTIDO, POR_CONFIRMAR ni LECTURA_FALLIDA (el
  caso STARLINK). La sugerencia de vuelo, igual: una vez por apertura y solo
  sin reparto.
- **Una apertura que SUPO de un reparto consume la IA** (revisión del
  14-oct-2026; `iaConsumidaPorReparto` / `marcarRepartoConocido`, desde el
  embed, la lectura, el editor y las respuestas del guardado): si un guardado
  a medias lo quita (PARCIAL_SOLO_REPARTO de un QUITAR), el diálogo queda en
  «Un avión» sin avión —justo las condiciones del prellenado— y aun así NO
  prellena la matrícula ni pide la sugerencia de vuelo (antes reimponía
  N990GG).
- «Reanalizar con IA» con reparto (guardado o armándose) no aplica la
  moneda, una categoría que no se reparte ni el avión; el toast lo dice
  (`notaIaConReparto`).

### Sesión, efectos y lint

- **Reset UNA vez por apertura** (`sesionRef` = `gasto.id`, se suelta al
  cerrar): con `[open, gasto]` a secas, el `router.refresh()` de
  `RefreshOnFocus` (o una revalidación) traía un `gasto` nuevo, borraba lo
  capturado y el prellenado reimponía N990GG. Ver la corrección en «El panel
  se pone al día al volver a la pestaña».
- **Base de la sesión** (`baseFormRef`, revisión del 14-oct-2026): el gasto
  con que se abrió ESTA apertura (y, tras un guardado PROPIO a medias, lo que
  devolvió el API). Los candados «viaja SOLO si se cambió en ESTE diálogo»
  —fecha (con `permitir_fecha_antigua` y el candado de fechas de
  `onSubmit`), facturación, TUA, tipo/lugar/hora de la carga, hojas y la
  autocorrección R14 del avión— comparan contra ella, NUNCA contra el `gasto`
  vivo: el formulario conserva lo de la apertura y un refresh trae lo que
  otro corrigió (Conciliación, el amarre de factura, otra sesión);
  compararlo con el vivo tomaba ese cambio como del usuario y lo REVERTÍA en
  silencio. Lo que el API tiene HOY sigue contra el vivo: borrar la TUA, el
  dinero (`monedaCambio`, conciliado), el vuelo de la 2.ª llamada y la hoja
  principal (`gasto.foto_url || baseForm.foto_url`). Se fija junto al reset
  (`sesionRef` → `baseFormRef` → `reset`) y se lee solo en manejadores.
- **Ficha de sesión** (`sesionN` estado + `sesionNRef` ref): los efectos del
  reparto, del prellenado y de la sugerencia esperan al render que YA trae el
  estado de la apertura nueva (en el commit del reset corren con el estado
  viejo: la misma clase de bug que el N990GG). Las cargas se DERIVAN de su
  clave (`gasto#sesión#intento`: «cargando» y «falló» sin estados aparte),
  los callbacks van con `useEffectEvent` y una respuesta de otra sesión se
  descarta.
- **React Compiler**: el archivo sale «Compilation Skipped: incompatible
  library» por el `watch` de react-hook-form (aviso previo), así que el lint
  NO revisa sus reglas aquí. Se revisó con una copia temporal sin `useForm`:
  0 errores nuevos (quedan 2 previos: el efecto del vuelo elegido y
  `handleSubmit`; tras la revisión del 14-oct-2026, solo el del vuelo
  elegido). Los efectos nuevos solo hacen setState en callbacks
  asíncronos o en bloques controlados por ref (reset, prellenado y
  sugerencia, una vez por sesión).

### Lo que cambió alrededor

- `verifyGastoAction` delega en `patchVerificacion`, que revalida con
  `revalidarVerificacion()`: Gastos, Otros gastos, Combustibles, Caja chica
  (layout), Gastos personales y Vuelos (layout). Su prueba es de
  COMPORTAMIENTO (las rutas exactas, en `gasto-con-reparto-action.test.ts`):
  la regex de `combustibles-editar-carga.test.tsx` casaba por el TRAMO del
  archivo, no por la action, y ya no la incluye. `saveRepartoAction`
  revalida también `/admin/caja-chica` (layout).
  `RepartoResponse.items[].matricula` es `string | null`.
- **RepartoDialog compartido** (menú ⋯ y Otros gastos), 4 arreglos: la
  confirmación de «Quitar reparto» vive DENTRO del `DialogContent` (Esc
  cierra solo ella); la carga tiene `.catch` (una action que lanzaba dejaba
  «Cargando…» para siempre; ahora toast + estado de falla); los textos de
  «Quitar reparto» salen de `textoQuitarRepartoDialogo` /
  `toastRepartoQuitadoDialogo` (un FIJO vuelve al prorrateo, ya no «100 %
  VuelaTour»); la matrícula null se pinta «¿?».
- **Pruebas**: `lib/admin/__tests__/reparto-gasto.test.ts` (89: ids reales,
  STARLINK, Cramex, f3c625e6, FIJO, GASOLINA, textos exactos, el fuzz, la
  guarda de que ningún texto mande a «Otros gastos» y la de los textos del
  avión por categoría), `app/admin/expenses/__tests__/gasto-con-reparto-action.test.ts` (23),
  `components/admin/expenses/__tests__/verificar-reparto-ui.test.tsx` (25:
  render y cableado, también la base de la sesión, el foco y las llamadas
  envueltas), `reparto-aviones-editor.test.tsx` (8: Enter por COMPORTAMIENTO,
  llamando al `onKeyDown` del árbol) y `reparto-dialog.test.tsx` (4). Las
  fábricas de mocks de `@/app/admin/expenses/actions` de los tests que montan
  el diálogo suman `getRepartoAction`, `listAvionesActivosAction`,
  `saveRepartoAction` y `guardarGastoConRepartoAction`: un test nuevo que lo
  monte las necesita.
- **Deploy**: solo panel. **Pendientes**: QA manual en producción
  (STARLINK, af52d6f4 y un gasto de prueba con montos raros por el
  auto-cruce) y sin QA visual en navegador (los diálogos viven en portales).

## Gastos: una sola tabla (14-oct-2026)

Pedido del cliente: «unir Gastos generales y Gastos operativos en una sola
tabla… está como ambigua la información… toda la vista debe quedar bien e
intuitiva». La división vieja (dos tarjetas por `CATEGORIAS_OPERATIVAS`)
partía los gastos de un mismo vuelo —233 directos del vuelo (comida, hotel,
taxi, comisariato…) caían en «generales»— y no decía a dónde iba el dinero;
además la columna «Avión» decía «Pendiente» en los 251 gastos sin avión
cuando para el API solo 36 lo son. **Solo panel**: sin API ni migración (el
DTO ya aceptaba `categoria`, `pendientes` y `duplicados` también en
`GET /v1/expenses/export`).

- **Fuentes únicas (PURAS, con prueba)**: `lib/admin/gastos-vista.ts`
  (lectura y validación de la URL —la MISMA en la página y en la barra—,
  consultas de lista, contadores y Excel, vacíos, pestañas, opciones de los
  filtros, descripción y búsqueda del renglón, línea del teléfono, compra,
  «Sugerir asignaciones», modo «Unir en compra» y TODOS los textos de la
  pantalla) y `lib/admin/gasto-avion.ts` («Avión · vuelo»). Lo importa la
  barra (cliente): de `lib/api/expenses-server.ts` solo `import type`.
- **«Falta avión» = espejo EXACTO de la bandeja del API**:
  `CATEGORIAS_SIN_AVION` (categorias-gasto.ts) = empresa + INDIRECTO +
  PERSONAL_DUENO + «Comisión del vendedor (VuelaTour)», sin la «(avión)» (igual
  que `CATEGORIAS_GASTO_SIN_AVION` de `common/categoria-gasto.util.ts`; la
  prueba de paridad lee el repo del API). `estadoAvionGasto`: reparto ⇒
  «Repartido:» + insignias (remanente en centavos ⇒ «VuelaTour»);
  PERSONAL_DUENO ⇒ «Personal»; NOMINA sin reparto ⇒ «Sin repartir» (regla 2b,
  16-oct-2026; con «ref. N4142R» si trae avión); empresa o comisión
  (VuelaTour) ⇒ «VuelaTour» SIEMPRE (con «ref. N4142R» si trae avión
  sellado: no se le carga); con avión
  ⇒ la matrícula; INDIRECTO sin avión ⇒ «VuelaTour»; lo demás ⇒ «Falta
  avión» (title y sr-only dicen qué hacer). Así el ámbar de la tabla suma lo
  mismo que la pestaña «Pendientes». El vuelo va debajo («Vuelo #437»).
- **Columnas** (`expenses-table.tsx`): Fecha (8rem: «14 oct 2026», «Cap. 14
  oct 10:33» —el lector oye «Capturado …»— y «Mary Cruz · panel» con
  `CapturadoCompacto`; el nombre se trunca, el origen se conserva) · Concepto (`w-full`, mínimo
  10rem: categoría + compra/«¿Duplicado?»/«Falta visto bueno» + la primera
  línea de las notas en 2 renglones, sin la matrícula propia al inicio;
  debajo de 768 px la línea de estado `md:hidden`) · Monto (`fmtMonto`, el
  medio corto «Tarjeta ****2865» y la propina) · Avión · vuelo · Comp.
  (`hidden xl:table-cell`; «Sin vista previa» si la firma de la foto falló;
  de 768 a 1279 px —1299 en modo unir— su respaldo va bajo el concepto)
  · Facturación (`FacturacionBadge compacta`: «No requiere») · Banco (igual)
  · ⋯ (la compra: ícono que abre la compra). Desaparecen Categoría,
  Descripción, Pago, Vuelo y Capturó. Tinte de la compra `bg-muted/40` (el de
  la marca se confundía con la fila activa).
- **Distintivo de origen** (pedido del 9-jul): NO se quitó. La insignia
  «Oficina/Sistema/Visitante» de la vieja columna «Capturó» es ahora el COLOR
  de la palabra de origen en la tercera línea de la fecha («panel» sky,
  «sistema» violet, «app» teal del visitante; piloto/mecánico «app» en gris),
  con su etiqueta en el `title` y en sr-only (`DISTINTIVO_ORIGEN`,
  `TITULO_DISTINTIVO_ORIGEN`). Una insignia con texto le quitaba al nombre el
  espacio que necesita (medido: «Pablo Canales» se cortaba).
- **Anchos MEDIDOS** (render real: tabla real + CSS de Tailwind compilado +
  Inter en Chrome headless, 100 gastos de prod + extremos: $290,800.85 MXN
  con propina, compra parcial, reparto de 3, foto sin firma con +2 hojas;
  barras de Windows emuladas, ancho útil = viewport − 336): Fecha 128 ·
  Concepto ≥ 176 · Monto 124–142 · Avión 102 · Comp. 91 · Facturación 130
  · Banco 104 · ⋯ 48 (+ casilla 32). Sin scroll horizontal de 1170 a 1536 px;
  a 1280 sobran 23 px en el peor bloque (41 en uno típico). Perillas
  aplicadas: Concepto mínimo 10rem y, SOLO en modo unir, «Comp.» desde
  1300 px (a 1280 con la casilla y un monto de seis cifras la tabla se
  deslizaba 9 px). La propina larga y el aviso de compra parcial envuelven
  (en una línea ensanchaban Monto ≈ 80 px). Debajo de ≈1166 px la tabla se
  desliza dentro de su caja; la página nunca (390 px verificado).
- **Breakpoints de VIEWPORT, no container queries**: la barra lateral es fija
  (256 px desde `lg`) y `container-type` haría de la tabla el contenedor de
  los `position: fixed` descendientes: el visor de `ImagePreview` (`fixed
  inset-0`, sin portal) quedaría atrapado dentro de la tabla.
- **Filtro de SERVIDOR «Categoría»** (`?categoria=`, las 21 de
  `CATEGORIAS_FILTRO_GASTOS_VISTA` —las 22 de `CATEGORIAS_FILTRO_GASTO` sin
  «Nómina», desde el 16-oct-2026— con su destino en verde; desconocida o en
  minúsculas se ignora; `?categoria=NOMINA` también se ignora y pinta la
  franja «La nómina se lleva en su propio módulo»): lo heredan los contadores
  de las pestañas, el Excel y `FILTROS_URL` (al final). Gastos personales
  enlaza `/admin/expenses?categoria=PERSONAL_DUENO`. La lista, los contadores
  y el Excel mandan SIEMPRE `excluir_categoria=NOMINA` (ver «Nómina: fuera de
  Gastos y reparto en partes iguales»).
- **Barra** (`expenses-filter-bar.tsx`, reescrita): `<Label htmlFor>` +
  `id` en cada control, «Todos/Todas» para quitar un filtro suelto, «Avión»
  (activos, dados de baja, «Avión desconocido»), «Fecha del gasto» y «Fecha
  de captura: Todas · Esta semana · Rango…» (sustituye al chip «Subidos esta
  semana») con BORRADOR (`useRangoBorrador`, mecánica de
  `quotes-filter-bar`: nada navega a media tecla), `CLASE_FILTRO_ACTIVO` en
  lo que tiene valor, «Limpiar» (quita avión, categoría y captura; conserva
  pestaña, orden y búsqueda), «Actualizando…» (`role="status"` siempre
  montado) y la pista «La búsqueda de la tabla solo filtra lo que ves…» con
  `?tq`. Navega con `consultaBaseParaNavegar` (UN pendiente para toda la
  barra), borra `tp` (página 1), conserva `tq`, `startTransition` y
  `scroll: false`; si nada cambió no navega.
- **Pestañas** en `<nav aria-label="Vistas de gastos">` con `aria-current`,
  `title` de ayuda (un conteo que falló dice «(no se pudo contar)», jamás
  «0»), `prefetch={false}` e `IndicadorEnlace` (`useLinkStatus`, en la
  esquina para no descentrar la etiqueta). «Unir en compra…» es un MODO
  (`UnirCompraToggle` en la fila de vistas): las casillas solo aparecen con
  él; «Terminar» (o unir con éxito) lo apaga y limpia la selección.
- **Encabezado**: «Nuevo gasto» primario (`varianteBoton="default"`),
  «Sugerir asignaciones» sin número en la etiqueta y con el total GLOBAL de la
  bandeja en su `title` (con filtros, una lectura extra degradable), «Exportar
  Excel» a la altura de los demás. **El Excel hereda la pestaña**
  (`pendientes`/`duplicados` = "true"): desde «Pendientes» trae solo los
  pendientes (cambio de comportamiento: avisar a la oficina).
- **Estados honestos**: la lista principal va con `principal()` y, si falla,
  `TarjetaErrorCarga` en el lugar de la tabla (cabecera, pestañas y filtros
  siguen vivos; jamás «Sin gastos»); vacíos por pestaña con `EmptyState` y
  «Quitar filtros» si hay filtros; la firma de las fotos degrada con aviso;
  el corte como siempre. «Todos» sigue cargando TODOS los gastos (sin mes por
  defecto: decisión pendiente del cliente).
- **Pruebas**: `lib/admin/__tests__/gasto-avion.test.ts`,
  `gastos-vista.test.ts`, `gastos-captura.test.ts` (nueva) y las ampliadas
  `categorias-gasto.test.ts` (paridad con el API), `medios-pago.test.ts`,
  `facturacion-estatus.test.ts`; `components/admin/expenses/__tests__/
  gastos-una-tabla.test.tsx` (marcado + cableado de la página),
  `expenses-filter-bar.test.tsx`, `unir-compra-modo.test.tsx`,
  `suggest-assignments.test.tsx` y `facturacion-badge-compacta.test.tsx`.
- **Decisiones del cliente pendientes**: ¿vista agrupada por destino (exige
  `categorias[]` en el API para que el Excel la herede)?; ¿el Excel con la
  pestaña es lo esperado?; ¿«Todos» abre en el mes corriente (rendimiento a
  ~430 gastos/mes)? **Fase 2**: `listGastosAll` en paralelo, `<Suspense>`
  con esqueleto, diálogos del ⋯ montados al abrirlos, miniatura con
  «Reintentar», contraste oscuro de las insignias de compra, tarjetas en
  teléfono, filtro «Comprobante: con / sin», fila sin `valor_ia_extraido`.
- **QA manual** (sin DOM en el runner): Chrome Windows a 1280/1366/1440/1536
  (también 1280 en modo unir), teléfono 390 px, contar «Falta avión» = la
  pestaña «Pendientes», `?categoria=PERSONAL_DUENO` y su Excel, «Exportar
  Excel» desde «Pendientes», página 5 + cambiar «Banco» ⇒ página 1 con la
  búsqueda conservada, teclear el año en una fecha sin navegar.

### Revisión adversaria (14-oct-2026)

- **Fecha**: «Capturado 14 oct 10:33» medía hasta 119.08 px en las 112 de la
  columna (Chrome + Inter, la rejilla de TODO el año, también con «⚠»): se
  truncaba justo la hora. Visible va «Cap. …» (`PREFIJO_CAPTURA_CORTO`:
  máximo 91.27 px; «⚠ Cap. …» 103.83) y el lector oye la larga
  (`cuandoLector`, sr-only; «⚠ año 2025 · Capturado …» cuando aplica). Los
  pagos de una compra (renglón hijo) van con `pl-3` y sublíneas de 6.25rem
  (`angosto`): 12 + 100 = 112 px; con `pl-6` + 7rem la columna crecía al
  desplegar la compra y las demás brincaban.
- **Respaldo de «Comp.»** (`lineaComprobanteGasto`): entre 768 y 1279 px
  (1299 en modo unir) nada decía si el gasto trae papel. Bajo el concepto,
  con el MISMO corte que oculta la columna: «Sin comp.» · «Sin vista previa»
  · «+2 hojas» · «✓ Confirmado» (quién y cuándo en el `title`:
  `tituloConfirmadoGasto`, el mismo del ✓ de la columna). Sin nada que decir
  no se pinta; debajo de 768 px lo dice la línea del teléfono.
- **Categoría** (filtro): `anchoFiltroCategoria` — con una etiqueta de más
  de 22 caracteres elegida, `sm:w-72`; si no, `sm:w-52` de siempre (las dos
  comisiones se veían iguales: «Comisión del vended…»).
- **La barra CADUCA lo que ya no es de la URL**: la consulta pendiente
  (`pendienteVigente`, en un efecto sobre `sp`), los borradores de las fechas
  (`borradoresVigentes`, ajuste guardado en el render) y «Rango…» abierto
  sin fechas (`RangoCapturaAbierto { vista, esperada }`: sigue mientras la
  URL de filtros —sin `tq`/`tp`, `claveFiltrosUrl`— sea donde se abrió o la
  que pidió la propia barra, `rangoCapturaTrasUrl` / `rangoCapturaTrasNavegar`;
  el chip ✕, «Quitar filtros», Atrás o el menú lo cierran). Antes revivían
  cuando la URL regresaba: el clic al MISMO avión tras el chip ✕ se perdía,
  un banco quitado volvía con el siguiente filtro y un borrador no aplicado
  reaparecía con la marca de activo. Lo mismo en `quotes-filter-bar`
  (pendiente y borradores). Las secuencias, simuladas sin DOM (con la
  versión vieja como control), en `quote-navegacion.test.ts`.
- **Barra «Unir en compra»**: `fixed inset-x-4 bottom-6 … mx-auto w-fit
  max-w-[calc(100vw-2rem)]`. Con `left-1/2` + translate el ancho disponible
  era MEDIO viewport: a 390 px medía 195 × 218 (28 % de la pantalla) y tapaba
  «Página anterior» y «Filas por página». Medido en Chrome con el CSS
  compilado: 358 × 98 a 390 px, 288 × 98 a 320, 718 × 58 a 768; paginador
  libre en todos los casos. Instrucción corta en teléfono
  (`INSTRUCCION_MODO_UNIR_CORTA`, `sm:hidden`) y el hueco del final MIDE la
  barra (`ResizeObserver` en un ref callback con limpieza: alto + 32 px;
  `h-20` hasta medirla). **Lista caída** (`cargaFallida={!lista.ok}`): el
  botón del modo no se ofrece, la barra encendida dice `TEXTO_UNIR_SIN_LISTA`
  (`role="status"`, con «Terminar») en vez de «no hay gastos que se puedan
  unir» y lo marcado NO se poda.
- **Sugerir asignaciones**: el API revisa a lo más 15 pendientes, los más
  recientes (`.limit(15)` en `expenses.service.ts`; espejo
  `TOPE_SUGERIR_ASIGNACIONES` con prueba de PARIDAD que lee el repo del
  API). El `title` y «Analizando…» ya no prometen «toda la bandeja» y, bajo
  el resultado, `textoPendientesSinRevisar` dice cuántos no entraron en la
  pasada («…otros 21 no se revisaron en esta pasada…»).
- **«VuelaTour» de la columna Avión**: el `title` de un gasto de VuelaTour
  sin vuelo ni avión (`tituloFueraDelAvion`) manda al menú ⋯ del renglón
  («Repartir entre aviones», solo en las repartibles:
  `DESTINO_VUELATOUR_REPARTIBLE_TABLA`), ya no a «la pantalla Otros gastos».
  `HOJA_OTROS_GASTOS_SIN_NADA` NO se tocó (la pista de destino del alta) y la
  guarda PROHIBIDO de `gasto-avion.test.ts` recorre todas las categorías.
- **Columna «Avión» del Excel = la de la tabla (RESUELTO en el API 0.0.78,
  paso 6; antes «Pendiente de API»)**: `listXlsx` escribía «Repartido (N)»,
  la matrícula o «(pendiente)» y contradecía la tabla. Hoy la celda sale de
  `celdaAvionGasto` (`expenses/gasto-avion.util.ts` del API) con la MISMA
  precedencia que `estadoAvionGasto`: reparto ⇒ «Repartido: N4142R,
  N621TX» (y «VuelaTour» si queda remanente) → PERSONAL_DUENO ⇒ «Personal»
  → empresa o «Comisión del vendedor (VuelaTour)» ⇒ «VuelaTour» (con
  «(ref. N4142R)» si trae avión sellado) → con avión ⇒ la matrícula →
  INDIRECTO sin avión ⇒ «VuelaTour» → «Falta avión» (= la bandeja
  `?pendientes=true`). **PARIDAD OBLIGATORIA**: `gasto-avion.paridad.spec`
  del API EJECUTA `lib/admin/gasto-avion.ts` de este repo (transpilado)
  contra 3,360 combinaciones + filas reales y revisa cómo pinta cada rama
  `expenses-table.tsx`; corre cuando `../vuelatour-next` está al lado (o
  con `VUELATOUR_NEXT_DIR`), lee el ÁRBOL DE TRABAJO y truena solo por una
  regla o un texto. Si cambia esa columna, `lib/admin/gasto-avion.ts`,
  `categorias-gasto.ts` o `lib/format.ts`, se cambian los dos repos en el
  MISMO lote.

## Títulos de las pestañas del navegador (14-oct-2026)

Pedido del cliente: «estaría genial que en cada pestaña del navegador se
ponga el nombre de lo que se está consultando en esa pantalla, para
guiarnos cuando tengamos varias pestañas abiertas». Hasta hoy TODAS las
páginas de `/admin` decían «Vuelatour Admin».

- **Fuente única**: `lib/admin/titulos-pestana.ts` (PURO: sin React ni
  red). Ninguna página arma el texto: `metadata`, `generateMetadata` y
  `<TituloPestana>` usan sus constantes (`TITULOS_SECCION` = las etiquetas
  del menú de `nav-items.ts`, `TITULOS_PAGINA`, `TITULOS_DETALLE`) y
  funciones (`tituloVuelo`, `tituloConciliacion`, `tituloBalance`…). El
  sufijo « · Vuelatour» lo pone el `template` del layout raíz: ningún
  título lo trae y el layout de `/admin` no pone título.
- **Lo distintivo primero** (la pestaña se recorta por la derecha): «Vuelo
  #315 · Beh Kay», «Cotización #332 · Beh Kay», «Conciliación ·
  Pendientes», «Balance general · 1–14 oct 2026», «Avión XB-PEV»,
  «Gastos». La pestaña que muestra todo («Todos») no se nombra; los
  periodos son días de pared Cancún (`periodoCorto`).
- **El head NUNCA lee el API (ni `/me`)**: «`generateMetadata` reutiliza el
  GET de la página» se probó y se descartó. En producción cada `<Link>`
  visible PRECARGA su ruta y, con `loading.tsx`, la precarga corta en el
  loading pero SÍ pide el head (`segment-cache/scheduler.js`,
  `pingRuntimeHead` con `Next-Router-Prefetch: 1`; el servidor responde con
  `rscHead` en `walk-tree-with-flight-router-state.js`): `generateMetadata`
  corre SIN la página y no hay render con el cual memoizar el GET.
  Medido (build de producción + API simulada + Chrome a 1440×900):
  leyendo el API en `generateMetadata`, `/admin/flights` (20 filas) pasaba
  de 5 a 41 lecturas (17 snapshots + 17 clientes + 2 `/me` de la precarga
  del menú) y otra vez en cada `router.refresh()` de RefreshOnFocus;
  Reportes, de 4 a 13 (los 7 libros completos de los aviones).
  `generateMetadata` solo valida la URL con la MISMA función que la página
  (`filtroConciliacionDeUrl`, `parametrosVistaBalance`, `periodoDeLaUrl`…)
  y NUNCA lanza (ni `throw`, ni `notFound()`, ni `redirect()`): un throw ahí
  manda la pantalla al error boundary.
- **Lo que necesita datos reutiliza lo que la página YA leyó** (cero
  lecturas nuevas): `<TituloPestana titulo={tituloVuelo(snapshot.folio,
  client?.nombre)} />` (`components/admin/titulo-pestana.tsx`; el lado DOM,
  `lib/admin/titulo-pestana-dom.ts`). La `metadata` de esa página es el
  genérico de su familia («Vuelo» = `tituloVuelo()`): lo que se ve mientras
  carga, sin permiso o si falta el dato. Vigila el `<head>` con un
  `MutationObserver` porque Next REMONTA su `<title>` genérico en cada
  respuesta del servidor (el `router.refresh()` de RefreshOnFocus, server
  actions) y React lo inserta ANTES del anterior; al desmontar repone el
  último título de Next. En Chrome (misma medición): «Vuelo #301 · Beh Kay
  · Vuelatour» al cargar y tras el refresh (con `<title>` NUEVO), «Vuelos ·
  Vuelatour» al volver a la lista y «Vuelo #307 · …» al abrir otra fila.
- **Prueba guardián**: `app/admin/__tests__/titulos-pestana-cableado.test.ts`
  clasifica TODA página de `/admin` (más `/login` y `/auth/auth-error`):
  título fijo, de la URL o EXCEPCIÓN con motivo (solo las que únicamente
  redirigen: `quotes/[id]/revise`, `quotes/grupo/[id]/editar`); vigila que
  no haya texto a mano, que `generateMetadata` no lance ni lea el API y que
  `<TituloPestana>` viva solo en páginas. Los textos los congela
  `lib/admin/__tests__/titulos-pestana.test.ts` (secciones = etiquetas del
  menú, plantilla idéntica a la del layout) y el DOM
  `lib/admin/__tests__/titulo-pestana-dom.test.ts`. **Página nueva ⇒ su
  título en `titulos-pestana.ts` y su renglón en la guardiana.**
- **Comodín** (`app/admin/[...slug]`): una ruta que no existe dice «Vuelos
  · Página no encontrada» (el módulo sale de `itemNavActivo`: gana el href
  más largo) y regresa a ese módulo; «En construcción» solo para un ítem
  `comingSoon` (hoy ninguno). Antes el «empieza con» de «Inicio» hacía que
  TODA ruta desconocida dijera «Inicio — Este módulo aún no se ha
  construido» (`app/admin/__tests__/comodin-admin.test.tsx`).

## Cobros: un cobro con varios abonos, «Conciliado parcial» y «Cobrado de más» (14-oct-2026, API 0.0.78)

Pedido del cliente: «que un cobro acepte varios abonos, el aviso de
«Conciliado parcial», la alerta al vincular un abono de otro monto y la de
«cobrado de más» en la card» (casos #315/#332: dos camionetas de $1,700
contra un cobro de $3,400, y un abono de $69,183 = $68,205.55 + $977.45).
Contrato: invariante 77 del API (migración `20261014000003` por el SQL
Editor; las LECTURAS del 0.0.78 salen de la puente y no dependen de ella).

- **El panel no calcula dinero que decide el API.** Estado del cobro, neto,
  lo vinculado, faltante, sobrante, sus abonos, `al_vincular` (con
  `sugeridos` y la comisión real) y «cobrado de más» vienen del API; aquí
  solo se formatea (`fmtMonto` / `fmtUsd`: sin decimales si el monto es
  entero; fechas del banco con `fmtDateOnly`, las de los cobros en hora
  Cancún) y se eligen textos y clases. Única resta: la vista previa del
  formulario de cobro, con números del API (el API recalcula al guardar).
  La suma de un lote en el diálogo «Vincular» es GUÍA.
- **«Conciliado» de un cobro = CUBIERTO**: Σ de sus abonos en su moneda ≥
  neto − $1.00 (`TOLERANCIA_COBRO_BANCO`). Estados (`conciliacion_estado`):
  CONCILIADO · PARCIAL · VIA_ANTICIPO · SIN_CONCILIAR · NO_BANCARIO; el
  `conciliado` de siempre = CONCILIADO o VIA_ANTICIPO (un PARCIAL ya dice
  `false`). El CANDADO del dinero del cobro es otra cosa: `ligado_banco`
  («tiene abonos»), también para un parcial.
- **Fuentes únicas (PURAS, con prueba)**: `lib/admin/cobro-banco.ts`
  (estado, badge de 3 estados con texto, clases y tooltip, renglón «Banco»,
  URLs al abono, texto del sobrante, chip de Ingresos, chip del pre-cierre,
  textos de desvincular UN abono y la columna «Banco» de «Cobros sin
  banco»), `lib/admin/cobrado-de-mas.ts` (tono y enlace del aviso, el
  renglón del pre-cierre y la vista previa del formulario de cobro) y
  `lib/admin/conciliacion-cobros-lote.ts` (`guiaAlVincular`,
  `pasoAlPulsarVincular`, `lineaCortaAlVincular`, las dos confirmaciones,
  la suma del lote por FALTANTE, toasts, los errores nuevos AL FINAL del
  switch, la bandeja y Paywise). Ningún componente redacta estas frases.
  Todo lo que se pulsa (badge-botón, ligas, salidas de un clic, botones de
  las confirmaciones) lleva `cursor-pointer`.
- **Badge del cobro** (`CobroConciliadoBadge` de `flights/cobro-sobre-nota.tsx`,
  en las tarjetas «Cobros» del vuelo y de la cotización): «Conciliado»
  (verde; también vía su sobre o su anticipo), «Conciliado parcial · faltan
  $1,700 MXN» (ámbar; envuelve dentro de su columna) y «Sin conciliar»
  (rosa, sin fondo); efectivo, dólares, BillPocket y reembolsos sin liga,
  sin badge. En un celular la FILA del cobro de la tarjeta del vuelo
  envuelve (`flex-wrap`: la fecha y los botones, ~234 px, bajan a su
  renglón con `ml-auto` y el cobro usa todo el ancho con `flex-1
  basis-64`; revisión del 15-oct-2026: antes al cobro le quedaban ~54 px y
  el badge, que ahora es botón, se cortaba o se encimaba con la fecha).
  Tooltip con el abono («Conciliado con el banco: abono del 15
  sep 2026 en EJE SCOTIA por $3,400 MXN.»), con varios («Conciliado con 2
  abonos del banco: 15 sep 2026 · $1,700 MXN (EJE SCOTIA) y …»), con un
  lote («Conciliado con el banco: $68,205.55 MXN de un abono de $69,183 MXN
  del 15 sep 2026 (EJE SCOTIA) que pagó 2 cobros.») o, en un parcial, lo que
  respalda el banco y qué hacer: «Mientras, este cobro sale en «Cobros sin
  banco».» SOLO si su método sale ahí (`saleEnCobrosSinBanco`, espejo de
  `METODOS_COBRO_ABONO_AUTO` del API con prueba de paridad); un BillPocket
  —candidato manual, pero esa lista y el pre-cierre no lo traen— dice
  «Mientras, lo que falta se ve en esta tarjeta y en Ingresos.». «Sin
  conciliar» usa `TITULO_SIN_CONCILIAR_ENTRADA`, el MISMO title de Ingresos
  (el de la spec
  prometía «se cruza solo al importar», falso para un cobro registrado
  DESPUÉS de importar: los cobros no tienen cruce «al revés»); la parte de
  un sobre y el cobro de un anticipo llevan su propio title (el abono se
  liga al sobre o al anticipo, no al cobro). Para ADMIN/FACTURACION el badge
  abre la hoja «Conciliación con el banco» (sección siguiente).
- **Renglón «Banco»** (`CobroBancoDetalle`, debajo de cada cobro) SOLO cuando
  dice algo que el badge no dice: un parcial («Banco: $1,700 de $3,400 ·
  abono del 15 sep 2026 (ver) · faltan $1,700 MXN · Buscar el abono que
  falta»), un cobro completo con 2+ abonos («Banco: 2 abonos · 15 sep 2026
  $1,700 (ver) · …») o un abono que trae de más (liga anterior al 0.0.78:
  `textoSobranteCobro`, «El abono vinculado ($55,053 MXN) trae $27,526.50
  MXN más que este cobro: ¿pagó también otro vuelo? …» + «Ver el abono»).
  Las ligas, en pestaña nueva, SOLO para ADMIN/FACTURACION
  (`puedeConciliarIngresos`); los demás leen el mismo texto sin ligas. «ver»
  = `hrefAbonoDeCobro` (Conciliación «Conciliados» de su cuenta y su día con
  `?mov=`: la fila sale primero y resaltada); «Buscar el abono que falta» =
  `hrefBuscarAbonoQueFalta` («Pendientes» de 7 días antes a 30 después del
  cobro, días Cancún, con el faltante en `?mvq=`). El abono de una cuenta en
  OTRA moneda (1 ↔ 1) pinta su monto sin moneda: `abonos_banco` no la trae.
- **Ingresos**: la lista nunca trae PARCIAL. Un cobro parcial conserva el
  badge «Sin conciliar» y, al lado, el chip ámbar INFORMATIVO «Parcial ·
  faltan $1,700 MXN» (`chipParcialEntrada` + `ChipParcialEntrada` de
  `ingresos/entradas-table.tsx`, del aditivo `conciliacion.parcial`); el
  chip nunca es botón. El `title` del badge de un parcial es el SUYO
  (`tituloBadgeEntrada` → `TITULO_SIN_CONCILIAR_PARCIAL_ENTRADA`: «Ya tiene
  abonos del banco ligados, pero todavía no completan el cobro. El abono
  que falta se vincula en Conciliación cuando llegue.»), también sin botón
  (COORDINADOR); el de SIN_CONCILIAR («Ningún abono del banco está ligado
  todavía…») contradecía al chip. Desviación anotada del texto literal de
  la spec (RC9 se respeta: el texto visible sigue siendo «Sin conciliar»).
- **Corregir un cobro** (`lib/admin/cobro-edicion.ts`): el candado del
  dinero decide con `ligado_banco`, también para un parcial, y el title del
  botón agrega «(parcial)». Ver «Corregir un cobro: «Editar» en las cards de
  cobros» (la tabla por tipo y el 409 `COBRO_CONCILIADO`).

### «Cobrado de más» y la vista previa del formulario de cobro

- **El aviso** (`flights/cobrado-de-mas-aviso.tsx`, `CobradoDeMasAviso`, sin
  hooks; en las dos tarjetas, debajo del resumen) pinta
  `snapshot.cobrado_de_mas` TAL CUAL: excedente, causa probable («Posible
  causa», nunca afirma) y qué hacer los arma el API, y la cifra es la MISMA
  que el balance manda a «otros movimientos». AVISO (`requiere_revision`) =
  caja ámbar `role="status"` con el título, la causa, «Qué hacer:» y, si la
  causa es el pago de otro vuelo del cliente, «Ver el vuelo #332»; INFO
  (comisión del link pagada por el cliente, redondeo del T.C.) = una línea
  gris («Cobrado de más: $214.26 USD — es la comisión del link de pago… No
  hay nada que corregir.»); con cobros en pesos sin T.C., «Además hay N
  cobro(s) en pesos sin T.C. ($X MXN) que no entraron a la cuenta.». null o
  ausente ⇒ nada: sin excedente, API previo, PILOTO/MECANICO/VISITANTE, o el
  API no pudo leer la fila de precios (omite la llave). Llega al vuelo por
  `CobrosCard` y a la cotización por la página → `QuoteWorkspace` →
  `QuoteCobrosCard`.
- **Pre-cierre** (`reportes/pre-cierre-card.tsx`; sus tipos viven ahí):
  renglón NO bloqueante `vuelos_cobrados_de_mas`
  (`CLAVE_PRECIERRE_COBRADOS_DE_MAS`) con chips «#217 ($495.99) · IVA»
  (sufijo por causa; title «Posible causa: … Revisa la card de cobros del
  vuelo.») y «Resolver →» a los vuelos del periodo; los EXPLICADOS no
  cuentan: el `detalle` del API ya cierra con «Además hay N vuelo(s) con la
  diferencia explicada (…) que no requiere(n) acción.» y la línea gris dice
  CUÁLES («Con la diferencia explicada: #111 (redondeo del tipo de
  cambio).», hasta 10 folios y «y N más»; revisión del 15-oct-2026: antes
  empezaba también con «Además:» y parecían dos grupos de vuelos). En
  `cobros_bancarios_sin_conciliar` los parciales salen en ámbar («#315 ·
  parcial · faltan $1,700 MXN», hasta 8 y «y N más…»).
- **Vista previa del formulario** (`flights/cobro-form-sheet.tsx` +
  `vistaPreviaMontoCobro`, con la tolerancia de la bandera `cobrado`,
  $1.00). ALTA, contra el pendiente de la página: «Rebasa el pendiente por
  $56.99 USD: el vuelo quedará cobrado de más.» (caja ámbar) + «Si el
  depósito también pagó otro vuelo, registra aquí solo lo de este vuelo y el
  resto como cobro del otro; en Conciliación el depósito se vincula a los
  dos cobros.»; «Cubre el pendiente — el vuelo se marcará como cobrado.»;
  «Quedará pendiente $Y USD.». CORRECCIÓN, con el `monto_usd` del cobro que
  manda el snapshot: saldo SIN este cobro = (total − cobrado) + `monto_usd`
  y los mismos tres casos («Con este cambio el vuelo quedará cobrado de más
  por $X USD.»); sin `monto_usd`, «El saldo del vuelo se recalcula al
  guardar.». Vuelo cancelado, lo de siempre. Cotización ABIERTA (prop
  `cotizacionAbierta`) o total ≤ 0 ⇒ nunca «cobrado de más» (el API
  tampoco avisa). Los cinco montajes de `CobroFormSheet` la pasan
  (`cobros-card.tsx` ×2, `quote-cobros-card.tsx`, `quote-workspace.tsx` y,
  desde la revisión del 15-oct-2026, «Registrar cobro» de la Auditoría
  Paywise con `VueloParaCobro.cotizacion_abierta`, leída del snapshot).

### Diálogo «Vincular a un cobro o ingreso» con el veredicto del API (`al_vincular`)

- Cada candidato trae `al_vincular` (el veredicto del API para ESTE abono,
  espejo del trigger A) y `GET …/movimientos/:id/candidatos-cobro` trae las
  capacidades `movimiento.cobros_parciales` y `movimiento.corregir_comision`.
  Con UN cobro marcado, la guía de `ingresos/vincular-abono-dialog.tsx` es
  `guiaAlVincular`:
  - CONCILIADO (verde): «1 cobro: cuadra con el abono · el cobro del vuelo
    #315 queda conciliado.» o, si completa un parcial, «Con este abono el
    cobro del vuelo #315 queda completo ($3,400 MXN con 2 abonos).».
  - PARCIAL (ámbar): «Este abono ($1,700 MXN) es menor que lo que falta del
    cobro del vuelo #315 ($3,400 MXN): el cobro quedará conciliado parcial y
    faltarán $1,700 MXN. Cuando llegue el resto, vincúlalo a este mismo
    cobro.». El botón dice «Vincular como parcial…» y abre el AlertDialog
    «¿Vincular como pago parcial?» («Sí, vincular como parcial»): el API no
    se llama hasta confirmar (el API no exige bandera). Su cuerpo dice «… y
    seguirá en «Cobros sin banco» hasta que vincules el resto» SOLO si el
    método del cobro sale ahí (`saleEnCobrosSinBanco`); un BillPocket: «…
    hasta que vincules el resto (lo que falta se ve en la tarjeta de cobros
    del vuelo y en Ingresos)» (revisión del 15-oct-2026).
  - EXCEDE: botón APAGADO con el title «El abono rebasa este cobro: marca
    también el otro vuelo» y salidas de un clic: «Agregar el cobro del vuelo
    #332» (marca el sugerido del API, solo si está en la lista) y «Buscar
    $977.45» (escribe el excedente en el buscador).
  - COMISION_NO_CUADRA: apagado; «Corregir la comisión a $1,200 y vincular»
    SOLO con la capacidad del API, la `comision_real` que manda el API, el
    cobro sin otros abonos y el depósito ≤ monto (si no, no se ofrece);
    abre el AlertDialog «¿Corregir la comisión y vincular?» («Sí, corregir
    y vincular»; arriba de 15 % del cobro agrega «Ojo: la comisión real es
    mayor que 15 % del cobro…»). Es dinero: SIEMPRE se confirma.
  - YA_CUBIERTO, UN_SOLO_ABONO, MONEDA_DISTINTA y SOBRE_NO_CUADRA: apagado y
    la razón a la vista (los candidatos no traen texto: el panel arma la
    frase con los números del API; un 409 se pinta con el texto del API).
  - **EXCEPCIÓN deliberada a «la guía nunca apaga el botón»**: solo con UN
    cobro marcado, porque es el veredicto del API para ese abono. Apagado por
    el veredicto, el botón queda ENFOCABLE (`focusableWhenDisabled` de Base
    UI: `aria-disabled`, sin `disabled` nativo; se atenúan relleno y texto
    —`aria-disabled:bg-primary/50`, `…:text-primary-foreground/70`— y NO el
    elemento: con `opacity` el anillo de foco quedaba a 1.13:1, y su foco
    lleva `aria-disabled:focus-visible:ring-ring`, revisión 2;
    sigue en el Tab y el lector anuncia su `aria-describedby` a la guía; Base
    UI no dispara el clic) dentro de un `<span title>` con la razón; apagado
    por «nada marcado» o «vinculando», el `disabled` de siempre. Con 2+
    cobros la suma del lote va por lo que le FALTA a cada uno (con un
    parcial marcado lo dice: «2 cobros suman $X (lo que le falta a cada
    uno) · …») y NUNCA apaga: manda el 409 `ABONO_NO_CUADRA`.
  - **Accesibilidad** (revisión del 15-oct-2026): una región viva
    PERMANENTE (`<p className="sr-only" aria-live="polite" aria-atomic="true">`,
    montada con el diálogo) dice el veredicto o la suma al marcar; la guía ya
    no lleva `aria-live` (nacía con su texto y no se anunciaba). «Agregar el
    cobro del vuelo #332» pasa el foco al botón principal ANTES de marcar (la
    guía se desmonta con 2 cobros y el foco caía al contenedor: el siguiente
    Tab iba al buscador). Revisión 2 (15-oct-2026): nada de `truncate` en
    la lista (un celular no tiene hover para el `title`): la etiqueta
    envuelve (con `title`), la descripción va a 2 renglones con su `title` y
    lo del 0.0.78 («ya conciliado … · falta $1,700 · cuadra exacto con lo
    que falta» o «diferencia …») va en SU renglón (`desc.estado`), como la
    línea corta. El rojo es `text-destructive dark:text-red-400` (AA en
    oscuro, también en la guía del diálogo legado).
  - **Confirmaciones de dinero anidadas** (`ConfirmacionVincular`, aquí, en
    el legado y en «Sugerencias»; también «¿Aceptar las propuestas
    marcadas?»): `AlertDialogContent backdropForceRender` — Base UI 1.4 no
    pinta el backdrop de un diálogo anidado y el de abajo seguía recibiendo
    clics (revisión 2). Y van LIGADAS al candidato: `confirmar` = `{ tipo,
    clave }` y se abre solo si `confirmacionVigente(confirmar,
    claveMarcada)`; marcar/desmarcar o recargar la suelta (antes reaparecía
    sola al volver a marcar el mismo cobro).
  - **Sin la capacidad** (`movimiento.cobros_parciales === false`: API
    0.0.78 sin la migración o tras su reversa): un PARCIAL nuevo se APAGA
    con `RAZON_BLOQUEO_PARCIAL_SIN_CAPACIDAD` y su guía dice que el resto ya
    no se podría vincular («avisa a sistemas»; `guiaAlVincular(…, {
    cobrosParciales })`); la línea corta deja de prometer «faltarían…»; en
    el diálogo legado igual (la capacidad sale de su `candidatos-cobro`) y
    `pasoPropuestaCobro` lo manda a mano (revisión 2: antes prometía «vincúlalo
    a este mismo cobro» y el 2.º abono no aparecía en ningún candidato).
- Bajo cada candidato, `lineaCortaAlVincular` («si lo vinculas, queda
  parcial: faltarían $1,700 MXN», «el abono rebasa este cobro por $977.45
  MXN», …; con 2+ marcados NO en los marcados —`enLote`—: ahí manda la suma
  del lote, revisión 2); un candidato parcial dice «ya conciliado $1,700 de $3,400 (1
  abono) · falta $1,700» y «cuadra exacto con lo que falta». La nota bajo la
  lista es `notaVariosCobros(cobros_parciales)`: con la capacidad explica
  que un cobro pagado en varias transferencias se vincula transferencia por
  transferencia; sin ella, la de siempre.
- **Recarga**: los candidatos se piden al abrir y tras CUALQUIER 409
  (conservando lo marcado, salvo los errores con `recargar`), NO al cambiar
  el buscador (filtra en local: el endpoint no busca por texto).
- **`corregir_comision: true`** viaja SOLO desde esa salida: tercer
  argumento `{ corregirComision }` de `ligarAbonoCobroAction` /
  `ligarAbonoCobrosAction` (con UN cobro); el 400 «property
  corregir_comision should not exist» de un API previo ⇒
  `API_SIN_CORREGIR_COMISION`.
- **Errores** (`mensajeErrorVincularCobros`, el texto del API cuando es
  claro): `ABONO_EXCEDE_COBRO` (+ «Marca también el cobro del vuelo #332 en
  la lista (busca $977.45).»), `COMISION_NO_CUADRA`, `COBRO_MONEDA_DISTINTA`,
  `SOBRE_NO_CUADRA`, `CORREGIR_COMISION_NO_APLICA` (suelta lo marcado), el
  503 `CONCILIACION_COBROS_PARCIALES_NO_DISPONIBLE` (sin la migración) y
  `SIN_CONEXION` ⇒ «No se pudo confirmar si el abono quedó vinculado…»
  (jamás «no se vinculó»). Con `details.comision_corregida`, con cualquier
  código, la comisión del cobro YA cambió. Con «Corregir la comisión» un
  fallo SIN veredicto del API (`respuestaSinVeredicto`: un 5xx sin código de
  negocio —el `ERROR` del filtro del API, que solo anota la comisión en los
  HttpException—, `PARSE_ERROR`, sin respuesta o un texto de red) es
  INCIERTO: `MSG_COMISION_INCIERTA` («No se pudo confirmar si la comisión
  del cobro y la liga quedaron…»), la lista se vuelve a pedir y la página
  se pone al día al cerrar (`mensajeErrorVincularCobros(r, {
  corrigiendoComision })`, revisión del 15-oct-2026).
- **Toasts** (de `cobros_estado[]` y `comision_corregida`): «Abono
  vinculado: el cobro del vuelo #315 queda conciliado PARCIAL (faltan $1,700
  MXN).» con la acción «Buscar el abono que falta» (pestaña nueva), «… quedó
  conciliado completo con 2 abonos.» y «Comisión corregida a $1,200 y abono
  vinculado: el cobro del vuelo #293 quedó conciliado.».
- **Refresco**: el diálogo NO llama `router.refresh()` al ligar: cierra y la
  página se pone al día UNA vez al cerrar (`refrescarAlCerrarRef`), también
  si la comisión cambió y la liga falló o si no hubo respuesta. Las actions
  de ligar revalidan Ingresos, Conciliación y los vuelos de `cobro` y
  `cobros_estado[]`; toda llamada va con `.catch` y `enviandoRef` impide una
  doble liga.
- **Diálogo LEGADO** de Conciliación (sin los catálogos de Ingresos,
  `conciliacion/movimiento-actions.tsx`): la misma guía sin salidas de un
  clic (`conAcciones: false`) + «Para marcar varios cobros o corregir la
  comisión desde aquí, usa «Conciliar en Ingresos».» en EXCEDE o
  COMISION_NO_CUADRA, la MISMA `ConfirmacionVincular` para el parcial —
  DENTRO de su `DialogContent` (revisión del 15-oct-2026: como hermana del
  `Dialog`, Base UI no la anidaba y un Esc con el foco fuera de ella cerraba
  también «Vincular cobro» y soltaba lo elegido)— y sus 409 por
  `mensajeErrorVincularCobros` (vuelve a pedir la lista). Toda server action
  del menú va con `.catch(sinConexion)` (vincular, desvincular, quitar el
  reverso y los candidatos): sin respuesta, la liga dice `MSG_VINCULO_INCIERTO`,
  vuelve a pedir la lista y refresca al CERRAR el diálogo
  (`refrescarAlCerrarLinkRef`, que consume `cerrarVincular()` —«Cancelar»,
  Esc/X/clic fuera y el éxito—: Base UI no llama `onOpenChange` al cambiar el
  `open` controlado, así que «Cancelar» con `setOpenLink(false)` directo se
  saltaba el refresco; revisión 2); si la búsqueda de candidatos FALLA,
  `textoCandidatosCobroNoCargaron` con «Reintentar» en vez del select vacío
  «Sin cobros ni sobres candidatos» (jamás «sin datos» cuando la carga
  falló); desvincular dice `MSG_DESVINCULO_INCIERTO`
  («No se pudo confirmar si el movimiento quedó desvinculado…»), cierra la
  confirmación y refresca. Antes un `await` desnudo en `startTransition`
  mandaba Conciliación entera al error boundary.
- **Propuestas LIGAR de la IA a un cobro** (revisión del 15-oct-2026, D3;
  antes «riesgo conocido»): `aceptarPropuestaAbonoAction` lee ANTES
  `candidatos-cobro` del abono (±30 días, `VENTANA_PROPUESTA_DIAS`) y decide
  con `pasoPropuestaCobro` (`lib/admin/conciliacion-cobros-lote.ts`, al
  final): CONCILIADO ⇒ liga; PARCIAL ⇒ `CONFIRMAR_PARCIAL` con el cobro en
  `details.candidato` y NADA escrito — la ventana de sugerencias abre la
  MISMA `ConfirmacionVincular` («¿Vincular como pago parcial?», números del
  API) y vuelve con `{ parcialConfirmado: true }` (toast de
  `toastVinculoCobros`: «… queda conciliado PARCIAL (faltan $X)»); un rechazo
  (EXCEDE, COMISION_NO_CUADRA…) o el cobro que ya no es candidato ⇒
  `PROPUESTA_A_MANO` con la razón de `guiaAlVincular` y «revísalo a mano con
  «Vincular a un cobro o ingreso»» (sin PATCH); sin poder leer el veredicto ⇒
  `PROPUESTA_SIN_VEREDICTO` («No se vinculó nada») SOLO si no hubo respuesta
  (`respuestaSinVeredicto`); un 4xx de esa lectura (sesión vencida, abono que
  ya no existe) sale con su texto + «No se vinculó nada.», su `code` y
  `status` (`errorLecturaPropuesta`, revisión 2); con `cobros_parciales:
  false` un PARCIAL va a mano; API ≤ 0.0.77 (sin
  `cobros_parciales`) ⇒ la liga de siempre. Vale también para «Vincular a
  esta» de las alternativas. En «Aceptar las marcadas» una liga a un COBRO
  solo entra con `monto_exacto` (`aceptableEnLote`): las demás, de una en
  una con su «Aceptar». Un sobre o un ingreso ligan directo (el API los
  rechaza con su 409: no hay parcial silencioso). «Vincular» desde el 409
  `ABONO_TIENE_COBRO_CANDIDATO` de `registrar-ingreso-dialog` sigue sin leer
  `al_vincular`: el API solo ofrece ahí cobros que CUADRAN con el abono (su
  neto o bruto a ≤ $1.00, o el faltante exacto de un parcial), así que no
  deja un parcial. Desde el API 0.0.79 un candidato que cuadra solo por el
  BRUTO y cuya liga directa rebotaría trae `liga_no_cuadra`
  (COMISION_NO_CUADRA | SOBRE_NO_CUADRA) y `comision_real`
  (`candidatosDeConflicto`): ese candidato NO ofrece «Vincular a este
  cobro» y dice qué corregir (`textoLigaNoCuadraConflicto`). Pendiente (no
  bloquea): ofrecer ahí «Corregir la comisión a $X y vincular» con su
  confirmación.

### Bandeja, desvincular, «Cobros sin banco» y Paywise

- **Bandeja** (`conciliacion/movimientos-table.tsx`, solo las ramas de
  cobro de la columna «Conciliación»; el `searchText` de la tabla no se
  tocó y el `useMemo` de columnas ganó la dependencia `cobroResaltado`): el
  abono de UN cobro (`LigaCobroDeVuelo`) gana una tercera línea,
  `lineaCobroUnicoBandeja`: «Pago parcial: este abono $1,700 de $3,400 ·
  faltan $1,700 MXN» (ámbar) o «Completa el cobro junto con 1 abono más»
  (gris); en un lote cada línea lleva el estado de SU cobro
  (`sufijoEstadoCobroLote`) en SU renglón, sin cortar: `sufijo.linea`
  «Parcial: faltan $X» (ámbar) / «Completa el cobro (2 abonos)» (gris)
  (revisión del 15-oct-2026: pegado a la secundaria de 240 px, la elipsis se
  comía lo que falta; la secundaria cortada lleva en su `title` el texto
  completo con `sufijo.texto` «· parcial: faltan $X»). La hoja de una
  entrada sigue con `sufijo.texto` pegado (allá no se corta). La búsqueda
  rápida encuentra «parcial» y el folio por `textoBusquedaCobros`.
- **Desvincular** suelta ESE abono: si el cobro tiene otros
  (`abonoConOtrosAbonosDelCobro`, por `cobro_conciliacion.abonos_n`) el menú
  dice «Desvincular este abono del cobro» y la confirmación «¿Desvincular
  este abono del cobro?» avisa ANTES cómo queda, con `faltante_sin_este`
  del API («El abono de $1,700 MXN del 15 sep 2026 vuelve a quedar
  pendiente. El cobro del vuelo #315 sigue ligado a 1 abono más y queda
  «Conciliado parcial»: faltarán $1,700 MXN. No se borra ningún cobro.»);
  si era el único, «El cobro del vuelo #315 vuelve a «Cobros sin banco».»
  SOLO si su método sale ahí (`textoCobroVuelveASinBanco(conc,
  movimiento.cobro?.metodo_cobro)`: un BillPocket —el API lo deja
  NO_BANCARIO— o sin el método, nada); en un lote, «… vuelven a «Cobros sin
  banco»» SOLO si todos sus cobros salen ahí (si no, «… quedan libres para
  vincularse con otro movimiento»: `textoConfirmarDesvincularCobros(n,
  movimiento.cobros)`) y «Los cobros que tienen otros abonos quedan como
  «Conciliado parcial».». El toast lee `cobros_liberados[]`
  (`toastDesvinculoCobros`; sin la llave, el de siempre).
  `cobros_liberados` no trae `vuelo_id`: desvincular revalida Conciliación
  e Ingresos, no el vuelo de cada cobro liberado.
- **«Cobros sin banco»** (`conciliacion/cobros-sin-banco-table.tsx`; desde el
  0.0.78 son los NO cubiertos, parciales incluidos): columna «Banco» (solo
  si el API manda `parcial`) con «Parcial» ámbar (title «Conciliado $1,700
  MXN de $3,400 MXN con 1 abono (15 sep 2026): faltan $1,700 MXN.») y «Ver
  abono» (con `dark:text-brand-400`: el brand-600 sobre la tarjeta oscura
  daba 3.03:1), o «Sin abono» gris; el «Neto esperado» de un parcial dice
  «$1,700.00 falta (de $3,400.00)» y arriba de la tabla, «N con pago
  parcial: un abono cubre solo una parte; el resto sigue pendiente.». El
  ENCABEZADO de la pestaña es `encabezadoCobrosSinBanco` (`cobro-banco.ts`,
  revisión del 15-oct-2026): con el API 0.0.78 (`parciales` numérico) el
  título «Cobros que el banco todavía no respalda por completo», la
  descripción «… sin ningún abono importado ligado, o con abonos que todavía
  no los completan …» y la cifra «Falta en el banco: $1,700.00 MXN» =
  `por_moneda[].faltante` del API (de un parcial, lo que le falta; de uno
  sin abonos, su neto). Antes decía «Sin cruzar: $3,400.00 MXN» con
  `monto` (Σ BRUTA de las filas, parciales incluidos) junto a una fila que
  decía «$1,700.00 falta». Con un API previo, los textos y la cifra de
  siempre. «Gastos sin banco» sigue con su «Faltan:» = Σ de `monto` (el API
  no manda el faltante por moneda; el panel no suma).
- **Auditoría Paywise**: «N depósitos de Paywise pagan varios cobros (lote):
  quedan fuera del cruce automático; revísalos en la bandeja.»
  (`textoPaywiseEnLote`, de `resumen.movimientos_en_lote`).
- **Tipos ADITIVOS** (bloques propios al final): `types/flights.ts`
  (`EstadoBancoCobro`, `AbonoBancoDeCobro`, `CausaCobradoDeMas`,
  `CobradoDeMasVuelo`; `FlightCobro` gana `conciliacion_estado`,
  `ligado_banco`, `neto_banco`, `monto_vinculado`, `faltante`, `sobrante`,
  `abonos_banco` y `monto_usd`, y el snapshot `cobrado_de_mas`),
  `types/conciliacion.ts` (`AlVincularCobro`, `SugeridoCobro`,
  `AlVincularSobreGrupo`, `AbonoDeCobroCorto`, `CobroConciliacionDeAbono`,
  `CobroLiberado`, `ComisionCorregida` y los opcionales de
  `MovimientoBancario`, `MovimientoCobroParte`, `CandidatoCobroVuelo`,
  `CobroSinBanco` y la respuesta de candidatos) y `types/ingresos.ts`
  (`ParcialEntrada`).
- **Pruebas**: `lib/admin/__tests__/cobro-banco.test.ts`,
  `cobrado-de-mas.test.ts`, `conciliacion-cobros-lote.test.ts`,
  `cobro-edicion.test.ts`; `components/admin/flights/__tests__/cobros-card-banco.test.tsx`
  (badge, renglón, aviso y el cableado de `cotizacionAbierta` y
  `monto_usd`) y `cobrado-de-mas-aviso.test.tsx`;
  `components/admin/reportes/__tests__/pre-cierre-cobrados-de-mas.test.tsx`;
  `components/admin/ingresos/__tests__/entradas-parcial.test.tsx`,
  `vincular-abono-parcial.test.tsx` y `vincular-abono-lote.test.tsx`;
  `components/admin/conciliacion/__tests__/cobros-parciales-bandeja.test.tsx`
  y `cobros-sin-banco-table.test.tsx`;
  `app/admin/ingresos/__tests__/aceptar-propuesta-cobro.test.ts` (la IA y
  el veredicto antes de ligar). El runner no tiene DOM: el diálogo
  se prueba pintando sus piezas exportadas (`GuiaVincularAbono`,
  `BotonVincularConGuia`, `ConfirmacionVincular`) y leyendo el cableado.
- **Pendientes**: sin QA visual en navegador (lector de pantalla incluido).

## Ingresos: «Conciliado» abre su conciliación con el banco (14-oct-2026, API 0.0.78)

Pedido textual: «y me hace falta que si doy clic en Conciliado vea el
detalle de con qué estado de cuenta se concilio y sus detalles». Gemela de
la de Gastos («Gastos: «conciliación al revés» desde el badge «Banco»»):
desde un COBRO de vuelo (también la parte de un sobre o el cobro de un
anticipo) o un INGRESO, sus abonos del banco con la cuenta, el estado de
cuenta de origen, lo que aporta cada uno, el lote que pagó, quién registró
la liga y, si sigue pendiente, «¿Qué hacer?». Contrato: invariante 78 del
API, `GET /v1/conciliacion/cobros/:id` y `GET /v1/conciliacion/ingresos/:id`
(ADMIN y FACTURACION, solo lectura, SIN migración).

- **Fuentes únicas (PURAS, con prueba)**: `lib/admin/entrada-banco.ts`
  (filas, encabezado, la frase del estado —17 ramas—, la línea de la
  comisión, las alertas, la ficha de cada abono, el lote, «¿Qué hacer?», la
  cobertura importada, URLs y errores), `lib/admin/hoja-banco.ts` (lo común
  con Gastos), `lib/admin/ingresos-ui.ts` (`etiquetaEstadoConciliacion(estado,
  contexto?)` —el contexto solo cambia el title de «No se concilia uno a
  uno» por método—, `tituloConClic`, `TITULO_SIN_CONCILIAR_ENTRADA` y
  `hrefPorConciliarIngreso`), `lib/admin/cobros.ts`
  (`esCuentaCobroPasarela`: la ÚNICA inferencia por el texto libre
  `cuenta_destino`) y la ruta: `conciliacionDeEntrada`
  (`lib/api/conciliacion-server.ts`) + `conciliacionDeEntradaAction` (al
  final de `app/admin/conciliacion/actions.ts`: origen y uuid antes de la
  red ⇒ `ENTRADA_INVALIDA`; 404 «Cannot GET» ⇒ `RUTA_NO_DISPONIBLE`;
  conserva code, status y details; nunca lanza; NO revalida). Tipos 1:1 con
  el API en `types/conciliacion-entrada.ts` (archivo propio).
  `MSG_ENTRADA_INVALIDA` vive en `entrada-banco.ts`: un archivo «use server»
  solo exporta funciones async.
- **La regla**: el panel JAMÁS suma. Estado (5 valores), cobertura, lo que
  aporta cada abono, la diferencia del lote, el cuadre de un ingreso, el
  T.C. implícito de un cruce, los otros cobros del día con su `suma_netos`,
  `cruce_no_corrio` y `varios_abonos_por_cobro` vienen del API. Nunca se
  pintan el número de cuenta, la CLABE ni el `storage_path`.
- **Roles**: `puedeVerDetalleBanco` (ADMIN, FACTURACION; sin rol conocido se
  ofrece: el 403 del API trae texto). Para los demás roles el badge queda
  como antes.
- **Qué badge es botón** (`abreDetalleEntrada`): Conciliado, Conciliado vía
  anticipo, Sin conciliar (también el de un parcial de Ingresos; el chip
  «Parcial · faltan $X» de al lado NO) y, en las tarjetas, «Conciliado
  parcial · faltan $X». «No se concilia uno a uno», «—» y un ingreso dado de
  baja, nunca. Botón = `Badge` con `render={<button aria-haspopup="dialog">}`,
  las mismas clases + `cursor-pointer`, el title de siempre + qué hace el
  clic (« Clic para ver el abono del banco y su estado de cuenta.» / « Clic
  para ver los abonos y buscar el que falta.» / « Clic para ver por qué y
  buscar el abono.»; el de un parcial de Ingresos es
  `TITULO_SIN_CONCILIAR_PARCIAL_ENTRADA`, no el de «Ningún abono…»: ver la
  sección anterior) y un nombre accesible que EMPIEZA con el texto visible
  («Conciliado: ver la conciliación con el banco del cobro del vuelo #332 de
  $977.45 del 15 sep 2026»; en la tarjeta, «… del cobro de $977.45 …»). La
  columna lleva `noLink`.
- **Dónde**: Ingresos «Todos» / «Cobros de vuelos» (`EntradasTable` +
  `CeldaConciliacionEntrada`), «Otros ingresos» y «Anticipos»
  (`CeldaConciliacionIngreso`), «Depósitos de vuelos que aún no vuelan»
  (`DepositosPorVolarTable`: sus columnas pasaron de constante de módulo a
  `useMemo`) y las tarjetas «Cobros» del vuelo y de la cotización
  (`CobroConciliadoBadge` con `alAbrir`). La página de Ingresos pasa `rol`.
- **La hoja** (`ingresos/entrada-banco-sheet.tsx`, UNA por tabla y por
  tarjeta): `useDetalleBancoEntrada` = el hook GENÉRICO
  `components/admin/banco/use-detalle-banco.ts` (turno, `.catch`, cerrar sin
  vaciar, la descarga del estado de cuenta en el MISMO clic); el cuerpo
  PRESENTACIONAL `ingresos/entrada-banco-detalle.tsx` se carga con
  `next/dynamic` sin SSR al primer clic (`EntradaBancoDetalleDinamico`) y
  comparte con Gastos el marcado de `components/admin/banco/partes-hoja.tsx`
  (`EnlaceNuevaPestana` con `dark:text-brand-400`: el admin vive en oscuro y
  el brand-600 sobre la hoja daba 3.03:1; revisión del 15-oct-2026).
  Encabezado: «Vuelo #332 · Cobro de vuelo · $977.45 · 15 sep 2026 · Beh
  Kay», «Cobrado con: …» / «Entró a: …» y «Registró el cobro: Itzi · 8 oct
  2026, 1:43 p.m.». Cuerpo: la frase del estado, la línea de la comisión,
  las alertas (ABONO_CON_SOBRANTE con `textoSobranteCobro`, la MISMA función
  del renglón «Banco»), una ficha por abono (fecha y monto, cuenta y si es
  pasarela, leyenda, lo que aporta, el T.C. implícito de un cruce, el lote
  con `lineaCobroLote` —la misma línea de la bandeja— y «(este cobro)» sin
  enlace, el estado de cuenta con «Descargar» o el motivo real de que no
  haya archivo, quién ligó y «Ver en Conciliación»). «Registró la liga» de
  un cobro solo desde el 12-oct-2026 00:00 Cancún («Liga anterior al 12 oct
  2026: el sistema todavía no guardaba quién la hizo.»).
- **«¿Qué hacer?»** (SIN_CONCILIAR, PARCIAL o conciliado sin abonos;
  `accionesPendienteEntrada`): la intro del cruce automático; el aviso de
  `cruce_no_corrio` («Este cobro se registró el 8 oct 2026, 1:43 p.m.,
  cuando ya estaban importados 4 abonos pendientes de esas fechas: …» +
  «Abrir Conciliación del 05 oct 2026 al 11 oct 2026»); los otros cobros
  del cliente ese día («Ese día Palma tiene 1 cobro más sin conciliar: Vuelo
  #380 · $29,540.50. Si los pagó juntos, el abono trae la suma de los
  netos: $59,081.00.» + «Buscar un abono por $59,081.00 (los 2 cobros del
  día)»); las causas que aplican (la de «varias transferencias» solo con
  `varios_abonos_por_cobro`); notas (USD, Paywise y la cuenta capturada
  «Paywise» con otro método); las búsquedas («Buscar el abono en
  Conciliación», «Buscar el abono que falta en Conciliación», «Ver los
  abonos ya conciliados de esas fechas», «Ver los omitidos de esas fechas»,
  «Ir a Auditoría Paywise», «Conciliarlo en «Por conciliar»» y las del
  sobre y el anticipo) y qué hay importado por cuenta («Movimientos
  importados por cuenta: HSBC USD del 01 sep 2026 al 06 oct 2026.»). Todas
  las ligas en pestaña nueva.
- **Las URLs al abono son las del 0.0.78**: «Ver en Conciliación» y «Buscar
  el abono que falta» REUTILIZAN `hrefAbonoDeCobro(a, { cobroId })` y
  `hrefBuscarAbonoQueFalta({ dia, faltante })` de `cobro-banco.ts`; no hay
  otro constructor de esas URLs. Conciliación acepta `?cobro=`
  (`PARAM_COBRO_FOCO`): la línea de ese cobro dentro del lote del abono se
  resalta con « · el que abriste» aunque fuera la 4.ª
  (`resumenLoteCobrosFila(m, { destacar })`), la franja dice «Primero en la
  lista y resaltado: el abono del 15 sep 2026 por $69,183.00 (EJE SCOTIA)
  que abriste.» y, si no está en la vista, el aviso genérico
  (`textoMovimientoNoEncontrado`).
- **El detalle `?ingreso=`** (`ingresos/ingreso-detalle-sheet.tsx`): para
  ADMIN/FACTURACION, si no es efectivo ni está dado de baja, EMBEBE el
  cuerpo con el MODO CONTROLADO del hook (`fija`: la carga se deriva de la
  llave —`claveEntradaConAbono` = `claveEntradaControlada` de
  `entrada-banco.ts`: origen, id, el abono, la cuenta, el día, el monto, el
  NETO (el `neto` del API: `EntradaBancoFila.neto`; revisión 2 del
  15-oct-2026, editar SOLO la comisión dejaba «al banco debe llegar el neto:
  $9,650» y «Ver los abonos ya conciliados» con el neto viejo), la moneda y
  el estado— y el único setState va en el `.then`, porque
  `react-hooks/set-state-in-effect` es ERROR); tras «Desvincular del abono»
  o tras «Editar» la cuenta, la fecha, el monto o la comisión en el MISMO detalle, el
  `router.refresh()` cambia la llave y el cuerpo se vuelve a pedir (revisión
  del 15-oct-2026: con solo ingreso + abono la edición dejaba la cobertura,
  las ventanas y «Conciliarlo en «Por conciliar»» de la cuenta vieja). Con
  un API ≤ 0.0.77 (`RUTA_NO_DISPONIBLE`) vuelve el bloque de siempre. Sin
  abono y sin la hoja (COORDINADOR): `TEXTO_INGRESO_SIN_ABONO` + «lo
  concilia Administración o Facturación». Sus acciones de dinero
  («Desvincular del abono», «Desaplicar», «Quitar comprobante») van con
  `.catch(sinConexion)`: sin respuesta, `textoAccionIngresoIncierta` («No se
  pudo confirmar si…») y la página al día, jamás el error boundary (revisión
  2 del 15-oct-2026).
- **Errores** (`mensajeErrorDetalleEntrada`; jamás «sin abonos» cuando la
  carga falló): API previo ⇒ «El servidor todavía no tiene este detalle
  (falta actualizar el API). Mientras, búscalo en Conciliación.» con la
  búsqueda armada desde la fila (`hrefBuscarDesdeFila`); 403 «Solo
  Administración y Facturación ven el detalle del banco.»; 404 «Ese cobro
  ya no existe: recarga la página.» (o «Ese ingreso…»); 503
  `INGRESOS_NO_DISPONIBLE` con el texto del API y «Reintentar»; 401 «Tu
  sesión expiró…»; lo demás, «No se pudo cargar el detalle del banco.
  Vuelve a intentarlo.» + «Reintentar». Si el estado del API ya no es el de
  la fila: «El estado cambió desde que abriste la página: recarga para ver
  la lista al día.» + «Recargar», que en la HOJA la CIERRA y pone la lista
  al día (`detalle.cerrar(); router.refresh()`; revisión del 15-oct-2026: el
  hook guarda la fila del clic y un refresh solo no la cambiaba —la franja
  nunca se iba—; igual en la hoja de Gastos). En el detalle `?ingreso=`
  basta el refresh (la fila es la de la lista).
- **Pruebas**: `lib/admin/__tests__/entrada-banco.test.ts` (respuestas
  reales en `entrada-banco.fixtures.ts`), `entrada-banco-omitidos.test.ts`,
  `hoja-banco.test.ts`, `cobros.test.ts`, `ingresos-ui.test.ts`,
  `conciliacion-vista.test.ts` y `cobro-banco.test.ts`;
  `components/admin/banco/__tests__/use-detalle-banco.test.ts`;
  `components/admin/ingresos/__tests__/entrada-banco-detalle.test.tsx`,
  `badge-estado-conciliacion.test.tsx` y `entrada-banco-cableado.test.ts`;
  `app/admin/conciliacion/__tests__/conciliacion-entrada-action.test.ts`;
  `components/admin/conciliacion/__tests__/enfoque.test.tsx`. Gastos sin
  cambios de comportamiento (`gasto-banco.test.ts`,
  `gasto-banco-sheet.test.tsx`); `banco-cableado.test.ts` se reapuntó al
  hook genérico. **Toda prueba que monte `CobrosCard` o `QuoteCobrosCard`
  mockea `@/app/admin/conciliacion/actions`**: la tarjeta importa la hoja y
  esa cadena llega a `@/lib/env`, que truena al importarse en vitest.

## Skew del lote 0.0.78: API previo, migración pendiente y panel viejo

- **Todo campo nuevo es OPCIONAL**: con un API ≤ 0.0.77 no viene y la
  pantalla queda como hoy: `conciliado` ⇒ «Conciliado» y nada más (sin «Sin
  conciliar», sin renglón «Banco», sin chip «Parcial»), sin aviso de
  «Cobrado de más», la corrección de un cobro dice «El saldo del vuelo se
  recalcula al guardar», el diálogo «Vincular» pinta la guía de siempre
  (sin `al_vincular`) y no ofrece «Corregir la comisión» (sin la capacidad;
  si viajara, el 400 de `forbidNonWhitelisted` ⇒
  `API_SIN_CORREGIR_COMISION`), «Cobros sin banco» va sin la columna
  «Banco» y con su encabezado de siempre («Sin cruzar: …», sin
  `parciales` ni `faltante`), aceptar una propuesta LIGAR de la IA liga como
  siempre (sin `cobros_parciales` no existe el parcial) y los toasts son los
  de siempre.
- **Una ruta nueva que responde 404 «Cannot GET»** (la hoja de una entrada)
  dice «El servidor todavía no tiene este detalle (falta actualizar el
  API). Mientras, búscalo en Conciliación.» con la búsqueda: jamás un error
  genérico ni «sin datos». El detalle `?ingreso=` vuelve al bloque de
  siempre.
- **API 0.0.78 sin la migración `20261014000003`** (o antes de reiniciarlo):
  `cobros_parciales: false` ⇒ el diálogo no recibe como candidatos los
  cobros que ya tienen abonos y pinta la nota de siempre; un PARCIAL nuevo
  se apaga con su razón (no se promete completarlo); un segundo abono a
  un parcial responde el 503 `CONCILIACION_COBROS_PARCIALES_NO_DISPONIBLE`
  con su texto. Las lecturas (estados, parciales, «Cobrado de más» y la
  hoja) ya funcionan.
- **Panel viejo con el API 0.0.78**: un parcial pierde su badge verde (dice
  la verdad) y su «Editar» puede ofrecer el dinero de un parcial ⇒ 409
  `COBRO_CONCILIADO` con texto (nada se escribe). Por eso el panel va
  enseguida.
- **Orden de deploy**: API 0.0.78 → migración `20261014000003` por el SQL
  Editor → reinicio del API (o ≤ 10 min) → humo como ADMIN → panel (push a
  `main`, después del API y en cuanto se pueda). El aviso a la oficina de
  «Conciliado parcial» y de «Cobrado de más» en la tarjeta va SOLO con el
  panel en prod.

## Nómina: un espacio propio (15-oct-2026)

Pedido del cliente (textual): «Necesitamos un nuevo espacio debajo de Gastos
y Otros Gastos que se llame Nomina para tener en ese apartado todo lo de
nomina». Fase 1, **solo panel**: sin API ni migración (el DTO de
`GET /v1/expenses` y de `/v1/expenses/export` ya aceptaba `categoria`,
`desde` y `hasta`). En prod (15-oct-2026) hay 17 gastos NOMINA, todos MXN,
sin vuelo, avión ni proveedor: sueldos quincenales del personal y de los
pilotos (la persona va en las NOTAS), una cuota IMSS/INFONAVIT y la asesoría
de la nómina; medios TRANSFERENCIA, PAYWISE y EFECTIVO.

- **Las reglas del dinero son del API** (SUPERSEDIDO en parte el
  16-oct-2026, invariante 91 del API — ver «Nómina: fuera de Gastos y
  reparto en partes iguales» justo abajo): «Nómina» (`NOMINA`) sigue en
  `CATEGORIAS_GASTO_EMPRESA` pero SIN reparto ya no va a la hoja «otros
  gastos» del Balance general ni a ningún libro: solo REPARTIDA entra al
  balance de cada avión y a su reparto; no pide avión (no es pendiente de la
  bandeja: la columna «Avión · vuelo» dice «Sin repartir»). La fecha del
  gasto es la del PAGO (decisión del 13-oct-2026).
- **Menú** (`lib/admin/nav-items.ts`): «Nómina» (`/admin/nomina`,
  `UserGroupIcon`) JUSTO después de «Otros gastos» y antes de «Gastos
  personales», con los MISMOS roles de «Gastos» y «Otros gastos» (ADMIN,
  COORDINADOR, FACTURACION: ya enseñan esos gastos, no se abre exposición
  nueva). Etiqueta y roles salen de la fuente única (`TITULO_NOMINA`,
  `[...ROLES_NOMINA]`). Pestaña del navegador: título FIJO
  `TITULOS_SECCION.nomina` («Nómina») + `RUTA_SECCION.nomina`, con su
  renglón en la guardiana `titulos-pestana-cableado.test.ts`.
- **Fuente única PURA** `lib/admin/nomina.ts` (sin React ni red, porque la
  importa también el menú; solo importa módulos puros: `lib/datetime`,
  `lib/format`, `lib/admin/medios-pago` y, desde la revisión del
  15-oct-2026, `lib/admin/gasto-acciones` y `lib/admin/url-params` —que a
  su vez solo trae `estado-vuelo`, también puro—): `CATEGORIA_NOMINA`, `ROLES_NOMINA`,
  `puedeVerNomina`; el mes (`mesNominaDeUrl`: «YYYY-MM» con mes 01–12 y
  año 2000–2100, cualquier otra cosa se IGNORA y vale el mes de hoy en
  Cancún —regla de `url-params`, nunca un 400 ni un throw—,
  `rangoMesNomina` con el último día REAL por aritmética de calendario,
  sin `Date` con zona; `etiquetaMesNomina` con `MESES_LARGOS_ES`;
  `mesesVecinos` con cruce de año; `esMesFuturoNomina`); la quincena
  (`quincenaDeFecha` por el TEXTO del día —jamás `new Date` sobre
  «YYYY-MM-DD», que en UTC−5 corre el día— y `etiquetaQuincena` «1ª
  quincena · 1–15 oct» / «2ª quincena · 16–31 oct»); el dinero
  (`centavosDeMonto`, `resumenNomina`, `montoNomina` con `fmtMonto`,
  `etiquetaMedioNomina` con `medios-pago`); enlaces y Excel
  (`hrefMesNomina`, `queryExcelNomina`, `nombreExcelNomina` =
  «nomina-2026-10.xlsx»; `hrefGastosNomina` se retiró el 16-oct-2026) y
  TODOS los textos de la
  pantalla. Ningún componente los redacta.
- **El panel solo SUMA lo ya registrado**: `resumenNomina` suma en
  CENTAVOS enteros (el texto de PostgREST se lee dígito a dígito: 0.1 + 0.2
  = 0.30 exacto) y POR MONEDA (MXN, USD, el resto; jamás una suma entre
  monedas). Total del mes, pagos, desglose por medio de pago (de mayor a
  menor dentro de cada moneda) y las dos quincenas. Un monto ilegible cuenta
  0 (el pago sí se cuenta) y una fecha ilegible no cae en ninguna quincena
  (`sinQuincena`, se DICE en ámbar; con `fecha_gasto` DATE NOT NULL no
  debería pasar). No se convierte nada ni se decide nada del dinero.
- **La persona NO se infiere de las notas**: agrupar «por empleado» leyendo
  texto libre («luis 1a oct», «Proveedor: …») sería una heurística sobre
  dinero sensible. La fase 2 es un campo «Beneficiario» (o un catálogo de
  personal) que decide el cliente. Mientras, el alta pide escribir en
  «Notas» a quién y qué quincena (`AYUDA_CAPTURA_NOMINA`) y la búsqueda de la
  tabla encuentra por las notas (`textoBusquedaGasto` ya las incluye).
- **La pantalla** (`app/admin/nomina/page.tsx`, `force-dynamic`, + su
  `loading.tsx`, idéntico al de Gastos personales):
  - **Falla CERRADO**: `getMe().catch(() => null)` + `puedeVerNomina` ⇒
    `notFound()` antes de leer nada, como Gastos personales (los sueldos son
    dato sensible: sin `/me` la pantalla no existe).
  - **Carga con el patrón de `/admin/expenses`**: la lista
    `principal(listGastosAll({ categoria: CATEGORIA_NOMINA, desde, hasta }))`
    (sin cap); si falla, `TarjetaErrorCarga` («No se pudo cargar la
    nómina»: jamás «Sin pagos» ni un resumen en ceros) con la cabecera y el
    mes vivos; aeronaves (`avionCatalogoGasto`), proveedores y la firma de
    las fotos degradan con `<AvisoDegradado>`; el corte del anti-cap avisa
    con `textoCorteGastos` y el resumen dice que suma solo lo que cargó
    (`avisoResumenIncompleto`).
  - **Cabecera**: «Operación» · «Nómina» · la descripción; acciones:
    `ExpenseCreateDialog` de siempre con `defaultCategoria={CATEGORIA_NOMINA}`
    (la IA no la pisa), botón primario «Registrar pago de nómina», ese mismo
    título y la ayuda de captura en `contexto` (se pinta también sin el modo
    controlado); «Exportar Excel» = el Excel de Gastos
    (`/v1/expenses/export`) con `queryExcelNomina(mes)` y el `title` de
    `tituloExcelGastos(rol)`. «Ver en Gastos» SE RETIRÓ el 16-oct-2026 (la
    nómina ya no sale en Gastos); en su lugar «Repartir entre aviones».
  - **Periodo** (`components/admin/nomina/nomina-nav-meses.tsx`, de
    CLIENTE): el selector de MES de Gastos personales
    (`GastosPersonalesFilterBar`, genérico: `usePathname` + `?mes=`; su
    comentario lo dice) entre «‹ septiembre 2026» y «noviembre 2026 ›»
    (`Link` con `prefetch={false}`, `cursor-pointer` y `aria-label`
    «Ver la nómina de …»; la flecha va `aria-hidden`); la página decide los
    vecinos (`null` = no se pinta: el siguiente no se ofrece hacia el
    futuro). Al reutilizarlo, su etiqueta «Mes» quedó ligada al campo
    (`htmlFor`/`id`: antes no tenía nombre accesible) con manita y el campo
    pasó de `w-44` a `w-52` (a 16 px, en teléfono, el ícono del calendario
    tapaba el año de «septiembre/noviembre/diciembre de 2026»). **Cambiar
    de mes conserva la búsqueda por los DOS caminos** (revisión
    15-oct-2026): una sola regla pura, `queryCambioDeMes`
    (`lib/admin/url-params.ts`), que conserva los parámetros actuales salvo
    `tp` (la tabla, remontada por `key={mes}`, arranca en la página 1; la
    búsqueda `tq` se queda, como en Gastos). La usan el campo y
    `hrefMesNomina(mes, actuales)`; los enlaces leen la query VIVA con
    `useSearchParams` porque `DataTable` escribe `tq` con `replaceState` y
    el server no la ve (antes «‹ mes» armaba `?mes=` a secas y tiraba la
    búsqueda que el campo sí conservaba). El campo hace `router.replace` y
    los enlaces `push` (diferencia en «Atrás» aceptada). Aplica también a
    Gastos personales.
  - **Resumen** (`components/admin/nomina/nomina-resumen.tsx`,
    PRESENTACIONAL sin hooks): 3 tarjetas (1 columna en teléfono, 3 desde
    `sm`): «Total de octubre 2026» (cada moneda en su renglón, «N pagos» y el
    desglose por medio con las etiquetas de `medios-pago.ts`; cada monto con
    `ml-auto text-right`: si el renglón envuelve —tarjeta angosta entre 640
    y ~715 px o montos de 7 cifras— sigue a la DERECHA) y las dos
    quincenas («Sin pagos» si no hubo); debajo, «La quincena sale de la
    fecha del gasto (la del pago).». Solo con la lista cargada y con pagos.
  - **Lista**: la MISMA `ExpensesTable` de Gastos (`key={mes}`) en una
    tarjeta «Pagos de nómina · octubre 2026 (12)»: cada pago con TODO lo de
    un gasto («Verificar / editar», «Repartir entre aviones» en los pagos sin
    vuelo, «Eliminar» con su confirmación según el rol, comprobante,
    facturación y banco). La descripción de la tarjeta es
    `descripcionListaNomina(me?.rol)`: nombra «Eliminar» SOLO si
    `puedeEliminarGasto(rol)` —la MISMA regla con la que `ExpenseActions` lo
    esconde; FACTURACION ve Nómina pero no elimina gastos— y aclara que
    «Repartir» es para los pagos sin vuelo (`repartible` del menú). SIN
    `ExpensesSeleccionProvider` ni «Unir en compra» (NOMINA no es categoría
    de compra; `useSeleccionGastos` devuelve null y la tabla funciona sin
    él). Lista vacía ⇒ `EmptyState` (`UserGroupIcon`) con «Sin pagos de
    nómina en octubre 2026» y cómo registrarlos o reclasificarlos; jamás la
    tabla vacía.
- **Alta** (`expense-create-dialog.tsx`): prop ADITIVA `etiquetaBoton?:
  string` (sin ella, «Nuevo gasto» / «Registrar gasto» byte a byte: el
  golden `alta-gasto.golden.json` no se regeneró) y el cuadro de NÓMINA
  (`data-ayuda-nomina`) es «Nómina: » + `AYUDA_ALTA_NOMINA` de la fuente
  única (texto del 16-oct-2026): «sin vuelo. No sale en Gastos ni entra a
  ningún balance hasta que se reparte entre aviones: si eliges un avión,
  queda solo como referencia y no le resta nada. Repártela en la pantalla
  «Nómina» con «Repartir entre aviones» (todo el mes o por quincena), o
  aquí al guardar si no eliges avión.» (lo mismo que el hint «Con lo elegido
  cae en: …» de `hojaDestinoGasto`, `HOJA_NOMINA_SIN_REPARTIR`). Antes decía «el avión es
  opcional (p. ej. piloto de un solo avión)», que invitaba a ligar el
  sueldo al avión del piloto como si con eso se lo cargara (revisión
  15-oct-2026). El comentario de `NOMINA` en `categorias-gasto.ts` dice lo
  mismo.
- **Revalidación**: donde las actions de Gastos revalidan «Otros gastos»
  ahora revalidan también `/admin/nomina` (`revalidarVerificacion`, también
  el PATCH incierto; `saveRepartoAction`, `revalidarReparto`,
  `saveRepartoMasivoAction`), más el alta (`createGastoAction` sin cargos,
  junto a Gastos personales) y la baja (`deleteGastoAction`). Las demás del
  menú ⋯ (duplicado, visto bueno, facturación, factura) repintan igual la
  pantalla abierta: en Next 16 cualquier `revalidatePath` dentro de una
  server action vuelve a pintar la página actual.
- **Pruebas**: `lib/admin/__tests__/nomina.test.ts` (todo lo puro y los
  textos exactos, con los montos REALES de prod: octubre 2026 = 12 pagos
  MXN que suman $109,921.46, todos en la 1.ª quincena; septiembre 2026 = 5
  pagos del 30-sep que suman $21,757.80, todos en la 2.ª; notas genéricas),
  `components/admin/nomina/__tests__/nomina-pagina.test.tsx` (resumen
  renderizado con los montos a la derecha, los enlaces del mes que
  conservan `tq` y sueltan `tp`, el ancho del campo «Mes», MXN y USD sin mezclar, la tabla sin el proveedor, el botón
  del alta con y sin `etiquetaBoton` contra el golden, la ayuda de NÓMINA,
  el menú y el cableado de la página por regex),
  `app/admin/expenses/__tests__/nomina-revalidacion.test.ts`
  (comportamiento de las revalidaciones) y las ampliadas
  `gasto-con-reparto-action.test.ts`, `crear-con-cargos-action.test.ts`,
  `url-params.test.ts` (`queryCambioDeMes`: pone el mes, conserva `tq`,
  suelta `tp`; mes vacío quita `?mes=`), `titulos-pestana.test.ts` y
  `titulos-pestana-cableado.test.ts`.
- **Fase 2 (decide el cliente)**: campo «Beneficiario» o catálogo de
  personal y el resumen por persona; ¿filtro por quincena en la tabla?
  **QA manual** (sin DOM en el runner): `/admin/nomina` como ADMIN,
  COORDINADOR y FACTURACION (SOCIO ⇒ 404), octubre y septiembre con sus
  totales, «‹ septiembre» / «noviembre ›» (este último no sale en el mes
  en curso), el alta con «Registrar pago de nómina», «Exportar Excel» y
  «Repartir entre aviones», teléfono a 390 px (el año completo en el campo «Mes» de
  septiembre/noviembre/diciembre), las tarjetas del resumen a 640–720 px y
  buscar «luis» y cambiar de mes con el campo y con «‹ mes» (la búsqueda se
  queda las dos veces).
- **Deploy: solo panel.**

## Nómina: fuera de Gastos y reparto en partes iguales (16-oct-2026, API 0.0.90)

Pedido del cliente (textual): «todo lo de nómina no se sume o agregue al
gasto… sumar todo lo de la nómina y repartir en partes iguales a los aviones
que yo elija… por lotes o todos de un jalón… y ya solo así repartido y
asignado se vaya al balance del avión y al general». Contrato: invariante 91
del API (SIN migración). **El panel no calcula dinero**: el reparto en partes
iguales, el residuo de centavos (rotado entre los aviones, Σ == monto
exacto), los totales por moneda, los errores por pago y lo aplicado vienen
del API; aquí solo se pinta y se suman las partes YA guardadas (centavos, por
moneda) para el resumen.

- **Reglas del dinero (del API)**: la NÓMINA vive SOLO en el módulo Nómina;
  cada pago se reparte POR SEPARADO (conserva su `gasto_reparto`, su mes y su
  trazabilidad); **sin reparto no entra a ningún balance** (ni «otros
  gastos» del general: el consolidado lo avisa) y el pre-cierre la BLOQUEA
  (`nomina_sin_repartir` en `bloqueantes`: `listo` y la previa del cierre de
  mes). Repartida, como cualquier reparto: parciales a «Gastos Indirectos» de
  cada avión y al reparto a socios. NO cambian Libro Dinero (la nómina pagada
  sigue en su «otros gastos»: es caja), tablero de gastos ni la app.
- **Fuente única PURA** `lib/admin/nomina-reparto.ts` (prueba
  `__tests__/nomina-reparto.test.ts`): roles `ROLES_REPARTO_NOMINA` = ADMIN,
  COORDINADOR, FACTURACION (espejo del `@Roles` del API; sin rol se ofrece:
  el API es el candado), `validarCuerpoRepartoIguales` (1–200 pagos, 0–20
  aviones, uuid sin repetir, `simular` solo `true`; `[]` de aviones = quitar),
  `pagoNominaDeGasto` (primera línea de las notas, repartible solo SIN
  vuelo —el API responde `GASTO_CON_VUELO`—, matrículas guardadas), chips
  «Todo el mes · 1ª quincena · 2ª quincena · Solo sin repartir»
  (`idsDeChip`, `chipInicialNomina`, `chipDeSeleccion`), la clave de la
  vista previa (`claveVistaPreviaNomina` / `idsDeClaveVistaPrevia`,
  `ESPERA_VISTA_PREVIA_MS` = 400), `resultadoEsIncierto` (red o 5xx: pudo
  escribirse), `erroresDeRespuestaReparto` (por pago, MES_CERRADO con el
  texto del API), `pagosYaRepartidos`, `toastResultadoRepartoNomina`,
  `resumenRepartoNomina` y TODOS los textos. Tipos 1:1 con el API en
  `types/reparto-iguales.ts`.
- **Server action** `repartoIgualesAction` (`app/admin/nomina/actions.ts`):
  valida ANTES de la red (`ENTRADA_INVALIDA`, 400, sin llamar al API), `POST
  /v1/expenses/reparto-iguales` con el cuerpo como OBJETO (`apiFetch`
  serializa) y `cache: no-store`, NUNCA lanza y **NO revalida** (la llama un
  diálogo que sigue montado: la página se pone al día con UN
  `router.refresh()` al CERRAR si algo cambió). 404 «Cannot POST» (API ≤
  0.0.89) ⇒ `RUTA_NO_DISPONIBLE` con «Falta actualizar el servidor: el
  reparto de la nómina todavía no está disponible.»; un fallo que no es del
  API (red) ⇒ `SIN_CONEXION` (incierto); texto técnico ⇒
  `MSG_SERVIDOR_NO_RESPONDIO`; un 400 de negocio (p. ej.
  `AERONAVE_INACTIVA`) conserva code, status y details.
- **La pantalla Nómina** (`app/admin/nomina/page.tsx`, **`maxDuration =
  120`**: hasta 200 pagos por llamada, uno por uno en el API): botón primario
  «Repartir entre aviones» (`NominaRepartoBoton`, `cursor-pointer`,
  `aria-haspopup="dialog"`) SOLO con la lista cargada, con pagos y para quien
  reparte (`ofrecerReparto`; con él, «Registrar pago de nómina» pasa a
  `outline`); el diálogo se MONTA solo al abrirse (sus lecturas no corren en
  reposo) y se desmonta al cerrar. Bajo el resumen del mes,
  `NominaRepartoResumen` (presentacional, sin hooks): tres tarjetas
  «Repartido» · «Sin repartir» (ámbar con pagos) · «Por avión» (A–Z, «¿?»
  al final), «Sin asignar de repartos manuales» si un reparto manual dejó
  remanente y la nota ámbar `NOTA_SIN_REPARTIR`; MXN y USD jamás se suman.
  La tabla recibe `resaltados={foco?.ids}`. «Ver en Gastos» se retiró.
- **El diálogo** (`components/admin/nomina/nomina-reparto-dialog.tsx`, Base
  UI): 1) «¿Qué pagos?» — chips + lista con casillas (un pago con vuelo va
  atenuado, con la casilla deshabilitada y «Ligado a un vuelo: no se
  reparte»; un pago sin repartir dice «Sin repartir» en ámbar),
  «Seleccionar todos / Ninguno»; 2) «¿Entre qué
  aviones?» — los ACTIVOS (`listAvionesActivosAction`, con turno y `.catch`;
  si no cargan, «Reintentar», jamás «no hay aviones») con «Todos»; 3) «Así
  quedaría» — vista previa AUTOMÁTICA con `simular: true` (debounce 400 ms +
  turno: una respuesta vieja no pisa a la nueva; nunca un `await` desnudo,
  `.catch(sinConexion)`) con el total por moneda y la parte de cada avión
  TAL CUAL del API; 4) «Repartir N pagos entre M aviones»: si algún pago ya
  estaba repartido, confirma el REEMPLAZO (AlertDialog anidado con
  `backdropForceRender` y `preventDefault`); si no, el resumen y el botón son
  la confirmación; 5) «Quitar el reparto» SIEMPRE confirma (`aeronave_ids:
  []`); 6) resultado: toast y, si hubo errores por pago, se listan en el
  diálogo (que sigue abierto). Sin respuesta (incierto): `MSG_REPARTO_INCIERTO`
  y refresh al cerrar. Todo lo que se pulsa lleva `cursor-pointer`.
- **Gastos sin nómina** (`lib/admin/gastos-vista.ts`): la lista, los dos
  contadores y el Excel mandan SIEMPRE `excluir_categoria=NOMINA`
  (`queryBaseGastos`); el filtro «Categoría» ofrece
  `CATEGORIAS_FILTRO_GASTOS_VISTA` (21, sin «Nómina»); `?categoria=NOMINA`
  (enlace viejo) se IGNORA (`nominaIgnorada`) y la página pinta la franja
  azul «La nómina se lleva en su propio módulo» con «Ir a Nómina»
  (`hrefNominaDesdeGastos`: el mes del `desde`/`hasta`, o el módulo). «Otros
  gastos» ya no la lista (su vacío lo dice).
- **SKEW con un API ≤ 0.0.89** (el `forbidNonWhitelisted` del DTO):
  - lista y contadores: el 400 «property excluir_categoria should not exist»
    lo resuelve `pedirGastosTolerante` (`lib/api/expenses-server.ts`):
    RELEE sin el campo (los demás filtros intactos) y las páginas
    siguientes del anti-cap repiten la consulta que funcionó; un 400 de otro
    campo o un 5xx suben como siempre. Regla única
    `esCampoDesconocidoParaApi` / `sinCampos` en `lib/api/campo-opcional.ts`
    (espejo de `esApiSinRangoFechas`; `esApiSinExcluirCategoria` /
    `sinExcluirCategoria` en `gastos-vista.ts`);
  - Excel: `ExcelExportButton` → `descargarDelApi(…, { camposOpcionales:
    CAMPOS_OPCIONALES_GASTOS })` pide UNA vez más sin el campo ante ese 400;
  - el reparto: 404 ⇒ «Falta actualizar el servidor…» (nada se escribe).
  Con el API previo Gastos sigue enseñando la nómina (como antes) y su
  franja no se pinta.
- **Celda «Avión · vuelo»** (`lib/admin/gasto-avion.ts`, regla 2b después
  del reparto y de PERSONAL_DUENO, antes de empresa): NOMINA sin reparto ⇒
  «Sin repartir» (+ « (ref. N4142R)» con avión sellado), title «Nómina sin
  repartir: no entra a ningún balance hasta repartirla entre aviones en el
  módulo Nómina.»; repartida dice «Repartido: …». Texto IDÉNTICO al de
  `celdaAvionGasto` del API (paridad `gasto-avion.paridad.spec`).
- **Textos de NÓMINA en «Verificar / editar»** (`lib/admin/reparto-gasto.ts`):
  `TITULO_MODO_UNO_NOMINA`, `AYUDA_MODO_UNO_NOMINA`, `DESTINO_NOMINA_SIN_REPARTIR`
  y `DESCRIPCION_VERIFICAR_NOMINA` dicen «sin repartir, el pago de nómina no
  entra a ningún balance» (ya no «lo absorbe VuelaTour») y la opción vacía
  del selector «Un avión» es `opcionSinAvionRepartible("NOMINA")` = «Sin
  avión (queda sin repartir)» (las demás repartibles: «Sin avión (gasto de
  VuelaTour)»). El alta: si su
  reparto falla, `avisoNominaSinRepartir`; desde OTRA pantalla, el toast
  ofrece «Ver en Nómina» (`accionVerEnNomina`, el mes del pago).
- **Pre-cierre**: renglón BLOQUEANTE `nomina_sin_repartir` («Nómina sin
  repartir entre aviones») con «Resolver →» `hrefPrecierreNominaSinRepartir`
  = la nómina del MES del periodo + el foco ámbar (`pc`/`ids`, «Resolver →»
  marca en ámbar): la página Nómina lee `leerFocoPreCierre`, pinta
  `FranjaPreCierre` (`NOTA_VISTA_MES`) y pone esos pagos PRIMERO y en ámbar.
- **PENDIENTE (paridad con el API)**: `DESTINO_POR_DEFECTO.NOMINA` (la línea
  verde del selector de categoría en el alta) sigue diciendo «Otros gastos
  (Balance general VuelaTour)»: es COPIA de la tabla canónica del API
  (`CATEGORIA_GASTO_DESTINO`) y su test de paridad la congela. Cambiarla es
  un lote coordinado API + panel + app (el hint «Con lo elegido cae en:» ya
  dice la regla nueva).
- **Pruebas**: `lib/admin/__tests__/nomina-reparto.test.ts`,
  `app/admin/nomina/__tests__/reparto-iguales-action.test.ts`,
  `components/admin/nomina/__tests__/nomina-reparto-ui.test.tsx` (resumen y
  botón renderizados, cableado del diálogo, «Resolver →» del pre-cierre),
  `lib/admin/__tests__/gastos-vista-nomina.test.ts`,
  `lib/api/__tests__/expenses-server-excluir.test.ts`,
  `lib/api/__tests__/campo-opcional.test.ts`,
  `lib/__tests__/download-campos-opcionales.test.ts` y las ampliadas
  `nomina.test.ts`, `nomina-pagina.test.tsx`, `gastos-vista.test.ts`,
  `reparto-gasto.test.ts`, `gasto-avion.test.ts` y
  `categorias-gasto.test.ts`.
- **Orden de deploy**: API 0.0.90 → panel. Con el panel antes, Gastos relee
  sin el campo (sigue mostrando la nómina) y «Repartir entre aviones» dice
  que falta actualizar el servidor; con el API antes, el panel viejo no
  manda `excluir_categoria` y el pre-cierre ya bloquea (el reparto por gasto
  de siempre sigue disponible). **QA manual** (sin DOM): `/admin/nomina` de
  octubre (12 pagos, $109,921.46) repartida entre 4 aviones ⇒ dos con
  $27,480.37 y dos con $27,480.36; «Quitar el reparto» confirma; Gastos sin
  nómina y `?categoria=NOMINA` con la franja; pre-cierre de septiembre
  bloqueado hasta repartir.

## Caja chica: el gasto con más datos y «Ver en balance» (15-oct-2026)

Pedido del cliente con la captura del fondo de Pablo Canales: «aquí necesito
más información en la fila sobre el gasto y estaría genial que se mande a la
celda en los balances» y «que diga en qué hoja del excel del balance está».

- **Fuente única del renglón**: `lib/admin/caja-chica-gasto.ts`
  (`detalleGastoFondo`, PURO y serializable; la página lo arma en
  `MovimientoFondoRow.detalleGasto` y la tabla lo pinta con
  `components/admin/caja-chica/gasto-fondo-detalle.tsx`). No decide nada:
  categoría con `categoriaGastoLabel`, avión con `estadoAvionGasto` (los
  MISMOS textos y titles de la columna «Avión · vuelo» de Gastos, en línea;
  salvo el title de «Falta avión», que aquí es
  `TITULO_FALTA_AVION_FUERA_DE_GASTOS`: el fondo no tiene pestaña
  «Pendientes» ni «Sugerir asignaciones», solo «Verificar / editar» del
  menú ⋯; el vuelo no se repite: el folio del renglón sigue ligando a él), proveedor
  (o el lugar), comprobante con `textoComprobante` y el semáforo
  `FacturacionBadge compacta` (el de un clic de Gastos). La categoría no se
  repite si ya es la descripción del renglón (gasto sin notas). Sin el gasto
  completo (no llegó en `listGastos`) igual se dicen la hoja y los enlaces.
  Renglones de caja (reposición, reintegro, ajuste): `detalleGasto: null`,
  marcado de siempre.
- **Libro, mes y hoja: SOLO del API** (`balance` de cada entrada
  `origen: "gasto"` del historial, la misma forma que Conciliación;
  invariante 72 del API). El panel NUNCA decide libro ni mes.
  - **Enlaces** «Ver en balance del avión X» / «Ver en balance general» con
    `enlacesBalanceDeGasto({ id, balance })` + `EnlacesBalanceGasto`
    (pestaña nueva, `?gasto=`, hermanos del `<Link>` del folio). Corte por
    rol: `puedeAbrirBalances(me?.rol)` en la página (ADMIN/ANALISTA; sin
    `/me` se ofrecen, el API es el candado).
  - **Línea de la hoja** (`textoHojaBalanceDeGasto`), para CUALQUIER rol
    que vea la fila: «Balance de N4142R (oct 2026): hoja «reporte horas
    N4142R» · Balance general: hoja «reporte horas FLOTA»»; máx.
    `MAX_ENLACES_AVION` matrículas y «y N aviones más»; mes corto es-MX
    («oct 2026»). El `title` de los enlaces (también en Conciliación) termina
    en «, hoja «…»».
  - **Nombres de pestaña** = `NOMBRE_HOJA_BALANCE_AVION` /
    `NOMBRE_HOJA_BALANCE_GENERAL`, EXACTOS de pyservices
    (`balance_avion_xlsx.py`; la de vuelos del avión es «reporte horas
    <MATRÍCULA>» con el espejo de `sheet_title`, sin matrícula ⇒ sin
    nombre). Hoja desconocida (API más nuevo) ⇒ se calla, jamás inventa.
    Renombrar una pestaña en pyservices obliga a tocar la tabla: la congela
    `conciliacion-balance.test.ts` (con paridad contra los tipos del panel,
    del API y el texto de pyservices cuando el repo hermano existe; cada
    tabla se busca SOLO en el cuerpo de SU libro —`construir_balance_avion`
    / el bloque `if cons is not None:` de `construir_balance_general`—,
    porque «combustible» y «refacciones» existen en los dos. Desde un
    worktree suelto: `VUELATOUR_WORKSPACE=<carpeta con los repos>` activa
    esas paridades, que si no se omiten).
  - `balance: null` NO significa «no cuenta en ningún balance» (el pago al
    vendedor resta en COMISIONES sin vínculo, inv. 72 (v)): sin línea ni
    enlaces, sin texto.
- **Búsqueda rápida** suma categoría, matrículas (también las del reparto)
  y proveedor/lugar (`busquedaDetalleGastoFondo`).
- **Skew**: panel nuevo + API previo ⇒ sin `balance` ⇒ sin línea ni
  enlaces, los demás datos sí (salen del gasto que la página ya leía); API
  nuevo + panel previo ⇒ ignora el campo. Ningún número cambia.
- **Pruebas**: `components/admin/caja-chica/__tests__/gasto-balance.test.tsx`
  (detalle puro, fila con y sin `balance`, sin rol ⇒ sin enlaces y con
  hoja, sin `<a>` anidado, textos y titles de «Avión · vuelo», renglón de
  caja intacto, cableado de la página) y
  `lib/admin/__tests__/conciliacion-balance.test.ts` (tabla de pestañas
  congelada, `textoHojaBalanceDeGasto`, title con la hoja, paridad con
  pyservices). `excel-caja.test.tsx` mockea `@/app/admin/expenses/actions`
  (la fila monta `FacturacionBadge`).

## Caja chica MADRE: a quién se repuso, reponer desde la madre y Desde/Hasta (15-oct-2026)

Pedidos del cliente sobre la caja de Mary Cruz (fondea a Gregorio Jurado,
Jimmy Chi, Nelson Hau, Luis Cáceres, Itzi, Alexander E. Saab…): «que diga a
quien le repuso en el movimiento», «que pueda seleccionar a quien le va a
reponer el fondo» y «le agregas un filtro de fecha de desde hasta». Contrato
con el API (invariante 83, sin migración ni ruta nueva). Lógica PURA en
`lib/admin/caja-chica-madre.ts`; el panel NO suma ni resta un peso.

- **El espejo dice a quién** (`repuestoADeEntrada`, fila
  `MovimientoFondoRow.repuestoA`): en la madre, el renglón del REINTEGRO
  espejo dice «Reposición a la caja de <nombre>» con enlace a
  `/admin/caja-chica/<fondo_id>`; «Reintegro a dirección» queda como badge
  (tipo secundario) y «Espejo automático…» como nota tenue. Orden: el nombre
  VIVO de `historial[].repuesto_a.nombre` → la referencia «Fondeo a X» que
  escribe `insertarEspejo` (API previo o `repuesto_a: null`, sin enlace) →
  nada (el renglón de siempre, idéntico). Solo los espejos (`espejo_de_id` o
  la llave): una referencia «Fondeo a…» tecleada a mano no cuenta. Un
  `fondo_id` que no es uuid no enlaza. La búsqueda rápida encuentra por el
  nombre (`textoRepuestoA`). Si la descripción ES la referencia «Fondeo a X»
  no se repite.
- **Reponer desde la caja madre** (`MovimientoDialog`, MISMO formulario):
  `cajasParaReponer(fondo)` → las `cajas_fondeadas` del API, o `null` si el
  diálogo debe quedar IDÉNTICO (API previo = llave ausente, `null` = lectura
  caída, `[]` = no fondea, madre inactiva —el API rechaza el espejo—, o
  CORRECCIÓN). Con cajas: dos botones «Movimiento de esta caja» / «Reponer a
  una caja que fondea (N)» (`aria-pressed`, `cursor-pointer`); el segundo
  muestra «¿A quién le repones?» con «Gregorio Jurado · por reponer
  $5,000.00» y su última reposición (`opcionCajaFondeada`: la cifra es
  `cajas_fondeadas[i].por_reponer` TAL CUAL, la misma de la tarjeta «Por
  reponer» y del Excel de esa caja). Al elegir: `valoresReponerA` prellena
  tipo REPOSICIÓN, monto = lo pendiente (editable; 0 ⇒ vacío), la moneda de
  la HIJA y la fecha de hoy Cancún (`todayCancun`). «Revisar y registrar»
  (monto > 0) pasa a la confirmación DENTRO del diálogo («Se registrará una
  reposición de $X en la caja de Gregorio Jurado y su reintegro en la caja
  de Mary Cruz.» + «Volver» / «Sí, registrar la reposición»); solo ese botón
  llama `createCajaMovimientoAction(hija.fondo_id, {…, tipo: REPOSICION,
  moneda: hija.moneda}, { fondoMadreId })` — la ruta de SIEMPRE en la caja
  HIJA (el espejo en la madre lo escribe el API; NO se duplica esa regla) —,
  que además revalida la página de la madre (uuid validado). Al terminar,
  `avisarReposicionYDescargar` con el movimiento creado y el nombre de la
  hija (el Excel de lo repuesto, «Descargar de nuevo»). Al cerrar, el
  diálogo vuelve a «esta caja».
- **Filtro Desde/Hasta del historial** (`HistorialPeriodoFiltro` en la
  cabecera del historial, solo con historial): `?desde=&hasta=` días
  `AAAA-MM-DD` (`rangoHistorialCaja`: inválido se ignora, invertido se
  corrige, un ISO completo no vale), con el BORRADOR de fechas de
  Cotizaciones/Gastos, ahora COMPARTIDO en `hooks/use-rango-borrador.ts`
  (salió tal cual de `expenses-filter-bar.tsx`, que lo importa; su prueba lee
  los dos fuentes), navegación encadenada (`consultaBaseParaNavegar` +
  `pendienteVigente`), `tp` fuera, `router.replace` sin brincar y
  «Limpiar». La página filtra FILAS del libro completo
  (`filtrarHistorialPorRango`, por texto del día): el saldo de cada fila, las
  tarjetas (`porReponerDeFondo(fondo)`) y el Excel de lo pendiente NO
  cambian. Línea «Viendo del 01 oct 2026 al 15 oct 2026 · 12 de 80
  movimientos. El saldo de cada fila es el del libro completo…»; vacío con
  filtro ⇒ «Sin movimientos en el periodo» + «Limpiar».
- **Skew**: API previo ⇒ sin `repuesto_a` (referencia o lo de hoy) y sin
  `cajas_fondeadas` (diálogo de siempre); panel previo + API nuevo ⇒ ignora
  las llaves. El filtro no depende del API.
- **Pruebas**: `lib/admin/__tests__/caja-chica-madre.test.ts` (espejo con y
  sin `repuesto_a`, cuándo se ofrece, opción, prellenado, confirmación,
  rango y filtro puros) y
  `components/admin/caja-chica/__tests__/caja-madre.test.tsx` (render del
  espejo, diálogo idéntico sin cajas y en corrección, botones con
  `cursor-pointer`, prellenado y confirmación ANTES de la server action por
  regex, la acción con el fondo HIJO y la revalidación de la madre, filtro
  pintado y cableado, página).

## Tacómetro omitido por tramo (15-oct-2026, API 0.0.81)

Pedido del cliente con la captura del #300 (N4142R, CET → CUN, 12-sep):
«necesito una opción para omitir la captura del tacómetro porque falló el
tacómetro y no había forma de registrarlo, debemos poder completarlo para
que no salga la alerta en reportes» … «Debe tener el porqué se omitió el
tacómetro y saber quién lo registró así». El API (invariante 79 de su
CLAUDE.md) guarda `escala.taco_omitido_at / _por / _motivo`; aquí solo se
pinta y se decide la UI.

- **Fuente única `lib/admin/taco-omitido.ts`** (PURA; textos CONGELADOS en
  `lib/admin/__tests__/taco-omitido.test.ts`): roles (`ROLES_OMITIR_TACO` =
  ADMIN, COORDINADOR, FACTURACION — el conjunto de `taco/confirm`), motivo
  10–500 contado como el API (`largoMotivoOmision`: trim + espacios dobles →
  uno), chips «Falló el tacómetro» / «Lectura ilegible y sin forma de
  recuperarla» / «No se tomó la foto», badges, `textoOmitidoPor` («Omitido
  por Itzi · 15 oct 2026, 10:40 a.m. · Falló el tacómetro», hora Cancún),
  toasts y predicados: `esTramoOmitido`, `tramoExigeLlegada`,
  `puedeOmitirTaco` = `esRolOmitirTaco` ∧ `tramoOmitible` (vuelo PROPIO no
  COMPLETADO/CANCELADO, tramo vivo, sin llegada, no omitido; un vuelo nunca
  iniciado —RESERVA…CONFIRMADO, #301/#279— SÍ se omite),
  `faltaTacoSinOmitidos` (badge «Tacómetro incompleto» del detalle y botón
  «Propagar lecturas»: un omitido sin salida no falta), `completableConOmision`,
  `mensajeOmision`, `errorDeOmision`, `escalaLiveOmitida`. Nadie redacta
  estos textos por su cuenta ni repite los predicados inline.
- **Botón y diálogo** (`components/admin/flights/taco-omitir-dialog.tsx`):
  `TacoOmitirDialog` (ghost, `MinusCircleIcon`, title = la ayuda) abre un
  `AlertDialog` con las 4 consecuencias, los 3 chips (`cursor-pointer`,
  rellenan y se editan), `Textarea` con `maxLength=500`, contador
  `n/500 · mínimo 10` (rojo + aviso bajo 10) y «Omitir tacómetro»
  deshabilitado mientras no alcance. El motivo se re-siembra al ABRIR (en el
  onClick, nunca `useState(prop)` + efecto). El cuerpo es
  `FormularioOmitirTaco` (exportado para probarlo sin DOM).
  `TacoOmitidoDeshacer` confirma antes de deshacer (acción reversible pero
  vuelve a pedir lectura y avisa al piloto). Errores: 404 SIN el código
  `ESCALA_NO_EXISTE` = «Cannot POST/DELETE» ⇒ «Esta opción necesita el API
  0.0.81…»; texto técnico ⇒ «El servidor no respondió…»; si no, el mensaje
  es-MX del API.
- **El vuelo NO se completa solo.** Tras omitir, `mensajeOmision` decide el
  toast: `completable` ⇒ «Tacómetro omitido. El vuelo #300 ya se puede
  completar.» con ACCIÓN «Completar vuelo» (`completeFlightAction`);
  `requiere_iniciar` ⇒ «… nunca se inició en la app: inícialo y
  complétalo.» con acción «Iniciar y completar»; si no, «Aún faltan
  lecturas en otros tramos» o el texto simple. La barra del vuelo
  (`FlightActionsBar`, prop `omision = completableConOmision(snapshot,
  snapshot.escalas)`) ofrece lo mismo de forma permanente: «Completar vuelo»
  (verde, mismo diálogo con `tituloCompletarConOmision` /
  `descripcionCompletarConOmision`) en un propio EN_VUELO, o «Iniciar y
  completar» (deshabilitado sin avión/piloto: el `start` del API los exige)
  en uno nunca iniciado; entra al early-return de la barra.
- **Omitir ≠ completar (revisión 15-oct-2026).** FACTURACION omite y deshace
  (`ROLES_OMITIR_TACO`), pero `POST :id/start` y `POST :id/complete` del API
  son `@Roles(ADMIN, COORDINADOR, PILOTO)` y le responden 403 «Required role:
  … Current: FACTURACION» (inglés). `ROLES_COMPLETAR_VUELO` /
  `esRolCompletarVuelo` es el espejo exacto: las páginas pasan
  `puedeCompletar={esRolCompletarVuelo(me?.rol)}` a `FlightActionsBar`,
  `EscalasCard` y `TacoLiveBoard` (que lo baja a `TacoOmitirDialog`). Sin él
  (ausente = sin permiso) la barra NO pinta «Completar vuelo» ni «Iniciar y
  completar» por omisión, y `mensajeOmision(r, faltanOtras, puedeCompletar)`
  da el toast SIN acción: «Tacómetro omitido. El vuelo #300 ya se puede
  completar: avisa a coordinación para completarlo.» / «… nunca se inició en
  la app: avisa a coordinación para iniciarlo y completarlo.». El
  «Iniciar/Cerrar vuelo» de los EXTERNOS no cambió (anterior a este lote).
- **`handleComplete` de la barra** (lo usan «Cerrar vuelo» de un externo y
  «Completar vuelo» por omisión) envuelve la server action en try/catch y
  cambia un texto técnico por `MSG_SERVIDOR_NO_RESPONDIO`, igual que
  `handleIniciarYCompletar`: nunca un `await` desnudo en la transición.
  Probado en `components/admin/flights/__tests__/omision-permisos.test.tsx`
  (`useTransition` simulado; un rechazo de la promesa = el boundary).
- **Server actions** (`app/admin/flights/actions.ts`, sección «Tacómetros:
  revisión de oficina»): `omitirTacoAction` (POST `…/legs/:id/taco/omitir`
  con `{ motivo }` recortado), `deshacerOmisionTacoAction` (DELETE) e
  `iniciarYCompletarVueloAction` (POST `:id/start` tolerando el 409
  `VUELO_YA_INICIADO` + POST `:id/complete`; `complete()` del API NO se
  relaja). Las tres nunca lanzan, copian `status` y revalidan el vuelo, la
  lista y `/admin/taco-live`. Si el start pasó y el complete falló, revalida
  igual y lo DICE (`errorIniciadoSinCompletar`: «El vuelo ya quedó EN VUELO,
  pero no se pudo completar: … Pulsa «Completar vuelo».»).
- **Dónde se ve el omitido**: «Tacómetros por tramo» (`EscalasCard`, props
  `puedeOmitir`, `vueloEstado`, `vueloEsExterno`, `vueloFolio`; sin ellos la
  card es la de siempre): fila slate, badge «Tacómetro omitido» (title con el
  motivo), «{salida} → omitido» si hay salida copiada, la línea «Omitido
  por …. No pide lectura y aporta 0 h…» y «Deshacer» (oficina; también en
  COMPLETADO, nunca en CANCELADO/externo). «Corregir» SE CONSERVA (es el
  camino de la lectura real: el API retira la omisión solo) y el borrado de
  la salida copiada también. Encabezado del vuelo: badge slate «Tacómetro
  omitido» con `tituloBadgeOmitido` (una línea por tramo, numerado por
  POSICIÓN como «Tramo N»), junto a «⚠ Tacómetro incompleto» si ambos
  aplican. Lista de vuelos: `taco-status` trae `{ falta, omitido }`
  (`TacoStatusVuelo`); `taco_omitido` pinta un `MinusCircleIcon` slate con
  `TITULO_BADGE_LISTA_OMITIDO`. `taco-status` se pide para TODO vuelo propio
  no cancelado de la tabla (`pideTacoStatusEnLista`, también los nunca
  iniciados y los azules en cotización: el #301 omitido y pendiente de
  «Iniciar y completar» sin icono parecía un vuelo futuro normal), y el
  triángulo «incompleto» solo se pinta en EN_VUELO/COMPLETADO
  (`faltaTacoEnLista`: el API dice `falta: true` de un vuelo futuro sin
  lecturas, y eso no es una falta).
- **Tacómetros en vivo**: la página lee `getMe()` best-effort y pasa
  `puedeOmitir`; el contador «por revisar» no cuenta omitidos. El API manda
  la fila omitida con `estado: 'OK'` + `omitido: true` (NUNCA un estado
  nuevo: el panel previo hacía `ESTADO_STYLE[estado].cls` y reventaba), y
  aun así **un estado desconocido no revienta**: `ESTADO_STYLE[estado] ??
  ESTADO_STYLE.ESPERANDO`. Fila omitida: borde slate, badge «Omitido» en vez
  del de estado, línea `textoOmitidoPor` + nota, sin «Sugerencia» ni «fin
  esperado», «Ajustar» sigue (sin «Comprobar») y «Deshacer». Fila VENCIDA o
  EN_CURSO sin llegada de un vuelo no COMPLETADO/CANCELADO ⇒ «Omitir
  tacómetro» compacto; `faltanOtras` = otras filas del vuelo sin llegada y no
  omitidas. `escalaLiveOmitida` vive en la lib (la usa el server component
  de la página: una función de un módulo `"use client"` no se puede llamar
  desde el servidor).
- **Pre-cierre** (`lib/admin/pre-cierre-tacos.ts`): `PreCierreTacoTramo`
  gana `omitido_por_nombre` y `omitido_at` (aditivos) y
  `lineasTramosOmitidos(tramos, max, total)` = `lineasTramosTacos` con el
  motivo cambiado por `motivoTramoOmitidoPreCierre` («#300 · T1 CET → CUN ·
  12 sep, 03:00 p.m. · Juan Pérez · Omitido por Itzi (15 oct, 10:40 a.m.):
  Falló el tacómetro»). El card la usa para el renglón INFORMATIVO
  `tacometros_omitidos` (`CLAVE_PRECIERRE_TACOS_OMITIDOS`; azul, sin
  «Resolver →» —no tiene entrada en `LINK_POR_CLAVE`—, nunca «pendiente»;
  la `<ul>` lleva `data-precierre-tramos={clave}`); con un API previo el
  renglón no existe.
- **Skew**: panel nuevo + API previo ⇒ sin llaves `taco_omitido_*`
  (`esTramoOmitido` false, UI de siempre), sin `omitido` en `taco-status`
  (sin icono) y las actions dan 404 «Cannot POST» ⇒ toast del API previo.
  API nuevo sin la migración ⇒ 503 `MIGRACION_PENDIENTE` con su mensaje es-MX
  (se pinta tal cual). Panel previo + API nuevo ⇒ ignora los aditivos.
- **Pruebas**: `lib/admin/__tests__/taco-omitido.test.ts`,
  `lib/admin/__tests__/taco-omitido-permisos.test.ts` (roles de completar,
  toast sin acción, `pideTacoStatusEnLista`, `faltaTacoEnLista`),
  `components/admin/flights/__tests__/omision-permisos.test.tsx` (barra de
  FACTURACION, `handleComplete` sin `await` desnudo y cableado),
  `lib/admin/__tests__/pre-cierre-tacos.test.ts` (`lineasTramosOmitidos`),
  `components/admin/reportes/__tests__/pre-cierre-tacos-omitidos.test.tsx`
  (renglón azul con «Omitido por …», sin «Resolver →», «oficina» sin
  nombre, «y N más…» del `count`, lectura fallida y cableado),
  `components/admin/flights/__tests__/taco-omitido-ui.test.tsx` (card,
  cuerpo del diálogo con 9 caracteres, barra y lista),
  `components/admin/taco-live/__tests__/taco-live-omitido.test.tsx` y
  `app/admin/flights/__tests__/actions-taco-omitido.test.ts` (rutas, body
  objeto, `status`, revalidación de taco-live, VUELO_YA_INICIADO tolerado y
  el fallo a medias).

## Pre-cierre: fuera `pistas_sin_gasto` y `tua_cobrada_sin_pagada`; nacen `tua_pagada_sin_cobrar` y `transporte_pagado_sin_cotizar` (15-oct-2026, API 0.0.81)

Pedidos 3 y 4 del cliente (capturas del pre-cierre de septiembre): el renglón
de pistas por tramo marcaba 96 con todo capturado (contaba por `escala_id` y
la oficina captura la cuota por `vuelo_id`) y el de «TUA cobrada sin pagada»
no era el que importa («el que nos importa es cuando no se cotizó pero sí se
pagó nosotros Operación los TUAS … igual con los transportes»).

- `pre-cierre-card.tsx`: fuera las entradas `pistas_sin_gasto` y
  `tua_cobrada_sin_pagada` de `LINK_POR_CLAVE` y el tipo
  `PreCierreVuelo.tua_cobrada_usd`; nuevos tipos ADITIVOS (todos opcionales)
  `tua_pagada_mxn/usd`, `pase_abordar`, `gastos_n`, `monto_mxn/usd` (del vuelo
  de transporte) y `gastos[] {id, texto, monto, moneda}`
  (`PreCierreGastoTransporte`). Mapa `CHIP_POR_CLAVE` (clave ⇒ helper PURO que
  da `{texto, href, title}`) con `vuelos_cobrados_sin_factura` (el mismo
  `chipVueloSinFactura` de antes) y las dos claves nuevas; el renderer
  genérico (`#folio` + sufijos, al detalle del vuelo) solo para las claves
  SIN entrada (`{!chipDeClave && …}`). Mismo tope de 8 chips + «y N más…»;
  el `<p>` lleva `data-precierre-chips={item.clave}` (sustituye a
  `data-precierre-sin-factura`) y los chips `cursor-pointer`.
- `lib/admin/pre-cierre-tua-pagada.ts` (PURO): `CLAVE_PRECIERRE_TUA_PAGADA_SIN_COBRAR`;
  «Resolver →» `hrefPrecierreTuaPagada` = `/admin/quotes?desde&hasta` (la
  lista de Cotizaciones del periodo, solo la BASE); chip «#70 ($2,355.39 MXN ·
  2 facturas)» / «#125 ($430.49 MXN)» / «#154 (pase de abordar · $756.48
  MXN)» / dos monedas «($1,000 MXN + $50 USD)» a `/admin/quotes/<id>` con
  `title` que dice qué hacer (encender «Se cobran TUAS» o agregar el extra;
  con pase de abordar, revisar la factura en Gastos → «Verificar / editar»).
  Exporta también `ChipPreCierre`, `montosPorMonedaTexto` y
  `folioChipPrecierre` (compartidos con el de transporte).
- `lib/admin/pre-cierre-transporte.ts` (PURO): mismo «Resolver →»
  (`hrefPrecierreTransporte`); chip «#190 ($400 MXN · Transporte Chetumal a
  Carl's…)» (texto del API ≤ 60, recortado a `CHIP_TEXTO_TRANSPORTE_MAX` = 28
  + «…» en el chip); varios ⇒ «#404 ($700 MXN · 2 gastos)»; `title` con cada
  gasto («$400 MXN · <texto>; …») y lo manual («Seguimiento de la
  cotización»). Es una SEÑAL: el `detalle` del API lo dice.
- El panel NO calcula dinero ni decide qué entra (fuentes únicas del API:
  `trasladosPagadosDeGasto`, `particionIngresoVuelo`, la heurística
  `transporte-pasajeros.util`); los montos por moneda del renglón se pintan
  los dos con `textoMontoItem` y los del chip con `fmtMonto`, NUNCA se suman.
- PEDIDO 2 («Resolver →» en ámbar): los dos renglones exponen sus ids en
  `vuelos[].id` (no llevan `ids`); la marca ámbar (`CLASE_FILA_ENFOCADA`)
  aplica a `quotes-table`, no a Vuelos.
- Skew: con API ≤ 0.0.80 no llegan las claves nuevas y los retirados se
  pintan con el renderer genérico (chips al vuelo) SIN «Resolver →»; con
  panel viejo y API 0.0.81 los nuevos salen genéricos. Sin rutas ni server
  actions nuevas. Las claves retiradas no se reusan nunca.
- Pruebas: `lib/admin/__tests__/pre-cierre-tua-pagada.test.ts`,
  `lib/admin/__tests__/pre-cierre-transporte.test.ts`,
  `components/admin/reportes/__tests__/pre-cierre-inversos.test.tsx` (render
  de los dos renglones, lectura fallida, renglón en 0, retirados sin
  «Resolver →» y cableado por regex: `LINK_POR_CLAVE` / `CHIP_POR_CLAVE` / sin
  `tua_cobrada_usd`); `expenses/__tests__/tua-incluida-ui.test.tsx` ya no
  pinta el renglón retirado (conserva la regla de `fmtMonto`);
  `lib/admin/__tests__/pre-cierre-factura.test.ts` congela el cableado nuevo
  (`CHIP_POR_CLAVE` / `chipDeClave`).

## Pre-cierre: «Resolver →» marca en ámbar (15-oct-2026, API 0.0.81)

Pedido 2 del cliente (captura del renglón «Gastos sin avión asignado
(bandeja) · 6 … Resolver →»): «el botón de Resolver estaría genial que te
marque bien lo que se debe resolver en amarillo, para poder saber dónde
atacar». «Resolver →» lleva a la pantalla DE SIEMPRE (su filtro + su
periodo) con un FOCO; la pantalla pinta esas filas PRIMERO y en ÁMBAR y monta
una franja arriba. NADA se resuelve solo (resolver en línea desde el
pre-cierre = fase 2, decide el cliente).

- **El API decide qué se cuenta; el panel solo pinta.** Desde el API 0.0.81
  los 11 renglones de gasto/movimiento traen `ids: string[]` (los CONTADOS,
  tope 500, `ids_truncado: true` al cortar; últimas llaves). Los demás ya
  traen su arreglo con id y el panel los deriva en este orden:
  `item.ids` → `vuelos[].id` → `cobros[].id` → `ligas[].movimiento_id` →
  `grupos[].grupo_id` → `sobres[].grupo_id` → `socios[].socio.id`
  (`idsDeItemPreCierre`: uuid válido, minúsculas, sin repetidos).
- `lib/admin/pre-cierre-resolver.ts` (PURO, sin React ni red): params `pc`
  (clave, `RE_CLAVE_PRE_CIERRE`), `pcn` (count), `pcp` (`desde,hasta`), `pct`
  / `pcd` (título ≤ 120 / detalle ≤ 400, recortados con «…») e `ids` (≤
  `TOPE_IDS_URL` = 100; con más viaja solo `pcn` y la franja lo dice). Orden
  fijo al anexar: pc, pcn, pcp, pct, pcd, ids; el `#hash` queda al final.
  `hrefResolverItem(item, periodo, base)`: sin base ⇒ null; informativo o
  `lectura_fallida` ⇒ la base intacta (sin franja: no hay qué resaltar). `leerFocoPreCierre(sp)` VALIDA (pc inválido ⇒ null; ids
  basura fuera; pcn no entero ⇒ null; pcp inválido ⇒ null).
  `filasResaltadasPrimero` (generaliza `filasConFoco` a un conjunto: sin ids
  ⇒ el MISMO arreglo), `conjuntoResaltado` / `claseFilaResaltada`,
  `textoConteoResolver` («6 por resolver · 4 en esta vista · 2 ya no están en
  esta vista (quizá ya se resolvieron)»; «M» = ids que viajaron y SÍ están en
  la lista pintada; «N» = el `count` del API), `hrefQuitarResaltado` (la URL
  sin los 6 params) y `hrefVolverPreCierre` (`/admin/reportes?desde&hasta#pre-cierre`,
  periodo del foco o el mes en curso).
- `components/admin/franja-pre-cierre.tsx` (server-safe): «Del pre-cierre:
  <título>», detalle, nota de la vista, conteo (`data-conteo`), «Volver al
  pre-cierre →» y «Quitar resaltado»; `role="status"`,
  `data-franja-pre-cierre="<clave>"`. Va después de la barra de filtros y de
  los avisos de degradación, antes de la tabla; solo con foco.
- Card del pre-cierre: ancla `id="pre-cierre"` + `scroll-mt-24` en la card,
  en la de error y en `PreCierreCardCargando`. `LINK_POR_CLAVE` gana periodo
  o destino: `gastos_sin_avion` ⇒ Gastos «Pendientes» del periodo;
  `gastos_sin_tc` / `matricula_recibo_distinta` ⇒ Gastos del periodo;
  `sin_conciliar` / `gastos_bancarios_sin_conciliar` /
  `cobros_bancarios_sin_conciliar` ⇒ su pestaña de Conciliación DEL periodo;
  `externos_sin_honorario` ⇒ Vuelos (el honorario se captura desde el vuelo);
  `repartos_incoherentes` ⇒ Otros gastos del mes. Enlaces NUEVOS:
  `combustible_sin_avion` (Combustibles del mes), `duplicados_sin_resolver`,
  `fijos_con_avion` (Gastos), `vuelos_sin_precio`, `extras_sin_desglose`
  (Cotizaciones), `fechas_tramos_incoherentes`,
  `vuelos_sin_gasto_operaciones`, `seguimiento_cotizacion_pendiente`
  (Vuelos). `vuelos_cobrados_sin_factura` ⇒ `/admin/facturas-emitidas#por-facturar`
  (el foco va ANTES del `#`). `tua_pagada_sin_cobrar` /
  `transporte_pagado_sin_cotizar` siguen en Cotizaciones (se corrigen en la
  cotización), así que su ámbar va en `quotes-table`, no en Vuelos.
- Pantallas destino (página lee el foco; tabla con prop ADITIVA
  `resaltados?: string[]`; sin ella el marcado es el de siempre): Vuelos,
  Gastos (reordena `gastos` ANTES de la tabla: la compra de un pago resaltado
  sube con él y la compra plegada también se marca), Conciliación (lista:
  primero los del pre-cierre y DESPUÉS el `?mov=`, que sigue primero; «Gastos
  sin banco» y «Cobros sin banco» por `id`), Combustibles (sin reordenar: la
  agrupación por avión manda; nota de mes), Otros gastos (nota de mes),
  Cotizaciones, Grupos, Tacómetros en vivo (Cards primero y en ámbar; un día
  a la vez, con su nota), Pagos a socios (fila del socio, sin reordenar) y
  Facturas emitidas («Por facturar», «Marcados…» y «Ya no aplican»: después
  del `?resaltar=` y con la misma marca; cambiar un filtro del registro borra
  también el foco).
- Las barras que COPIAN la URL conservan el foco; las pestañas y los enlaces
  que arman su propia URL (Gastos `FILTROS_URL`, Conciliación `hrefVista`,
  Facturas `hrefFacturas`) lo quitan: es correcto («Quitar resaltado» es
  explícito y «Volver al pre-cierre» siempre está).
- Skew: con API ≤ 0.0.80 los 11 renglones de gasto/movimiento viajan sin
  `ids` ⇒ franja «N por resolver» sin resaltar (los de `vuelos[]` sí
  resaltan); un panel previo ignora `ids`.
- Pruebas: `lib/admin/__tests__/pre-cierre-resolver.test.ts`,
  `components/admin/__tests__/franja-pre-cierre.test.tsx`,
  `components/admin/reportes/__tests__/pre-cierre-resolver-card.test.tsx` y
  `components/admin/__tests__/pre-cierre-resolver-cableado.test.ts`; las de la
  card que congelaban el href de «Resolver →» esperan ahora `…&pc=<clave>…`,
  y `conciliacion/__tests__/enfoque.test.tsx` / `seleccion.test.tsx` la línea
  nueva de `rowClassName` de `movimientos-table`.

## Facturas por cobro: un vuelo, varias facturas; cada cobro con la suya (16-oct-2026, API 0.0.82)

Pedido del cliente (captura de la card «Cobro» del vuelo #332: 4 cobros
conciliados y UNA «Factura A-0420»): «necesitamos poder cargar en un vuelo
varias facturas y poder vincularlas, porque a veces pasa que unos pagos de
los cobros hechos son con una factura y a lo mejor otro con otra factura».
Contrato: invariante 84 del API (migración `20261016000001`:
`cobro_vuelo.factura_emitida_id`, triggers de coherencia y backfill
determinista). Fuente única del panel: `lib/admin/cobro-factura.ts`
(PURA; prueba `lib/admin/__tests__/cobro-factura.test.ts`).

- **La liga cobro ↔ factura es CLASIFICACIÓN, no dinero.** No toca el
  cobrado, el reparto, el balance ni el candado de conciliación: un cobro
  conciliado (parcial o completo) o de anticipo SÍ cambia de factura desde
  «Editar» (`cambiosDeCobro` calcula ese diff FUERA de `dineroBloqueado`;
  la línea de la confirmación dice «Factura: — → A-0420» / «A-0420 → sin
  factura» y `tocaDinero` queda en false). Lo único que el panel suma son
  los cobros que el operador MARCA (para decir si cuadran con el total
  tecleado) y lo que una factura ya ampara (para no preseleccionar una ya
  completa), con la MISMA tolerancia de $1.00 del backfill del API.
- **Todo cuelga de la sonda del API**: el bloque `factura_servicio` trae
  `asignacion_disponible` (= migración aplicada), `cobros_sin_factura`,
  `cobros_sin_factura_exigen`; cada mini de `facturas[]` trae `es_parcial`,
  `cobros_n`, `cobros_monto`; cada cobro trae `factura_emitida {id,
  etiqueta} | null`. Son ADITIVOS y opcionales en `types/`: con un API
  previo no hay selector, casillas ni chips, y **JAMÁS viajan
  `factura_emitida_id` ni `cobro_ids`** (un API ≤ 0.0.81 responde 400
  `forbidNonWhitelisted`). Con API 0.0.82 sin migración
  (`asignacion_disponible: false`) ídem; una pestaña vieja que mande el
  campo recibe 503 `COBRO_FACTURA_NO_DISPONIBLE` con texto claro.
- **Card de cobros (vuelo y cotización, `flights/cobro-factura-chip.tsx`)**:
  bajo «método · → cuenta · referencia», SOLO si el cobro trae la llave y es
  asignable (positivo, sin sobre): chip verde «Factura A-0420»
  (`data-cobro-factura`, clic ⇒ PDF si la mini dice `tiene_pdf` y el rol
  puede) o, con ≥ 1 vigente y `asignacion_disponible`, chip «Sin factura
  asignada» (`data-cobro-sin-factura="ambar|gris"`) + «Asignar factura»
  (`data-accion="asignar-factura"`, solo ADMIN/FACTURACION: abre el MISMO
  `CobroFormSheet` en edición con `enfocarFactura` ⇒ foco en el selector).
  Sin vigentes, nada (la burbuja ya dice «Sin factura»). Reembolsos y
  partes de sobre, nada. «Eliminar» un cobro amparado lo dice en la
  confirmación (`textoEliminarCobroConFactura`).
- **Tono de «sin factura asignada» (`tonoSinFactura`)**: ÁMBAR solo cuando
  importa cuál factura ampara qué (≥ 2 vigentes, una vigente que ya
  clasificó algún cobro, o cobros que EXIGEN factura sin ninguna: #332 tras
  el backfill); GRIS con una sola vigente «global» sin clasificar y cobros
  que no exigen (A-0430 ×6, FA-A-0433 ×12, FA-A-0449 ×11): no es un
  problema, es trabajo pendiente opcional. Sin esto ~30 cards amanecían en
  ámbar sin que nada estuviera mal.
- **Burbuja**: cada chip «Factura A-0420» suma «· 1 cobro» / «· 3 cobros» /
  «· sin cobro asignado» (title «Ampara 1 cobro de este vuelo: $68,208
  MXN»); tras los chips, «3 cobros sin factura asignada»
  (`data-cobros-sin-factura`, mismo tono). «Registrar factura» sigue en
  TODOS los estados con el title «Un vuelo puede llevar varias: cada una
  ampara sus cobros». «Necesito factura» y «Factura obligatoria» siguen
  escondidos con una vigente (la exigencia sigue siendo por vuelo).
- **Formulario del cobro (`cobro-form-sheet.tsx`)**: props
  `facturasVigentes`, `asignacionFactura`, `rol`, `enfocarFactura` (las
  pasan `cobros-card` ×2, `quote-cobros-card` y `quote-workspace`; el
  montaje de Paywise NO: no tiene rol ni bloque). Campo «Factura» entre
  «Referencia» y «Fecha del cobro» SOLO con `asignacionFactura &&
  vigentes.length > 0 && !reembolso && puedeRegistrarFactura(rol)`
  (COORDINADOR ve el formulario de siempre: el API le descarta el campo).
  Opciones «Sin factura todavía» + «A-0420 · $68,208 MXN · 21 sep 2026» con
  «Ampara $68,208 MXN» / «No ampara ningún cobro todavía» debajo; en
  edición, la factura del cobro que no esté entre las vigentes del vuelo
  (liga que quedó en el original tras reasignar avión) entra como opción
  «Ligada a otro vuelo…» para que el selector no diga «Sin factura
  todavía» con una factura puesta.
  **Preselección del alta solo con cupo** (`facturaPreseleccionada`: UNA
  vigente que todavía no ampara su total ⇒ esa; ya completa —A-0420 tras el
  backfill, FA-A-0434— o 2+ ⇒ vacío): preseleccionar una ya completa ligaba
  en silencio la camioneta de $1,700 de #364 y el pre-cierre dejaba de
  verla; una liga de menos se ve (chip ámbar), una de más no. Alta: la
  llave viaja solo si se eligió una; toast «Cobro registrado · amparado por
  A-0420». Edición: `valoresParaEdicion(values, mostrarSelectorFactura)`
  mete `factura_emitida_id` al diff solo si el selector se pintó.
- **Diálogo «Registrar factura» / «Editar factura»**: bajo los vuelos, por
  cada vuelo elegido cuyo candidato trae `cobros` (hidratación por `ids`
  del selector —que ahora también hidrata un vuelo con grupo pero sin
  cobros— o resultado de búsqueda), bloque «¿Qué cobros cubre esta
  factura? — Vuelo #332» con casillas «21 sep 2026 · $68,208 MXN ·
  Transferencia → Scotiabank Pesos»; «· ya tiene A-0420» deshabilitada si
  la ampara OTRA factura; «Este vuelo no tiene cobros registrados todavía…»
  si no hay; nota del sobre de grupo en vuelos de grupo. **Prefill del alta
  = la MISMA regla del backfill** (`prefillCobrosDeFactura` sobre los
  libres de la misma moneda que el total tecleado: Σ ≈ total ⇒ todos; si
  no, EXACTAMENTE UN cobro ≈ total ⇒ ese; si no ⇒ todos los libres y el
  resumen sale ámbar; sin total ⇒ todos los libres); se re-prellena
  mientras no se toque una casilla; en edición, los que ya ampara. Pie
  `resumenMarcados` («Marcados: $4,377.45 MXN · Factura: $4,377.45 MXN»
  ok / «… (difieren $122.55 MXN)» ámbar, NO bloquea: el API avisa
  `TOTAL_DISTINTO_COBROS`). **`cobro_ids` viaja SOLO con TODOS los vuelos
  hidratados** (`cobrosHidratados`): el PATCH REEMPLAZA el conjunto y
  mandar las casillas de los que sí cargaron desligaría en silencio los
  del que no cargó; con un vuelo sin `cobros` todas las casillas se apagan
  con «No se pudieron cargar los cobros: guarda la factura y asígnala desde
  cada cobro». En el alta viaja también `[]` (el API evalúa «quedan cobros
  sin factura»); ausente ≠ `[]`. En edición `cambiosDeEdicion` lo compara
  como conjunto contra `factura.cobros` y solo lo manda si cambió. Editar
  una factura CANCELADA (el menú lo permite): casillas apagadas con «Esta
  factura no está vigente: no puede amparar cobros…» y sin la llave (el API
  respondería 409 `FACTURA_NO_VIGENTE`). El updater de `setCobroIds` es
  PURO: qué vuelos se prellenan (y el `ref.add`) se decide fuera de él
  (React lo invoca dos veces en desarrollo).
  Avisos nuevos del API (`TOTAL_DISTINTO_COBROS`, `COBROS_DESLIGADOS`,
  `COBROS_SIN_FACTURA`) salen como `toast.warning` de 10 s; el 409
  `COBRO_CON_OTRA_FACTURA` va al banner rojo con `mensajeErrorCobroFactura`.
  El switch «Factura parcial» se conserva con la ayuda nueva («Para
  registrar varias facturas ya no hace falta: a cada una se le marcan sus
  cobros»).
- **Selector de vuelos**: chip «Tiene A-0420» (antes «Ya tiene»), gris e
  informativo (title «puedes agregarle otra si ampara otros cobros»); no
  deshabilita nada. `VueloSeleccionado.cobros`: `undefined` = sin hidratar
  (o falló), `null` = hidratado por un API sin la llave.
- **Registro**: la alerta `DUPLICADO_VUELO` se rotula «Facturas que no
  cuadran» (filtro `duplicado_vuelo` conserva su valor; chip del resumen
  «Vuelos con facturas que no cuadran»; mismo rótulo en el Excel del API) y
  su tooltip son los `alertas_detalle[].mensaje` unidos por « · » (sin
  detalle, la ayuda general). Un vuelo con 2 facturas que cuadran ya no es
  alerta. Bajo cada folio de «Vuelo(s)»: «· 1 cobro» / «· 3 cobros» y «· 3
  sin factura» (`tonoSinFacturaRegistro`: ámbar solo si esta factura ya
  clasificó cobros de ese vuelo o el vuelo tiene otra vigente; gris con una
  sola factura global sin clasificar, para que FA-A-0433 ×12 no amanezca
  en ámbar).
- **Pre-cierre** (`lib/admin/pre-cierre-factura.ts`): el renglón
  `vuelos_cobrados_sin_factura` acepta vuelos que YA tienen factura cuando
  el API manda `registrada` + `cobros_sin_factura` ⇒ chip «#332 (A-0420 · 3
  cobros sin factura · Scotiabank Pesos)» con title «Ya tiene factura, pero
  3 de sus cobros que exigen factura no están amparados por ninguna.
  Asígnala desde cada cobro o registra la que falta.» (misma card de
  cobros). Sin `registrada`, el chip de siempre. «Por facturar», la columna
  «FACTURA VUELATOUR» y la solicitud automática siguen por vuelo.
- **Skew**: panel viejo + API 0.0.82 ⇒ ignora las llaves nuevas; panel
  nuevo + API ≤ 0.0.81 ⇒ sin controles nuevos y sin mandar nada; panel
  nuevo + 0.0.82 sin migración ⇒ ídem (`asignacion_disponible: false`).
- Pruebas: `lib/admin/__tests__/cobro-factura.test.ts` (regla y textos),
  `cobro-edicion.test.ts` (diff de la factura fuera del candado),
  `facturas-emitidas.test.ts` (`cobro_ids` ausente ≠ `[]`, conjunto en
  edición, rótulo), `pre-cierre-factura.test.ts` (chip con `registrada`),
  `flights/__tests__/cobros-card-facturas-emitidas.test.tsx` (describe
  «FACTURAS POR COBRO»), `cobros-card-editar.test.tsx` (cableado del
  selector) y `facturas-emitidas/__tests__/registrar-factura-dialog.test.tsx`
  (cableado de las casillas; el diálogo es un portal).

## Inicio oficial 1-sep-2026 (16-oct-2026, API 0.0.84)

Pedido del cliente: «Quitemos todo lo de Agosto … para que iniciemos en
septiembre 2026 de forma oficial», porque agosto se cerró en el sistema
anterior. Promesa: vuelos, cotizaciones, gastos, ingresos, conciliación,
reportes, pre-cierre y reparto arrancan en septiembre; los datos QUEDAN
GUARDADOS; es reversible y NO toca inventario ni horas. **El piso solo
oculta**: ningún número de un periodo ≥ inicio cambia, ni un saldo acumulado.
El que recorta listados y reportes es el API (invariante 86); el panel solo
acota sus selectores, sube un `?desde` viejo con aviso, recorta atajos y
pinta el chip/franja de lo anterior.

- **Fuente ÚNICA**: `GET /v1/me` → `config.inicio_oficial` («AAAA-MM-DD» de
  pared Cancún o `null`). NUNCA la fecha en duro: `lib/admin/inicio-oficial.ts`
  no tiene constante por defecto. `inicioOficialDeMe` valida (inválida ⇒
  `null`).
  - Servidor: `getInicioOficial()` (`lib/api/inicio-oficial.ts`, `react.cache`
    sobre `getMe`: cero HTTP extra; si `/me` falla ⇒ `null`, jamás tumba la
    página).
  - Cliente: `InicioOficialProvider` lo monta `AdminShell` con
    `inicioOficialDeMe(me)`; `useInicioOficial()` (fuera del Provider ⇒ `null`).
  - **`generateMetadata` NO lo lee** (regla 5 de titulos-pestana: el head no
    toca el API). El título de una URL vieja puede decir agosto; la página
    dice el periodo ajustado.
- **Skew**: API ≤ 0.0.83 (sin la llave), fila apagada (`activa=false`) o
  inválida ⇒ `null` ⇒ **cero cambios visibles** (todas las funciones devuelven
  su entrada tal cual; los tests lo fijan con «null ⇒ idéntico»). Orden de
  despliegue: API 0.0.84 → panel → migración `20261016000002` (el interruptor).
- **Reglas puras** (`lib/admin/inicio-oficial.ts`, espejo de
  `common/inicio-oficial.util.ts` del API): `ajustarRangoAlInicio` (URL
  vieja: `hasta < inicio` ⇒ el mes del inicio, cortado en hoy si es el mes en
  curso; solo `desde < inicio` ⇒ `desde = inicio`; sin extremos NO inventa
  rango), `ajustarMesAlInicio`, `pisoDesde`/`pisoMes`, `ventanaConPiso`
  (`max(hoy − N, inicio)`), `mesesDesdeInicio`, `recortarAtajos` (quita el
  atajo ENTERO antes; la ventana que lo cruza se llama «Desde el 1-sep-2026»),
  `esAntesDelInicio` (un instante pasa a día Cancún: `2026-09-01T04:59:59Z` es
  31-ago), `vaciarDiasAntesDelInicio` (calendario) y los textos exactos.
- **Selectores** (`min`): las barras de Vuelos, Cotizaciones, Grupos, Gastos
  (fecha y captura), Otros gastos, Nómina, Gastos personales, Combustibles
  (`type="month"`: `min` = mes del inicio), Ingresos, Conciliación (+ «Cruzar
  pendientes», «Sugerir con IA», reporte Excel, Paywise y sugerencias de
  abonos), Facturación automática, Facturas emitidas, Caja chica,
  `PeriodSelector` y Taco-live. La ficha del piloto (`mes-stats-selector`)
  dejó de ser excepción en la auditoría 16-oct (ver abajo). `MesReporteSelect` ofrece
  meses desde el del inicio (`opcionesMesReporte`; `null` ⇒ desde ene-2026).
- **Atajos**: «Mes pasado / Mes anterior» (Reportes, Reparto, Ingresos,
  Conciliación, Cotizaciones) no se ofrece si el mes queda entero antes;
  «Últimos 90 días» (Ingresos, Conciliación) ⇒ «Desde el 1-sep-2026»; «Cruzar
  pendientes» / «Sugerir con IA» (30 días) y «Por conciliar» (90 días, SIN
  aviso: nadie pidió agosto) ⇒ `max(hoy − N, inicio)`.
- **URL vieja ⇒ aviso sin redirigir** (`AvisoPeriodoAjustado`: «El sistema
  arranca el 1-sep-2026; ajustamos el periodo a partir de esa fecha.»):
  Reportes, Balance en pantalla, Reparto, Tableros, Otros gastos, Nómina,
  Gastos personales, Combustibles, Calendario, Ingresos; y en las listas sin
  rango por defecto (Vuelos, Cotizaciones —también en el detalle, para que las
  flechas coincidan—, Grupos, Gastos, Conciliación, Facturación, Facturas
  emitidas) solo se sube un `?desde`/`?hasta` explícito. La llave `ajustado`
  de los filtros existe SOLO cuando es `true` y nunca viaja al API.
- **Flechas**: Calendario «Mes anterior» y Nómina «‹ anterior» deshabilitadas
  en el mes del inicio (`title` «El sistema arranca en septiembre de 2026»);
  en la cuadrícula los días anteriores van en gris y sin eventos (el API de
  calendario no se toca: lo usa la app).
- **«Todas las fechas»** ⇒ «desde el 1-sep-2026»: encabezado y nota de
  Cotizaciones, nota sin periodo y ventana «sin banco» de Conciliación,
  «Limpiar» de Caja chica. «Anticipos con saldo (todas las fechas)» NO cambia:
  es saldo vivo.
- **Cruces (chip y franja)**: `ChipInicioOficial` («De antes del inicio
  oficial (1-sep-2026)») junto a cobros del detalle del vuelo, gasto/cobro
  ligado en Conciliación (también cada gasto de un lote: `LineaGastoLote.fecha`),
  vuelos de una factura en el registro de Facturas emitidas y anticipos con
  saldo. `FranjaAntesDelInicio` arriba del detalle por id (vuelo, cotización,
  hoja de un ingreso). Se edita como siempre (no bloquea). Donde el API solo
  manda el folio del vuelo (gasto → vuelo, entrada de Ingresos → vuelo,
  cobro de Conciliación → vuelo) NO hay chip del vuelo: el vuelo abre por id
  con su franja (sin campo nuevo en el API, por contrato).
- **Capturas con fecha anterior** (`AvisoCapturaAntesDelInicio`, no
  bloqueante, mismo patrón que `avisoFechaAntesDelArranque`): alta y
  verificación de gasto, cobro, reembolso, cobro de grupo, ingreso,
  movimiento de caja chica y corregir la fecha desde Conciliación. El API
  acepta la fecha (la cola offline de la app tiene capturas fechadas).
- **Caja chica**: el API sigue mandando el libro COMPLETO (saldo por fila y
  tarjetas intactos, `NOTA_SALDO_LIBRO_COMPLETO`). Sin `?desde` la vista va
  `{desde: inicio}` (no cuenta como filtro: sin «Limpiar»); «Limpiar» vuelve
  ahí, no al libro completo. **«Saldo inicial al 1-sep-2026»**
  (`saldoInicialAlInicio`): `saldo` y `por_reponer` de la ÚLTIMA fila
  anterior al inicio tal como los calculó el API (el `historial` llega del
  más reciente al más viejo: la primera anterior en ese orden; no se reordena
  ni recalcula). Como la tabla va del más reciente al más viejo, el renglón
  sintético va AL PIE, bajo la fila más vieja visible, y solo cuando la vista
  arranca en el inicio. Sin filas anteriores, no hay renglón.
- **Ficha del avión**: `metrics.finanzas_desde` (aditivo) ⇒ «Cobrado vs
  gastos (desde el 1-sep-2026)» / «Utilidad (desde el 1-sep-2026)»; sin la
  llave, «acumulado» de siempre. Horas y vuelos no cambian.
- **No se toca**: existencias/valorizado del inventario, horas de vida
  (horómetro, motores, hélices), saldos y el Inicio del panel (su bug de mes
  en UTC es aparte). Ficha del piloto, tienda, tacómetros, cardex y cuenta
  de socios SÍ se tocaron en la auditoría 16-oct (solo filas y rótulos).
- **Ligas a un movimiento de antes** (revisión adversaria, 16-oct-2026):
  «Ver en Conciliación» de un cargo/abono anterior al inicio llega con
  `?mov=&desde=&hasta=` de ese día, y el listado ya no lo trae NUNCA. Con
  `periodoPedidoAntesDelInicio` la página dice «… es de antes del inicio
  oficial (1-sep-2026): se conserva, pero ya no aparece en Conciliación…» y
  NO ofrece «Ver todos los movimientos» (antes mandaba a «quitar filtros»
  para buscar algo que no iba a aparecer). La hoja «Conciliación con el
  banco» del gasto pinta el chip en ese cargo y en las líneas del lote.
- **Tacómetros en vivo**: un `?fecha=` anterior sube al inicio con el aviso
  (el API devolvía vacío) y «Día anterior» se apaga en el día del inicio.
  «Aterrizajes sin gasto» (`pistas-dialog`): `min` del inicio en sus fechas.
- Tests: `lib/admin/__tests__/inicio-oficial.test.ts`,
  `lib/admin/__tests__/inicio-oficial-modulos.test.ts`,
  `lib/api/__tests__/inicio-oficial-server.test.ts`,
  `components/admin/__tests__/inicio-oficial-ui.test.tsx`,
  `components/admin/__tests__/inicio-oficial-revision.test.tsx`.

### Auditoría 16-oct-2026 (API 0.0.85)

Pedido del cliente tras el deploy: «Ocultarlos está bien, solo asegúrate que
no se vean en ningún módulo». El API 0.0.85 recorta más listas y manda llaves
ADITIVAS; el panel las lee con reglas puras del MISMO archivo
(`lib/admin/inicio-oficial.ts`, sección «Auditoría 16-oct-2026»). **Sin las
llaves (API 0.0.84) o con `null`, el marcado es idéntico** (los tests lo
fijan). Ningún número se recalcula: solo se LEE lo que el API calculó con el
historial completo.

- **Tacómetros del avión** (`aircraft-tacometros-card`): el `historial` ya no
  trae filas anteriores. El «salto en la cadena» se calcula con
  `saltosDeCadena(historial, saldo_inicial)`: la fila FECHADA más vieja se
  compara contra `saldo_inicial.taco` (= llegada de la fila previa) ⇒ el
  mismo salto de antes del recorte; las filas sin fecha (el API las pone al
  final) se comparan entre sí como siempre. Renglón «Saldo inicial al
  1-sep-2026 · Tacómetro N» AL PIE (la tabla va del más reciente al más
  viejo; mismo componente `RenglonSaldoInicial` que el cardex, aspecto de
  Caja chica). Lista vacía con saldo ⇒ «Sin lecturas desde el 1-sep-2026.».
- **Cardex** (ficha del artículo) — **SUPERSEDIDO el 18-oct-2026 (API
  0.0.92)**: el inventario muestra TODO el historial y ya no hay saldo
  inicial (ver «Inventario: todo el historial y cardex como lista por
  fecha»). Lo que sigue es histórico: `saldo_inicial` del API
  (`normalizarSaldoInicialCardex`) ⇒ `FilaSaldoInicialCardex` al PIE del
  cardex (existencia + último precio de compra, tal cual) y arriba del
  RESUMEN por día (orden cronológico); «Dinero generado por este producto
  (desde el 1-sep-2026)» y «Sin compras/ventas/movimientos desde el
  1-sep-2026.» SOLO cuando llega el saldo (con él se sabe que el API recortó).
  El panel NO calcula existencias corridas (las manda el API).
- **Caja chica del panel**: sin cambio (el API sigue mandando el libro
  completo al panel; solo «Mi caja» de la app se recortó).
- **Ficha del piloto (a)**: `min` = mes del inicio en el selector y un
  `?mes=` anterior se pide como el mes del inicio con `AvisoPeriodoAjustado`
  (mismo patrón de Nómina; funciona igual con 0.0.84). «Histórico» de
  honorarios ⇒ «Desde el 1-sep-2026» con `honorarios.desde`.
- **Ficha del avión (b)**: `metrics.anio_desde` ⇒ KPI «Horas mes / desde el
  1-sep-2026» (`rotuloHorasMesAnio`); sin la llave «Horas mes / año».
- **Bitácora PDF (d)**: `min` del inicio en las dos fechas, el `desde` que
  viaja pasa por `pisoDesde` y un `hasta` anterior al inicio no se pide.
- **Vuelo anterior del avión (e)**: la liga se conserva; chip SOLO con
  `anterior.antes_del_inicio === true` (`ChipInicioOficial antes`: la
  bandera del API decide, no la fecha).
- **Facturas emitidas (f)**: chip «Registradas desde el 1-sep-2026» con
  `resumen.desde` (`rotuloRegistradas`); los huecos siguen sobre la serie.
- **Cuenta de socios (h)**: `opcionesMesArranque`, `opcionesFiltroMeses`,
  `filtroMesesCuenta` (sube `?desde=2026-07` con `ajustado` ⇒ aviso),
  `mesParaVerEntregasPrevias` (si entre el inicio y el arranque no cabe un
  mes ⇒ null: ya no manda a ver agosto) y `validarFormCuenta` reciben el
  inicio (parámetro opcional; `null` ⇒ como antes). El 400
  `CUENTA_ANTES_DEL_INICIO` pinta el `message` del API (respaldo sin fecha
  en duro en `MENSAJES_RESPALDO`); el formulario lo avisa antes con
  `textoCuentaAntesDelInicio`.
- **Ingresos (i)**: chip por `fecha_vuelo` en los vuelos candidatos de
  «Registrar ingreso», «Cobro desde abono» y «Aplicar anticipo», y en el
  aviso «Este abono cuadra con un cobro de vuelo». `vuelosCandidatos` NO
  lleva piso (un depósito de septiembre puede pagar un vuelo de agosto).
- **Utilidad de la tienda** — **SUPERSEDIDO el 18-oct-2026**: sin piso del
  inicio, «Todo» vuelve a ser todo el historial. Histórico (revisión
  adversaria): el API 0.0.85 sube el
  `desde` de `tienda/resumen` aunque no se mande ⇒ «Todo» decía «todo el
  historial» y la columna de utilidad por ítem seguía de por vida. Ahora
  `rangoPeriodoTienda("todo", hoy, inicio)` = del inicio a hoy (tarjeta,
  columna y Excel cuentan lo mismo con 0.0.84 y 0.0.85), rótulo «desde el
  1-sep-2026» y «Mes pasado» no se ofrece si queda entero antes
  (`periodosTiendaOfrecidos`, `periodoTiendaConInicio`).
- Tests: `lib/admin/__tests__/inicio-oficial-auditoria.test.ts`,
  `components/admin/__tests__/inicio-oficial-auditoria.test.tsx` y el
  bloque «inicio oficial (API 0.0.85)» de
  `components/admin/inventory/__tests__/ficha-producto.test.tsx`.

## Varias facturas por gasto (16-oct-2026, API 0.0.86)

Pedido del cliente con captura: en «Verificar / editar» las «Hojas del
comprobante» PDF salían como chips «PDF» que no se veían ahí, y «Subir
factura» aceptaba UN PDF + UN XML (la segunda REEMPLAZABA a la primera).
ASA entrega 5 CFDI por carga de gasavión (gasto 24b941d4…, 29-sep, N4142R):
Mary terminó metiendo los 5 PDF como hojas. Contrato: invariante 87 del API
(tabla puente `gasto_factura_recibida`, migración `20261016000003`;
`gasto.factura_recibida_id` sigue siendo la PRINCIPAL — folio de
Conciliación/Excel, trigger FACTURADA). Fuente única del panel:
`lib/admin/facturas-gasto.ts` (PURA; prueba
`lib/admin/__tests__/facturas-gasto.test.ts`). El contrato FINAL salió en el
API **0.0.87** (mismas llaves; además `DELETE …/gastos/:gastoId` responde
`{ok, principal, estatus_facturacion, facturas, avisos, facturas_multiples}`
y con la migración el shape viejo también AGREGA).

- **Lo que viaja**: `POST /v1/invoices/recibidas/de-gasto` con `archivos[]`
  (una entrada POR FACTURA: `{xml_b64?, pdf_b64?, nombre?}`, 1–10) por
  `subirFacturasGastoAction({gastoId, archivos})` (UN objeto: regla del
  base64). La respuesta trae `facturas`, `agregadas` (ligadas en este envío;
  incluye las `EXISTENTE` del buzón, que `detalle[]` cuenta como
  `reutilizadas`), `ya_existian` (las que YA estaban en ESTE gasto),
  `avisos` y `facturas_multiples`. El detalle `GET /v1/expenses/:id` (solo
  roles de oficina) trae `facturas`, `facturas_avisos` y
  `facturas_multiples`; la lista, `facturas_n` (leerlo SIEMPRE con
  `nFacturasDeFila`). Quitar = `DELETE
  /v1/invoices/recibidas/:id/gastos/:gastoId` (quita la LIGA; la factura
  sigue en el buzón; si era la principal, el API promueve la más antigua).
- **Selector ÚNICO** (`gasto-facturas-dialog.tsx`, `GastoFacturasDialog`):
  `type="file" multiple` con PDF y XML juntos (y arrastre). Se emparejan con
  `emparejarArchivosFactura`: (1) mismo nombre base
  (`ACC…_FCUN_1299718.pdf` ↔ `.xml`); (2) si no, por las pistas del XML
  (`pistasDeXmlCfdi`: UUID del timbre o serie+folio/folio ≥ 4 dígitos dentro
  del nombre del PDF), solo con candidato ÚNICO; (3) 1 PDF + 1 XML de
  nombres distintos son la misma SOLO si la selección son exactamente esos
  2 archivos (el caso de siempre: XML del SAT con su PDF). Lo emparejado sin
  coincidir el nombre se DICE en ámbar y tiene «Separar» (el XML queda en
  `separados` y ya no se pega). Revisión adversaria: con más archivos el 1↔1
  a ciegas pegaba el PDF de una factura al XML de otra y el API guardaba la
  huella del PDF en la fila equivocada (después, esa factura subida sola se
  «deduplicaba» contra la otra). Lo demás va suelto («solo PDF» / «solo
  XML»). Rechaza —diciéndolo— tipos ajenos, vacíos, > 3 MB, repetidos, una
  factura cuyo PDF + XML no cabe en una llamada y lo que pase de 10.
  Lista previa «Factura 1…N» con ✕ por factura. La selección asíncrona
  (leer los XML) parte de espejos en ref (`archivosRef`, `fijarArchivos`),
  no del cierre: dos selecciones seguidas o una ✕ durante la lectura se
  perdían; «Subir» se apaga mientras se leen («Leyendo archivos…»).
- **3 MB por archivo, no 8**: el archivo viaja en base64 (+33 %) por una
  server action y Vercel corta en 4.5 MB (413): un PDF de 4 MB fallaba
  SIEMPRE como «el servidor no respondió» (el botón viejo prometía 8 MB).
  El API acepta 25 MB, pero el cuello es Vercel. Para más, el camino sería
  `apiBrowser` directo al API.
- **Lotes**: `partirEnLotes` (≤ 4.3 M caracteres de base64 y ≤ 3 facturas
  por llamada — el API procesa en fila y 10 en una llamada podían pasar
  del tiempo de la función; `maxDuration = 60` en `/admin/expenses`,
  `/admin/flights/[id]` y `/admin/nomina`, donde vive la action). Un PDF
  nunca se separa de su XML. Un lote que falla NO detiene los demás: sus
  archivos SIGUEN en la lista con el motivo (`textoFalloLotes`). Si el
  fallo fue de red/5xx (el API no es atómico por lote) se recarga la lista
  igual, se marca el cambio (refresh al cerrar) y se pide revisarla
  (`TEXTO_REVISA_LISTA`); reintentar no duplica (dedupe por UUID y huella).
  El toast dice cuántas se agregaron (`textoResultadoSubida`; con el API
  previo y factura previa, «Se reemplazó la factura…»).
- **Las actions NO revalidan** (el diálogo sigue abierto con la lista y los
  avisos): al CERRAR con cambios, `router.refresh()` (convención «Red /
  API»). En «Verificar / editar» el refresh trae un `gasto` nuevo y el
  diálogo ya lo tolera (BASE de la sesión).
- **SKEW (obligatorio)**:
  - **«Subir» solo con la lista CARGADA** (`puedeSubir`): mientras carga o
    si falló, no se sabe si el API agrega o reemplaza (revisión adversaria:
    subir antes reemplazaba sin preguntar con el API previo). Al reabrir,
    el hook vuelve a «cargando» (la lista vieja no cuenta).
  - API 0.0.85 (sin `archivos` ⇒ 400 «property archivos should not
    exist»): la action reintenta con el shape de SIEMPRE `{xml_b64,
    pdf_b64, pdf_nombre}` SOLO si es UNA factura Y `permitirLegado` (el
    gasto no tiene factura o el operador CONFIRMÓ el reemplazo); con varias
    no sube NADA y responde `CODIGO_API_SIN_VARIAS` ⇒ el diálogo deja todo
    en la lista y lo dice (`TEXTO_API_SIN_VARIAS`). Si un lote de una sola
    factura entró en modo `LEGADO` y quedan más, SE DETIENE
    (`TEXTO_LEGADO_PARCIAL`): la siguiente la reemplazaría.
  - API 0.0.86 con la migración PENDIENTE: varias ⇒ 503
    `FACTURAS_GASTO_NO_DISPONIBLE` (no escribe nada) ⇒ el mismo código; una
    sola ⇒ `facturas_multiples: false` ⇒ modo `LEGADO`.
  - `facturasDeGastoAction`: con `facturas` en el detalle, `varias =
    facturas_multiples ?? true`; `facturas_multiples` SIN `facturas` (o
    `facturas_error: true`) = fallo de lectura ⇒ error con «Reintentar»,
    nunca «API previo» (hoy el API omite las tres llaves si la lectura
    falla: pendiente pedirle la bandera); sin la llave (0.0.85) arma la lista con la
    ÚNICA factura (`GET /v1/invoices/recibidas/:id`) y `varias: false`. Con
    `varias: false` el selector admite UNA factura (`decidirSubida`,
    `TEXTO_SOLO_UNA_FACTURA`) y, si ya hay una, el aviso ámbar
    `TEXTO_LEGADO_YA_TIENE` («si subes otra, la REEMPLAZA») y subir CONFIRMA
    antes («¿Reemplazar la factura de este gasto?»: lo destructivo pregunta;
    antes era solo el aviso). «Quitar de
    este gasto» solo con `varias === true`; un 404 «Cannot DELETE» se dice
    en es-MX (`TEXTO_QUITAR_NO_DISPONIBLE`).
  - Sin `facturas_n` en la lista, el ícono es el de siempre (⬆ / 📎).
- **Columna Facturación** (`gasto-factura-button.tsx`): ⬆ sin facturas, 📎
  con una, 📎 + número con varias (junto al semáforo se lee «● Facturada
  📎 5»; el semáforo sigue siendo el menú de estados, por eso el número va
  en el ícono y no dentro del pill). Clic = el diálogo con la lista: cada
  factura con folio (`etiquetaFactura`: SERIE-FOLIO, el nombre del PDF o el
  UUID corto), emisor · total · qué archivos tiene, «Ver aquí» (visor del
  PDF), «PDF ↗», «XML ↗» y «Quitar de este gasto» CON confirmación
  (`TITULO_QUITAR_FACTURA` / `textoQuitarFactura`: «NO se borra…», «era la
  principal…», «era la única: regresa a Pendiente»).
- **Avisos ámbar NO bloqueantes**: SOLO los del API (`facturas_avisos` del
  detalle, que se recarga tras subir/quitar). El panel NO calcula la suma:
  el API excluye las facturas que amparan además OTROS gastos (VIP SAESA) y
  un espejo aquí avisaría en falso.
- **«Verificar / editar»** (`expense-verify-dialog.tsx`): bloque «Facturas
  del gasto (N)» (`FacturasDelGastoSeccion`: la lista con «Ver aquí» y el
  botón «Subir facturas», que abre el MISMO diálogo anidado; fuera del
  `<form>`; su select «Facturación (oficina)» NO se resincroniza tras subir
  —el trigger pone FACTURADA y el campo solo viaja si se tocó—: pendiente
  conocido). En «Hojas del comprobante» cada PDF (principal o guardada)
  tiene «Ver aquí» ⇒ visor incrustado debajo de la lista (uno a la vez; se
  cierra al reabrir el diálogo o al quitar esa hoja). Una hoja sin firma ya
  NO es texto sin enlace: «Abrir» pide la firma en el clic; la principal sin
  firma dice su nombre con «Abrir» (antes «no tiene foto»).
- **Tablas** (`expenses-table.tsx`, `flight-gastos-table.tsx`): «+N hojas»
  es un botón (`hojas-comprobante-boton.tsx`) que abre el comprobante
  completo (hoja 1 = la que lee la IA): fotos con su miniatura (zoom), PDF
  con «Ver aquí» (el primer PDF se abre solo) y «Abrir en pestaña nueva».
- **Visor** (`components/admin/visor-archivo.tsx`): `VisorPdf` = `<iframe>`
  con la URL FIRMADA (Supabase sirve el PDF inline; el panel no tiene CSP
  que lo impida). La URL VENCE: al montar, si la que trae la página es
  vieja (`debeRenovarUrl`, el `exp` del token) o no hay, pide otra ANTES de
  pintar el iframe — un iframe con firma vencida enseña el JSON
  `InvalidJWT` y no hay `onError` que lo detecte. «Volver a cargar» siempre
  re-firma; «Abrir en pestaña nueva» (`BotonAbrirFirmado`) usa la fresca o
  la pide en el MISMO clic (`abrirArchivoFirmado`, Safari). Facturas =
  bucket `facturas` por `/v1/storage/firmar` (lista blanca, ADMIN/
  COORDINADOR/FACTURACION; equivale a `POST /recibidas/file-urls`, que desde
  0.0.87 también admite COORDINADOR) con el lote de `pedirUrlFirmada`;
  hojas = `gasto-fotos`. Las confirmaciones «¿Reemplazar?» y «¿Quitar?» van
  DENTRO del popup del diálogo con `backdropForceRender` (anidado de Base
  UI); si el diálogo ya se cerró al terminar algo, se refresca igual. En el celular el iframe
  puede mostrar solo la primera página: el texto lo dice y ofrece la
  pestaña nueva.
- `fileToBase64` se importa DIFERIDO en el diálogo (su módulo carga el
  cliente de Supabase del navegador, que exige variables al CARGAR, y el
  diálogo vive dentro de «Verificar / editar», que las pruebas renderizan
  sin ellas).
- Tests: `lib/admin/__tests__/facturas-gasto.test.ts` (emparejar, pistas,
  lotes, skew, textos), `app/admin/expenses/__tests__/facturas-gasto-actions.test.ts`
  (archivos[], reintento legado, 400/503 con varias, detalle 0.0.85/0.0.86,
  DELETE) y `components/admin/expenses/__tests__/facturas-gasto-ui.test.tsx`
  (ícono con número, lista sin «sin facturas» en fallo, cableado de
  confirmación, refresco al cerrar y visores). `verFacturaGastoAction` y
  `subirFacturaGastoAction` (una sola) se fueron: no tenían otros usuarios.

## Cierre de mes y vuelos diferidos (16-oct-2026, API 0.0.88)

Pedido del cliente: «Necesito una opción para cerrar el mes que no es el
corriente, para el mes anterior … y los vuelos que aún no se cobren se marquen
en el balance y se muevan para el siguiente mes hasta que se cobre y
complete». Decisiones ya tomadas (16-oct): el vuelo pasa COMPLETO (venta,
gastos del vuelo, comisiones; las HORAS se quedan en su fecha real), un cobro
parcial también pasa, mes cerrado = BLOQUEADO para capturas (409
`MES_CERRADO`) y «Reabrir» solo ADMIN con confirmación. Contrato del API:
invariante 89 (`cierre_mes`, `cierre_mes_vuelo`, `vuelo.periodo_contable` /
`fecha_contable`, migración `20261016000004`). **El panel no calcula dinero
ni decide qué vuelo pasa**: copia montos, leyendas (`leyenda`,
`cierre_marca`) y textos de los 409 del API. Fuentes únicas PURAS:
`lib/admin/cierre-mes.ts` (roles, textos, badge, normalización, chips) y
`lib/admin/mes-cerrado.ts` (aviso del 409); pruebas en
`lib/admin/__tests__/cierre-mes.test.ts`, `mes-cerrado.test.ts` y
`components/admin/reportes/__tests__/cierre-mes-ui.test.tsx`. Tipos en
`types/cierres.ts`.

- **Reportes → «Cierre y reparto del periodo»** (`cierre-mes-card.tsx`,
  servidor, en su PROPIO Suspense; `cierre-mes-acciones.tsx`, cliente). Lee
  `GET /v1/cierres` (`lib/api/cierres-server.ts`, `react.cache`, nunca lanza)
  y evalúa el MES del periodo (`mesDeVistaCierre`: mes calendario completo o
  «Este mes»; otro rango ⇒ guía «elige «Mes pasado · Septiembre 2026»»).
  Badge: «Abierto» / «Cerrado el 16-oct-2026 por Ale» / «Reabierto el … por
  … (motivo)» / «En curso (se cierra a partir del 1-nov)».
  - **«Cerrar <mes>»** (ADMIN y FACTURACION; deshabilitado con el texto de
    `motivo_no_cerrable`, mismo texto que el 409 del API). El diálogo pide
    la previa AL ABRIR (`previaCierreAction` → `GET
    /v1/cierres/:periodo/previa`, lectura pesada) y pinta: bloqueantes (con
    «Resolver en el pre-cierre →» al ancla de la card de arriba), la tabla
    «Vuelos que pasarán a octubre 2026» (folio · cliente · avión · fecha ·
    venta · cobrado al 30-sep · por cobrar al 30-sep · cobrado después), «Vuelos que
    vienen de …» si hay, el resumen y el saldo del reparto antes → después
    solo de los aviones que cambian. Casilla «Entiendo que septiembre 2026
    quedará bloqueado para capturas» obligatoria. `cerrarMesAction` manda
    `vuelos_esperados` = los ids que se VIERON: con 409 `PREVIA_CAMBIO` el
    diálogo se repinta con la previa nueva de `details` y hay que volver a
    marcar la casilla; cualquier otro rechazo, el `message` del API tal cual.
  - **«Reabrir mes»** (solo ADMIN): motivo 5–300 y la confirmación «Al
    reabrir, los 5 vuelos que pasaron a octubre 2026 regresan a septiembre
    2026 y el mes vuelve a aceptar capturas. Octubre 2026 debe estar
    abierto.» (`totales.vuelos_diferidos`).
  - Las actions (`app/admin/reportes/actions.ts`) **solo revalidan en el
    éxito** (Reportes, balance en pantalla, reparto); en un rechazo el
    diálogo sigue montado y hace `router.refresh()` al cerrarse (convención
    «Red / API»).
- **Chips** (`components/admin/chip-cierre.tsx`, sin hooks): el TEXTO es
  siempre el del API; el color sale de cómo arranca (`tonoMarcaCierre`):
  «Pasa a…» ámbar, «Viene de…» azul, «Pendiente de cobro…» / «Pasará a…»
  ámbar claro; un texto que no reconoce NO se pinta. Dónde:
  - Reparto (`/admin/profit-sharing`): `CierreRepartoAviso` (estado del mes,
    aviso rojo si `coincide_con_snapshot === false`, bloques «Pasan a
    octubre 2026 (sin cobro completo al 30-sep, no se reparten)» / «Vienen
    de…» / «Pasarán a octubre 2026 al cerrar el mes (sin cobro completo al
    30-sep)»), `CierreRepartoAvion` en cada card (la leyenda del API en el
    `title` de cada línea) y `cierre_marca` junto a la ruta en el desglose.
  - Balance en pantalla: junto al título, estado + conteos («5 pasan a
    octubre 2026», `chipsResumenDiferidos`) de `libro.cierre` (pyservices lo
    copia a la raíz del JSON). Las marcas por vuelo YA vienen en las celdas.
  - Pre-cierre: badge del estado en el título; en `cobros_pendientes` y el
    renglón nuevo `vuelos_que_vienen` una línea por vuelo con su `leyenda`
    (`lineasLeyendaPreCierre`, tope 8 + «y N más» contra `count`); sin
    leyendas (API previo) los chips genéricos de siempre.
  - Detalle del vuelo: «Viene de septiembre 2026» / «Mes cerrado»
    (`chipsCierreVuelo`, de `snapshot.cierre`).
  - Libro Dinero: es Excel (sin pantalla); la marca la pinta pyservices.
- **409 `MES_CERRADO` en formularios**: `toastMesCerradoSiAplica(res)`
  (`components/admin/aviso-mes-cerrado.tsx`) pinta el `message` del API tal
  cual («Septiembre 2026 ya está cerrado (Ale, 16-oct). Reábrelo en Reportes
  para corregir.») con la acción «Ir a Reportes» (el mes completo, donde
  ADMIN ve «Reabrir mes») y devuelve true para que el formulario no pinte su
  toast genérico. Cableado en: alta/edición/baja de gasto (crear,
  verificar/editar —con y sin reparto—, eliminar, repartir), cobros
  (registrar, corregir, eliminar en vuelo y cotización, desde abono, aplicar
  anticipo), ingresos (registrar/editar, baja), caja chica (movimiento,
  eliminar), entregas a socios (registrar/editar, eliminar), cotizador
  (`decidirErrorRevise` ⇒ tipo `mes_cerrado`: ANTES no era «la cotización
  cambió mientras editabas») y «Corregir fecha» de Conciliación (`bloqueo`
  de esa fecha). Las actions de Gastos y Caja chica conservan `code` /
  `details` SOLO para este código (el resto de sus fallos, la forma de
  siempre). No hay aviso preventivo antes de enviar: decide el API.
- **SKEW**: panel nuevo + API 0.0.87 ⇒ `GET /v1/cierres` 404 «Cannot GET» ⇒
  la card dice «El cierre formal necesita el API 0.0.88…» y nada más
  cambia; sin la migración (503 `CIERRE_NO_DISPONIBLE` o
  `disponible:false`) ⇒ «todavía no está activo en la base de datos»; sin
  permiso ⇒ nada; red/500 ⇒ «No se pudo leer…» (jamás «Abierto» sin leer).
  Sin `cierre` / `cierre_marca` / `leyenda` en los payloads ⇒ ningún chip.
  Orden de despliegue: migración ⇒ pyservices ⇒ API ⇒ panel. El PRIMER
  cierre lo hace la oficina desde el panel.
- **Revisión adversaria (16-oct-2026, contra el API real)**:
  - Textos de «no se puede cerrar»: espejo EXACTO de `textoMotivoNoCerrable`
    del API («… se cierra a partir del 1 de noviembre.»; el año solo si
    cambia: «1 de enero de 2027»), incluido `PERIODO_ANTES_DEL_INICIO`. En
    el diálogo gana `previa.texto_no_cerrable` del API
    (`textoNoCerrableDePrevia`). La card deshabilita también con
    `puede_cerrar:false` y un código desconocido (`textoNoCerrableDeMes`).
  - Confirmar = `puedeConfirmarCierre` (previa leída, `listo`, sin motivo,
    no CERRADA, casilla). La respuesta la decide `decidirRespuestaCerrar`
    (éxito / previa nueva / error); el texto de un rechazo de cerrar o
    reabrir, `mensajeErrorCierre`: el `message` del API tal cual salvo lo
    técnico (sin respuesta, `PARSE_ERROR`, «Internal server error»,
    403 del RolesGuard en inglés, 404 «Cannot POST», 503 sin migración).
    **Un POST sin respuesta pudo aplicarse**: el texto pide RECARGAR antes
    de reintentar. Reabrir también refresca al cerrar tras un rechazo.
  - `/admin/reportes` lleva **`maxDuration = 300`**: sus server actions lo
    heredan y el cierre corre en el API pre-cierre + dos repartos.
  - La tabla «Vuelos que vienen de …» rotula «Cobrado al cerrar su mes» /
    «Por cobrar entonces» (montos de la bitácora del cierre de ORIGEN) y no
    pinta «Cobrado después».
  - Pruebas: `app/admin/reportes/__tests__/cierre-actions.test.ts` (cuerpo
    exacto, nada inválido sale a la red, solo el éxito revalida, el
    rechazo conserva code/details/status, skew de la previa).
- **Caso #351 (16-oct-2026, API 0.0.91)**: el cliente vio «aparece que aún
  no se cobran pero sí están cobrados». Los cinco de septiembre (#316, #337,
  #343, #344, #351) pasan a octubre con motivo `COBRO_POSTERIOR`: no estaban
  cobrados al 30-sep, pero se cobraron en octubre. Un vuelo que pasa NO
  siempre está «pendiente de cobro», así que ningún texto PROPIO del panel lo
  dice; la regla que sí es cierta de todos es «sin cobro completo al <corte>».
  - Las LEYENDAS siguen siendo del API y ya dicen cuándo se cobró («Pasa a
    octubre 2026 · cobrado el 14-oct, después del 30-sep (…)», «Pasará a
    octubre 2026 al cerrar · cobrado el 14-oct, …»). Siguen arrancando con
    «Pasa a» / «Pasará a» / «Pendiente de cobro», así que `tonoMarcaCierre`
    no cambió (sus pruebas lo congelan con las marcas nuevas).
  - Textos propios (`lib/admin/cierre-mes.ts`, mismos que el PDF y el Excel
    de pyservices): `tituloBloquePasan` / `tituloBloquePasarian` (arriba),
    los `title` de `chipsCierreVuelo` («Sin cobro completo al 30-sep
    (cierre de septiembre 2026): su dinero cuenta en el mes al que pasó.»)
    y de `chipsResumenDiferidos` («Sin cobro completo al 30-sep: no suman en
    este mes (#316, #337).»; el corte sale del `corte` del API o, sin él, de
    `corteCortoDeDestino`), y la descripción del diálogo de cierre
    (`textoDescripcionCerrar`: «…también los que se cobraron después de esa
    fecha: su dinero cuenta en ese mes.»).
  - Diálogo de cierre: la celda «Cobrado después» es `textoCobradoPosterior`
    («$2,343.20 USD · el 14-oct») con `fecha_cobro_posterior` (ADITIVO del
    API 0.0.91, día Cancún `YYYY-MM-DD`, leído con `diaCortoDeDia`, espejo
    del API; un timestamp NO se recorta a día). Sin la llave (API previo),
    solo el monto. La columna se llama «Por cobrar al 30-sep» y va en GRIS
    (no en ámbar) cuando `porCobrarYaSeCobro` (motivo `COBRO_POSTERIOR` del
    API). La línea de resumen (`resumenPrevia`) suma «; después se cobraron
    $16,199.76 USD» con `totales.pasan_cobrado_posterior_usd` > 0.
  - `VueloDiferidoMarca` suma los ADITIVOS del 0.0.91 (`motivo`, `corte`,
    `cobrado_posterior_usd`, `fecha_cobro_posterior`,
    `cobrado_despues_usd/_mxn`, `fecha_cobro_despues`); el panel solo usa
    `corte`. Skew: panel nuevo + API ≤ 0.0.90 ⇒ títulos nuevos (el corte se
    deduce del destino) y la celda sin fecha; nada se rompe.

## AFAC por vuelo (16-oct-2026, API 0.0.89)

Pedido del cliente (URGENTE): «lo del AFAC … debe aparecer en balance general
en la hoja de Otros movimientos para poder confirmar el monto, estaría bien que
estuvieran 2 columnas juntas, una que sea lo reservado de afac o cotizado y
otra de lo que realmente costó y que en esa celda poder poner el monto y se
registre sin tenerte que ir a otro lado» y, después, «la columna nueva que te
pedí mejor que sea en la columna de egreso». Decisiones del cliente (16-oct):
una fila POR VUELO; el costo real es EGRESO DE VUELATOUR (el avión sigue
pagando lo RESERVADO, su columna PERMISO AFAC (PROVISIÓN)); se escribe SOLO el
monto del vuelo (no crea gasto); los pagos al gestor se MARCAN «Pago de AFAC» y
dejan de restarle al avión. Contrato del API: invariante 90 (migración
`20261016000005`: tabla `afac_vuelo` + `gasto.es_pago_afac`), `PUT` / `DELETE
/v1/flights/:id/afac-real`, `config.afac_real` en `/v1/me`. pyservices pinta
cada vuelo como fila NORMAL de «otros movimientos» (RESERVADO en INGRESO,
COSTO REAL en EGRESO, remanente = ingreso − egreso) y marca la celda EGRESO con
`vinculo` `afac_real`. **El panel no calcula dinero**: el reservado, el
remanente, los totales y el bloque VUELATOUR llegan en el libro.

- **Quién captura** (`lib/admin/libro-afac.ts`): `ROLES_AFAC_REAL` = ADMIN,
  FACTURACION, COORDINADOR (espejo del API; ANALISTA ve el libro sin editar) Y
  `config.afac_real === true` (la base ya tiene la migración):
  `puedeEditarAfacReal(me)`. La página del balance lo lee de `getMe()`
  (cacheado por el layout; si falla, nadie edita) y pasa `edicionAfac` a
  `LibroExcel`; solo cuenta con `pantalla`. `AdminShell` monta
  `AfacRealProvider` con el mismo valor para los formularios de gasto.
- **La celda** (`leerVinculoAfacReal`): vínculo `{tipo:'afac_real',
  campo:'costo_real_mxn', vuelo_id, clave, matricula, valor, reservado_mxn,
  editable, motivo, mes, capturado_por, capturado_at}` (tipo
  `VinculoAfacReal` en `types/libro-excel.ts`); cualquier otra forma ⇒ solo
  lectura. `prepararHojaAfac` (puro, en un `useMemo` sobre la hoja del libro)
  pone en cada celda `afac_real` su `edicion` (SOLO del panel: `editable` /
  `bloqueada` / `guardando` + tooltip) y, si hay un cambio local, el número
  tecleado con el formato de la celda; sin celdas `afac_real` devuelve la
  MISMA hoja (marcado byte a byte). Tooltip: «Costo real AFAC de este vuelo
  (lo paga VuelaTour): doble clic, Enter o empieza a escribir para
  capturarlo; Supr para quitarlo.»; bloqueada: el `motivo` del API (mes
  cerrado con `textoMesCerrado`, fila de otro avión, migración pendiente) o
  «Solo administración, facturación o coordinación captura el costo real.».
  CSS (`styles/libro-excel.css`): `xl-edicion-editable` (cursor de texto y
  raya verde abajo), `xl-edicion-guardando` (gris en cursiva),
  `xl-edicion-bloqueada` (`not-allowed`); ninguna toca el `position`.
- **Editar** (`libro-excel.tsx` + `libro-afac-edicion.tsx`): doble clic (el
  2.º clic del `<tbody>` delegado, `e.detail === 2`), Enter o F2 abren el
  cuadro con el valor («4427.80», todo seleccionado); un dígito o el punto lo
  abren REEMPLAZANDO; Supr/Retroceso sobre una celda con valor piden quitar.
  El cuadro (`EditorCeldaAfac`, `.xl-editor-afac`) es un `<input>` HIJO
  ABSOLUTO del marco (`.xl-marco` ganó `position: relative`) con el
  rectángulo REAL del `<td>` medido en el manejador (`cajaEditorAfac`: el alto
  de fila del libro es nominal), z-index 1 (por debajo de lo inmovilizado);
  así las filas memo NO cambian de props. Ninguna tecla sube al marco
  (`stopPropagation`); Enter guarda y baja (Mayús+Enter sube), Tab guarda y
  avanza, Esc cancela; salir con clic guarda; cambiar de ventana NO (el
  cuadro sigue abierto). La barra de fórmulas enseña lo que se teclea.
  `decidirGuardadoAfac`: lo mismo ⇒ nada; vacío sobre un valor ⇒
  «¿Quitar el costo real AFAC?» («… de #236 · Ambulancia Internacional? El
  vuelo vuelve a «sin capturar» y deja de contar como egreso de VuelaTour. Hoy
  tiene $4,500.00.», regla del cliente: lo destructivo confirma) ⇒ `DELETE`;
  un monto ⇒ `PUT`; lo ilegible ⇒ «Escribe el monto en pesos, por ejemplo
  4427.80» (negativo: «… Escribe 0 si AFAC no cobró.»; 0 es válido y distinto
  de vacío). Se acepta «4,427.80», «4427.8», «$4,427.80», «4427.80 MXN»; NO
  «4427,80».
- **Guardar** (`app/admin/reportes/actions.ts`: `guardarCostoRealAfacAction`
  manda EXACTO `{costo_real_mxn}` —las notas no viajan: el API las conserva— y
  `quitarCostoRealAfacAction` el DELETE; validan antes de la red y **NO
  revalidan**: decisión D10, el general tarda decenas de segundos). La celda
  enseña lo tecleado en gris («guardando», no editable) y, con el OK, normal +
  toast «Costo real AFAC guardado · #236» y, a la derecha de la barra de
  fórmulas, «1 cambio guardado · el resto del libro se actualiza en unos
  segundos» (`EstadoAfacBarra`; también «Guardando…», cómo terminar y el
  último error, porque a pantalla completa los toasts NO se ven).
  **Recálculo en pantalla, como Excel** (pedido del cliente el mismo día:
  «falta que el remanente se ajuste cuando se agregue el costo real del
  egreso, no?»; el #364 enseñaba $3,000.00 de costo real y el remanente
  todavía en $3,619.98): con el número tecleado, `prepararHojaAfac` cambia el
  concepto de esa fila («AFAC costo real · guardando…» / «· capturado ahora»
  / «· por capturar», `conceptoAfacLocal`; solo si la celda de su izquierda
  es el «AFAC costo real · …» del API) y RECALCULA las fórmulas visibles de
  la MISMA hoja que dependen de la celda —remanente `=ROUND(G21-D21,2)`,
  TOTALES y el bloque «AFAC DEL PERIODO»— con `lib/admin/libro-recalculo.ts`
  (PURO: solo `ROUND`, `SUM`, + − × ÷ y referencias de la misma hoja; ROUND
  medio-hacia-afuera a 15 cifras como Excel; texto con el `formatear` de
  pyservices para `#,##0.00` / `"$"#,##0.00`). No es regla de negocio:
  pyservices solo deja viva una fórmula que reproduce al API, así que
  evaluarla da lo que el servidor va a mandar. Lo que no sabe evaluar (otra
  hoja, otra función, otro formato) se queda como vino y lo que depende de
  ello también (nunca un número nuevo junto a uno viejo); el bloque
  VUELATOUR de 'balance' (otra hoja) espera al libro nuevo. La celda
  recalculada lleva la marca SOLO del panel `recalculada {negativo}`
  (`data-recalculada`, tooltip `TITULO_CELDA_RECALCULADA`) y
  `estiloCeldaCss` le pone o le quita el rojo de los negativos (el formato
  condicional del libro llega ya resuelto con el número de antes). Pruebas:
  `lib/admin/__tests__/libro-recalculo.test.ts`. `RefrescoDiferidoAfac`:
  UN `router.refresh()` 15 s después del ÚLTIMO guardado (cada guardado lo
  reprograma; desmontar lo cancela) + «Actualizar datos» de siempre. Los
  cambios locales se descartan al llegar un libro que ya los trae
  (`depurarCambiosAfac`, ajuste de estado en el render, sin efecto): mismo
  monto, el vuelo ya sin celda editable, o un libro generado más de un minuto
  después del guardado (manda el servidor). Un rechazo devuelve la celda a lo
  de antes: 409 `MES_CERRADO` con su texto y «Ir a Reportes»
  (`toastMesCerradoSiAplica`), 400/503 del API tal cual, 403 «Solo
  administración…», 404 «Cannot PUT» ⇒ «necesita la actualización del
  servidor», sin respuesta ⇒ «Pulsa «Actualizar datos» para ver si se guardó…»
  y el libro se vuelve a leer (el PUT es idempotente). La confirmación se monta
  DENTRO del libro a pantalla completa (`AlertDialogContent` ganó la prop
  ADITIVA `portalContainer`).
- **«Es pago de AFAC» en Gastos** (`lib/admin/pago-afac.ts`): casilla
  `CasillaPagoAfac` «Es pago de AFAC (lo paga VuelaTour; no le resta al
  avión)» + «Márcalo en los pagos al gestor de AFAC. El costo de cada vuelo se
  captura en el Balance general (otros movimientos).» SOLO en Permiso y para
  quien puede marcar (`usePuedeMarcarPagoAfac`); en «Verificar / editar»,
  además, solo si el gasto trae la llave `es_pago_afac` (`apiConPagoAfac`).
  Cambiar la categoría la desmarca. Alta: viaja SOLO `true` y visible
  (`pagoAfacParaAlta`); PATCH: SOLO visible y si cambió contra la BASE de la
  sesión (`pagoAfacParaPatch`); marcado y reclasificado fuera de Permiso ⇒
  aviso «Al guardar se quitará la marca…» (el trigger del API la quita). En
  los dos diálogos la casilla comparte un Fragment con la ayuda de la comisión:
  un hijo NUEVO corre los ids de `useId` de los campos de abajo y el golden
  del alta (`alta-gasto.golden.json`) dejaba de salir byte a byte. Tabla de
  Gastos: chip «AFAC» junto a la categoría y, en «Avión · vuelo», «VuelaTour»
  + «pago de AFAC» (+ «ref. XA-VGV»; `estadoAvionGasto` regla 3b, texto plano
  «VuelaTour · pago de AFAC», paridad con `ETIQUETA_AVION_PAGO_AFAC` del API;
  también en Caja chica). Historial: «Pago de AFAC: No → Sí». Conciliación:
  `hoja_general` `otros_movimientos` ⇒ pestaña «otros movimientos».
- **Skew**: panel nuevo + API 0.0.88 (o sin la migración) ⇒ sin `vinculo`
  `afac_real` y sin `config.afac_real`: nada editable, sin casilla, nada se
  manda (libro byte a byte). Panel viejo + API 0.0.89 ⇒ el libro nuevo en
  solo lectura y sin casilla. Orden: migración ⇒ pyservices ⇒ API ⇒ panel.
- **Pruebas**: `lib/admin/__tests__/libro-afac.test.ts`,
  `lib/admin/__tests__/pago-afac.test.ts`, `gasto-avion.test.ts` (regla 3b),
  `conciliacion-balance.test.ts` (pestaña), `app/admin/reportes/__tests__/
  afac-real-actions.test.ts` (cuerpo exacto, sin revalidar, 409 con
  code/details/status), `components/admin/reportes/__tests__/
  libro-afac-ui.test.tsx` (marcado editable/bloqueada/sin rol, skew byte a
  byte, cableado) y `components/admin/expenses/__tests__/pago-afac-ui.test.tsx`
  (alta, verificar, tabla, historial, qué viaja). `libro-excel.test.tsx` gana
  el mock de las actions (sin servidor).
- **Pendientes**: sin QA en navegador (vitest sin DOM): doble clic, Enter/Tab
  y el cuadro encima de la celda con zoom y a pantalla completa; las notas
  del costo real no se capturan en pantalla (el API las acepta); un vuelo sin
  reservado no tiene celda (contrato §8). Avisar al cliente: capturar los
  costos reales de septiembre ANTES de cerrarlo (cerrado, la celda queda
  bloqueada hasta reabrir).
- **Revisión adversaria (16-oct-2026, contra el API real de la rama
  afac-real)**:
  - El 404 `VUELO_NO_EXISTE` del API llega en INGLÉS y con el uuid
    («Vuelo 5e2a… not found»): `mensajeErrorAfac` lo cambia por «Este vuelo
    ya no existe (lo borraron o lo cambiaron). Pulsa «Actualizar datos».»
    (`MSG_AFAC_VUELO_NO_EXISTE`). La prueba vieja suponía un texto en español
    que el API no manda.
  - Un rechazo que dice que el libro en pantalla quedó VIEJO (409
    `MES_CERRADO`, 404 `VUELO_NO_EXISTE`, 400 `AFAC_VUELO_SIN_AVION` /
    `AFAC_VUELO_SIN_FECHA` / `PERIODO_ANTES_DEL_INICIO`) ahora también pide el
    refresco diferido (`falloAfacPideRefresco`, que incluye lo incierto): antes
    la celda seguía verde y el operador reintentaba esa celda o las demás del
    mes cerrado.
  - Cuadro ABIERTO + libro nuevo (RefreshOnFocus al volver de otra ventana —el
    cuadro sigue abierto a propósito— o el refresco diferido): el cuadro guarda
    en el vuelo de SU vínculo pero se pinta sobre (r, c). Si esa celda ya es de
    OTRO vuelo (llegó o se fue una fila) o ya no se puede capturar, se cierra
    SIN guardar con «El libro se actualizó mientras capturabas y esa celda
    cambió: no se guardó nada. Vuelve a abrirla.» (`revisarEditorAfac`, en el
    mismo ajuste de estado del render que `depurarCambiosAfac`; el hook recibe
    la hoja CRUDA que se enseña). Mismo vuelo con otro valor ⇒ el vínculo se
    refresca (lo «sin cambios» y la confirmación comparan contra él).
  - Celda AFAC seleccionada que NO se puede capturar (mes cerrado, fila de otro
    avión, migración pendiente): el doble clic o Enter no hacía nada y solo el
    tooltip lo explicaba. La barra de fórmulas dice ahora el motivo (tono
    `bloqueada`, ámbar; `estadoBarraAfac({ motivoCelda })`, después de error,
    «Guardando…» y «Enter guarda · Esc cancela», antes de «N cambios
    guardados»).
  - Verificado sin cambios: Enter + blur no guardan dos veces (`terminado` del
    cuadro; React no despacha el blur del `<input>` que se desmonta); «quitar»
    SOLO sale de la confirmación (`confirmarQuitar`); «1,700.50» ⇒ 1700.5 y
    «1.700,50» / «1700,50» ⇒ error (jamás se adivina la coma); ANALISTA ve la
    celda bloqueada con «Solo administración…» y el teclado no la abre; sin
    `vinculo` o sin `config.afac_real` la hoja es la MISMA (byte a byte).

## Inventario: todo el historial y cardex como lista por fecha (18-oct-2026, API 0.0.92)

Pedido del cliente: «En inventario si debemos mostrar lo de agosto y julio,
solo en inventario» y «cambiar el formato del Cardex del producto en forma
de lista por orden de fecha… con sus entradas, salidas y movimientos».
Contrato: excepción de inventario a la invariante 86 del API (el cardex, el
resumen, la tienda y el Excel ya no llevan el piso del inicio oficial; el
`saldo_inicial` del 0.0.85 se retiró). El resto del sistema sigue arrancando
el 1-sep-2026.

- **Sin piso en inventario**: la tarjeta «Utilidad de la tienda» vuelve a
  los tres periodos de siempre («Todo» = todo el historial,
  `rangoPeriodoTienda(periodo, hoy)` sin inicio); la ficha y el cardex
  plegable ya no pintan «Saldo inicial al 1-sep-2026» ni «(desde el
  1-sep-2026)». `saldo-inicial-cardex.tsx` y `normalizarSaldoInicialCardex`
  se borraron; `textoSinFilasDesde` sigue (lo usan los tacómetros).
- **La ficha es UNA lista por fecha** (`resumen-producto.tsx`): Fecha ·
  Movimiento (Entrada / Salida / Devolución / Ajuste con su detalle) ·
  Entrada · Salida · Precio unitario · Total MXN · Existencia (la de
  después del movimiento: `stock_despues` / `remanente` del API), del más
  viejo al más nuevo, agrupada por MES con su renglón «Agosto 2026 · Stock
  al inicio · Entradas · Vendidas · Stock al final (Stock hoy en el mes en
  curso) · Vendido $X · utilidad +$Y». Un mes sin movimientos lo dice. Al
  pie: «Total compras», «Total vendido» (+ lo cargado a costo) y «Hoy ·
  utilidad acumulada» con la existencia actual y «bajo el mínimo». Siguen
  los avisos, la línea del precio vigente, «Dinero generado» y la nota.
- **Fuente única PURA** `lib/admin/inventario-cardex-lista.ts` (prueba
  `__tests__/inventario-cardex-lista.test.ts`): `filasCardexPorFecha` (por
  `orden` del API = posición en el cardex completo; API previo: por fecha y,
  el mismo día, primero lo que entró), `gruposCardexPorMes` (un grupo por
  cada `meses[]` del API, también vacíos; una fecha ilegible se queda con el
  mes anterior), `etiquetaMesCardex`, `piezasMesCardex`, `textoDineroMes`,
  `TITULO_VENDIDAS_MES` (= todas las salidas, con precio o a costo: la misma
  nota del Excel) y los textos. **El panel no calcula stock, costo ni
  utilidad**: ordena, agrupa y pinta lo que manda el API.
- **Tipos ADITIVOS**: `ResumenCompra.orden?`, `ResumenVenta.orden?`,
  `MesCardexResumen` y `InventarioItemResumen.meses?`. Con un API previo
  (sin `orden` ni `meses`) la lista sale por fecha, agrupada por los meses
  de las filas y sin renglón del mes.
- **Excel** («Cardex (Excel)»): lo arma pyservices — hoja de movimientos por
  fecha y «Resumen por mes» con stock al inicio del mes, unidades vendidas y
  stock al final del mes. El botón solo cambió su `title`.
- Pruebas: `inventario-cardex-lista.test.ts`, el describe «cardex como LISTA
  POR FECHA» de `inventory/__tests__/ficha-producto.test.tsx` y las de
  inicio oficial ajustadas (`inicio-oficial-auditoria.test.ts(x)`).
- **Orden de deploy**: pyservices → API 0.0.92 → panel.

## Reparto en pesos (18-oct-2026, API 0.0.93)

Pedido del cliente: «…debe venir todo en pesos porque casi siempre se les
transfiere a los socios en pesos mexicanos, y que los dólares solo sean
informativos pero no los que llamen primero la atención.» Contrato §2a: el API
agrega a `GET /v1/profit-sharing` la bandera raíz `reparto_en_pesos: true` y
llaves `*_mxn` ADITIVAS (cálculo NATIVO en pesos: venta al T.C. de la
cotización, gastos MXN tal cual, USD a su T.C.; no es el USD × un T.C. único).

- **Regla**: con la bandera, `/admin/profit-sharing` pinta PESOS como cifra
  principal (tamaño y peso de siempre) y los dólares debajo, en
  `text-muted-foreground` y `text-xs` («≈ $70.12 USD»). KPIs de la flota,
  saldo de la card (encabezado y cascada), cada fila de la cascada (con su
  «−»), la reserva (« · al T.C. 17.25» del cierre del periodo), la «Utilidad
  del periodo» de cada socio y el desglose (cobrado/pendiente por vuelo con su
  T.C. `tc_pesos`, monto por categoría en «MXN»). Lo que solo existe en
  dólares (venta bruta del vuelo, deuda total del cliente, «Otros ingresos
  VuelaTour», vuelos externos) lleva el sufijo «USD» para no leerse como pesos.
  **El panel NO convierte ni recalcula**: el total de la flota (KPIs) y el pie
  del desglose SUMAN en centavos lo que ya trae cada card (`sumaCentavos`); si
  a alguno le falta la llave, el total cae a los dólares y lo dice.
- **Monto sin pesos** (`null`: sin ningún T.C.): se pinta en dólares CON su
  sufijo y debajo, en ámbar, «sin T.C. para pasarlo a pesos». Jamás un peso
  inventado. `pesos_sin_tc_usd > 0` ⇒ aviso ámbar DENTRO de la cascada de ese
  avión («$X USD no se pudieron pasar a pesos (sin tipo de cambio): el saldo en
  pesos está incompleto.», `data-aviso-pesos-sin-tc`) y el KPI de saldo de la
  flota dice «Incompleto en pesos: revisa el aviso del avión». El aviso va
  dentro de la cascada a propósito: un hermano nuevo en el `CardContent`
  correría los ids de `useId` del desglose y rompería el golden.
- **Badges «sin TC»** con la bandera: su `title` dice que quedaron fuera del
  dato en DÓLARES (neutral; no afirma si cuentan en pesos).
- **Fuente única PURA**: `lib/admin/reparto-pesos.ts` — `repartoEnPesos`
  (solo `true` estricto), `montoPrincipal({mxn, usd}, enPesos, {deduccion,
  tc})` ⇒ `{principal, informativo, sinPesos, valor}` (sin la bandera,
  `fmtUsd` de siempre), `sumaCentavos`, `totalFlotaMxn`, `gastosMxnDeAvion`,
  `pesosIncompletos`, `avisoPesosSinTc` y TODOS los textos (badge de
  pendiente, deuda, hints, tooltips, encabezados, `NOTA_REPARTO_EN_PESOS` del
  recuadro de la página). Formatos: `fmtMxn`/`fmtUsd`/`fmtMonto`/`fmtTc` de
  `lib/format.ts`. Ningún componente redacta estos textos.
- **Cableado**: la página calcula `enPesos = repartoEnPesos(result)` UNA vez y
  lo pasa a `KpiStrip` y `AvionRepartoCard` (que lo baja a `SociosSection` y
  `DesgloseSection`); todas las props son ADITIVAS (default `false`). NO se
  tocan `socios-por-entregar-section.tsx` ni la cuenta corriente
  (`/admin/profit-sharing/socios/**`): siguen en dólares por decisión del
  usuario. Ayudas de Reportes (`DETALLE_BALANCE_POR_AVION`,
  `DESCRIPCION_CIERRE_REPARTO`) dicen que balances y reparto van en pesos; las
  líneas de los libros (`TEXTOS_LIBRO`, copia del contrato) y el «(dólares
  sin IVA)» del costo por hora NO cambian.
- **Skew**: panel nuevo + API ≤ 0.0.92 (sin la bandera, aunque vengan llaves
  `*_mxn`) ⇒ marcado BYTE A BYTE el de antes; panel previo + API 0.0.93 ⇒
  ignora las llaves. Orden: pyservices ⇒ API ⇒ panel.
- **Pruebas**: `lib/admin/__tests__/reparto-pesos.test.ts` (bandera,
  principal/informativo, sumas, textos exactos) y
  `components/admin/profit-sharing/__tests__/reparto-pesos.test.tsx` (golden
  `reparto-pesos.golden.json` congelado ANTES del cambio con
  `reparto-pesos.fixtures.ts`: sin bandera ⇒ idéntico; con bandera ⇒ MXN
  primero y USD gris, reserva con T.C., socios, desglose, aviso de
  `pesos_sin_tc_usd`, montos sin pesos, KPIs y cableado).

## Gastos por pagar (fecha a futuro) (19-oct-2026, API 0.0.95)

Pedido del cliente: «que se puedan capturar gastos a futuro en la app y en el
admin, a veces yo anoto cosas que ya sé que voy a pagar en efectivo al día
siguiente para que no se me olvide». Decisiones (no se vuelven a preguntar):
hasta fin de mes, todos los roles, con estado «por pagar». La fecha del gasto
es la del PAGO: un gasto con fecha futura nace «por pagar» y se confirma con
«Marcar pagado» (fecha real ≤ hoy). **El API decide todo** (`estado_pago`
PAGADO | POR_PAGAR | VENCIDO, el tope, el filtro, el pre-cierre y la caja
chica); el panel solo pinta y decide la UI.

- **Capacidad** = `config.gastos_por_pagar === true` + `config.gasto_fecha_max`
  de `/v1/me` (`capacidadPorPagarDeMe`). `AdminShell` monta
  `PorPagarProvider`; los clientes leen `usePorPagar()`. **Sin capacidad
  (API previo o sin la migración) TODO queda como antes**: ninguna llave
  nueva viaja, sin nota, sin filtro, sin chip (el golden del alta lo congela
  también CON capacidad y fecha de hoy).
- **Fuente única PURA** `lib/admin/gasto-por-pagar.ts`: la regla de la
  fecha de captura (`evaluarFechaGasto`: con capacidad, fecha > hoy y ≤ el
  tope ⇒ nota EXACTA «Quedará POR PAGAR: el día que lo pagues, márcalo
  pagado (la fecha del gasto es la del pago).»; sin la confirmación de
  «fecha futura» hasta fin de mes (o el tope si es antes); más allá —oficina
  hasta +30— la confirmación de siempre; sin capacidad =
  `fechaGastoSospechosa`), el estado (`estadoPagoDe`, `porPagarVigente`),
  el chip, el diálogo, los errores, el filtro, el pre-cierre y la caja
  chica. `fecha-gasto.ts` ganó un `hoy` opcional (pruebas).
- **Captura**: alta y «Verificar / editar» (cubren refacción, combustible y
  caja chica) usan `evaluarFechaGasto(...).pideConfirmacion` en lugar de
  `fechaGastoSospechosa` y pintan `NotaFechaPorPagar` en el campo de la
  fecha (en «Verificar / editar» de un gasto que sigue por pagar con fecha ≤
  hoy, dice que cambiar la fecha NO lo marca pagado). El payload no cambia:
  el API pone `por_pagar` solo.
- **Gastos**: chip «Por pagar · 20 oct» (ámbar) / «Vencido · 20 oct» (rojo)
  bajo la fecha (también en «Gastos del vuelo»), como botón que abre
  «Marcar pagado»; el menú ⋯ lo trae PRIMERO (solo con `estado_pago` ≠
  PAGADO; vale en Combustibles, Nómina y Caja chica). Diálogo
  (`marcar-pagado-dialog.tsx`, cargado con `next/dynamic` sin SSR: las tablas
  no arrastran la server action): fecha del pago default hoy Cancún, `max`
  hoy ⇒ `marcarPagadoGastoAction` (`PATCH {por_pagar:false, fecha_gasto,
  if_updated_at}` EXACTO, valida antes de la red, revalida como «Verificar /
  editar» solo en el éxito, nunca lanza). Errores del API tal cual;
  `MES_CERRADO` con «Ir a Reportes»; `CONFLICTO_VERSION`, 404 o sin
  respuesta ⇒ el texto, cerrar y `router.refresh()`.
- **Filtro «Pago: Todos | Por pagar»** (`?por_pagar=1`, también `true`)
  SOLO con la capacidad (`leerFiltrosGastos(get, inicio, disponible)`); viaja
  al API y al Excel, lo conservan las pestañas (`FILTROS_URL`), cuenta para
  «Limpiar» y tiene su vacío. La URL con `por_pagar` sin capacidad se ignora
  y la página lo dice (`data-franja="por-pagar-ignorado"`).
- **Pre-cierre**: renglón BLOQUEANTE `gastos_por_pagar` (lo decide el API) con
  «Resolver →» `hrefPrecierreGastosPorPagar` = Gastos «Por pagar» del periodo
  + el foco ámbar de sus `ids`.
- **Caja chica** (detalle del fondo): `PorPagarCaja`, «Por pagar (aún no sale
  de la caja)» con la lista aditiva `por_pagar[]` y `por_pagar_total` del API
  (chip, concepto, monto, «Marcar pagado»); sin la llave no se pinta; no toca
  saldos.
- **Pruebas**: `lib/admin/__tests__/gasto-por-pagar.test.ts`,
  `app/admin/expenses/__tests__/marcar-pagado-action.test.ts`,
  `components/admin/expenses/__tests__/por-pagar-ui.test.tsx`,
  `por-pagar-pantallas.test.tsx` y `alta-por-pagar.test.tsx`.
- **Orden de deploy**: migración → API 0.0.95 → panel (en cualquier orden es
  seguro: sin capacidad, nada cambia).
