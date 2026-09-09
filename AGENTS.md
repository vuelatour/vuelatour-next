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
  (alta: «+ nuevo cliente» / «corregir nombre» en el margen).
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
  botón PDF de la barra de acciones).

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
  `billpocket-field`, `redondeo-field`, `tarifa-tipo-field`,
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
