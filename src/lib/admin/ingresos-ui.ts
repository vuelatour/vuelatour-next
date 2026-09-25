/**
 * INGRESOS (24-sep-2026) — lógica PURA de la pantalla `/admin/ingresos`.
 *
 * Pedido del cliente: «faltarían las categorías de "ingresos" de igual manera
 * de como están ya ahorita las de "gastos" … •Otros Ingresos •Anticipos y
 * depósitos •Ingresos en cuentas de banco». Usuario: «que tengamos un espacio
 * para ingresos como en Gastos y podamos conciliar como los gastos pero ahora
 * los ingresos subiendo un estado de cuenta y con IA marcar los que sí
 * empatan con los cobros de los vuelos».
 *
 * Este módulo NO calcula dinero: todo total, saldo, estado de conciliación y
 * motivo lo decide el API (contrato INGRESOS). Aquí solo viven los textos
 * es-MX, la validación de la URL y del formulario, y los payloads EXACTOS que
 * el API acepta (corre con `forbidNonWhitelisted`: un campo de más es un 400).
 * Prueba: `__tests__/ingresos-ui.test.ts`.
 */

import type { Rol } from "@/types/me";
import type {
  AbonoPendiente,
  AccionPropuestaAbono,
  CandidatoAbonoFicha,
  CategoriaIngreso,
  EstadoConciliacionEntrada,
  Ingreso,
  IngresoAplicacion,
  IngresoBitacoraFila,
  MetodoIngreso,
  MonedaIngreso,
  PropuestaAbono,
  ResumenIngresosMoneda,
  SugerirAbonosRespuesta,
} from "@/types/ingresos";
import {
  CATEGORIAS_INGRESO,
  CATEGORIA_INGRESO_DESTINO,
  categoriaIngresoAdmiteVuelo,
  categoriaIngresoSumaAResultados,
  esAnticipo,
  etiquetaCategoriaIngreso,
} from "./categorias-ingreso";
import { DESTINO_CLASSNAME } from "./categorias-gasto";
import { diaMas, textoConfianza } from "./conciliacion-auto";
import { metodoPagoLabel } from "./metodos-pago";
import { esDiaValido, uuidFiltro, valorDeCatalogo } from "./url-params";
import { fmtMonto, fmtUsd } from "@/lib/format";
import { fmtDate, fmtDateOnly } from "@/lib/datetime";

/** Misma regla de confianza que la conciliación de gastos (fuente única). */
export { textoConfianza };

// ═══════════════════════════════ Roles ═══════════════════════════════

/** Roles del menú «Ingresos» = los de «Gastos» (espejo de `ROLES_INGRESOS` del API). */
export const ROLES_INGRESOS: readonly Rol[] = ["ADMIN", "COORDINADOR", "FACTURACION"];

/**
 * Conciliar con el banco, desaplicar un anticipo (= borrar un cobro) y
 * desvincular: SOLO ADMIN y FACTURACION, igual que hoy la conciliación y el
 * DELETE de cobros. COORDINADOR registra ingresos y aplica anticipos, pero la
 * pestaña «Por conciliar» ni se le ofrece.
 */
export const ROLES_CONCILIAR_INGRESOS: readonly Rol[] = ["ADMIN", "FACTURACION"];

export function puedeVerIngresos(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_INGRESOS as readonly string[]).includes(rol);
}

export function puedeConciliarIngresos(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_CONCILIAR_INGRESOS as readonly string[]).includes(rol);
}

// ═══════════════════════════════ Pestañas ═══════════════════════════════

export const TABS_INGRESOS = ["todos", "cobros", "otros", "anticipos", "por-conciliar"] as const;
export type TabIngresos = (typeof TABS_INGRESOS)[number];

export const ETIQUETA_TAB_INGRESOS: Record<TabIngresos, string> = {
  todos: "Todos",
  cobros: "Cobros de vuelos",
  otros: "Otros ingresos",
  anticipos: "Anticipos",
  "por-conciliar": "Por conciliar",
};

/** Pestañas que ve el rol: «Por conciliar» solo ADMIN/FACTURACION. */
export function tabsIngresos(rol: string | null | undefined): TabIngresos[] {
  return TABS_INGRESOS.filter((t) => t !== "por-conciliar" || puedeConciliarIngresos(rol));
}

/**
 * Pestaña pedida por la URL: fuera de catálogo ⇒ «todos»; «por-conciliar» sin
 * rol de conciliación ⇒ «todos» (un enlace compartido no abre lo que el rol no
 * puede usar).
 */
export function tabDeUrl(valor: string | null | undefined, rol: string | null | undefined): TabIngresos {
  const t = valorDeCatalogo(valor ?? undefined, TABS_INGRESOS);
  if (!t) return "todos";
  if (t === "por-conciliar" && !puedeConciliarIngresos(rol)) return "todos";
  return t;
}

// ═══════════════════════════════ Filtros de la URL ═══════════════════════════════

export const MONEDAS_INGRESO = ["MXN", "USD"] as const;
export const FILTROS_CONCILIACION = [
  "conciliado",
  "sin_conciliar",
  "no_bancario",
  "via_anticipo",
] as const;
export type FiltroConciliacion = (typeof FILTROS_CONCILIACION)[number];

export const ETIQUETA_FILTRO_CONCILIACION: Record<FiltroConciliacion, string> = {
  conciliado: "Conciliado",
  sin_conciliar: "Sin conciliar",
  no_bancario: "No se concilia uno a uno",
  via_anticipo: "Conciliado vía anticipo",
};

export interface FiltrosIngresos {
  tab: TabIngresos;
  /** Periodo YA resuelto (default: mes corriente Cancún, del 1 a hoy). */
  desde: string;
  hasta: string;
  /** true = el periodo viene en la URL (se conserva en los enlaces). */
  periodoExplicito: boolean;
  moneda?: MonedaIngreso;
  categoria?: CategoriaIngreso;
  cuenta?: string;
  conciliacion?: FiltroConciliacion;
  q?: string;
  /** Detalle abierto (`?ingreso=<uuid>`). */
  ingreso?: string;
  /** «Ver dados de baja» (Otros ingresos). Ausente = excluir. */
  bajas?: "incluir" | "solo";
  /** Anticipos: «todos» (ausente = solo con saldo). */
  saldo?: "todos";
}

type Sp = Record<string, string | string[] | undefined>;

function primero(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Filtros de la URL VALIDADOS (patrón `url-params`): un valor fuera de
 * catálogo o una fecha que no existe se IGNORA en vez de viajar al API y
 * tumbar la pantalla. El rango invertido se corrige. `hoy` es parámetro para
 * poder probar el default sin fingir el reloj.
 */
/** Ventana de «Por conciliar» cuando la URL no trae periodo (= default del API). */
export const DIAS_POR_CONCILIAR_DEFAULT = 90;

export function filtrosIngresosDeUrl(
  sp: Sp,
  rol: string | null | undefined,
  hoy: string,
): FiltrosIngresos {
  const tab = tabDeUrl(primero(sp.tab), rol);
  let d = primero(sp.desde);
  let h = primero(sp.hasta);
  d = esDiaValido(d) ? d : undefined;
  h = esDiaValido(h) ? h : undefined;
  if (d && h && d > h) [d, h] = [h, d];
  // Solo `hasta` anterior al mes corriente: el default «día 1 del mes» quedaría
  // DESPUÉS de `hasta` y el API respondería 400 (desde > hasta) ⇒ la lista
  // principal caía en «No se pudo cargar». Se toma el día 1 del mes de `hasta`.
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  // «Por conciliar» SIN periodo en la URL abre los últimos 90 días (el
  // default del API): el estado de cuenta que se acaba de subir suele ser del
  // mes ANTERIOR y, con el mes corriente, sus abonos no aparecían y parecía
  // que ya no había nada que conciliar.
  const inicioDefault =
    tab === "por-conciliar" && !h ? diaMas(hoy, -(DIAS_POR_CONCILIAR_DEFAULT - 1)) : inicioMes;
  const desde = d ?? (h && h < inicioMes ? `${h.slice(0, 7)}-01` : inicioDefault);
  const hasta = h ?? (desde > hoy ? desde : hoy);
  const conc = valorDeCatalogo(primero(sp.conciliacion), FILTROS_CONCILIACION);
  const q = (primero(sp.q) ?? "").trim().slice(0, 80);
  const bajas = valorDeCatalogo(primero(sp.bajas), ["incluir", "solo"] as const);
  return {
    tab,
    desde,
    hasta,
    periodoExplicito: !!(d || h),
    moneda: valorDeCatalogo(primero(sp.moneda), MONEDAS_INGRESO),
    // La categoría solo filtra «Todos» y «Otros ingresos» (esta vista no
    // incluye anticipos: filtrar por ANTICIPO ahí sería una lista vacía falsa).
    categoria:
      tab === "todos" || (tab === "otros" && primero(sp.categoria) !== "ANTICIPO_CLIENTE")
        ? valorDeCatalogo(primero(sp.categoria), CATEGORIAS_INGRESO)
        : undefined,
    cuenta: uuidFiltro(primero(sp.cuenta)),
    // «Vía anticipo» solo existe para COBROS (las entradas); en la lista de
    // ingresos el API no lo conoce ⇒ se ignora ahí.
    conciliacion:
      conc === "via_anticipo" && (tab === "otros" || tab === "anticipos") ? undefined : conc,
    q: q || undefined,
    ingreso: uuidFiltro(primero(sp.ingreso)),
    bajas: tab === "otros" ? bajas : undefined,
    saldo: tab === "anticipos" && primero(sp.saldo) === "todos" ? "todos" : undefined,
  };
}

export type ClaveUrlIngresos =
  | "tab"
  | "desde"
  | "hasta"
  | "moneda"
  | "categoria"
  | "cuenta"
  | "conciliacion"
  | "q"
  | "ingreso"
  | "bajas"
  | "saldo";

/** Parámetros explícitos de la vista (lo default NO se escribe en la URL). */
export function paramsDeFiltros(f: FiltrosIngresos): URLSearchParams {
  const p = new URLSearchParams();
  if (f.tab !== "todos") p.set("tab", f.tab);
  if (f.periodoExplicito) {
    p.set("desde", f.desde);
    p.set("hasta", f.hasta);
  }
  if (f.moneda) p.set("moneda", f.moneda);
  if (f.categoria) p.set("categoria", f.categoria);
  if (f.cuenta) p.set("cuenta", f.cuenta);
  if (f.conciliacion) p.set("conciliacion", f.conciliacion);
  if (f.q) p.set("q", f.q);
  if (f.bajas) p.set("bajas", f.bajas);
  if (f.saldo) p.set("saldo", f.saldo);
  if (f.ingreso) p.set("ingreso", f.ingreso);
  return p;
}

/**
 * URL de `/admin/ingresos` que CONSERVA los filtros de la vista y aplica los
 * cambios (`null` = quitar). Cambiar de pestaña quita el detalle abierto y los
 * filtros que no existen en la pestaña destino.
 */
export function hrefIngresos(
  f: FiltrosIngresos,
  cambios: Partial<Record<ClaveUrlIngresos, string | null>> = {},
): string {
  const p = paramsDeFiltros(f);
  if ("tab" in cambios) {
    p.delete("ingreso");
    const destino = cambios.tab ?? "todos";
    if (destino !== "otros") p.delete("bajas");
    if (destino !== "anticipos") p.delete("saldo");
    if (
      destino === "cobros" ||
      destino === "anticipos" ||
      destino === "por-conciliar" ||
      (destino === "otros" && p.get("categoria") === "ANTICIPO_CLIENTE")
    ) {
      p.delete("categoria");
    }
    if (destino === "todos" || destino === "cobros") p.delete("cuenta");
    if (p.get("conciliacion") === "via_anticipo" && destino !== "todos" && destino !== "cobros") {
      p.delete("conciliacion");
    }
  }
  for (const [k, v] of Object.entries(cambios)) {
    if (k === "tab") {
      if (!v || v === "todos") p.delete("tab");
      else p.set("tab", v);
      continue;
    }
    if (v == null || v === "") p.delete(k);
    else p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `/admin/ingresos?${qs}` : "/admin/ingresos";
}

type Query = Record<string, string | undefined>;

/** Query de `GET /v1/ingresos/entradas` para «Todos» / «Cobros de vuelos». */
export function queryEntradas(f: FiltrosIngresos, tab: "todos" | "cobros"): Query {
  return {
    desde: f.desde,
    hasta: f.hasta,
    origen: tab === "cobros" ? "cobros" : "todos",
    moneda: f.moneda,
    categoria: tab === "todos" ? f.categoria : undefined,
    conciliacion: f.conciliacion,
    q: f.q,
  };
}

/** «Depósitos de vuelos que aún no vuelan» (solo lectura, pestaña Anticipos). */
export function queryDepositosPorVolar(f: FiltrosIngresos): Query {
  return {
    desde: f.desde,
    hasta: f.hasta,
    origen: "cobros",
    vuelo: "por_volar",
    moneda: f.moneda,
    q: f.q,
  };
}

/** Query de `GET /v1/ingresos` para «Otros ingresos» / «Anticipos». */
export function queryIngresos(f: FiltrosIngresos, vista: "otros" | "anticipos"): Query {
  const conc = f.conciliacion === "via_anticipo" ? undefined : f.conciliacion;
  return {
    desde: f.desde,
    hasta: f.hasta,
    vista,
    categoria: vista === "otros" ? f.categoria : undefined,
    moneda: f.moneda,
    cuenta_bancaria_id: f.cuenta,
    conciliacion: conc,
    // Anticipos: por default el API lista TODOS los que tienen saldo (ignora
    // el periodo); «Todos» usa el periodo.
    saldo: vista === "anticipos" ? (f.saldo === "todos" ? "todos" : "con_saldo") : undefined,
    bajas: vista === "otros" ? (f.bajas ?? "excluir") : undefined,
    q: f.q,
  };
}

/** Query de `GET /v1/conciliacion/abonos-pendientes` (mismo periodo de la vista). */
export function queryAbonosPendientes(f: FiltrosIngresos): Query {
  return { desde: f.desde, hasta: f.hasta, cuenta_bancaria_id: f.cuenta };
}

/** Qué descarga «Descargar Excel» en cada pestaña (filtros de `entradas` + `vista`). */
export function queryExportIngresos(f: FiltrosIngresos): Query {
  const base: Query = {
    desde: f.desde,
    hasta: f.hasta,
    moneda: f.moneda,
    q: f.q,
  };
  switch (f.tab) {
    case "cobros":
      return { ...base, origen: "cobros", conciliacion: f.conciliacion };
    case "otros":
      return {
        ...base,
        origen: "ingresos",
        vista: "otros",
        categoria: f.categoria,
        conciliacion: f.conciliacion,
      };
    case "anticipos":
      return { ...base, origen: "ingresos", vista: "anticipos" };
    default:
      return {
        ...base,
        origen: "todos",
        vista: "todos",
        categoria: f.categoria,
        conciliacion: f.conciliacion,
      };
  }
}

/** Ruta del proxy del Excel (`app/api/ingresos/export`). */
export function rutaExportIngresos(f: FiltrosIngresos): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(queryExportIngresos(f))) if (v) p.set(k, v);
  return `/api/ingresos/export?${p.toString()}`;
}

export function nombreExportIngresos(desde: string, hasta: string): string {
  return `Ingresos ${desde} a ${hasta}.xlsx`;
}

const ORIGENES_EXPORT = ["todos", "cobros", "ingresos"] as const;
const VISTAS_EXPORT = ["otros", "anticipos", "todos"] as const;

/**
 * Parámetros que el PROXY del Excel reenvía al API: SOLO los conocidos y
 * validados (el API corre con `forbidNonWhitelisted`; un parámetro de más es
 * un 400 y un valor inválido, otro). PURO para probarlo sin Next.
 */
export function parametrosExportDeUrl(sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  let desde = sp.get("desde") ?? undefined;
  let hasta = sp.get("hasta") ?? undefined;
  desde = esDiaValido(desde) ? desde : undefined;
  hasta = esDiaValido(hasta) ? hasta : undefined;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  if (desde) out.set("desde", desde);
  if (hasta) out.set("hasta", hasta);
  const origen = valorDeCatalogo(sp.get("origen") ?? undefined, ORIGENES_EXPORT);
  if (origen) out.set("origen", origen);
  const vista = valorDeCatalogo(sp.get("vista") ?? undefined, VISTAS_EXPORT);
  if (vista) out.set("vista", vista);
  const moneda = valorDeCatalogo(sp.get("moneda") ?? undefined, MONEDAS_INGRESO);
  if (moneda) out.set("moneda", moneda);
  const categoria = valorDeCatalogo(sp.get("categoria") ?? undefined, CATEGORIAS_INGRESO);
  if (categoria) out.set("categoria", categoria);
  const conc = valorDeCatalogo(sp.get("conciliacion") ?? undefined, FILTROS_CONCILIACION);
  if (conc) out.set("conciliacion", conc);
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  if (q) out.set("q", q);
  return out;
}

// ═══════════════════════════════ Estados y motivos ═══════════════════════════════

export type TonoIngreso = "verde" | "ambar" | "gris" | "azul" | "rojo";

export const CLASE_TONO: Record<TonoIngreso, string> = {
  verde:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ambar: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  gris: "border-border text-muted-foreground",
  azul: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  rojo: "border-destructive/50 text-destructive",
};

export interface EtiquetaEstado {
  texto: string;
  tono: TonoIngreso;
  titulo: string;
}

/**
 * Badge de conciliación de un ingreso o de un cobro de vuelo. El ESTADO lo
 * decide el API (fuente única: la misma regla que «Cobros sin banco»); aquí
 * solo se nombra.
 */
export function etiquetaEstadoConciliacion(
  estado: EstadoConciliacionEntrada | string | null | undefined,
): EtiquetaEstado {
  switch (estado) {
    case "CONCILIADO":
      return {
        texto: "Conciliado",
        tono: "verde",
        titulo: "Ligado a un movimiento del estado de cuenta.",
      };
    case "SIN_CONCILIAR":
      return {
        texto: "Sin conciliar",
        tono: "ambar",
        titulo:
          "Todavía no aparece en ningún estado de cuenta importado: al subirlo se cruza solo o se concilia en «Por conciliar».",
      };
    case "VIA_ANTICIPO":
      return {
        texto: "Conciliado vía anticipo",
        tono: "azul",
        titulo:
          "Este cobro salió de un anticipo que ya está conciliado con su abono del banco.",
      };
    case "NO_BANCARIO":
      return {
        texto: "No se concilia uno a uno",
        tono: "gris",
        titulo: "Efectivo, dólares en mano o terminal BillPocket (depósito agrupado)",
      };
    default:
      return { texto: "—", tono: "gris", titulo: "Sin dato de conciliación." };
  }
}

export const TEXTO_DUPLICADO = "¿Duplicado?";

/** Tooltip del chip «¿Duplicado?» de un abono. */
export function tituloDuplicado(d: AbonoPendiente["posible_duplicado_de"]): string {
  if (!d) return "";
  const cual = [d.descripcion, d.referencia ? `ref. ${d.referencia}` : null]
    .filter(Boolean)
    .join(" · ");
  return `Hay otra línea del banco en la misma cuenta, con la misma fecha y el mismo monto (${
    d.conciliado ? "ya conciliada" : "pendiente"
  })${cual ? `: ${cual}` : ""}. Revísala antes de conciliar esta: registrarla dos veces inflaría el ingreso.`;
}

/**
 * Motivo por el que un ABONO sigue sin identificar («Por conciliar»). Nunca
 * se inventa: sin motivos calculados por el API es «Pendiente» a secas.
 */
export function etiquetaMotivoAbono(
  a: Pick<AbonoPendiente, "patron" | "motivo_pendiente" | "candidatos_n" | "exactos_manual">,
  motivosCalculados = true,
): EtiquetaEstado {
  if (a.patron === "TRASPASO") {
    return {
      texto: "Parece traspaso",
      tono: "gris",
      titulo:
        "La descripción del banco dice traspaso entre cuentas: no es un ingreso. Pulsa «Cruzar pendientes» y se clasifica solo.",
    };
  }
  if (a.patron === "REVERSO") {
    return {
      texto: "Parece reverso",
      tono: "gris",
      titulo:
        "El banco devolvió un cargo anterior: no es un ingreso. Clasifícalo con «Es el reverso de un cargo».",
    };
  }
  if (!motivosCalculados || !a.motivo_pendiente) {
    return {
      texto: "Pendiente",
      tono: "ambar",
      titulo: motivosCalculados
        ? "Sin identificar todavía. Elige qué es desde el menú de la fila."
        : "No se pudo calcular por qué sigue pendiente (la lectura de candidatos falló o se recortó). Revísalo a mano desde el menú de la fila.",
    };
  }
  const exactos = typeof a.exactos_manual === "number" ? a.exactos_manual : 0;
  switch (a.motivo_pendiente) {
    case "SE_PUEDE_CRUZAR":
      return {
        texto: "Se puede cruzar",
        tono: "verde",
        titulo:
          "Hay un cobro o un ingreso que cuadra exacto con este abono: pulsa «Cruzar pendientes» y se liga solo.",
      };
    case "AMBIGUO": {
      const n = a.candidatos_n ?? 0;
      return {
        texto: n > 1 ? `Ambiguo entre ${n}` : "Ambiguo",
        tono: "ambar",
        titulo:
          "Más de un cobro o ingreso cuadra con este abono: el sistema no adivina. Elige el correcto con «Vincular a un cobro o ingreso».",
      };
    }
    default: {
      const extra =
        exactos > 0 ? ` · ${exactos} con el monto exacto` : "";
      return {
        texto: `Sin candidato automático${extra}`,
        tono: exactos > 0 ? "azul" : "ambar",
        titulo:
          exactos > 0
            ? `El cruce automático no lo toma, pero ${
                exactos === 1 ? "hay 1 cobro o ingreso" : `hay ${exactos} cobros o ingresos`
              } con el monto exacto (p. ej. una transferencia a la cuenta Paywise). Revísalo en «Vincular a un cobro o ingreso».`
            : "Ningún cobro de vuelo ni ingreso registrado cuadra con este abono. Si es el pago de un vuelo, registra su cobro; si el vuelo aún no existe, es un anticipo; si no, otro ingreso.",
      };
    }
  }
}

/** Saldo de un anticipo en palabras («Saldo por aplicar $4,000.00 MXN»). */
export function textoSaldoAnticipo(
  a: Ingreso["anticipo"] | null | undefined,
  moneda: string,
): string {
  if (!a) return "";
  if (a.saldo <= 0.005) return "Aplicado completo";
  if (a.aplicado <= 0.005) return `Sin aplicar · saldo ${fmtMonto(a.saldo, moneda)}`;
  return `Saldo por aplicar ${fmtMonto(a.saldo, moneda)}`;
}

// ═══════════════════════════════ Errores del API ═══════════════════════════════

/** Fallback es-MX por code (contrato INGRESOS §10). El `message` del API manda. */
export const FALLBACK_ERROR_INGRESO: Record<string, string> = {
  INGRESOS_NO_DISPONIBLE:
    "Los ingresos todavía no están habilitados; intenta en unos minutos.",
  INGRESO_NO_EXISTE: "Ese ingreso ya no existe.",
  CATEGORIA_EXIGE_CLIENTE: "Un anticipo necesita el cliente.",
  ANTICIPO_CON_VUELO: "Si el vuelo ya existe, registra el cobro en el vuelo.",
  EFECTIVO_SIN_CUENTA: "Sin cuenta bancaria el método debe ser Efectivo o Dólares directo.",
  MONEDA_DISTINTA_CUENTA: "La moneda no coincide con la de la cuenta.",
  TC_REQUERIDO: "Captura el tipo de cambio.",
  FECHA_FUTURA: "La fecha no puede ser futura.",
  COMISION_INVALIDA: "La comisión debe ser menor que el monto.",
  GASTO_SOLO_EN_REEMBOLSO: "Solo un reembolso puede ligar un gasto.",
  ARCHIVO_TIPO_INVALIDO: "Sube una foto o PDF de hasta 10 MB.",
  ARCHIVO_MUY_GRANDE: "Sube una foto o PDF de hasta 10 MB.",
  INGRESO_CONCILIADO: "Está conciliado con el banco: desvincúlalo antes.",
  ANTICIPO_CON_APLICACIONES: "Ya se aplicó a vuelos: desaplícalo antes.",
  ANTICIPO_MONTO_MENOR_A_APLICADO: "No puede valer menos de lo ya aplicado.",
  ANTICIPO_SIN_SALDO: "El anticipo no tiene saldo suficiente.",
  ANTICIPO_MONEDA_DISTINTA: "El cobro debe ser en la moneda del anticipo.",
  ANTICIPO_OTRO_CLIENTE: "El vuelo es de otro cliente (confirmar).",
  NO_ES_ANTICIPO: "Ese ingreso no es un anticipo de cliente.",
  APLICACION_NO_EXISTE: "Esa aplicación ya no existe.",
  INGRESO_DADO_DE_BAJA: "Ese ingreso está dado de baja.",
  COBRO_DE_ANTICIPO:
    "Salió de un anticipo: desaplícalo para cambiar el monto (y al conciliar: concilia el anticipo, no el cobro).",
  COBRO_EXCEDE_SALDO: "El cobro rebasa el saldo del vuelo.",
  SOLO_ABONOS: "Solo un abono (entrada de dinero) se liga a un ingreso.",
  MOVIMIENTO_YA_LIGADO: "Ese movimiento ya está conciliado con otra cosa.",
  INGRESO_SIN_CUENTA: "Este ingreso se registró en efectivo: no llegó al banco.",
  INGRESO_OTRA_CUENTA: "El ingreso está registrado en otra cuenta que la del abono.",
  INGRESO_MONEDA_DISTINTA: "La moneda del ingreso no es la de la cuenta del abono.",
  INGRESO_MONTO_DISTINTO: "El monto del ingreso no cuadra con el abono.",
  INGRESO_YA_CONCILIADO: "Ese ingreso ya está conciliado con otro abono.",
  PERIODO_MUY_GRANDE: "Acota el periodo.",
  VUELO_SOLO_EN_REEMBOLSO:
    "El pago de un vuelo se registra como cobro del vuelo, no como ingreso.",
  ABONO_TIENE_COBRO_CANDIDATO:
    "Este abono cuadra con un cobro de vuelo: vincúlalo a ese cobro (o confirma que es otro dinero).",
  ABONO_POSIBLE_DUPLICADO:
    "Esta línea parece repetida de otra del banco: confirma antes de registrarla.",
  CONCILIAR_SOLO_ADMIN_FACTURACION: "Solo Administración y Facturación concilian con el banco.",
  ANTICIPO_LIGA_INMUTABLE:
    "La liga del cobro con su anticipo no se cambia: desaplica y vuelve a aplicar.",
  CONFLICTO_VERSION: "Alguien lo modificó mientras lo editabas; se recargó.",
  CUENTA_NO_EXISTE: "Esa cuenta bancaria ya no existe.",
  CLIENTE_NO_EXISTE: "Ese cliente ya no existe.",
  VUELO_NO_EXISTE: "Ese vuelo ya no existe.",
  AERONAVE_NO_EXISTE: "Ese avión ya no existe.",
  GASTO_NO_EXISTE: "Ese gasto ya no existe.",
  SIN_ARCHIVO: "Este ingreso no tiene comprobante.",
};

const TECNICO =
  /^(Internal server error|Request failed|Bad Request|Not Found|Unauthorized|Forbidden|Conflict|Service Unavailable)$/i;

/**
 * Mensaje es-MX de un error del API de ingresos: el `message` del API (ya viene
 * redactado en español y suele nombrar el vuelo, el ING-n o el monto) y, si no
 * sirve, el fallback por code de la tabla del contrato.
 */
export function mensajeErrorIngreso(
  code: string | null | undefined,
  message: string | null | undefined,
  status?: number | null,
): string {
  const msg = (message ?? "").trim();
  if (status === 401) return "Tu sesión expiró. Recarga la página e inicia sesión.";
  if (code === "SIN_CONEXION") {
    return "No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.";
  }
  if (code === "TIEMPO_AGOTADO") {
    return "El servidor tardó demasiado y se canceló la espera. Revisa la lista antes de reintentar.";
  }
  if (status === 404 && /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/.test(msg)) {
    return "El servidor todavía no tiene esta función (falta actualizarlo). Avisa a sistemas.";
  }
  const util = msg && code !== "PARSE_ERROR" && !TECNICO.test(msg) ? msg : "";
  if (util) return util;
  if (code && FALLBACK_ERROR_INGRESO[code]) return FALLBACK_ERROR_INGRESO[code];
  if (status === 403) return "Tu usuario no tiene permiso para esto.";
  return `El servidor respondió con error${status ? ` ${status}` : ""}. Vuelve a intentarlo; si sigue igual, avisa a sistemas.`;
}

/** ¿El error es «falta la migración» (503 con su code), no un fallo pasajero? */
export function esIngresosNoDisponible(err: { code?: string | null } | null | undefined): boolean {
  return err?.code === "INGRESOS_NO_DISPONIBLE";
}

// ═══════════════════════════════ Cuentas, métodos, categorías ═══════════════════════════════

export interface CuentaIngresoOpcion {
  id: string;
  alias: string;
  banco: string;
  moneda: MonedaIngreso;
  tipo: "BANCO" | "PASARELA";
  activa: boolean;
}

/** Valor del selector «¿Dónde entró el dinero?» para efectivo / caja (sin cuenta). */
export const VALOR_EFECTIVO = "__efectivo__";
/**
 * Alta desde un abono cuya cuenta el panel no conoce (consulta dirigida de la
 * IA sin la ficha completa): no se manda la cuenta y el API toma la del abono.
 */
export const VALOR_CUENTA_DEL_ABONO = "__cuenta_del_abono__";
export const ETIQUETA_EFECTIVO = "Efectivo / caja (no pasa por el banco)";

export function etiquetaCuentaIngreso(c: Pick<CuentaIngresoOpcion, "alias" | "banco" | "moneda" | "tipo">): string {
  return `${c.alias} · ${c.banco} (${c.moneda})${c.tipo === "PASARELA" ? " · pasarela" : ""}`;
}

/** Orden de los métodos (valores del enum `metodo_cobro`). */
export const METODOS_INGRESO: readonly MetodoIngreso[] = [
  "TRANSFERENCIA",
  "PAYWISE",
  "HSBC_LINK",
  "CHEQUE",
  "BILLPOCKET",
  "EFECTIVO",
  "DOLARES",
  "OTRO",
];
/** Sin cuenta bancaria solo caben estos (espejo de `ingreso_destino_chk`). */
export const METODOS_SIN_CUENTA: readonly MetodoIngreso[] = ["EFECTIVO", "DOLARES"];

/**
 * Método DERIVADO de dónde entró el dinero: cuenta de banco ⇒ Transferencia;
 * pasarela ⇒ Link de pago (Paywise); efectivo ⇒ Efectivo. Editable en «Más datos».
 */
export function metodoDerivado(
  cuenta: Pick<CuentaIngresoOpcion, "tipo"> | null | undefined,
): MetodoIngreso {
  if (!cuenta) return "EFECTIVO";
  return cuenta.tipo === "PASARELA" ? "PAYWISE" : "TRANSFERENCIA";
}

export function opcionesMetodoIngreso(conCuenta: boolean): { value: string; label: string }[] {
  return METODOS_INGRESO.filter((m) => conCuenta || METODOS_SIN_CUENTA.includes(m)).map((m) => ({
    value: m,
    label: metodoPagoLabel(m),
  }));
}

/** Opción del selector de categoría: etiqueta + destino en verde (como Gastos). */
export function opcionCategoriaIngreso(c: CategoriaIngreso): {
  value: string;
  label: string;
  description: string;
  descriptionClassName: string;
} {
  return {
    value: c,
    label: etiquetaCategoriaIngreso(c),
    description: CATEGORIA_INGRESO_DESTINO[c],
    descriptionClassName: DESTINO_CLASSNAME,
  };
}

/**
 * Clasificaciones de conciliación de los abonos que NO son ingreso. Nombres
 * canónicos: «Traspaso entre cuentas» ya existe en prod y «Reverso de un
 * cargo» la siembra la migración `20260924000004` (el POST de clasificaciones
 * es idempotente por nombre, así que crearla desde el panel no la duplica).
 */
export const CLASIFICACION_TRASPASO = "Traspaso entre cuentas";
export const CLASIFICACION_REVERSO = "Reverso de un cargo";

export const AVISO_ANTICIPO_VUELO =
  "¿Ya existe el vuelo? Registra el cobro en el vuelo (Vuelos → Cobros). Usa \"Anticipo\" solo si el vuelo todavía no existe; después lo aplicas al vuelo desde aquí.";
export const AVISO_OTRO_INGRESO_CLIENTE =
  "Si este dinero es el pago de un vuelo, NO lo registres aquí: regístralo como cobro del vuelo (contaría dos veces).";
export const HINT_TC_OFICIAL = "Si lo dejas vacío se usa el oficial del día.";

// ═══════════════════════════════ Tipos de escritura (fuera de §4) ═══════════════════════════════

/** DTO de `POST /v1/ingresos` (campo `datos` del multipart). */
export interface DatosIngreso {
  categoria: CategoriaIngreso;
  fecha: string;
  descripcion: string;
  monto: number;
  moneda: MonedaIngreso;
  comision_monto?: number | null;
  tc_usd_mxn?: number | null;
  metodo: MetodoIngreso;
  cuenta_bancaria_id?: string | null;
  referencia?: string | null;
  pagador?: string | null;
  cliente_id?: string | null;
  vuelo_id?: string | null;
  aeronave_id?: string | null;
  gasto_id?: string | null;
  notas?: string | null;
  movimiento_bancario_id?: string | null;
  aceptar_sin_cobro?: boolean;
  aceptar_posible_duplicado?: boolean;
  client_request_id?: string;
}

/** DTO de `PATCH /v1/ingresos/:id`: solo lo que cambió + CAS. */
export type DatosEdicionIngreso = Partial<
  Omit<
    DatosIngreso,
    "movimiento_bancario_id" | "client_request_id" | "aceptar_sin_cobro" | "aceptar_posible_duplicado"
  >
> & { if_updated_at?: string };

export interface RespuestaRegistrarIngreso {
  ingreso: Ingreso;
  movimiento_id: string | null;
  avisos: string[];
  idempotente?: true;
}

export interface RespuestaEditarIngreso {
  ingreso: Ingreso;
  avisos: string[];
}

export interface SaldoAnticipo {
  aplicado: number;
  saldo: number;
}

export interface RespuestaAplicarAnticipo {
  aplicacion: IngresoAplicacion;
  anticipo: SaldoAnticipo;
  avisos: string[];
  idempotente?: true;
}

export interface RespuestaDesaplicar {
  ok: true;
  anticipo: SaldoAnticipo;
}

export interface RespuestaCobroDesdeAbono {
  cobro: { id: string; vuelo_id: string; monto: number | string; moneda: string };
  movimiento_id: string;
  avisos: string[];
  idempotente?: true;
}

export interface ArchivoIngresoUrl {
  url: string;
  nombre: string;
  expira_en_s: number;
}

/** Fila de `GET /v1/ingresos/vuelos-candidatos`. */
export interface VueloCandidatoIngreso {
  vuelo_id: string;
  folio: number | null;
  fecha_vuelo: string | null;
  estado: string;
  cliente_nombre: string | null;
  ruta: string | null;
  monto_total_usd: number | null;
  cobrado_usd: number;
  saldo_usd: number | null;
  tc_usd_mxn: number | null;
  es_otro_cliente: boolean;
}

export function etiquetaVueloCandidato(v: VueloCandidatoIngreso): string {
  return [
    `Vuelo #${v.folio ?? "—"}`,
    v.fecha_vuelo ? fmtDate(v.fecha_vuelo) : "sin fecha",
    v.cliente_nombre,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function descripcionVueloCandidato(v: VueloCandidatoIngreso): string {
  return [
    v.ruta,
    v.saldo_usd == null
      ? "sin precio"
      : v.saldo_usd <= 0.005
        ? "ya liquidado"
        : `saldo ${fmtMonto(v.saldo_usd, "USD")}`,
    v.estado === "CANCELADO" ? "cancelado" : null,
    v.es_otro_cliente ? "otro cliente" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ═══════════════════════════════ Formulario de alta / edición ═══════════════════════════════

export interface FormIngreso {
  categoria: CategoriaIngreso | "";
  fecha: string;
  descripcion: string;
  monto: string;
  moneda: MonedaIngreso;
  /** id de la cuenta, `VALOR_EFECTIVO` o "" (sin elegir). */
  cuenta: string;
  metodo: MetodoIngreso | "";
  cliente_id: string;
  pagador: string;
  comision: string;
  tc: string;
  vuelo_id: string;
  aeronave_id: string;
  gasto_id: string;
  referencia: string;
  notas: string;
}

export function formularioVacio(hoy: string): FormIngreso {
  return {
    categoria: "",
    fecha: hoy,
    descripcion: "",
    monto: "",
    moneda: "MXN",
    cuenta: "",
    metodo: "",
    cliente_id: "",
    pagador: "",
    comision: "",
    tc: "",
    vuelo_id: "",
    aeronave_id: "",
    gasto_id: "",
    referencia: "",
    notas: "",
  };
}

const txt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "" : String(v);

export function formularioDeIngreso(i: Ingreso): FormIngreso {
  return {
    categoria: i.categoria,
    fecha: i.fecha,
    descripcion: i.descripcion,
    monto: txt(i.monto),
    moneda: i.moneda,
    cuenta: i.cuenta_bancaria_id ?? VALOR_EFECTIVO,
    metodo: i.metodo,
    cliente_id: i.cliente_id ?? "",
    pagador: i.pagador ?? "",
    comision: txt(i.comision_monto),
    tc: txt(i.tc_usd_mxn),
    vuelo_id: i.vuelo_id ?? "",
    aeronave_id: i.aeronave_id ?? "",
    gasto_id: i.gasto_id ?? "",
    referencia: i.referencia ?? "",
    notas: i.notas ?? "",
  };
}

/** Concepto a partir de la descripción del banco (3..300, sin espacios de sobra). */
function conceptoDeBanco(desc: string | null): string {
  const limpio = (desc ?? "").replace(/\s+/g, " ").trim().slice(0, 300).trim();
  return limpio.length >= 3 ? limpio : "";
}

/**
 * Categorías que JAMÁS se prellenan desde una sugerencia (heurística o IA):
 * «Otros ingresos» y «Anticipo» son justo donde terminaría el pago de un vuelo
 * mal identificado (doble conteo) — el operador las elige a mano. La
 * heurística del API nunca las devuelve, pero la IA sí puede (revisión
 * adversaria 24-sep-2026: «Aceptar» un REGISTRAR_INGRESO de la IA abría el
 * alta con «Otros ingresos» ya elegido, el default que el contrato prohíbe).
 * «Es un anticipo» del menú la FUERZA con `forzarCategoria` (eso sí vale).
 */
const CATEGORIAS_NUNCA_SUGERIDAS: ReadonlySet<CategoriaIngreso> = new Set([
  "OTRO_INGRESO",
  "ANTICIPO_CLIENTE",
]);

/**
 * «Registrar como otro ingreso» / «Es un anticipo» desde un ABONO del banco:
 * fecha, monto, moneda, cuenta, método, referencia y concepto prellenados.
 * La CATEGORÍA es la sugerida por el API o VACÍA — jamás «Otros ingresos» por
 * default (el pago de un vuelo registrado como otro ingreso contaría dos veces).
 * Pasarela con `monto_bruto`: bruto + comisión (el abono es el neto).
 */
export function formularioDesdeAbono(
  a: AbonoPendiente,
  opts: { forzarCategoria?: CategoriaIngreso | null } = {},
): FormIngreso {
  const sugerida =
    a.categoria_sugerida && !CATEGORIAS_NUNCA_SUGERIDAS.has(a.categoria_sugerida)
      ? a.categoria_sugerida
      : "";
  const pasarela = a.cuenta_tipo === "PASARELA";
  const bruto = pasarela && a.monto_bruto != null && a.monto_bruto > 0 ? a.monto_bruto : null;
  const comision =
    bruto != null
      ? a.comision_monto != null
        ? a.comision_monto
        : Math.round((bruto - a.monto) * 100) / 100
      : null;
  return {
    categoria: opts.forzarCategoria ?? sugerida,
    fecha: a.fecha,
    descripcion: conceptoDeBanco(a.descripcion),
    monto: txt(bruto ?? a.monto),
    moneda: a.cuenta_moneda ?? "MXN",
    cuenta: a.cuenta_bancaria_id || VALOR_CUENTA_DEL_ABONO,
    metodo: pasarela ? "PAYWISE" : "TRANSFERENCIA",
    cliente_id: a.cliente_sugerido?.id ?? "",
    pagador: "",
    comision: comision != null && comision > 0 ? txt(comision) : "",
    tc: "",
    vuelo_id: "",
    aeronave_id: "",
    gasto_id: "",
    referencia: (a.referencia ?? "").trim().slice(0, 120),
    notas: "",
  };
}

/** Número capturado («1,234.50» o «1234.5»); null si no es número. */
export function numeroCapturado(v: string): number | null {
  const limpio = v.replace(/[,\s$]/g, "").trim();
  if (!limpio) return null;
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function decimales(v: string): number {
  const limpio = v.replace(/[,\s$]/g, "");
  const i = limpio.indexOf(".");
  return i < 0 ? 0 : limpio.length - i - 1;
}

/** ¿Hay algo capturado en «Más datos»? (el plegable abre solo si sí). */
export function hayMasDatos(f: FormIngreso): boolean {
  return !!(
    f.comision.trim() ||
    f.tc.trim() ||
    f.vuelo_id ||
    f.aeronave_id ||
    f.gasto_id ||
    f.referencia.trim() ||
    f.notas.trim()
  );
}

export type ErroresIngreso = Partial<Record<keyof FormIngreso, string>>;

/**
 * Validación del formulario (espejo de las reglas del API, para decirlo ANTES
 * de mandar). El API vuelve a validar todo: esto solo evita el viaje.
 */
export function erroresFormularioIngreso(
  f: FormIngreso,
  ctx: { hoy: string; monedaCuenta?: MonedaIngreso | null },
): ErroresIngreso {
  const e: ErroresIngreso = {};
  if (!f.categoria) e.categoria = "Elige la categoría.";
  if (!esDiaValido(f.fecha)) e.fecha = "Captura la fecha.";
  else if (f.fecha > ctx.hoy) e.fecha = "La fecha no puede ser futura.";
  const desc = f.descripcion.trim();
  if (desc.length < 3) e.descripcion = "Escribe el concepto (mínimo 3 letras).";
  else if (desc.length > 300) e.descripcion = "El concepto admite hasta 300 caracteres.";
  const monto = numeroCapturado(f.monto);
  if (monto == null || monto <= 0) e.monto = "Captura el monto (mayor a 0).";
  else if (decimales(f.monto) > 2) e.monto = "El monto admite hasta 2 decimales.";
  else if (monto > 99_999_999.99) e.monto = "Monto demasiado grande.";
  if (!f.cuenta) e.cuenta = "Elige dónde entró el dinero.";
  if (f.categoria === "ANTICIPO_CLIENTE" && !f.cliente_id) e.cliente_id = "Un anticipo necesita el cliente.";
  if (f.cuenta === VALOR_EFECTIVO && f.metodo && !METODOS_SIN_CUENTA.includes(f.metodo)) {
    e.metodo = "Sin cuenta bancaria el método debe ser Efectivo o Dólares directo.";
  }
  if (ctx.monedaCuenta && ctx.monedaCuenta !== f.moneda) {
    e.moneda = `La cuenta es en ${ctx.monedaCuenta}.`;
  }
  if (f.comision.trim()) {
    const c = numeroCapturado(f.comision);
    if (c == null || c < 0) e.comision = "Comisión inválida.";
    else if (decimales(f.comision) > 2) e.comision = "La comisión admite hasta 2 decimales.";
    else if (monto != null && c >= monto) e.comision = "La comisión debe ser menor que el monto.";
  }
  if (f.tc.trim()) {
    const t = numeroCapturado(f.tc);
    if (t == null || t <= 0) e.tc = "Tipo de cambio inválido.";
    else if (decimales(f.tc) > 6) e.tc = "El tipo de cambio admite hasta 6 decimales.";
  }
  if (f.referencia.trim().length > 120) e.referencia = "La referencia admite hasta 120 caracteres.";
  if (f.pagador.trim().length > 200) e.pagador = "Admite hasta 200 caracteres.";
  if (f.notas.trim().length > 1000) e.notas = "Las notas admiten hasta 1,000 caracteres.";
  if (f.vuelo_id && f.categoria && !categoriaIngresoAdmiteVuelo(f.categoria)) {
    e.vuelo_id = "Solo un reembolso recibido se liga a un vuelo.";
  }
  return e;
}

const opcional = (v: string) => {
  const t = v.trim();
  return t ? t : null;
};

/**
 * Payload EXACTO de un alta: solo los campos que aplican a la categoría (un
 * vuelo o un gasto en una categoría que no los admite es un 400 del API) y sin
 * vacíos. `cuentaConocida=false` (alta desde un abono cuya cuenta el panel no
 * conoce) omite la cuenta: el API toma la del abono.
 */
export function datosAltaDeFormulario(
  f: FormIngreso,
  extra: {
    clientRequestId: string;
    movimientoId?: string | null;
    aceptarSinCobro?: boolean;
    aceptarDuplicado?: boolean;
  },
): DatosIngreso {
  const cat = f.categoria as CategoriaIngreso;
  const delAbono = f.cuenta === VALOR_CUENTA_DEL_ABONO;
  const cuenta = f.cuenta && f.cuenta !== VALOR_EFECTIVO && !delAbono ? f.cuenta : null;
  const metodo: MetodoIngreso =
    (f.metodo || metodoDerivado(cuenta || delAbono ? { tipo: "BANCO" } : null)) as MetodoIngreso;
  const d: DatosIngreso = {
    categoria: cat,
    fecha: f.fecha,
    descripcion: f.descripcion.replace(/\s+/g, " ").trim(),
    monto: numeroCapturado(f.monto) ?? 0,
    moneda: f.moneda,
    metodo,
    client_request_id: extra.clientRequestId,
  };
  if (cuenta) d.cuenta_bancaria_id = cuenta;
  else if (f.cuenta === VALOR_EFECTIVO) d.cuenta_bancaria_id = null;
  const com = f.comision.trim() ? numeroCapturado(f.comision) : null;
  if (com != null && com > 0) d.comision_monto = com;
  const tc = f.tc.trim() ? numeroCapturado(f.tc) : null;
  if (tc != null && tc > 0 && f.moneda === "USD") d.tc_usd_mxn = tc;
  const ref = opcional(f.referencia);
  if (ref) d.referencia = ref;
  const pagador = opcional(f.pagador);
  if (pagador) d.pagador = pagador;
  if (f.cliente_id) d.cliente_id = f.cliente_id;
  if (f.vuelo_id && categoriaIngresoAdmiteVuelo(cat)) d.vuelo_id = f.vuelo_id;
  if (f.aeronave_id) d.aeronave_id = f.aeronave_id;
  if (f.gasto_id && cat === "REEMBOLSO_DEVOLUCION") d.gasto_id = f.gasto_id;
  const notas = opcional(f.notas);
  if (notas) d.notas = notas;
  if (extra.movimientoId) d.movimiento_bancario_id = extra.movimientoId;
  if (extra.aceptarSinCobro) d.aceptar_sin_cobro = true;
  if (extra.aceptarDuplicado) d.aceptar_posible_duplicado = true;
  return d;
}

/**
 * Edición = SOLO lo que cambió contra lo VIGENTE (el API compara igual y sus
 * candados de conciliado/aplicado miran el valor nuevo contra el vigente), más
 * `if_updated_at` para el CAS. Vaciar un opcional manda `null` explícito.
 */
export function cambiosDeEdicion(f: FormIngreso, base: Ingreso): DatosEdicionIngreso {
  const c: DatosEdicionIngreso = {};
  const cat = f.categoria as CategoriaIngreso;
  if (cat && cat !== base.categoria) c.categoria = cat;
  if (f.fecha !== base.fecha) c.fecha = f.fecha;
  const desc = f.descripcion.replace(/\s+/g, " ").trim();
  if (desc !== base.descripcion) c.descripcion = desc;
  const monto = numeroCapturado(f.monto);
  if (monto != null && Math.abs(monto - base.monto) > 0.0001) c.monto = monto;
  if (f.moneda !== base.moneda) c.moneda = f.moneda;
  const com = f.comision.trim() ? numeroCapturado(f.comision) : null;
  const comN = com != null && com > 0 ? com : null;
  // Una comisión VIGENTE de 0 (alta por API con `comision_monto: 0`) es lo
  // mismo que «sin comisión»: sin esto, cualquier edición de un ingreso
  // CONCILIADO mandaba `comision_monto: null` y el candado del API respondía
  // 409 INGRESO_CONCILIADO aunque solo se tocaran las notas.
  const comBase = base.comision_monto != null && base.comision_monto > 0 ? base.comision_monto : null;
  if (comN !== comBase) c.comision_monto = comN;
  const tc = f.tc.trim() ? numeroCapturado(f.tc) : null;
  if ((tc ?? null) !== (base.tc_usd_mxn ?? null)) c.tc_usd_mxn = tc;
  if (f.metodo && f.metodo !== base.metodo) c.metodo = f.metodo;
  const cuenta = f.cuenta && f.cuenta !== VALOR_EFECTIVO ? f.cuenta : null;
  if (cuenta !== (base.cuenta_bancaria_id ?? null)) c.cuenta_bancaria_id = cuenta;
  const cmp = (k: "referencia" | "pagador" | "notas") => {
    const nuevo = opcional(f[k]);
    if (nuevo !== (base[k] ?? null)) c[k] = nuevo;
  };
  cmp("referencia");
  cmp("pagador");
  cmp("notas");
  const ids = [
    ["cliente_id", f.cliente_id],
    ["vuelo_id", categoriaIngresoAdmiteVuelo(cat || base.categoria) ? f.vuelo_id : ""],
    ["aeronave_id", f.aeronave_id],
    ["gasto_id", (cat || base.categoria) === "REEMBOLSO_DEVOLUCION" ? f.gasto_id : ""],
  ] as const;
  for (const [k, v] of ids) {
    const nuevo = v || null;
    if (nuevo !== (base[k] ?? null)) c[k] = nuevo;
  }
  c.if_updated_at = base.updated_at;
  return c;
}

/** ¿La edición cambia algo además del CAS? */
export function hayCambios(c: DatosEdicionIngreso): boolean {
  return Object.keys(c).some((k) => k !== "if_updated_at");
}

// ═══════════════════════════════ Conflictos 409 del alta desde abono ═══════════════════════════════

export interface CandidatoCobroConflicto {
  tipo: "COBRO_VUELO" | "SOBRE_GRUPO";
  id: string;
  etiqueta: string;
  cliente: string | null;
  fecha: string | null;
  monto: number;
  neto: number;
}

/** `details.candidatos` de 409 ABONO_TIENE_COBRO_CANDIDATO (tolerante). */
export function candidatosDeConflicto(details: unknown): CandidatoCobroConflicto[] {
  const lista = (details as { candidatos?: unknown } | null)?.candidatos;
  if (!Array.isArray(lista)) return [];
  const out: CandidatoCobroConflicto[] = [];
  for (const x of lista) {
    const c = x as Record<string, unknown>;
    if (typeof c?.id !== "string") continue;
    out.push({
      tipo: c.tipo === "SOBRE_GRUPO" ? "SOBRE_GRUPO" : "COBRO_VUELO",
      id: c.id,
      etiqueta: typeof c.etiqueta === "string" ? c.etiqueta : "Cobro de vuelo",
      cliente: typeof c.cliente === "string" ? c.cliente : null,
      fecha: typeof c.fecha === "string" ? c.fecha : null,
      monto: Number(c.monto) || 0,
      neto: Number(c.neto ?? c.monto) || 0,
    });
  }
  return out.slice(0, 5);
}

export interface DuplicadoConflicto {
  movimiento_id: string | null;
  conciliado: boolean;
  descripcion: string | null;
}

export function duplicadoDeConflicto(details: unknown): DuplicadoConflicto {
  const d = (details ?? {}) as Record<string, unknown>;
  return {
    movimiento_id: typeof d.movimiento_id === "string" ? d.movimiento_id : null,
    conciliado: d.conciliado === true,
    descripcion: typeof d.descripcion === "string" ? d.descripcion : null,
  };
}

/** «Esta línea parece repetida de otra del banco (08 sep 2026 · $19,380 MXN · ya conciliada).» */
export function textoConfirmarDuplicado(
  abono: { fecha: string; monto: number; moneda?: string | null },
  d: DuplicadoConflicto,
): string {
  return `Esta línea parece repetida de otra del banco (${fmtDateOnly(abono.fecha)} · ${fmtMonto(
    abono.monto,
    abono.moneda ?? undefined,
  )} · ${d.conciliado ? "la otra ya está conciliada" : "la otra sigue pendiente"}${
    d.descripcion ? ` · «${d.descripcion}»` : ""
  }). ¿Registrarla de todos modos?`;
}

/** `details` de 409 ANTICIPO_OTRO_CLIENTE. */
export function otroClienteDeConflicto(details: unknown): { anticipo: string | null; vuelo: string | null } {
  const d = (details ?? {}) as Record<string, unknown>;
  const nombre = (v: unknown) =>
    typeof v === "string"
      ? v
      : typeof (v as { nombre?: unknown } | null)?.nombre === "string"
        ? ((v as { nombre: string }).nombre)
        : null;
  return { anticipo: nombre(d.cliente_anticipo), vuelo: nombre(d.cliente_vuelo) };
}

// ═══════════════════════════════ Aplicar anticipo / cobro desde abono ═══════════════════════════════

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Monto sugerido al aplicar un anticipo: el MENOR entre el saldo del anticipo y
 * el saldo del vuelo expresado en la moneda del anticipo (USD directo; MXN =
 * saldo_usd × T.C., a centavos). Sin precio o sin T.C. para convertir ⇒ el
 * saldo del anticipo. Es una SUGERENCIA editable: el API valida los dos saldos.
 */
export function montoDefaultAplicacion(p: {
  saldoAnticipo: number;
  moneda: MonedaIngreso;
  saldoVueloUsd: number | null;
  tc: number | null;
}): number {
  const saldo = Math.max(0, r2(p.saldoAnticipo));
  if (p.saldoVueloUsd == null || !(p.saldoVueloUsd > 0)) return saldo;
  const enMoneda =
    p.moneda === "USD" ? r2(p.saldoVueloUsd) : p.tc && p.tc > 0 ? r2(p.saldoVueloUsd * p.tc) : null;
  if (enMoneda == null) return saldo;
  return Math.min(saldo, enMoneda);
}

/** dd/mm/aaaa de un día `YYYY-MM-DD` (sin pasar por Date: nunca corre el día). */
export function fechaDdMmAaaa(dia: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

export function textoConfirmarAplicacion(p: {
  monto: number;
  moneda: MonedaIngreso;
  folio: number | null;
  fechaAnticipo: string;
  saldoRestante: number;
}): string {
  return `Se registrará un cobro de ${fmtMonto(p.monto, p.moneda)} en el vuelo #${
    p.folio ?? "—"
  } con fecha del anticipo (${fechaDdMmAaaa(p.fechaAnticipo)}). El anticipo queda con saldo ${fmtMonto(
    Math.max(0, r2(p.saldoRestante)),
    p.moneda,
  )}.`;
}

export function textoConfirmarCobroDesdeAbono(p: {
  monto: number;
  moneda: string;
  folio: number | null;
  fecha: string;
}): string {
  return `Se registrará un cobro de ${fmtMonto(p.monto, p.moneda)} en el vuelo #${
    p.folio ?? "—"
  } con fecha ${fechaDdMmAaaa(p.fecha)} y quedará conciliado con este abono.`;
}

export function textoConfirmarDesaplicar(p: {
  monto: number;
  moneda: string;
  folio: number | null;
  etiquetaAnticipo?: string | null;
}): string {
  return `Se borrará el cobro de ${fmtMonto(p.monto, p.moneda)} del vuelo #${
    p.folio ?? "—"
  } y el monto regresa al saldo del anticipo${p.etiquetaAnticipo ? ` ${p.etiquetaAnticipo}` : ""}.`;
}

// ═══════════════════════════════ Sugerencias con IA ═══════════════════════════════

/** Confianza mínima para PRESELECCIONAR una liga en el lote. */
export const CONFIANZA_PRESELECCION = 0.85;

/**
 * ¿La propuesta va marcada de entrada en «Aceptar las marcadas»? Solo una liga
 * con MONTO EXACTO (lo calcula el API, no la IA) y confianza ≥ 0.85, o una
 * clasificación por REGLA (traspaso/reverso). Un posible duplicado JAMÁS.
 */
export function preseleccionada(p: PropuestaAbono): boolean {
  if (p.posible_duplicado) return false;
  if (p.accion === "LIGAR") {
    return !!p.candidato && p.monto_exacto === true && p.confianza >= CONFIANZA_PRESELECCION;
  }
  if (p.accion === "CLASIFICAR_TRASPASO" || p.accion === "CLASIFICAR_REVERSO") {
    return p.origen === "REGLA";
  }
  return false;
}

/** ¿Se puede aceptar dentro del LOTE? (Registrar abre el alta: va de una en una.) */
export function aceptableEnLote(p: PropuestaAbono): boolean {
  if (p.posible_duplicado) return false;
  if (p.accion === "LIGAR") return !!p.candidato;
  return p.accion === "CLASIFICAR_TRASPASO" || p.accion === "CLASIFICAR_REVERSO";
}

/** ¿Tiene botón «Aceptar»? (REVISAR no: se revisa a mano.) */
export function sePuedeAceptar(p: PropuestaAbono): boolean {
  if (p.accion === "LIGAR") return !!p.candidato;
  return (
    p.accion === "REGISTRAR_INGRESO" ||
    p.accion === "CLASIFICAR_TRASPASO" ||
    p.accion === "CLASIFICAR_REVERSO"
  );
}

export const ETIQUETA_ACCION_PROPUESTA: Record<AccionPropuestaAbono, string> = {
  LIGAR: "Vincular",
  REGISTRAR_INGRESO: "Registrar como ingreso",
  CLASIFICAR_TRASPASO: "Clasificar como traspaso entre cuentas",
  CLASIFICAR_REVERSO: "Clasificar como reverso de un cargo",
  REVISAR: "Revisar a mano",
};

/** Qué propone, en palabras del operador. */
export function textoAccionPropuesta(p: PropuestaAbono): string {
  switch (p.accion) {
    case "LIGAR":
      return p.candidato ? `Vincular a ${p.candidato.etiqueta}` : "Revisar a mano";
    case "REGISTRAR_INGRESO":
      return p.categoria_sugerida
        ? `Registrar como «${etiquetaCategoriaIngreso(p.categoria_sugerida)}»`
        : "Registrar como ingreso (elige la categoría)";
    default:
      return ETIQUETA_ACCION_PROPUESTA[p.accion] ?? "Revisar a mano";
  }
}

/** Renglón de la ficha de un candidato («08 sep 2026 · $20,400 MXN · neto $19,380 · Cristy Chavez»). */
export function descripcionFichaCandidato(c: CandidatoAbonoFicha): string {
  return [
    fechaLegible(c.fecha),
    fmtMonto(c.monto, c.moneda),
    Math.abs(c.neto - c.monto) > 0.005 ? `neto ${fmtUsd(c.neto)}` : null,
    c.metodo_etiqueta,
    c.cliente,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Resumen de la consulta a la IA (nunca «no encontró nada» si no contestó). */
export function resumenSugerencias(r: SugerirAbonosRespuesta): string {
  return [
    `${r.revisados} ${r.revisados === 1 ? "abono revisado" : "abonos revisados"}`,
    `${r.con_propuesta} con propuesta`,
    r.sin_propuesta > 0 ? `${r.sin_propuesta} sin propuesta` : null,
    r.errores > 0 ? `${r.errores} con error` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** null = el asistente sí contestó; texto = no estuvo disponible (y por qué). */
export function textoIaNoDisponible(r: Pick<SugerirAbonosRespuesta, "disponible" | "nota">): string | null {
  if (r.disponible) return null;
  const nota = (r.nota ?? "").trim();
  return `El asistente no está disponible${nota ? `: ${nota}` : "."}`;
}

export function lineaConfirmacionLote(p: PropuestaAbono): string {
  return `${fmtDateOnly(p.fecha)} · ${fmtMonto(p.monto, p.cuenta_moneda ?? undefined)} → ${textoAccionPropuesta(p)}`;
}

export function textoConfirmarLote(ps: PropuestaAbono[]): string {
  return `Se conciliarán ${ps.length} ${ps.length === 1 ? "abono" : "abonos"}:`;
}

export interface ResultadoLote {
  conciliados: string[];
  errores: Array<{ movimiento_id: string; error: string }>;
}

/**
 * Acepta las propuestas marcadas UNA POR UNA (secuencial: dos ligas en
 * paralelo al mismo candidato serían una carrera). Un error no detiene el
 * resto; se cuenta con su motivo.
 */
export async function aceptarEnLote(
  ps: PropuestaAbono[],
  ejecutar: (p: PropuestaAbono) => Promise<{ ok: boolean; error?: string | null }>,
): Promise<ResultadoLote> {
  const res: ResultadoLote = { conciliados: [], errores: [] };
  for (const p of ps) {
    let r: { ok: boolean; error?: string | null };
    try {
      r = await ejecutar(p);
    } catch (e) {
      r = { ok: false, error: e instanceof Error ? e.message : "No se pudo" };
    }
    if (r.ok) res.conciliados.push(p.movimiento_id);
    else res.errores.push({ movimiento_id: p.movimiento_id, error: r.error || "No se pudo" });
  }
  return res;
}

/** «3 conciliados · 1 con error (Ese movimiento ya está conciliado…)». */
export function textoResultadoLote(r: ResultadoLote): string {
  const partes = [`${r.conciliados.length} ${r.conciliados.length === 1 ? "conciliado" : "conciliados"}`];
  if (r.errores.length > 0) {
    const motivo = r.errores[0].error;
    partes.push(`${r.errores.length} con error (${motivo})`);
  }
  return partes.join(" · ");
}

// ═══════════════════════════════ Resumen ═══════════════════════════════

/** «conciliado $X · sin conciliar $Y · no pasa por el banco $Z» (sin ceros). */
export function lineaConciliacionResumen(
  c: { conciliado: number; sin_conciliar: number; no_bancario: number },
  moneda: string,
): string {
  return [
    c.conciliado > 0 ? `conciliado ${fmtMonto(c.conciliado, moneda)}` : null,
    c.sin_conciliar > 0 ? `sin conciliar ${fmtMonto(c.sin_conciliar, moneda)}` : null,
    c.no_bancario > 0 ? `no pasa por el banco ${fmtMonto(c.no_bancario, moneda)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** ¿La moneda tiene algo que pintar? */
export function monedaConMovimiento(m: ResumenIngresosMoneda): boolean {
  return (
    m.total_recibido !== 0 ||
    m.cobros_vuelo.reembolsos !== 0 ||
    m.aplicado_de_anticipos.monto !== 0 ||
    m.abonos_por_identificar.n > 0
  );
}

export const PIE_RESUMEN_INGRESOS =
  "Por fecha de pago, hora Cancún. Los totales no convierten monedas. Los cobros que salieron de un anticipo no se suman otra vez (ese dinero ya entró como anticipo).";

// ═══════════════════════════════ Bitácora ═══════════════════════════════

export const ACCION_BITACORA_INGRESO: Record<IngresoBitacoraFila["accion"], string> = {
  INSERT: "Registró",
  UPDATE: "Editó",
  DELETE: "Borró",
  APLICAR: "Aplicó a un vuelo",
  DESAPLICAR: "Desaplicó de un vuelo",
  CONCILIAR: "Concilió con el banco",
  DESCONCILIAR: "Desvinculó del banco",
};

const CAMPOS_BITACORA: Record<string, string> = {
  categoria: "Categoría",
  fecha: "Fecha",
  descripcion: "Concepto",
  monto: "Monto",
  comision_monto: "Comisión del banco",
  moneda: "Moneda",
  tc_usd_mxn: "Tipo de cambio",
  metodo: "Método",
  cuenta_bancaria_id: "Cuenta",
  referencia: "Referencia del banco",
  pagador: "Quién pagó",
  cliente_id: "Cliente",
  vuelo_id: "Vuelo",
  aeronave_id: "Avión",
  gasto_id: "Gasto relacionado",
  notas: "Notas",
  archivo_path: "Comprobante",
  deleted_at: "Baja",
  motivo_baja: "Motivo de baja",
};

/** 'monto' → 'Monto', 'cuenta_bancaria_id' → 'Cuenta' (copia del API). */
export function textoCampoBitacora(campo: string): string {
  if (CAMPOS_BITACORA[campo]) return CAMPOS_BITACORA[campo];
  const limpio = campo.replace(/_id$/, "").replaceAll("_", " ").toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** Valor legible de un campo de la bitácora (ids: «asignado», nunca el uuid). */
export function textoValorBitacora(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (campo === "categoria") return etiquetaCategoriaIngreso(String(valor));
  if (campo === "metodo") return metodoPagoLabel(String(valor));
  if (campo === "monto" || campo === "comision_monto") return fmtUsd(valor as number | string);
  if (campo === "fecha") return fmtDateOnly(String(valor));
  if (campo === "deleted_at") return fmtDate(String(valor));
  if (campo === "archivo_path") return "con archivo";
  if (campo.endsWith("_id")) return "asignado";
  const s = typeof valor === "string" ? valor : JSON.stringify(valor);
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
}

// ═══════════════════════════════ Varios ═══════════════════════════════

/**
 * Fecha legible que puede venir como día (`YYYY-MM-DD`, pared Cancún) o como
 * instante ISO (`fecha_cobro`): el día se pinta tal cual y el instante en hora
 * Cancún (recortar el ISO en UTC corre el día en la noche).
 */
export function fechaLegible(v: string | null | undefined): string {
  if (!v) return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDateOnly(v) : fmtDate(v);
}

/** Periodo corto «1 sep 2026 – 24 sep 2026». */
export function textoPeriodo(desde: string, hasta: string): string {
  return desde === hasta ? fmtDateOnly(desde) : `${fmtDateOnly(desde)} – ${fmtDateOnly(hasta)}`;
}

/** Rápidos de periodo: este mes, mes anterior, últimos 90 días. */
export function periodosRapidos(hoy: string): Array<{ clave: string; etiqueta: string; desde: string; hasta: string }> {
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finMesAnterior = diaMas(inicioMes, -1);
  const inicioMesAnterior = `${finMesAnterior.slice(0, 7)}-01`;
  return [
    { clave: "mes", etiqueta: "Este mes", desde: inicioMes, hasta: hoy },
    { clave: "anterior", etiqueta: "Mes anterior", desde: inicioMesAnterior, hasta: finMesAnterior },
    { clave: "90", etiqueta: "Últimos 90 días", desde: diaMas(hoy, -90), hasta: hoy },
  ];
}

/** ¿Suma a resultados? (re-export para las tablas sin importar dos módulos). */
export { categoriaIngresoSumaAResultados, esAnticipo };
