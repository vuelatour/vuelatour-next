/**
 * Títulos de las PESTAÑAS del navegador (14-oct-2026) — FUENTE ÚNICA. PURO:
 * sin React ni red (lo prueba `__tests__/titulos-pestana.test.ts`).
 *
 * Pedido del cliente: «estaría genial que en cada pestaña del navegador se
 * ponga el nombre de lo que se está consultando en esa pantalla, para
 * guiarnos cuando tengamos varias pestañas abiertas en los navegadores».
 * Hasta hoy TODAS las páginas de /admin decían «Vuelatour Admin».
 *
 * Reglas (las vigila `app/admin/__tests__/titulos-pestana-cableado.test.ts`):
 *  1. Lo DISTINTIVO va primero: la pestaña se recorta por la derecha
 *     («Vuelo #315 · Beh Kay», «Conciliación · Pendientes»).
 *  2. Las secciones se llaman como en el menú (`lib/admin/nav-items.ts`; la
 *     prueba compara las dos listas renglón por renglón).
 *  3. El sufijo « · Vuelatour» lo pone el `template` del layout raíz
 *     (`app/layout.tsx`): ningún título lo trae. `<TituloPestana>` escribe
 *     directo en la pestaña y por eso aplica la MISMA plantilla
 *     (`PLANTILLA_TITULO`, copia que la prueba compara con el layout).
 *  4. Ninguna página arma el texto a mano: `metadata`, `generateMetadata` y
 *     `<TituloPestana>` usan estas constantes y funciones.
 *  5. `metadata`/`generateMetadata` NUNCA leen el API (ni `/me`): en
 *     producción cada <Link> visible PRECARGA su ruta y, como todas tienen
 *     loading.tsx, la precarga corta en el loading pero SÍ resuelve el head:
 *     corre `generateMetadata` SIN la página, así que no hay render con el
 *     cual memoizar el GET y cada fila visible de una tabla era una lectura
 *     NUEVA al API (otra vez en cada router.refresh() de RefreshOnFocus).
 *     Su título sale de la URL validada o es el genérico («Vuelo»); lo que
 *     necesita datos —folio, cliente, matrícula, el tablero del rol— lo pone
 *     la página, que YA los cargó, con
 *     `<TituloPestana titulo={tituloVuelo(snapshot.folio, client?.nombre)} />`
 *     (`components/admin/titulo-pestana.tsx`).
 *
 * Patrones:
 *  - Sección del menú: «Gastos».
 *  - Pestaña de una sección (`?f=` / `?tab=`): «Conciliación · Pendientes»;
 *    la pestaña que muestra TODO («Todos»/«Todas») no se nombra.
 *  - Libro o reporte de un periodo: «Balance general · 1–14 oct 2026».
 *  - Detalle con folio o código: «Vuelo #315 · Beh Kay», «Avión XB-PEV».
 *  - Detalle de una persona: «Piloto · Juan Pérez» (la misma persona puede
 *    ser piloto, socio y tener caja chica: el tipo va primero).
 *  - Producto: su nombre primero, «Aceite 15W-50 · Inventario/Tienda».
 */
import { MESES_LARGOS_ES } from "@/lib/datetime";
import { NOMBRE_LIBRO_VUELATOUR, type DestinoVistaBalance } from "./balance-vista";
import type { FiltroConciliacion } from "./conciliacion-vista";
import { folioTexto } from "./grupos-ui";
import { ETIQUETA_TAB_INGRESOS, type TabIngresos } from "./ingresos-ui";
import { esDiaValido } from "./url-params";

// ═══════════════════════════════ Piezas ═══════════════════════════════

/** Separador entre las partes del título («Vuelo #315 · Beh Kay»). */
export const SEPARADOR_TITULO = " · ";

/** Tope de un texto libre (cliente, proveedor, persona, producto). */
export const MAX_TEXTO_TITULO = 40;

/** Tope de una matrícula (son cortas; esto solo frena basura). */
const MAX_MATRICULA = 20;

/** Une las partes NO vacías con « · » (lo vacío o ausente se omite). */
export function unirTitulo(...partes: Array<string | null | undefined | false>): string {
  return partes
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .map((p) => p.trim())
    .join(SEPARADOR_TITULO);
}

/**
 * Texto libre listo para el título: espacios colapsados, recortado y con
 * tope («Grupo Empresarial Aeronáutico del Sures…»). Vacío, no texto o solo
 * espacios ⇒ null (la parte se omite).
 */
export function textoParaTitulo(valor: unknown, max: number = MAX_TEXTO_TITULO): string | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const limpio = String(valor).replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

/** «#315». Un folio ausente, 0 o ilegible ⇒ null (nunca «#0» ni «#NaN»). */
export function folioParaTitulo(folio: unknown): string | null {
  const n =
    typeof folio === "number"
      ? folio
      : typeof folio === "string" && /^\s*\d+\s*$/.test(folio)
        ? Number(folio)
        : Number.NaN;
  return Number.isInteger(n) && n > 0 ? `#${n}` : null;
}

// ═══════════════════════════════ Secciones del menú ═══════════════════════════════

/**
 * Títulos de las secciones: EXACTAMENTE las etiquetas del menú
 * (`NAV_GROUPS` de `nav-items.ts`). No se importan de ahí porque ese módulo
 * trae los íconos (React); la prueba compara las dos listas.
 */
export const TITULOS_SECCION = {
  inicio: "Inicio",
  estadisticas: "Estadísticas",
  cotizaciones: "Cotizaciones",
  vuelos: "Vuelos",
  calendario: "Calendario",
  tacometros: "Tacómetros en vivo",
  ingresos: "Ingresos",
  gastos: "Gastos",
  otrosGastos: "Otros gastos",
  nomina: "Nómina",
  gastosPersonales: "Gastos personales",
  combustibles: "Combustibles",
  aeronaves: "Aeronaves",
  motores: "Motores",
  helices: "Hélices",
  ingenieria: "Ingeniería",
  vencimientos: "Vencimientos",
  inventario: "Inventario/Tienda",
  multas: "Multas",
  rutas: "Rutas",
  clientes: "Clientes",
  proveedores: "Proveedores",
  aeropuertos: "Aeropuertos",
  distancias: "Distancias",
  entidadesFiscales: "Entidades fiscales",
  tiposDocumento: "Tipos de documento",
  facturasEmitidas: "Facturas emitidas",
  facturacionAutomatica: "Facturación automática",
  facturasRecibidas: "Facturas recibidas",
  cajaChica: "Caja chica",
  conciliacion: "Conciliación",
  reparto: "Reparto de utilidades",
  pagosSocios: "Pagos a socios",
  reportes: "Reportes",
  cuentasBancarias: "Cuentas bancarias",
  tarjetas: "Tarjetas corp.",
  pilotos: "Pilotos",
  usuarios: "Usuarios",
  alertas: "Alertas",
  configuracion: "Configuración",
} as const;

export type SeccionMenu = keyof typeof TITULOS_SECCION;

/** Ruta del menú de cada sección (la prueba la cruza con `NAV_GROUPS`). */
export const RUTA_SECCION: Readonly<Record<SeccionMenu, string>> = {
  inicio: "/admin",
  estadisticas: "/admin/dashboards",
  cotizaciones: "/admin/quotes",
  vuelos: "/admin/flights",
  calendario: "/admin/calendar",
  tacometros: "/admin/taco-live",
  ingresos: "/admin/ingresos",
  gastos: "/admin/expenses",
  otrosGastos: "/admin/otros-gastos",
  nomina: "/admin/nomina",
  gastosPersonales: "/admin/gastos-personales",
  combustibles: "/admin/combustibles",
  aeronaves: "/admin/aircraft",
  motores: "/admin/engines",
  helices: "/admin/propellers",
  ingenieria: "/admin/ingenieria",
  vencimientos: "/admin/expirations",
  inventario: "/admin/inventory",
  multas: "/admin/multas",
  rutas: "/admin/routes",
  clientes: "/admin/clients",
  proveedores: "/admin/providers",
  aeropuertos: "/admin/airports",
  distancias: "/admin/distancias",
  entidadesFiscales: "/admin/issuing-entities",
  tiposDocumento: "/admin/document-types",
  facturasEmitidas: "/admin/facturas-emitidas",
  facturacionAutomatica: "/admin/facturas",
  facturasRecibidas: "/admin/facturas-recibidas",
  cajaChica: "/admin/caja-chica",
  conciliacion: "/admin/conciliacion",
  reparto: "/admin/profit-sharing",
  pagosSocios: "/admin/profit-sharing/socios",
  reportes: "/admin/reportes",
  cuentasBancarias: "/admin/bank-accounts",
  tarjetas: "/admin/cards",
  pilotos: "/admin/pilots",
  usuarios: "/admin/users",
  alertas: "/admin/alertas",
  configuracion: "/admin/configuracion",
};

/**
 * Pantallas que NO están en el menú. Se llaman como su enlace en el panel:
 * «Grupos» (botón de Cotizaciones y BackLink del grupo), «Mi cuenta» (el
 * topbar, `page-title.ts`). Lo distintivo va primero: «Nuevo grupo» y no
 * «Nueva cotización de grupo», que recortado se confunde con «Nueva
 * cotización». Fuera de /admin: «Iniciar sesión» (`/login`, a donde manda el
 * proxy cuando la sesión vence; es el botón del formulario) y «No se pudo
 * iniciar sesión» (`/auth/auth-error`, la pantalla dice «No pudimos iniciar
 * tu sesión»): sin título decían «Vuelatour Admin».
 */
export const TITULOS_PAGINA = {
  miCuenta: "Mi cuenta",
  cotizacionNueva: "Nueva cotización",
  grupos: "Grupos",
  grupoNuevo: "Nuevo grupo",
  compras: "Compras",
  iniciarSesion: "Iniciar sesión",
  errorSesion: "No se pudo iniciar sesión",
} as const;

// ═══════════════════════════════ Detalles ═══════════════════════════════

/** Título GENÉRICO de cada detalle: el respaldo cuando el dato no llega. */
export const TITULOS_DETALLE = {
  vuelo: "Vuelo",
  cotizacion: "Cotización",
  grupo: "Grupo",
  avion: "Avión",
  producto: "Producto",
  compra: "Compra",
  piloto: "Piloto",
  socio: "Socio",
  balanceAvion: "Balance del avión",
} as const;

/** «Tipo #folio · contexto»; sin folio, solo el tipo (genérico). */
function conFolio(tipo: string, folio: unknown, contexto?: unknown): string {
  const f = folioParaTitulo(folio);
  if (!f) return tipo;
  return unirTitulo(`${tipo} ${f}`, textoParaTitulo(contexto));
}

/** «Tipo · nombre»; sin nombre, solo el tipo (genérico). */
function conNombre(tipo: string, nombre: unknown): string {
  return unirTitulo(tipo, textoParaTitulo(nombre));
}

/** «Vuelo #315 · Beh Kay» · «Vuelo #315» · «Vuelo». */
export function tituloVuelo(folio?: unknown, cliente?: unknown): string {
  return conFolio(TITULOS_DETALLE.vuelo, folio, cliente);
}

/** «Cotización #332 · Beh Kay» · «Cotización #332» · «Cotización». */
export function tituloCotizacion(folio?: unknown, cliente?: unknown): string {
  return conFolio(TITULOS_DETALLE.cotizacion, folio, cliente);
}

/**
 * «Grupo G-12 · Maqar» · «Grupo G-12» · «Grupo». Acepta el folio numérico o
 * el `folio_texto` del API («G-12»): los normaliza `folioTexto` de
 * `grupos-ui.ts`, la fuente única del «G-12».
 */
export function tituloGrupo(folio?: unknown, cliente?: unknown): string {
  const texto =
    typeof folio === "number" || typeof folio === "string" ? folioTexto(folio) : "G-?";
  if (texto === "G-?") return TITULOS_DETALLE.grupo;
  return unirTitulo(`${TITULOS_DETALLE.grupo} ${texto}`, textoParaTitulo(cliente));
}

/** «Avión XB-PEV» · «Avión». */
export function tituloAvion(matricula?: unknown): string {
  const m = textoParaTitulo(matricula, MAX_MATRICULA);
  return m ? `${TITULOS_DETALLE.avion} ${m}` : TITULOS_DETALLE.avion;
}

/**
 * «Aceite AeroShell 15W-50 · Inventario/Tienda» · «Producto». El NOMBRE va
 * primero: es lo que distingue una pestaña de otra (ninguna otra pantalla
 * enseña nombres de productos, así que no hace falta el tipo delante).
 */
export function tituloProducto(nombre?: unknown): string {
  const n = textoParaTitulo(nombre);
  return n ? unirTitulo(n, TITULOS_SECCION.inventario) : TITULOS_DETALLE.producto;
}

/** «Compra #12 · Aircraft Spruce» · «Compra #12» · «Compra». */
export function tituloCompra(folio?: unknown, proveedor?: unknown): string {
  return conFolio(TITULOS_DETALLE.compra, folio, proveedor);
}

/** «Piloto · Alexander E. Saab» · «Piloto». */
export function tituloPiloto(nombre?: unknown): string {
  return conNombre(TITULOS_DETALLE.piloto, nombre);
}

/** «Socio · Mauricio Roque» · «Socio» (estado de cuenta en «Pagos a socios»). */
export function tituloSocio(nombre?: unknown): string {
  return conNombre(TITULOS_DETALLE.socio, nombre);
}

/** «Caja chica · Diego Ramírez» · «Caja chica» (fondo de una persona). */
export function tituloCajaChica(nombre?: unknown): string {
  return conNombre(TITULOS_SECCION.cajaChica, nombre);
}

// ═══════════════════════════════ Pestañas de una sección ═══════════════════════════════

/** «Sección · Pestaña»; la pestaña que muestra todo (o ninguna) no se nombra. */
function conPestana(seccion: string, etiqueta: string | null | undefined): string {
  return unirTitulo(seccion, etiqueta);
}

/**
 * Pestañas de Conciliación (`?f=`, validado con `filtroConciliacionDeUrl`).
 * Mismos textos que los chips de la pantalla (la prueba lo cruza).
 */
export const PESTANAS_CONCILIACION: Readonly<Record<FiltroConciliacion, string>> = {
  todos: "Todos",
  pendientes: "Pendientes",
  conciliados: "Conciliados",
  omitidos: "Omitidos",
  sin_banco: "Gastos sin banco",
  cobros_sin_banco: "Cobros sin banco",
  paywise: "Auditoría Paywise",
};

/** «Conciliación» (Todos) · «Conciliación · Pendientes» · «Conciliación · Gastos sin banco». */
export function tituloConciliacion(filtro?: FiltroConciliacion | null): string {
  return conPestana(
    TITULOS_SECCION.conciliacion,
    filtro && filtro !== "todos" ? PESTANAS_CONCILIACION[filtro] : null,
  );
}

/** Pestañas de Gastos (`?f=`): «Todos» es el default. */
export type FiltroGastos = "todos" | "pendientes" | "duplicados";

export const PESTANAS_GASTOS: Readonly<Record<FiltroGastos, string>> = {
  todos: "Todos",
  pendientes: "Pendientes",
  duplicados: "Duplicados",
};

/** «Gastos» (Todos) · «Gastos · Pendientes» · «Gastos · Duplicados». */
export function tituloGastos(filtro?: FiltroGastos | null): string {
  return conPestana(
    TITULOS_SECCION.gastos,
    filtro && filtro !== "todos" ? PESTANAS_GASTOS[filtro] : null,
  );
}

/**
 * «Ingresos» (Todos) · «Ingresos · Por conciliar». La pestaña es la que
 * resuelve `filtrosIngresosDeUrl` (que ya considera el rol); las etiquetas son
 * las MISMAS de los chips (`ETIQUETA_TAB_INGRESOS`, fuente única).
 */
export function tituloIngresos(tab?: TabIngresos | null): string {
  return conPestana(
    TITULOS_SECCION.ingresos,
    tab && tab !== "todos" ? (ETIQUETA_TAB_INGRESOS[tab] ?? null) : null,
  );
}

/** Pestañas de Estadísticas (`?tab=`), filtradas por rol en la página. */
export type PestanaEstadisticas = "ejecutivo" | "operativo" | "gastos" | "tarjetas" | "horas";

export const PESTANAS_ESTADISTICAS: Readonly<Record<PestanaEstadisticas, string>> = {
  ejecutivo: "Ejecutivo",
  operativo: "Operativo",
  gastos: "Gastos",
  tarjetas: "Gastos por tarjeta",
  horas: "Horas de piloto",
};

/**
 * «Estadísticas · Ejecutivo». Aquí cada pestaña es un TABLERO distinto (no
 * hay una que muestre «todo»), así que la activa siempre se nombra; sin
 * pestaña para el rol ⇒ «Estadísticas».
 */
export function tituloEstadisticas(pestana?: PestanaEstadisticas | null): string {
  return conPestana(TITULOS_SECCION.estadisticas, pestana ? PESTANAS_ESTADISTICAS[pestana] : null);
}

/** Pestañas de Compras (`?f=`): «Abiertas» es el default. */
export type FiltroCompras = "abiertas" | "recibidas" | "todas";

export const PESTANAS_COMPRAS: Readonly<Record<FiltroCompras, string>> = {
  abiertas: "Abiertas",
  recibidas: "Recibidas",
  todas: "Todas",
};

/** «Compras · Abiertas» (default) · «Compras · Recibidas» · «Compras» (Todas). */
export function tituloCompras(filtro?: FiltroCompras | null): string {
  return conPestana(
    TITULOS_PAGINA.compras,
    filtro && filtro !== "todas" ? PESTANAS_COMPRAS[filtro] : null,
  );
}

// ═══════════════════════════════ Periodos (día de pared Cancún) ═══════════════════════════════

/** «ene» … «dic»: los tres primeros caracteres de `MESES_LARGOS_ES` (sin otra tabla). */
const MESES_CORTOS = MESES_LARGOS_ES.map((m) => m.slice(0, 3));

interface PartesDia {
  anio: number;
  mes: number;
  dia: number;
}

/** Día `YYYY-MM-DD` que EXISTE (`esDiaValido`) ⇒ sus números; si no, null. */
function partesDia(valor: unknown): PartesDia | null {
  if (typeof valor !== "string" || !esDiaValido(valor)) return null;
  return {
    anio: Number(valor.slice(0, 4)),
    mes: Number(valor.slice(5, 7)),
    dia: Number(valor.slice(8, 10)),
  };
}

/** Último día del mes (aritmética UTC: sin zonas horarias). */
function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function corto(p: PartesDia): string {
  return `${p.dia} ${MESES_CORTOS[p.mes - 1]} ${p.anio}`;
}

/**
 * «14 oct 2026»: un día de PARED (ya en hora Cancún) sin cero a la
 * izquierda. Sin `Date` local ni `Intl`: el día nunca se corre. Inválido ⇒
 * null.
 */
export function diaCorto(dia: unknown): string | null {
  const p = partesDia(dia);
  return p ? corto(p) : null;
}

/** «octubre 2026» (mes 1–12). Inválido ⇒ null. */
export function mesLargo(anio: unknown, mes: unknown): string | null {
  if (typeof anio !== "number" || typeof mes !== "number") return null;
  if (!Number.isInteger(anio) || anio < 1000 || anio > 9999) return null;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  return `${MESES_LARGOS_ES[mes - 1]} ${anio}`;
}

/**
 * Periodo CORTO para el título, con días de pared Cancún `YYYY-MM-DD`:
 *  - un día: «14 oct 2026»;
 *  - mismo mes: «1–14 oct 2026»; el mes COMPLETO: «septiembre 2026»;
 *  - meses completos: «jul – sep 2026», el año completo «2026»,
 *    entre años «nov 2025 – feb 2026»;
 *  - mismo año: «28 sep – 14 oct 2026»; entre años «28 dic 2025 – 3 ene 2026»;
 *  - un solo extremo: «desde 1 oct 2026» / «hasta 14 oct 2026».
 * El rango invertido se endereza; sin ningún día válido ⇒ null.
 */
export function periodoCorto(desde: unknown, hasta: unknown): string | null {
  let d = partesDia(desde);
  let h = partesDia(hasta);
  if (!d && !h) return null;
  if (!h) return `desde ${corto(d as PartesDia)}`;
  if (!d) return `hasta ${corto(h)}`;
  if ((desde as string) > (hasta as string)) [d, h] = [h, d];

  if (d.anio === h.anio && d.mes === h.mes && d.dia === h.dia) return corto(d);

  const mesesCompletos = d.dia === 1 && h.dia === ultimoDiaDelMes(h.anio, h.mes);
  if (mesesCompletos) {
    if (d.anio === h.anio && d.mes === h.mes) return `${MESES_LARGOS_ES[d.mes - 1]} ${d.anio}`;
    if (d.anio === h.anio && d.mes === 1 && h.mes === 12) return String(d.anio);
    if (d.anio === h.anio) return `${MESES_CORTOS[d.mes - 1]} – ${MESES_CORTOS[h.mes - 1]} ${d.anio}`;
    return `${MESES_CORTOS[d.mes - 1]} ${d.anio} – ${MESES_CORTOS[h.mes - 1]} ${h.anio}`;
  }
  if (d.anio === h.anio && d.mes === h.mes) return `${d.dia}–${h.dia} ${MESES_CORTOS[d.mes - 1]} ${d.anio}`;
  if (d.anio === h.anio) return `${d.dia} ${MESES_CORTOS[d.mes - 1]} – ${corto(h)}`;
  return `${corto(d)} – ${corto(h)}`;
}

// ═══════════════════════════════ Libros, reportes y vistas con fecha ═══════════════════════════════

/**
 * Vista en pantalla de un balance (`/admin/reportes/balance`):
 * «Balance mensual · 1–14 oct 2026», «Balance general · septiembre 2026»,
 * «Balance XB-PEV · septiembre 2026». La matrícula del avión llega en la
 * respuesta del libro; sin ella, «Balance del avión · …».
 */
export function tituloBalance(
  destino: DestinoVistaBalance,
  desde: unknown,
  hasta: unknown,
  matricula?: unknown,
): string {
  let libro: string;
  if (destino.tipo === "vuelatour") {
    libro = NOMBRE_LIBRO_VUELATOUR[destino.modo] ?? NOMBRE_LIBRO_VUELATOUR.mensual;
  } else {
    const m = textoParaTitulo(matricula, MAX_MATRICULA);
    libro = m ? `Balance ${m}` : TITULOS_DETALLE.balanceAvion;
  }
  return unirTitulo(libro, periodoCorto(desde, hasta));
}

/** «Reparto de utilidades · 1–14 oct 2026». */
export function tituloReparto(desde: unknown, hasta: unknown): string {
  return unirTitulo(TITULOS_SECCION.reparto, periodoCorto(desde, hasta));
}

/** «Calendario · octubre 2026» (mes 1–12); mes o año inválidos ⇒ «Calendario». */
export function tituloCalendario(anio: unknown, mes: unknown): string {
  return unirTitulo(TITULOS_SECCION.calendario, mesLargo(anio, mes));
}

/**
 * «Tacómetros en vivo» (hoy, sin fecha o fecha inválida) ·
 * «Tacómetros en vivo · 13 oct 2026» (otro día). `hoy` = `todayCancun()`.
 */
export function tituloTacometros(fecha: unknown, hoy: string): string {
  const dia = diaCorto(fecha);
  return dia && fecha !== hoy
    ? unirTitulo(TITULOS_SECCION.tacometros, dia)
    : TITULOS_SECCION.tacometros;
}

// ═══════════════════════════════ Comodín de /admin (ruta que no existe) ═══════════════════════════════

/** Título de la pestaña y encabezado de la tarjeta del comodín. */
export const TITULO_PAGINA_NO_ENCONTRADA = "Página no encontrada";

/** Sufijo SOLO para un módulo del menú marcado `comingSoon` (hoy ninguno). */
export const SUFIJO_EN_CONSTRUCCION = "En construcción";

/**
 * `app/admin/[...slug]`: una ruta de /admin que NO existe (enlace viejo,
 * marcador, dedazo). Dentro de un módulo del menú lo nombra primero:
 * «Vuelos · Página no encontrada»; fuera de todos, «Página no encontrada».
 * «Vuelos · En construcción» SOLO si el módulo del menú está marcado
 * `comingSoon`: todos los del menú tienen su página (lo vigila
 * `app/admin/__tests__/comodin-admin.test.tsx`) y decir «en construcción» de
 * uno que funciona hacía creer que Vuelos no servía.
 */
export function tituloComodin(modulo?: unknown, enConstruccion: boolean = false): string {
  const m = textoParaTitulo(modulo);
  if (!m) return TITULO_PAGINA_NO_ENCONTRADA;
  return unirTitulo(m, enConstruccion ? SUFIJO_EN_CONSTRUCCION : TITULO_PAGINA_NO_ENCONTRADA);
}

// ═══════════════════════════════ Plantilla del layout raíz ═══════════════════════════════

/**
 * La plantilla del layout raíz (`app/layout.tsx`, `title.template`). Next la
 * aplica a `metadata`/`generateMetadata`; `<TituloPestana>` escribe el título
 * directo en la pestaña y la aplica con ESTA copia (la prueba exige que sea
 * idéntica a la del layout).
 */
export const PLANTILLA_TITULO = "%s · Vuelatour";

/** «Vuelo #315 · Beh Kay» ⇒ «Vuelo #315 · Beh Kay · Vuelatour» (lo que se ve en la pestaña). */
export function tituloConPlantilla(titulo: string): string {
  // Reemplazo con FUNCIÓN: un «$&» en el nombre de un cliente no es un patrón.
  return PLANTILLA_TITULO.replace("%s", () => titulo);
}
