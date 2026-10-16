import type { ListGastosQuery } from "@/lib/api/expenses-server";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import { verificadorNombre, type Gasto } from "@/types/expenses";
import { CATEGORIAS_COMPRA } from "@/types/compras";
import { unirEtiquetas } from "@/lib/api/degradar";
import { fmtMonto } from "@/lib/format";
import { fmtDate } from "@/lib/datetime";
import { hojasDe, textoHojas } from "@/lib/admin/comprobante-hojas";
import { esDiaValido, rangoFiltro, uuidFiltro, valorDeCatalogo } from "@/lib/admin/url-params";
import { CATEGORIAS_FILTRO_GASTO, categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { MEDIOS_CAPTURA_VALUES, medioPagoLabel, textoPagoCorto } from "@/lib/admin/medios-pago";
import {
  FACTURACION_FILTRO_VALUES,
  estadoFacturacion,
  etiquetaFacturacionTabla,
} from "@/lib/admin/facturacion-estatus";
import { conciliadoDeFiltroBanco, estadoBancoGasto } from "@/lib/admin/conciliacion-estado";
import { diaMas } from "@/lib/admin/conciliacion-auto";
import { hayComprobante } from "@/lib/admin/comprobante-badge";
import { distintivoOrigen, origenCapturaLabel } from "@/lib/admin/gastos-captura";
import { estadoAvionGasto, etiquetaAvionGasto } from "@/lib/admin/gasto-avion";
import { PESTANAS_GASTOS } from "@/lib/admin/titulos-pestana";
import { ajustarRangoAlInicio, type InicioOficial } from "./inicio-oficial";

/**
 * Vista de GASTOS en UNA sola tabla (14-oct-2026). Pedido del cliente: «unir
 * Gastos generales y Gastos operativos en una sola tabla… está como ambigua
 * la información… toda la vista debe quedar bien e intuitiva». La división
 * vieja partía en dos tarjetas los gastos de un mismo vuelo (233 directos del
 * vuelo caían en «generales») y no decía a dónde iba el dinero; ahora cada
 * renglón lo dice en «Avión · vuelo» (`gasto-avion.ts`) y el filtro de
 * SERVIDOR «Categoría» sustituye a la división (lo heredan los contadores de
 * las pestañas y el Excel).
 *
 * PURO (sin React ni red): lo usan la PÁGINA (servidor) y la BARRA de filtros
 * (cliente) — por eso de `lib/api/expenses-server.ts` (que usa `apiServer`)
 * solo hay `import type`. Aquí viven la lectura/validación de la URL, las
 * consultas (lista, contadores, Excel), los vacíos, los títulos de las
 * pestañas, las opciones de los filtros, la descripción y la búsqueda de
 * cada renglón, la línea del teléfono, la compra, el modo «Unir en compra» y
 * TODOS los textos de la pantalla (prueba `__tests__/gastos-vista.test.ts`).
 */

// =============================================================================
// Filtros de la URL
// =============================================================================

export type VistaGastos = "todos" | "pendientes" | "duplicados";
export type ModoCaptura = "todas" | "semana" | "rango";

export interface FiltrosGastos {
  vista: VistaGastos;
  /** Inicio oficial (16-oct-2026): la fecha del gasto de la URL caía antes
   *  del inicio y se movió (la página pinta el aviso). Solo existe si es
   *  `true`; no viaja al API. */
  ajustado?: true;
  aeronave_id?: string;
  categoria?: string;
  medio?: string;
  piloto?: string;
  desde?: string;
  hasta?: string;
  facturacion?: string;
  banco?: "conciliados" | "sin_conciliar";
  captura: ModoCaptura;
  cap_desde?: string;
  cap_hasta?: string;
  orden?: "captura";
}

/**
 * Lee y VALIDA los filtros de la URL — la MISMA función en el servidor (la
 * página) y en el cliente (la barra lee la URL viva con `useSearchParams`).
 * Son las reglas que vivían en la página (21-sep-2026: un filtro inválido se
 * IGNORA, nunca viaja al API ni provoca un 400 que tumbe la pantalla):
 *  - `f`: pendientes | duplicados; cualquier otra cosa ⇒ «todos».
 *  - `aeronave_id` y `piloto`: solo uuid.
 *  - `categoria`: una de las 22 (`CATEGORIAS_FILTRO_GASTO`), exacta.
 *  - `medio`: los de captura (BODEGA no se filtra).
 *  - `desde`/`hasta`: `rangoFiltro` (día o ISO; invertido se corrige).
 *  - `facturacion`: los 4 estados + NO_FACTURADA.
 *  - `banco`: conciliados | sin_conciliar.
 *  - Fecha de CAPTURA: `cap_desde`/`cap_hasta` solo si el día EXISTE
 *    (`?cap_desde=2026-13-45` reventaba al API); con un rango válido manda el
 *    rango, si no `cap=7d` es «Esta semana» (los últimos 7 días, hora
 *    Cancún); si no, «todas».
 *  - `orden`: "captura" o nada (fecha del gasto, el default del API).
 */
export function leerFiltrosGastos(
  get: (clave: string) => string | null | undefined,
  inicio: InicioOficial = null,
): FiltrosGastos {
  const f = get("f");
  const vista: VistaGastos = f === "pendientes" || f === "duplicados" ? f : "todos";
  const capDesdeCrudo = get("cap_desde");
  const capHastaCrudo = get("cap_hasta");
  const capDesde = esDiaValido(capDesdeCrudo) ? (capDesdeCrudo as string) : undefined;
  const capHasta = esDiaValido(capHastaCrudo) ? (capHastaCrudo as string) : undefined;
  const captura: ModoCaptura =
    capDesde || capHasta ? "rango" : get("cap") === "7d" ? "semana" : "todas";
  // Inicio oficial (16-oct-2026, API 0.0.84): un `?desde`/`?hasta` anterior
  // se sube (con aviso); sin rango no se inventa uno (el API ya recorta).
  const rango = ajustarRangoAlInicio(rangoFiltro(get("desde"), get("hasta")), inicio, "");
  const banco = get("banco");
  const out: FiltrosGastos = { vista, captura };
  const aeronave = uuidFiltro(get("aeronave_id"));
  if (aeronave) out.aeronave_id = aeronave;
  const categoria = valorDeCatalogo(get("categoria"), CATEGORIAS_FILTRO_GASTO);
  if (categoria) out.categoria = categoria;
  const medio = valorDeCatalogo(get("medio"), MEDIOS_CAPTURA_VALUES);
  if (medio) out.medio = medio;
  const piloto = uuidFiltro(get("piloto"));
  if (piloto) out.piloto = piloto;
  if (rango.desde) out.desde = rango.desde;
  if (rango.hasta) out.hasta = rango.hasta;
  const facturacion = valorDeCatalogo(get("facturacion"), FACTURACION_FILTRO_VALUES);
  if (facturacion) out.facturacion = facturacion;
  if (banco === "conciliados" || banco === "sin_conciliar") out.banco = banco;
  if (capDesde) out.cap_desde = capDesde;
  if (capHasta) out.cap_hasta = capHasta;
  if (get("orden") === "captura") out.orden = "captura";
  if (rango.ajustado) out.ajustado = true;
  return out;
}

/**
 * Los filtros del API comunes a la lista, los dos contadores de pestaña y el
 * Excel (sin la pestaña). «Esta semana» = capturado desde hoy Cancún − 7 días.
 */
export function queryBaseGastos(
  f: FiltrosGastos,
  hoy: string,
): Omit<ListGastosQuery, "limit" | "offset" | "pendientes" | "duplicados"> {
  return {
    aeronave_id: f.aeronave_id,
    categoria: f.categoria,
    medio_pago: f.medio,
    usuario_captura_id: f.piloto,
    desde: f.desde,
    hasta: f.hasta,
    estatus_facturacion: f.facturacion,
    conciliado: conciliadoDeFiltroBanco(f.banco),
    capturado_desde: f.captura === "semana" ? diaMas(hoy, -7) : f.cap_desde,
    capturado_hasta: f.cap_hasta,
    orden: f.orden,
  };
}

/** La lista de la pestaña: la base + `pendientes`/`duplicados` según la vista. */
export function queryListaGastos(
  f: FiltrosGastos,
  hoy: string,
): Omit<ListGastosQuery, "limit" | "offset"> {
  const base = queryBaseGastos(f, hoy);
  if (f.vista === "pendientes") return { ...base, pendientes: true };
  if (f.vista === "duplicados") return { ...base, duplicados: true };
  return base;
}

/**
 * Query del «Exportar Excel» (`GET /v1/expenses/export`, mismo
 * `ListGastosQuery` del API): los MISMOS filtros que la pantalla como textos
 * (`conciliado` "true"/"false") y, desde el 14-oct-2026, también la PESTAÑA
 * (`pendientes`/`duplicados` = "true": el DTO los acepta con
 * `ToBooleanQuery`). Antes, desde «Pendientes» el Excel traía todo.
 */
export function queryExcelGastos(f: FiltrosGastos, hoy: string): Record<string, string | undefined> {
  const b = queryBaseGastos(f, hoy);
  const q: Record<string, string | undefined> = {
    aeronave_id: b.aeronave_id,
    categoria: b.categoria,
    medio_pago: b.medio_pago,
    usuario_captura_id: b.usuario_captura_id,
    desde: b.desde,
    hasta: b.hasta,
    estatus_facturacion: b.estatus_facturacion,
    conciliado: b.conciliado == null ? undefined : String(b.conciliado),
    capturado_desde: b.capturado_desde,
    capturado_hasta: b.capturado_hasta,
    orden: b.orden,
  };
  if (f.vista === "pendientes") q.pendientes = "true";
  if (f.vista === "duplicados") q.duplicados = "true";
  return q;
}

/** ¿Hay algún filtro puesto? (avión, categoría y captura cuentan; el orden NO). */
export function hayFiltrosGastos(f: FiltrosGastos): boolean {
  return (
    !!(
      f.aeronave_id ||
      f.categoria ||
      f.medio ||
      f.piloto ||
      f.desde ||
      f.hasta ||
      f.facturacion ||
      f.banco
    ) || f.captura !== "todas"
  );
}

// =============================================================================
// Pestañas y estados
// =============================================================================

/**
 * Etiquetas de las pestañas: el MISMO mapa que nombra la pestaña del
 * navegador (`PESTANAS_GASTOS` de `titulos-pestana`): si una cambia, cambian
 * las dos.
 */
export const ETIQUETA_VISTA: Readonly<Record<VistaGastos, string>> = PESTANAS_GASTOS;

export const AYUDA_VISTA: Readonly<Record<VistaGastos, string>> = {
  todos: "Todos los gastos con los filtros de abajo.",
  pendientes: "Gastos que necesitan avión y aún no lo tienen. Debe quedar vacía.",
  duplicados:
    "Gastos que el sistema marcó como posible duplicado. Revísalos y descarta los que no lo son.",
};

/** Title de la pestaña; un conteo que no se pudo leer lo dice (jamás «0»). */
export function tituloVistaGastos(vista: VistaGastos, count: number | null | undefined): string {
  return AYUDA_VISTA[vista] + (vista !== "todos" && count == null ? " (no se pudo contar)" : "");
}

export const TEXTO_QUITAR_FILTROS_GASTOS = "Quitar filtros";
const DESCRIPCION_VACIO_CON_FILTROS = "Cambia o quita algún filtro para ver más gastos.";

/** Título y guía del estado vacío por pestaña (con filtros, «Quitar filtros»). */
export function vacioGastos(
  vista: VistaGastos,
  conFiltros: boolean,
): { titulo: string; descripcion: string } {
  if (conFiltros) {
    const titulo =
      vista === "pendientes"
        ? "Sin pendientes con estos filtros"
        : vista === "duplicados"
          ? "Sin duplicados con estos filtros"
          : "Ningún gasto coincide con estos filtros";
    return { titulo, descripcion: DESCRIPCION_VACIO_CON_FILTROS };
  }
  if (vista === "pendientes") {
    return {
      titulo: "Sin gastos pendientes",
      descripcion: "Todos los gastos que necesitan avión ya lo tienen. Bandeja limpia.",
    };
  }
  if (vista === "duplicados") {
    return {
      titulo: "Sin duplicados sospechosos",
      descripcion: "Ningún gasto está marcado como posible duplicado.",
    };
  }
  return {
    titulo: "Sin gastos capturados",
    descripcion: "Aquí verás los gastos que capturen pilotos y oficina.",
  };
}

/** «Quitar filtros» del vacío: conserva la pestaña y el orden. */
export function hrefQuitarFiltrosGastos(vista: VistaGastos, orden?: "captura"): string {
  const params = new URLSearchParams();
  if (vista !== "todos") params.set("f", vista);
  if (orden === "captura") params.set("orden", "captura");
  const qs = params.toString();
  return qs ? `/admin/expenses?${qs}` : "/admin/expenses";
}

/** Chip «Avión: N4142R ✕» de la fila de vistas. */
export const TITULO_QUITAR_FILTRO_AVION = "Quitar el filtro de avión";
export const ETIQUETA_CHIP_AVION = "Avión:";
/** Matrícula del chip cuando el id de la URL no está en el catálogo. */
export const AVION_FILTRO_DESCONOCIDO = "desconocido";
export function ariaQuitarFiltroAvion(matricula: string): string {
  return `${TITULO_QUITAR_FILTRO_AVION} ${matricula}`;
}

/** Aviso de corte defensivo (count cambió a media carga). */
export function textoCorteGastos(mostrados: number, total: number): string {
  return `Mostrando ${mostrados} de ${total} gastos — usa los filtros para acotar la lista.`;
}

// =============================================================================
// Opciones de la barra de filtros
// =============================================================================

export const OPCION_TODOS = "Todos";
export const OPCION_TODAS = "Todas";
export const DESCRIPCION_AVION_BAJA = "Dado de baja";
export const ETIQUETA_AVION_DESCONOCIDO = "Avión desconocido";

/** Marca visual de un filtro con valor (borde y fondo de la marca). */
export const CLASE_FILTRO_ACTIVO = "border-brand-600/60 bg-brand-600/5";

/** Antepone la opción vacía («Todos»/«Todas»): así se quita un filtro suelto. */
export function opcionesConTodos<T extends { value: string; label: string }>(
  etiqueta: string,
  opciones: readonly T[],
): Array<T | { value: string; label: string }> {
  return [{ value: "", label: etiqueta }, ...opciones];
}

/**
 * Opciones del filtro «Avión»: «Todos», los activos A–Z, los dados de baja
 * A–Z (con su descripción) y, si el id de la URL no está en el catálogo,
 * «Avión desconocido» al final (para no enseñar «Todos» con un filtro puesto).
 */
export function opcionesAvionFiltroGastos(
  aviones: ReadonlyArray<{ id: string; matricula: string; activa?: boolean }>,
  seleccionado?: string,
): SearchableSelectOption[] {
  const porMatricula = (a: { matricula: string }, b: { matricula: string }) =>
    a.matricula.localeCompare(b.matricula, "es");
  const activos = aviones.filter((a) => a.activa !== false).sort(porMatricula);
  const baja = aviones.filter((a) => a.activa === false).sort(porMatricula);
  const out: SearchableSelectOption[] = [
    { value: "", label: OPCION_TODOS },
    ...activos.map((a) => ({ value: a.id, label: a.matricula })),
    ...baja.map((a) => ({ value: a.id, label: a.matricula, description: DESCRIPCION_AVION_BAJA })),
  ];
  if (seleccionado && !aviones.some((a) => a.id === seleccionado)) {
    out.push({ value: seleccionado, label: ETIQUETA_AVION_DESCONOCIDO });
  }
  return out;
}

export const ETIQUETA_FECHA_GASTO = "Fecha del gasto";
export const TITULO_FECHA_GASTO = "Fecha del consumo (la del ticket)";
export const ETIQUETA_FECHA_CAPTURA = "Fecha de captura";
export const TITULO_FECHA_CAPTURA =
  "Cuándo se capturó (cargó a la app o al panel), en hora Cancún — aunque el ticket traiga otra fecha";
export const TEXTO_ACTUALIZANDO = "Actualizando…";
export const TEXTO_LIMPIAR_FILTROS = "Limpiar";
export const TITULO_LIMPIAR_FILTROS =
  "Quita todos los filtros; conserva la pestaña, el orden y la búsqueda de la tabla.";
export const PISTA_BUSQUEDA_EXCEL =
  "La búsqueda de la tabla solo filtra lo que ves: el Excel sale con la pestaña y los filtros de arriba.";

/**
 * Ancho del selector «Categoría» (revisión del 14-oct-2026): con `sm:w-52` el
 * texto visible es de ~158 px y «Comisión del vendedor (VuelaTour)» y
 * «Comisión del vendedor (avión)» se veían IGUALES («Comisión del vended…»):
 * se cortaba justo quién paga. Con una categoría de etiqueta larga elegida,
 * el selector crece a `sm:w-72` (~238 px de texto: las dos caben completas);
 * sin filtro o con una corta, el ancho de siempre (la barra no se reacomoda
 * para nada).
 */
export const LARGO_MAX_ETIQUETA_CATEGORIA_FILTRO = 22;
export function anchoFiltroCategoria(categoria: string | null | undefined): string {
  return categoria && categoriaGastoLabel(categoria).length > LARGO_MAX_ETIQUETA_CATEGORIA_FILTRO
    ? "sm:w-72"
    : "sm:w-52";
}

/** Etiquetas visibles de los campos de la barra (sin cambio de nombre). */
export const ETIQUETAS_FILTRO_GASTOS = {
  categoria: "Categoría",
  avion: "Avión",
  facturacion: "Facturación",
  banco: "Banco",
  medio: "Tipo de pago",
  capturo: "Capturó",
  orden: "Ordenar por",
} as const;

/** aria-label de cada extremo de un rango («Fecha del gasto: desde»). */
export function ariaCampoFecha(etiqueta: string, campo: "desde" | "hasta"): string {
  return `${etiqueta}: ${campo}`;
}

export const OPCIONES_CAPTURA: ReadonlyArray<{ valor: ModoCaptura; etiqueta: string; titulo: string }> = [
  { valor: "todas", etiqueta: "Todas", titulo: "Sin filtro por fecha de captura" },
  {
    valor: "semana",
    etiqueta: "Esta semana",
    titulo:
      "Solo lo capturado en los últimos 7 días (aunque el ticket traiga otra fecha): lo que subieron desde la app esta semana",
  },
  { valor: "rango", etiqueta: "Rango…", titulo: "Elige desde y hasta qué día se capturó (hora Cancún)" },
];

/**
 * «Rango…» de la fecha de captura pulsado SIN fechas todavía (solo UI: la
 * URL no lo dice). `vista` = la URL de filtros donde quedó abierto;
 * `esperada` = la que la PROPIA barra pidió después (mientras viaja).
 */
export interface RangoCapturaAbierto {
  vista: string;
  esperada: string | null;
}

/** La URL de filtros sin la búsqueda ni la página de la tabla (`tq`/`tp` no abren ni cierran nada). */
export function claveFiltrosUrl(qs: string): string {
  const p = new URLSearchParams(qs);
  p.delete("tq");
  p.delete("tp");
  return p.toString();
}

/**
 * ¿Sigue abierto «Rango…» con la URL de AHORA? (revisión del 14-oct-2026).
 * Se queda mientras la URL sea donde se abrió o la que la propia barra pidió
 * (al llegar, esa pasa a ser la vista); cualquier otra —el enlace «Quitar
 * filtros» del vacío, Atrás, el menú «Gastos»— lo CIERRA para siempre. Antes
 * era un booleano que solo apagaba la barra: «Rango…» quedaba presionado, con
 * dos campos vacíos y «Todas» apagado, sin ningún filtro de captura puesto.
 * Devuelve el MISMO objeto si nada cambió (se ajusta en el render, sin bucles).
 */
export function rangoCapturaTrasUrl(
  estado: RangoCapturaAbierto | null,
  clave: string,
): RangoCapturaAbierto | null {
  if (estado === null || clave === estado.vista) return estado;
  if (estado.esperada !== null && clave === estado.esperada) return { vista: clave, esperada: null };
  return null;
}

/** La barra pidió navegar a `destino`: un «Rango…» abierto lo espera. */
export function rangoCapturaTrasNavegar(
  estado: RangoCapturaAbierto | null,
  destino: string,
): RangoCapturaAbierto | null {
  return estado === null ? null : { vista: estado.vista, esperada: destino };
}

/** Orden del listado (lo aplica el API y el Excel sale igual). No es un filtro. */
export const OPCIONES_ORDEN_GASTOS: ReadonlyArray<{ value: "fecha" | "captura"; label: string }> = [
  { value: "fecha", label: "Fecha del gasto" },
  { value: "captura", label: "Fecha de captura" },
];

// =============================================================================
// Renglón de la tabla
// =============================================================================

export const PLACEHOLDER_BUSCAR_GASTOS = "Buscar: proveedor, monto, matrícula, folio, vuelo…";
export const ETIQUETA_LISTA_GASTOS = "Lista de gastos";

/** Encabezados de la tabla (los títulos largos van en `title` / sr-only). */
export const ENCABEZADOS_GASTOS = {
  fecha: "Fecha",
  concepto: "Concepto",
  monto: "Monto",
  avion: "Avión · vuelo",
  comp: "Comp.",
  compLargo: "Comprobante",
  facturacion: "Facturación",
  banco: "Banco",
  acciones: "Acciones",
} as const;

export const TITULO_ENCABEZADO_FECHA =
  "Fecha del gasto (la del ticket). Debajo: cuándo se capturó y quién lo capturó (hora Cancún).";
export const TITULO_ENCABEZADO_COMP = "Comprobante (ticket, factura o voucher)";
export const TEXTO_DUPLICADO = "¿Duplicado?";
export const TITULO_DUPLICADO =
  "Posible duplicado: revísalo y, si no lo es, márcalo con «No es duplicado» en el menú ⋯.";
export const TEXTO_FALTA_VISTO_BUENO = "Falta visto bueno";
export const TITULO_FALTA_VISTO_BUENO =
  "Prellenado con IA desde la app: pendiente del visto bueno de administración (menú ⋯ → Dar visto bueno).";
export const ETIQUETA_SIN_VISTA_PREVIA = "Sin vista previa";
export const TITULO_SIN_VISTA_PREVIA =
  "No se pudo cargar la foto del comprobante; recarga la página o ábrelo en «Verificar / editar».";
export const TEXTO_SIN_COMPROBANTE_CORTO = "Sin comp.";
export const TEXTO_CONFIRMADO_CORTO = "✓ Confirmado";

/** Title del ✓ de confirmación del panel (quién y cuándo). */
export function tituloConfirmadoGasto(g: Pick<Gasto, "verificador" | "verificado_at">): string {
  return `Confirmado por ${verificadorNombre(g) ?? "oficina"} · ${fmtDate(g.verificado_at)}`;
}

/**
 * Respaldo de la columna «Comp.» bajo el concepto (revisión del 14-oct-2026):
 * la columna se oculta debajo de 1280 px (1300 en modo unir) y la línea del
 * teléfono solo vive debajo de 768 px; entre los dos nada decía si el gasto
 * trae papel. Dice lo que la columna pintaría salvo la miniatura: «Sin
 * comp.», «Sin vista previa» (`firmada` = la foto sí tiene URL firmada),
 * «+2 hojas» y «✓ Confirmado» (con quién y cuándo en el title). Como en la
 * línea del teléfono, la AUSENCIA de «Sin comp.» = sí trae comprobante.
 * null = nada que decir.
 */
export function lineaComprobanteGasto(
  g: Gasto,
  firmada: boolean,
): { texto: string; title: string | null } | null {
  const partes = [
    !hayComprobante(g.estatus_comprobante) ? TEXTO_SIN_COMPROBANTE_CORTO : null,
    g.foto_url && !firmada ? ETIQUETA_SIN_VISTA_PREVIA : null,
    textoHojas(hojasDe(g).length),
    g.verificado_at ? TEXTO_CONFIRMADO_CORTO : null,
  ].filter((p): p is string => !!p);
  if (partes.length === 0) return null;
  return { texto: partes.join(" · "), title: g.verificado_at ? tituloConfirmadoGasto(g) : null };
}

/** Alt de la miniatura del comprobante. */
export function altComprobanteGasto(categoria: string): string {
  return `Comprobante · ${categoriaGastoLabel(categoria)}`;
}

/** «incl. propina $50 MXN» bajo el monto; null sin propina. */
export function textoPropinaGasto(
  propina: string | number | null | undefined,
  moneda: string,
): string | null {
  const n = Number(propina ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `incl. propina ${fmtMonto(n, moneda)}`;
}

const escaparRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Descripción del renglón (2 líneas como máximo en la tabla): la PRIMERA
 * línea de las notas; si empieza con la matrícula del PROPIO gasto y « · »
 * (210 gastos en prod: «XA-VGV · Aeropuerto de Cancún…»), ese prefijo se
 * quita porque la matrícula ya está en «Avión · vuelo» — solo si queda
 * texto. Sin notas: el proveedor, luego el lugar. `title` = las notas
 * completas (o null).
 */
export function descripcionGasto(
  g: Pick<Gasto, "notas" | "aeronave" | "proveedor" | "lugar">,
): { texto: string | null; title: string | null } {
  const notas = (g.notas ?? "").trim();
  if (notas) {
    let linea = notas.split("\n")[0].trim();
    const matricula = g.aeronave?.matricula?.trim();
    if (matricula) {
      const sinPrefijo = linea.replace(new RegExp(`^${escaparRegExp(matricula)}\\s*·\\s*`), "").trim();
      if (sinPrefijo && sinPrefijo !== linea) linea = sinPrefijo;
    }
    return { texto: linea || null, title: notas };
  }
  const proveedor = g.proveedor?.nombre?.trim();
  if (proveedor) return { texto: proveedor, title: null };
  const lugar = g.lugar?.trim();
  if (lugar) return { texto: lugar, title: null };
  return { texto: null, title: null };
}

/**
 * Texto de la búsqueda rápida de un gasto: lo de siempre (categoría y su
 * etiqueta, proveedor, matrículas —también las del reparto—, lugar, folio del
 * vuelo, quién capturó, terminación, notas, compra) + lo que ahora se VE en
 * el renglón (vuelo, origen y distintivo, medio de pago largo y corto, el
 * monto en las dos formas, folio del ticket, a dónde va el dinero, las
 * insignias, facturación y banco). Así se encuentra por «2,763», «2763.00»,
 * «efectivo», el folio, «vuelatour», «falta avion», «duplicado» o «sin
 * conciliar» (`coincideBusqueda` normaliza acentos y montos).
 */
export function textoBusquedaGasto(g: Gasto): string {
  const folioVuelo = g.vuelo?.folio ?? "";
  const banco = estadoBancoGasto(g);
  return [
    g.categoria,
    categoriaGastoLabel(g.categoria),
    g.proveedor?.nombre ?? "",
    g.aeronave?.matricula ?? "",
    ...(g.repartos ?? []).map((r) => r.aeronave?.matricula ?? ""),
    g.lugar ?? "",
    folioVuelo,
    folioVuelo ? `Vuelo #${folioVuelo}` : "",
    g.captura?.nombre ?? "",
    origenCapturaLabel(g.origen) ?? "",
    distintivoOrigen(g.origen)?.etiqueta ?? "",
    g.tarjeta_terminacion ?? "",
    medioPagoLabel(g.medio_pago),
    textoPagoCorto(g.medio_pago, g.tarjeta_terminacion)?.texto ?? "",
    Number(g.monto).toFixed(2),
    fmtMonto(g.monto, g.moneda),
    g.folio_ticket ?? "",
    etiquetaAvionGasto(estadoAvionGasto(g)),
    g.duplicado_sospechado ? TEXTO_DUPLICADO : "",
    g.requiere_visto_bueno === true ? TEXTO_FALTA_VISTO_BUENO : "",
    estadoFacturacion(g.estatus_facturacion).label,
    banco.value === "NO_APLICA" ? "" : banco.label,
    g.notas ?? "",
    g.compra ? `compra #${g.compra.folio}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Línea de estado SOLO en teléfono (<768 px), bajo el concepto: lo que en
 * pantalla ancha está en las columnas de la derecha, en texto.
 * «$295.67 MXN · XA-VGV · Factura: Pendiente · Banco: Sin conciliar».
 */
export function lineaEstadoMovilGasto(g: Gasto): string {
  const banco = estadoBancoGasto(g);
  return [
    fmtMonto(g.monto, g.moneda),
    etiquetaAvionGasto(estadoAvionGasto(g)),
    `Factura: ${etiquetaFacturacionTabla(g.estatus_facturacion)}`,
    banco.value !== "NO_APLICA" ? `Banco: ${banco.label}` : null,
    !hayComprobante(g.estatus_comprobante) ? TEXTO_SIN_COMPROBANTE_CORTO : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// =============================================================================
// Compra (renglón-grupo)
// =============================================================================

/** «Compra #5» (insignia del renglón-grupo). */
export function etiquetaCompra(folio: number): string {
  return `Compra #${folio}`;
}

/** Nombre accesible y title del enlace de solo ícono a la compra. */
export function tituloAbrirCompra(folio: number): string {
  return `Abrir la compra #${folio}`;
}

export const TITULO_VER_PAGOS_COMPRA = "Ver los pagos de la compra";
export const TITULO_OCULTAR_PAGOS_COMPRA = "Ocultar pagos";

/**
 * Pagos de la compra bajo su total: «1 pago», «3 pagos» o, si el API dice
 * que tiene más de los que llegaron a esta vista (filtro o corte), «2 de 3
 * pagos» con el aviso de que los totales del grupo son parciales.
 */
export function textoPagosCompra(
  cargados: number,
  total: number | null,
): { texto: string; parcial: string | null; title: string | null } {
  if (total !== null && total > cargados) {
    return {
      texto: `${cargados} de ${total} pagos`,
      parcial: "(parcial: hay pagos fuera de este filtro)",
      title:
        "La compra tiene pagos que no entran en el filtro o en el corte de esta vista; los totales del grupo son parciales. Abre la compra para verlos todos.",
    };
  }
  return { texto: `${cargados} ${cargados === 1 ? "pago" : "pagos"}`, parcial: null, title: null };
}

// =============================================================================
// Encabezado: «Sugerir asignaciones» y carga
// =============================================================================

/**
 * Cuántos pendientes revisa UNA pasada de «Sugerir asignaciones»: espejo del
 * `.limit(15)` de `sugerirAsignaciones()` del API (los 15 de `fecha_gasto`
 * más reciente; la prueba de paridad lee el repo hermano). Revisión del
 * 14-oct-2026: los textos prometían «toda la bandeja» y con 36 pendientes el
 * API revisaba 15; los otros 21 nunca recibían sugerencia y nadie lo decía.
 */
export const TOPE_SUGERIR_ASIGNACIONES = 15;

/** Title de «Sugerir asignaciones»: el total GLOBAL de la bandeja (no lo filtrado) y el tope de una pasada. */
export function ayudaSugerirAsignaciones(n: number | null): string {
  if (n === null) {
    return `No se pudieron contar los pendientes; el análisis revisa los ${TOPE_SUGERIR_ASIGNACIONES} más recientes de la bandeja (no solo de lo filtrado).`;
  }
  if (n === 1) return "Propone el avión del gasto pendiente de la bandeja (no solo de lo filtrado).";
  if (n <= 0) return "No hay gastos pendientes en la bandeja.";
  if (n > TOPE_SUGERIR_ASIGNACIONES) {
    return `Propone el avión de los ${TOPE_SUGERIR_ASIGNACIONES} pendientes más recientes de la bandeja (hay ${n}; no solo de lo filtrado).`;
  }
  return `Propone el avión de los ${n} gastos pendientes de toda la bandeja (no solo de lo filtrado).`;
}

/** Texto mientras corre el análisis. */
export function textoAnalizandoPendientes(n: number | null): string {
  if (n === null || n <= 0) return "Analizando los pendientes… esto toma unos segundos.";
  if (n > TOPE_SUGERIR_ASIGNACIONES) {
    return `Analizando los ${TOPE_SUGERIR_ASIGNACIONES} más recientes de ${n} pendientes… esto toma unos segundos.`;
  }
  return `Analizando ${n} ${n === 1 ? "pendiente" : "pendientes"}… esto toma unos segundos.`;
}

/**
 * Bajo el resultado: cuántos pendientes NO revisó esta pasada (el API revisa
 * a lo más `TOPE_SUGERIR_ASIGNACIONES`). `pendientes` = el total global de la
 * bandeja (null = no se pudo contar ⇒ no se afirma nada); `revisados` = los
 * que devolvió el API. null = no quedó ninguno fuera (o no se sabe: sin
 * conteo, o sin nada revisado —un conteo viejo no se contradice con «No hay
 * gastos pendientes por revisar»—).
 */
export function textoPendientesSinRevisar(pendientes: number | null, revisados: number): string | null {
  if (pendientes === null || revisados <= 0 || !(pendientes > revisados)) return null;
  const faltan = pendientes - revisados;
  return faltan === 1
    ? `Se revisaron los ${revisados} pendientes más recientes; 1 pendiente más no se revisó en esta pasada (asígnalo a mano).`
    : `Se revisaron los ${revisados} pendientes más recientes; otros ${faltan} no se revisaron en esta pasada (asígnalos a mano o vuelve a pulsar después de aplicar).`;
}

export const ETIQUETA_FOTOS_COMPROBANTES = "las fotos de los comprobantes";
export const ETIQUETA_TOTAL_PENDIENTES = "el total de pendientes";
export const TITULO_ERROR_LISTA_GASTOS = "No se pudieron cargar los gastos";
export const DESCRIPCION_ERROR_LISTA_GASTOS =
  "El servidor no respondió. Pulsa Reintentar: tus filtros se conservan.";

// =============================================================================
// Modo «Unir en compra»
// =============================================================================

export const TEXTO_MODO_UNIR = "Unir en compra…";
export const TEXTO_TERMINAR_UNIR = "Terminar de unir";
export const AYUDA_MODO_UNIR =
  "Muestra casillas para marcar los pagos de una misma compra (la factura de mercancía y su envío, impuestos…) y unirlos.";
export const TITULO_TERMINAR_UNIR = "Oculta las casillas y limpia la selección.";
export const INSTRUCCION_MODO_UNIR =
  "Marca los gastos que son pagos de una misma compra: la factura de mercancía y al menos otro pago (envío, impuestos…).";
/** La misma instrucción en teléfono (la barra fija no debe tapar media pantalla). */
export const INSTRUCCION_MODO_UNIR_CORTA = "Marca la factura de mercancía y al menos otro pago de la compra.";
/**
 * La lista NO cargó: la barra no dice «no hay gastos que se puedan unir»
 * (jamás «sin datos» cuando la carga falló; revisión del 14-oct-2026).
 */
export const TEXTO_UNIR_SIN_LISTA =
  "No se pudieron cargar los gastos: pulsa «Reintentar» para seguir uniendo (lo marcado se conserva).";
export const TEXTO_TERMINAR_BARRA = "Terminar";
export const ENCABEZADO_COLUMNA_UNIR = "Unir en compra";
export const TITULO_COLUMNA_UNIR = "Marca los pagos de una misma compra";
/** Botón de la barra flotante. */
export const TEXTO_BOTON_UNIR = "Unir en compra";
export const TEXTO_LIMPIAR_SELECCION = "Limpiar";
export const TITULO_MINIMO_UNIR = "Marca al menos dos gastos para unirlos";
export const AYUDA_UN_SELECCIONADO =
  "Marca la factura de mercancía y al menos otro pago (envío, impuestos…). Para un solo gasto usa “Crear compra con esta factura” en su menú.";

/** «1 gasto seleccionado» / «3 gastos seleccionados». */
export function textoGastosSeleccionados(n: number): string {
  return n === 1 ? "gasto seleccionado" : "gastos seleccionados";
}

/** La barra del modo cuando la vista no tiene nada que se pueda unir. */
export function tituloUnirSinSeleccionables(): string {
  return `En esta vista no hay gastos que se puedan unir: solo gastos sueltos de ${unirEtiquetas(
    [...CATEGORIAS_COMPRA].map(categoriaGastoLabel),
  )}.`;
}
