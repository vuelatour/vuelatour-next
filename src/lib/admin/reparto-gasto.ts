/**
 * REPARTIR UN GASTO ENTRE AVIONES DESDE «VERIFICAR / EDITAR» (14-oct-2026).
 *
 * Pedido del cliente: «cuando sea un gasto repartido o queremos repartir el
 * gasto a diferentes aviones se pueda hacer desde aquí… solo me deja uno».
 * Caso STARLINK (1-sep, $4,733.76 MXN INDIRECTO repartido 3 × $1,577.92 entre
 * N4142R, N621TX y N990GG): el diálogo prellenaba N990GG por la matrícula que
 * leyó la IA y el API rechazaba el guardado («el avión individual no aplica»).
 *
 * Módulo PURO (sin React ni red; solo `llamarSinLanzar` es async, con la
 * función inyectada): tipos, datos del reparto, el PLANIFICADOR del guardado
 * (qué va primero, el PATCH del gasto o el PUT del reparto), las reglas del
 * diálogo y TODOS sus textos. La regla Σ ≤ monto, los aviones activos y el
 * remanente son del API: aquí las sumas son GUÍA de pantalla y el
 * planificador solo ORDENA las dos escrituras que ya existen
 * (`PATCH /v1/expenses/:id` y `PUT /v1/expenses/:id/reparto`).
 *
 * Ningún texto de aquí manda a «Otros gastos» a editar el reparto: el reparto
 * se ajusta en «Avión» → «Repartir entre aviones» (la hoja del balance sí se
 * llama «Balance general · Otros gastos»). Lo vigila su prueba.
 */
import { fmtMonto, fmtMxn } from "@/lib/format";
import { MESES_LARGOS_ES } from "@/lib/datetime";
import {
  CATEGORIAS_EMPRESA,
  CATEGORIAS_REPARTIBLES,
  categoriaGastoLabel,
  categoriaLlevaAvion,
  hojaDestinoGasto,
} from "@/lib/admin/categorias-gasto";
import { medioPagoAceptadoPorApi } from "@/lib/admin/medios-pago";
import { normMatricula } from "@/lib/admin/matricula";
import { esTextoTecnico } from "@/lib/admin/errores-tecnicos";
import { esUuid } from "@/lib/admin/url-params";
import type { Gasto, RepartoResponse } from "@/types/expenses";

// ===================== Tipos =====================

/** «Un avión» (o «Sin avión» en Gasolina/Visita) o «Repartir entre aviones». */
export type ModoAvion = "UNO" | "REPARTO";

/**
 * Qué sabe el diálogo del reparto guardado: lo dice el embed `repartos` de la
 * lista; sin embed (API viejo u otro montaje) un gasto repartible queda POR
 * CONFIRMAR hasta leerlo, y si la lectura falla, LECTURA_FALLIDA.
 */
export type EstadoRepartoDialogo =
  | "SIN_REPARTO"
  | "REPARTIDO"
  | "POR_CONFIRMAR"
  | "LECTURA_FALLIDA";

/** Lo que viaja al `PUT /v1/expenses/:id/reparto` (2 decimales). */
export interface ItemReparto {
  aeronave_id: string;
  monto: number;
}

/** Una parte guardada, con su matrícula (null si el join no la trajo). */
export interface ParteReparto {
  aeronave_id: string;
  matricula: string | null;
  monto: number;
}

/** Fila del editor: un avión activo o, marcado `inactivo`, uno de un reparto viejo. */
export interface AvionReparto {
  id: string;
  matricula: string;
  modelo: string;
  inactivo?: boolean;
}

/** Casillas y montos TECLEADOS del editor, por avión. */
export type SeleccionReparto = Record<string, { incluir: boolean; monto: string }>;

export type PasoGuardado = "GASTO" | "REPARTO";

export type CodigoGastoConReparto =
  | "OK"
  | "BLOQUEO"
  | "LECTURA"
  | "REPARTO_CAMBIO"
  | "GASTO"
  | "GASTO_INCIERTO"
  | "PARCIAL_SIN_REPARTO"
  | "PARCIAL_SOLO_REPARTO"
  | "SIN_NADA_REPARTO";

/** Cómo quedó el reparto tras un PUT que falló (se relee). */
export type EstadoRepartoTrasFalla =
  | "IGUAL_AL_NUEVO"
  | "IGUAL_AL_ANTERIOR"
  | "DISTINTO"
  | "DESCONOCIDO";

/**
 * Lo que devuelve `guardarGastoConRepartoAction` (el tipo vive aquí: un
 * archivo "use server" solo exporta funciones async). `reparto` = lo último
 * que se supo del reparto (el GET, el PUT o la relectura); `pasos` = las
 * escrituras que SÍ quedaron, en orden.
 */
export interface ResultadoGastoConReparto {
  ok: boolean;
  codigo: CodigoGastoConReparto;
  gastoGuardado: boolean;
  gastoIncierto: boolean;
  repartoGuardado: boolean;
  repartoEstado: EstadoRepartoTrasFalla | null;
  pasos: PasoGuardado[];
  reparto?: RepartoResponse | null;
  data?: Gasto;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  avisos: string[];
  /** ADITIVOS (16-oct-2026, API 0.0.88): código y detalle del API cuando el
   *  PATCH del gasto rebota con un código que la UI reconoce (`MES_CERRADO`). */
  code?: string;
  details?: unknown;
}

// ===================== Dinero y datos =====================

/** Monto (número o texto de PostgREST) a centavos enteros; ilegible ⇒ 0. */
export function centavosDe(v: unknown): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v)
        : Number.NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Monto del reparto SIEMPRE con su moneda: «$1,577.92 MXN», «$1,500 USD». */
export function montoReparto(v: number, moneda: string): string {
  return moneda === "USD" ? fmtMonto(v, "USD") : fmtMxn(v);
}

/** «A» · «A y B» · «A, B y C»; una matrícula desconocida (null) ⇒ «¿?». */
export function unirMatriculas(m: Array<string | null>): string {
  const t = m.map((x) => (x && x.trim() !== "" ? x : "¿?"));
  if (t.length <= 1) return t[0] ?? "";
  return `${t.slice(0, -1).join(", ")} y ${t[t.length - 1]}`;
}

/** Matrícula del embed `aeronave` (objeto o arreglo según PostgREST). */
function matriculaDeEmbed(a: unknown): string | null {
  const x = Array.isArray(a) ? a[0] : a;
  const m = (x as { matricula?: unknown } | null | undefined)?.matricula;
  return typeof m === "string" && m.trim() !== "" ? m : null;
}

/** Orden por matrícula (es-MX); las desconocidas al final. */
function ordenarPartes<T extends { matricula: string | null; aeronave_id: string }>(p: T[]): T[] {
  return [...p].sort((a, b) => {
    if (a.matricula == null && b.matricula == null) return a.aeronave_id.localeCompare(b.aeronave_id);
    if (a.matricula == null) return 1;
    if (b.matricula == null) return -1;
    return a.matricula.localeCompare(b.matricula, "es-MX") || a.aeronave_id.localeCompare(b.aeronave_id);
  });
}

/** Partes del embed `repartos` de la lista de Gastos (o [] sin embed). */
export function partesDeGasto(g: Pick<Gasto, "repartos">): ParteReparto[] {
  const filas = Array.isArray(g.repartos) ? g.repartos : [];
  return ordenarPartes(
    filas.map((r) => ({
      aeronave_id: r.aeronave_id,
      matricula: matriculaDeEmbed(r.aeronave),
      monto: centavosDe(r.monto) / 100,
    })),
  );
}

/** Partes de la respuesta de `GET`/`PUT /v1/expenses/:id/reparto`. */
export function partesDeRespuesta(r: RepartoResponse): ParteReparto[] {
  return ordenarPartes(
    (r.items ?? []).map((it) => ({
      aeronave_id: it.aeronave_id,
      matricula: typeof it.matricula === "string" && it.matricula.trim() !== "" ? it.matricula : null,
      monto: centavosDe(it.monto) / 100,
    })),
  );
}

/** R1: el estado del reparto al abrir el diálogo. */
export function estadoRepartoInicial(
  g: Pick<Gasto, "repartos" | "categoria" | "vuelo_id">,
): EstadoRepartoDialogo {
  if (Array.isArray(g.repartos)) {
    return partesDeGasto(g).length > 0 ? "REPARTIDO" : "SIN_REPARTO";
  }
  // Sin embed: solo un repartible GUARDADO sin vuelo puede tener reparto (el
  // trigger trg_gasto_reparto_valida impide reparto con vuelo o con una
  // categoría que no se reparte).
  return CATEGORIAS_REPARTIBLES.has(g.categoria) && !g.vuelo_id ? "POR_CONFIRMAR" : "SIN_REPARTO";
}

export function itemsDePartes(p: ParteReparto[]): ItemReparto[] {
  return p.map((x) => ({ aeronave_id: x.aeronave_id, monto: centavosDe(x.monto) / 100 }));
}

/** Items de una respuesta del API (para comparar con la base). */
export function itemsDeRespuesta(r: RepartoResponse): ItemReparto[] {
  return itemsDePartes(partesDeRespuesta(r));
}

export function seleccionDesdePartes(p: ParteReparto[]): SeleccionReparto {
  const sel: SeleccionReparto = {};
  for (const x of p) sel[x.aeronave_id] = { incluir: true, monto: (centavosDe(x.monto) / 100).toFixed(2) };
  return sel;
}

/** La PRIMERA vez que se reparte: el avión del formulario con el total pagado; sin avión, nada. */
export function seleccionInicialAlRepartir(
  aeronaveId: string | null,
  techoCents: number,
): SeleccionReparto {
  if (!aeronaveId) return {};
  return { [aeronaveId]: { incluir: true, monto: (Math.max(0, techoCents) / 100).toFixed(2) } };
}

/**
 * Filas del editor. Sin la lista de aviones (cargando o fallida) ⇒ SOLO las
 * partes guardadas; con la lista ⇒ los activos en su orden + las partes cuyo
 * avión ya no está activo (insignia «Inactivo»: si se envían, el API las
 * rechaza y el guardado se frena antes).
 */
export function filasRepartoEditor(
  aviones: AvionReparto[] | null,
  partes: ParteReparto[],
): AvionReparto[] {
  if (aviones === null) {
    return partes.map((p) => ({ id: p.aeronave_id, matricula: p.matricula ?? "¿?", modelo: "" }));
  }
  const ids = new Set(aviones.map((a) => a.id));
  return [
    ...aviones.map((a) => ({ id: a.id, matricula: a.matricula, modelo: a.modelo })),
    ...partes
      .filter((p) => !ids.has(p.aeronave_id))
      .map((p) => ({
        id: p.aeronave_id,
        matricula: p.matricula ?? "¿?",
        modelo: BADGE_INACTIVO,
        inactivo: true,
      })),
  ];
}

/** Monto tecleado a centavos (vacío o ilegible ⇒ 0). */
function centavosTecleados(monto: string | undefined): number {
  const n = Number(monto);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Lo que viajaría al PUT: solo los marcados con monto > 0, en el orden de las filas. */
export function itemsDeSeleccion(filas: AvionReparto[], sel: SeleccionReparto): ItemReparto[] {
  const out: ItemReparto[] = [];
  for (const f of filas) {
    const s = sel[f.id];
    if (!s?.incluir) continue;
    const n = Number(s.monto);
    if (!Number.isFinite(n) || Math.round(n * 100) <= 0) continue;
    out.push({ aeronave_id: f.id, monto: Math.round(n * 100) / 100 });
  }
  return out;
}

/**
 * Techo del reparto = el TOTAL PAGADO en vivo (ticket + propina, la misma
 * cuenta de «Total pagado»). Con ticket y propina vacíos, el monto guardado
 * (el PATCH tampoco lo toca).
 */
export function techoRepartoCents(e: {
  ticket: string;
  propina: string;
  montoGuardado: string | number;
}): number {
  if ((e.ticket ?? "") === "" && (e.propina ?? "") === "") return centavosDe(e.montoGuardado);
  const t = Number(e.ticket);
  const p = Number(e.propina);
  return Math.round(((Number.isFinite(t) ? t : 0) + (Number.isFinite(p) ? p : 0)) * 100);
}

export interface ResumenReparto {
  incluidos: AvionReparto[];
  sumaCents: number;
  restoCents: number;
  excedidoCents: number;
  /** Matrículas marcadas sin monto. */
  sinMonto: string[];
  /** Matrículas marcadas que ya no están activas. */
  inactivos: string[];
}

/** GUÍA de pantalla en centavos (la regla Σ ≤ monto la decide el API). */
export function resumenReparto(
  filas: AvionReparto[],
  sel: SeleccionReparto,
  techoCents: number,
): ResumenReparto {
  const incluidos = filas.filter((f) => sel[f.id]?.incluir);
  let sumaCents = 0;
  const sinMonto: string[] = [];
  for (const f of incluidos) {
    const c = centavosTecleados(sel[f.id]?.monto);
    if (c > 0) sumaCents += c;
    else sinMonto.push(f.matricula);
  }
  return {
    incluidos,
    sumaCents,
    restoCents: Math.max(0, techoCents - sumaCents),
    excedidoCents: Math.max(0, sumaCents - techoCents),
    sinMonto,
    inactivos: incluidos.filter((f) => f.inactivo).map((f) => f.matricula),
  };
}

/**
 * Partes iguales con Σ == total EXACTO: base = round(total / n) y el PRIMERO
 * absorbe el residuo (disciplina de centavos del RepartoDialog).
 */
export function dividirIgualesCents(totalCents: number, n: number): number[] {
  if (!(n > 0)) return [];
  const base = Math.round(totalCents / n);
  const primero = totalCents - base * (n - 1);
  return [primero, ...Array.from({ length: n - 1 }, () => base)];
}

/** ¿Mismo reparto? Por avión y a centavos, sin importar el orden. */
export function mismoReparto(a: ItemReparto[], b: ItemReparto[]): boolean {
  if (a.length !== b.length) return false;
  const ma = new Map(a.map((i) => [i.aeronave_id, centavosDe(i.monto)]));
  const idsB = new Set(b.map((i) => i.aeronave_id));
  if (ma.size !== a.length || idsB.size !== b.length) return false;
  return b.every((i) => ma.get(i.aeronave_id) === centavosDe(i.monto));
}

export interface QuitaReparto {
  aeronave_id: string;
  matricula: string | null;
  antesCents: number;
  despuesCents: number;
}

/** Las partes guardadas que BAJAN o SALEN del reparto (después 0), por matrícula. */
export function quitasDelReparto(base: ParteReparto[], nuevo: ItemReparto[]): QuitaReparto[] {
  const despues = new Map(nuevo.map((i) => [i.aeronave_id, centavosDe(i.monto)]));
  const quitas: QuitaReparto[] = [];
  for (const p of ordenarPartes(base)) {
    const antesCents = centavosDe(p.monto);
    const despuesCents = despues.get(p.aeronave_id) ?? 0;
    if (despuesCents < antesCents) {
      quitas.push({ aeronave_id: p.aeronave_id, matricula: p.matricula, antesCents, despuesCents });
    }
  }
  return quitas;
}

/** Categorías que jamás llevan avión individual (el guardado los desliga). */
function categoriaSinAvion(cat: string): boolean {
  return cat === "GASOLINA" || cat === "VISITA" || cat === "PERSONAL_DUENO";
}

/** ¿El botón «Un avión» se llama «Sin avión»? (Gasolina y Visita no llevan avión.) */
function etiquetaUnoEsSinAvion(cat: string): boolean {
  return cat === "GASOLINA" || cat === "VISITA";
}

export interface ConfigAvionGasto {
  /** Categoría repartible y sin vuelo ⇒ «Repartir entre aviones» habilitado. */
  repartoPermitido: boolean;
  /** Se pinta el selector de modo (repartible o con reparto guardado). */
  conModos: boolean;
  /** Por qué «Repartir» está deshabilitado (title + texto). */
  motivoSinReparto: string | null;
  /** «Un avión» o, en Gasolina/Visita, «Sin avión». */
  etiquetaUno: string;
  /** ¿Se pinta el selector de avión en «Un avión»? */
  admiteAvion: boolean;
}

/** R3: qué ofrece el bloque «Avión» con la categoría y el vuelo del FORMULARIO. */
export function configAvionGasto(e: {
  categoria: string;
  vueloSel: string;
  repartoGuardado: boolean;
}): ConfigAvionGasto {
  const repartible = CATEGORIAS_REPARTIBLES.has(e.categoria);
  const repartoPermitido = repartible && !e.vueloSel;
  return {
    repartoPermitido,
    conModos: repartible || e.repartoGuardado,
    motivoSinReparto: repartoPermitido
      ? null
      : !repartible
        ? motivoCategoriaNoRepartible(categoriaGastoLabel(e.categoria))
        : MOTIVO_REPARTO_CON_VUELO,
    etiquetaUno: etiquetaUnoEsSinAvion(e.categoria) ? ETIQUETA_MODO_SIN_AVION : ETIQUETA_MODO_UNO,
    admiteAvion: !categoriaSinAvion(e.categoria),
  };
}

// ===================== Planificador del guardado =====================

export interface EntradaPlanReparto {
  /** Lo que el API tiene HOY (GET recién leído). */
  sumaActualCents: number;
  montoActualCents: number;
  monedaActual: string;
  /** Lo que lleva el PATCH (null = no lo cambia). */
  montoNuevoCents: number | null;
  monedaNueva: string | null;
  categoriaNueva: string;
  patchConAvion: boolean;
  patchConVuelo: boolean;
  /** El reparto pedido ([] = quitarlo). */
  nuevo: ItemReparto[];
  /** El gasto está conciliado y el PATCH cambia monto, moneda o medio. */
  riesgoConciliado: boolean;
}

export type CodigoBloqueoReparto = "CONCILIADO" | "INCOMPATIBLE" | "MONEDA" | "EXCEDE" | "INCOHERENTE";

export type PlanGuardadoReparto =
  | { tipo: "PASOS"; pasos: PasoGuardado[] }
  | { tipo: "BLOQUEO"; codigo: CodigoBloqueoReparto; mensaje: string };

/**
 * Qué escritura va primero para que NINGUNA choque con los candados del API:
 * el PATCH rechaza (con reparto guardado) un monto bajo la suma, una
 * categoría que no se reparte, un vuelo, otra moneda o un avión individual;
 * el PUT valida contra lo GUARDADO (sin vuelo, categoría repartible, Σ ≤
 * monto) — también el PUT [] valida vuelo y categoría. Fuzz contra un
 * simulador estricto del API en la prueba: 0 rechazos en el 2.º paso.
 */
export function planGuardadoReparto(e: EntradaPlanReparto): PlanGuardadoReparto {
  const pasos = (...p: PasoGuardado[]): PlanGuardadoReparto => ({ tipo: "PASOS", pasos: p });
  const bloqueo = (codigo: CodigoBloqueoReparto, mensaje: string): PlanGuardadoReparto => ({
    tipo: "BLOQUEO",
    codigo,
    mensaje,
  });
  const sumaNueva = e.nuevo.reduce((acc, i) => acc + centavosDe(i.monto), 0);
  const montoFinal = e.montoNuevoCents ?? e.montoActualCents;
  const cambiaMoneda = e.monedaNueva != null && e.monedaNueva !== e.monedaActual;
  const repartible = CATEGORIAS_REPARTIBLES.has(e.categoriaNueva);

  if (e.nuevo.length === 0) {
    // QUITAR el reparto.
    if (e.sumaActualCents === 0) return pasos("GASTO");
    const choca =
      e.patchConAvion ||
      e.patchConVuelo ||
      !repartible ||
      cambiaMoneda ||
      montoFinal < e.sumaActualCents;
    if (!choca) return pasos("GASTO", "REPARTO");
    // PUT primero: con el gasto conciliado el PATCH puede rebotar 409 y el
    // reparto ya se habría quitado.
    if (e.riesgoConciliado) return bloqueo("CONCILIADO", MSG_REPARTO_CONCILIADO);
    return pasos("REPARTO", "GASTO");
  }
  // CREAR o EDITAR.
  if (!repartible || e.patchConAvion || e.patchConVuelo) {
    return bloqueo("INCOMPATIBLE", MSG_REPARTO_INCOMPATIBLE);
  }
  if (cambiaMoneda && e.sumaActualCents > 0) {
    return bloqueo("MONEDA", textoRepartoMoneda(e.monedaActual));
  }
  if (sumaNueva > montoFinal) return bloqueo("EXCEDE", MSG_REPARTO_EXCEDE);
  if (e.sumaActualCents > 0 && montoFinal < e.sumaActualCents) {
    if (e.riesgoConciliado) return bloqueo("CONCILIADO", MSG_REPARTO_CONCILIADO);
    // El PUT primero tiene que caber en el monto GUARDADO.
    if (sumaNueva > e.montoActualCents) {
      return bloqueo(
        "INCOHERENTE",
        msgRepartoIncoherente(e.sumaActualCents, e.montoActualCents, e.monedaActual),
      );
    }
    return pasos("REPARTO", "GASTO");
  }
  return pasos("GASTO", "REPARTO");
}

/**
 * ¿El PATCH cambia el dinero del banco? Espejo de `cambiaDineroDelGasto` del
 * API (`expenses.service.ts`): monto a centavos, moneda y medio (el medio
 * solo si el API lo acepta: BODEGA nunca viaja). Vacío = no viaja.
 */
export function dineroCambia(
  p: { monto?: unknown; moneda?: unknown; medio_pago?: unknown },
  g: Pick<Gasto, "monto" | "moneda" | "medio_pago">,
): boolean {
  const viaja = (v: unknown) => v !== undefined && v !== null && v !== "";
  if (viaja(p.monto)) {
    const n = Number(p.monto);
    if (!Number.isFinite(n) || Math.round(n * 100) !== centavosDe(g.monto)) return true;
  }
  if (viaja(p.moneda) && p.moneda !== g.moneda) return true;
  if (
    viaja(p.medio_pago) &&
    medioPagoAceptadoPorApi(String(p.medio_pago)) &&
    p.medio_pago !== g.medio_pago
  ) {
    return true;
  }
  return false;
}

/**
 * R9: prellenar el avión con la matrícula que leyó la IA SOLO en un gasto
 * sin reparto (sabido), en «Un avión», sin avión, con el campo vacío, sin el
 * veto de «Sin avión» elegido a mano, en una categoría que lleva avión y a lo
 * más una vez por apertura. Jamás en REPARTIDO, POR_CONFIRMAR ni
 * LECTURA_FALLIDA: el caso STARLINK reimponía N990GG sobre un repartido.
 */
export function debePrellenarAvionPorMatricula(e: {
  estadoRep: EstadoRepartoDialogo;
  modoAvion: ModoAvion;
  matriculaIa: unknown;
  categoria: string;
  vetado: boolean;
  avionActual: string | null | undefined;
  yaPrellenado: boolean;
}): boolean {
  return (
    e.estadoRep === "SIN_REPARTO" &&
    e.modoAvion === "UNO" &&
    typeof e.matriculaIa === "string" &&
    e.matriculaIa.trim() !== "" &&
    !categoriaSinAvion(e.categoria) &&
    !e.vetado &&
    !e.avionActual &&
    !e.yaPrellenado
  );
}

/**
 * ¿La IA ya quedó consumida en ESTA apertura por un reparto? (revisión del
 * 14-oct-2026). En cuanto el diálogo sabe que el gasto tiene o tuvo reparto
 * —al abrir, al leerlo o con lo que devolvió un guardado—, la matrícula de la
 * IA y la sugerencia de vuelo ya no corren en la sesión: un guardado a
 * medias que deja el gasto SIN reparto (PARCIAL_SOLO_REPARTO de un QUITAR)
 * ya no reimpone el avión de la IA sobre el «Sin avión (gasto de VuelaTour)»
 * que se confirmó (R9). `yaConsumida` = lo que la sesión ya sabía.
 */
export function iaConsumidaPorReparto(yaConsumida: boolean, partes: readonly unknown[]): boolean {
  return yaConsumida || partes.length > 0;
}

/**
 * R11: «Reanalizar con IA» sobre un gasto repartido (o que se está
 * repartiendo) no le pone una categoría que no se reparte (SERVICIOS,
 * REFACCION, PERMISO, TAXI: las sugerencias reales de los repartidos).
 */
export function iaRespetaReparto(sugerida: string | null | undefined, conReparto: boolean): boolean {
  if (!sugerida) return false;
  if (!conReparto) return true;
  return CATEGORIAS_REPARTIBLES.has(sugerida);
}

/** «septiembre 2026»: los meses (YYYY-MM distintos) ANTERIORES al de hoy (Cancún). */
export function mesesTerminados(fechas: Array<string | null | undefined>, hoy: string): string[] {
  const mesHoy = (hoy ?? "").slice(0, 7);
  const meses = new Set<string>();
  for (const f of fechas) {
    if (typeof f !== "string") continue;
    const m = /^(\d{4})-(\d{2})/.exec(f);
    if (!m) continue;
    const mes = Number(m[2]);
    if (mes < 1 || mes > 12) continue;
    const clave = `${m[1]}-${m[2]}`;
    if (clave < mesHoy) meses.add(clave);
  }
  return [...meses]
    .sort()
    .map((c) => `${MESES_LARGOS_ES[Number(c.slice(5, 7)) - 1]} ${c.slice(0, 4)}`);
}

/**
 * ¿El API rechazó el PATCH por el reparto? Reconoce los 5 textos de hoy
 * (`expenses.service.ts`) y los de la Fase 2: todos empiezan igual.
 */
export function esRechazoPorReparto(error?: string | null): boolean {
  return /^El gasto está repartido entre aviones/.test((error ?? "").trim());
}

/** Respuesta corta cuando una server action no contestó (red, deploy de Vercel). */
export const MSG_SERVIDOR_NO_RESPONDIO = "No hubo respuesta del servidor.";

/**
 * Llama a una server action SIN lanzar (patrón `moverVueloOperativo`): un
 * throw en el cliente («Failed to find Server Action» tras un deploy, red
 * caída) jamás llega al error boundary. Un texto técnico no se pinta.
 */
export async function llamarSinLanzar<R>(
  llamar: () => Promise<R>,
): Promise<{ ok: true; valor: R } | { ok: false; error: string }> {
  try {
    return { ok: true, valor: await llamar() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    return { ok: false, error: esTextoTecnico(msg) ? MSG_SERVIDOR_NO_RESPONDIO : msg };
  }
}

/** Motivo para meter en una frase: sin punto final; un texto técnico no se pinta. */
export function motivoLegible(error?: string | null): string {
  const m = (error ?? "").trim();
  if (esTextoTecnico(m)) return "el servidor no respondió";
  return m.replace(/\.+$/, "");
}

/**
 * Valida un reparto que llega del cliente ANTES de la red: arreglo de a lo
 * más 20, avión uuid sin repetir, monto finito > 0 con 2 decimales (el DTO
 * del API). null = inválido.
 */
export function validarItemsReparto(x: unknown): ItemReparto[] | null {
  if (!Array.isArray(x) || x.length > 20) return null;
  const vistos = new Set<string>();
  const out: ItemReparto[] = [];
  for (const it of x) {
    const id = (it as { aeronave_id?: unknown } | null)?.aeronave_id;
    const monto = (it as { monto?: unknown } | null)?.monto;
    if (typeof id !== "string" || !esUuid(id) || vistos.has(id)) return null;
    if (typeof monto !== "number" || !Number.isFinite(monto) || monto <= 0) return null;
    if (Math.abs(monto * 100 - Math.round(monto * 100)) > 1e-6) return null;
    vistos.add(id);
    out.push({ aeronave_id: id, monto: Math.round(monto * 100) / 100 });
  }
  return out;
}

/** Tras un PUT que falló: ¿cómo quedó el reparto? (relectura null = no se sabe). */
export function estadoRepartoTrasFalla(
  releido: ItemReparto[] | null,
  base: ItemReparto[],
  nuevo: ItemReparto[],
): EstadoRepartoTrasFalla {
  if (releido === null) return "DESCONOCIDO";
  if (mismoReparto(releido, nuevo)) return "IGUAL_AL_NUEVO";
  if (mismoReparto(releido, base)) return "IGUAL_AL_ANTERIOR";
  return "DISTINTO";
}

// ===================== Textos: modos y bloque «Avión» =====================

export const ETIQUETA_CAMPO_AVION_MODOS = "Avión";
export const ETIQUETA_MODO_UNO = "Un avión";
export const ETIQUETA_MODO_SIN_AVION = "Sin avión";
export const ETIQUETA_MODO_REPARTO = "Repartir entre aviones";
export const ARIA_MODO_AVION = "Cómo se carga el gasto a los aviones";

/** `title` del botón «Un avión» por categoría. */
export function tituloModoUno(categoria: string): string {
  if (categoria === "INDIRECTO") {
    return "Un solo avión (o ninguno): resta en el balance de ese avión, no en su reparto a socios.";
  }
  if (categoria === "FIJO") {
    return "Un solo avión (o ninguno): el gasto fijo queda en VuelaTour y en el reparto a socios se prorratea entre todos los aviones activos.";
  }
  if (categoria === "OTRO" || categoria === "NOMINA") {
    return "Un solo avión (o ninguno): el avión queda solo como referencia; el gasto es de VuelaTour.";
  }
  if (etiquetaUnoEsSinAvion(categoria)) return "Sin avión: el gasto es de VuelaTour.";
  return "Un solo avión (o ninguno).";
}

export const TITULO_MODO_REPARTO =
  "Divide el gasto entre los aviones que elijas; lo no asignado lo absorbe VuelaTour.";

export const OPCION_SIN_AVION_VUELATOUR = "Sin avión (gasto de VuelaTour)";

export const HINT_SIN_AVION_CATEGORIA =
  "La gasolina de vehículos y las visitas no llevan avión: para cargarlas a aviones, elige «Repartir entre aviones».";

/** Ayuda bajo el selector de «Un avión»; null = la categoría no la lleva. */
export function ayudaModoUno(e: { categoria: string; matricula: string | null }): string | null {
  const mat = e.matricula && e.matricula.trim() !== "" ? e.matricula : null;
  if (e.categoria === "INDIRECTO") {
    return mat
      ? `Con un solo avión (${mat}) el gasto resta en el balance de ese avión, pero no en su reparto a socios. Repartido —aunque sea 100 % a ese avión— resta en los dos.`
      : "Sin avión, el gasto lo absorbe VuelaTour (Balance general · Otros gastos).";
  }
  if (e.categoria === "FIJO") {
    return `Gasto fijo: sin reparto queda en VuelaTour en el balance y, en el reparto a socios, se prorratea entre todos los aviones activos.${mat ? ` ${mat} queda solo como referencia.` : ""}`;
  }
  if (e.categoria === "OTRO" || e.categoria === "NOMINA") {
    return mat
      ? `${mat} queda solo como referencia: el gasto sigue siendo de VuelaTour. Para cargarlo a aviones, usa «Repartir entre aviones».`
      : "Sin avión, el gasto es de VuelaTour (Balance general · Otros gastos).";
  }
  if (etiquetaUnoEsSinAvion(e.categoria)) return HINT_SIN_AVION_CATEGORIA;
  return null;
}

export const MOTIVO_REPARTO_CON_VUELO =
  "Un gasto ligado a un vuelo no se reparte: para repartirlo, cambia «Vuelo» a «Sin vuelo».";

export function motivoCategoriaNoRepartible(label: string): string {
  return `«${label}» no se reparte entre aviones.`;
}

export const HINT_VUELO_EN_REPARTO =
  "Un gasto repartido entre aviones no lleva vuelo. Para ligarlo a uno, elige «Un avión» (el reparto se quita al guardar).";

/**
 * Descripción del diálogo, decidida con la CATEGORÍA del formulario (revisión
 * del 14-oct-2026): un repartido reclasificado a «Servicios (avión)» seguía
 * prometiendo «el avión es opcional… puedes repartirlo» con «Repartir»
 * apagado, y el gasto personal y la comisión que paga VuelaTour decían que
 * sin avión quedan en la bandeja (no cuentan en «Pendientes»).
 */
export function descripcionVerificarGasto(e: { enReparto: boolean; categoria: string }): string {
  if (e.enReparto) return "Revisa el reparto entre aviones y confirma categoría y comprobante.";
  if (CATEGORIAS_REPARTIBLES.has(e.categoria)) {
    return categoriaSinAvion(e.categoria)
      ? "Confirma categoría y comprobante. No lleva avión: sin reparto es gasto de VuelaTour, o puedes repartirlo entre aviones."
      : "Confirma categoría y comprobante. El avión es opcional: sin avión es gasto de VuelaTour, o puedes repartirlo entre aviones.";
  }
  if (e.categoria === "PERSONAL_DUENO") {
    return "Confirma categoría y comprobante. El gasto personal del dueño no lleva avión: queda fuera de los balances.";
  }
  if (!categoriaLlevaAvion(e.categoria)) {
    return "Confirma categoría, vuelo y comprobante. Esta categoría no lleva avión (el que elijas es solo referencia): no queda en la bandeja de pendientes.";
  }
  return "Asigna el avión y confirma categoría y comprobante. Sin avión, el gasto queda en la bandeja de pendientes.";
}

/** Campo «Avión» SIN modos (categoría que no se reparte y sin reparto guardado). */
export const ETIQUETA_AVION_RESUELVE_PENDIENTE = "Avión (resuelve pendiente)";
export const ETIQUETA_AVION_SOLO_REFERENCIA = "Avión (solo referencia)";

/**
 * Etiqueta del campo «Avión» sin modos: «(resuelve pendiente)» SOLO en una
 * categoría que necesita avión (espejo de la bandeja del API); en las que no
 * lo llevan (la comisión que paga VuelaTour) el avión es solo referencia.
 */
export function etiquetaCampoAvionSinModos(categoria: string): string {
  return categoriaLlevaAvion(categoria) ? ETIQUETA_AVION_RESUELVE_PENDIENTE : ETIQUETA_AVION_SOLO_REFERENCIA;
}

/** El gasto personal del dueño no lleva avión: el guardado lo desliga (no se ofrece selector). */
export const HINT_AVION_PERSONAL =
  "El gasto personal del dueño no lleva avión: al guardar se desliga y queda fuera de los balances.";

export const TITULO_RESUMEN_REPARTO = "Repartido entre aviones";
export const BOTON_EDITAR_REPARTO = "Editar reparto";
export const BOTON_QUITAR_REPARTO = "Quitar el reparto";
export const TITLE_QUITAR_REPARTO = "Deja el gasto sin reparto; se confirma al guardar.";

export const TEXTO_MARCA_AVIONES = "Marca los aviones y captura cuánto le toca a cada uno.";
export const BOTON_DIVIDIR_IGUALES = "Dividir en partes iguales";
export const TEXTO_SIN_AVIONES_ACTIVOS = "Sin aviones activos para repartir.";
export const TEXTO_CARGANDO_AVIONES = "Cargando aviones activos…";
export const BADGE_INACTIVO = "Inactivo";

export function ariaMontoAvion(mat: string): string {
  return `Monto de ${mat}`;
}

const enMoneda = (cents: number, moneda: string) => montoReparto(cents / 100, moneda);

/** Línea viva del editor y del resumen (roja si se pasa). */
export function lineaResumenReparto(e: {
  sumaCents: number;
  techoCents: number;
  restoCents: number;
  excedidoCents: number;
  moneda: string;
}): string {
  const base = `Asignado ${enMoneda(e.sumaCents, e.moneda)} de ${enMoneda(e.techoCents, e.moneda)} del total pagado`;
  return e.excedidoCents > 0
    ? `${base} · se pasa por ${enMoneda(e.excedidoCents, e.moneda)} — ajusta los montos`
    : `${base} · VuelaTour absorbe ${enMoneda(e.restoCents, e.moneda)}`;
}

/** Cola de «Total pagado» en modo reparto (roja si se pasa). */
export function lineaTotalPagadoReparto(e: {
  sumaCents: number;
  nAviones: number;
  restoCents: number;
  excedidoCents: number;
  moneda: string;
}): string {
  if (e.excedidoCents > 0) {
    return `· el reparto (${enMoneda(e.sumaCents, e.moneda)}) se pasa del total por ${enMoneda(e.excedidoCents, e.moneda)}: ajústalo en «Avión»`;
  }
  return `· repartido ${enMoneda(e.sumaCents, e.moneda)} entre ${e.nAviones} ${e.nAviones === 1 ? "avión" : "aviones"} · VuelaTour absorbe ${enMoneda(e.restoCents, e.moneda)}`;
}

/** «Con lo elegido cae en:» en modo reparto (prop `hoja` de CategoriaDestinoHint). */
export function hojaDestinoReparto(e: {
  matriculas: Array<string | null>;
  restoCents: number;
  moneda: string;
}): string {
  if (e.matriculas.length === 0) return "Balance de cada avión que marques · Gastos Indirectos (reparto manual)";
  const orden = [...e.matriculas].sort((a, b) =>
    a == null ? 1 : b == null ? -1 : a.localeCompare(b, "es-MX"),
  );
  const resto =
    e.restoCents > 0
      ? ` · lo no asignado (${enMoneda(e.restoCents, e.moneda)}) lo absorbe VuelaTour: Balance general · Otros gastos`
      : "";
  return `Balance de ${unirMatriculas(orden)} · Gastos Indirectos (reparto manual; también resta en su reparto a socios)${resto}`;
}

/** Recuadro informativo al repartir por PRIMERA vez. */
export function textoQueCambiaAlRepartir(e: {
  categoria: string;
  matriculaGuardada: string | null;
}): string {
  const cola =
    "Repartido, cada parte resta en el balance y en el reparto a socios de su avión; lo no asignado lo absorbe VuelaTour.";
  const mat = e.matriculaGuardada && e.matriculaGuardada.trim() !== "" ? e.matriculaGuardada : null;
  if (mat && e.categoria === "INDIRECTO") {
    return `Hoy el gasto está en ${mat}: resta en su balance pero no en el reparto a socios. ${cola}`;
  }
  if (mat && CATEGORIAS_EMPRESA.has(e.categoria)) {
    return `Hoy ${mat} es solo referencia: el gasto es de VuelaTour. ${cola}`;
  }
  return `Hoy el gasto es de VuelaTour. ${cola}`;
}

export const AVISO_REPARTO_FIJO =
  "Gasto fijo: sin reparto, en el reparto a socios se prorratea entre todos los aviones activos. Repartido sale de ese prorrateo: resta solo a los aviones que marques y lo no asignado queda en VuelaTour.";

export type MotivoQuitarReparto = "MODO" | "CATEGORIA";

/** Aviso ámbar del bloque «Avión» cuando el guardado quitará el reparto. */
export function avisoRepartoSeQuita(e: {
  motivo: MotivoQuitarReparto;
  resumen: string;
  label?: string;
}): string {
  if (e.motivo === "CATEGORIA") {
    return `«${e.label ?? ""}» no se reparte entre aviones: al guardar se quitará el reparto (${e.resumen}). Para conservarlo, regresa a una categoría que se reparta.`;
  }
  return `Al guardar se quitará el reparto (${e.resumen}). Para conservarlo, vuelve a «Repartir entre aviones».`;
}

/** Línea corta bajo «Categoría» (patrón de la TUA que se borra). */
export function lineaCategoriaQuitaReparto(label: string): string {
  return `«${label}» no se reparte: al guardar se quita el reparto (se confirma).`;
}

/**
 * R12: en modo reparto, la matrícula del comprobante (ya cruzada con el
 * catálogo por quien llama) que NO está entre los aviones marcados.
 */
export function avisoMatriculaFueraDeReparto(
  matriculaIa: unknown,
  marcadas: Array<string | null>,
): string | null {
  if (typeof matriculaIa !== "string" || matriculaIa.trim() === "") return null;
  const n = normMatricula(matriculaIa);
  if (!n) return null;
  if (marcadas.some((m) => m != null && normMatricula(m) === n)) return null;
  return `El comprobante trae la matrícula ${matriculaIa} y el reparto no la incluye: revisa si le toca una parte.`;
}

/** «A», «A ni B», «A, B ni C». */
function unirNi(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} ni ${partes[partes.length - 1]}`;
}

/** Cola del toast de «Reanalizar con IA» con lo que NO se aplicó por el reparto. */
export function notaIaConReparto(e: {
  categoria?: string | null;
  moneda?: string | null;
  matricula?: string | null;
}): string {
  const lista: string[] = [];
  if (e.categoria) lista.push(`la categoría «${categoriaGastoLabel(e.categoria)}»`);
  if (e.moneda) lista.push(`la moneda ${e.moneda}`);
  if (e.matricula) lista.push(`el avión ${e.matricula}`);
  if (lista.length === 0) return "";
  return ` El gasto está repartido: no se aplicó ${unirNi(lista)} (cámbialo a mano si aplica).`;
}

export const NOTA_DINERO_BLOQUEADO =
  "Este gasto ya está conciliado con el banco: el guardado no aceptará otro monto, otra moneda ni otro medio de pago (para corregirlos, primero desvincula el cargo en Conciliación).";

/** R17: el monto sube con el reparto guardado intacto ⇒ VuelaTour absorbería la diferencia. */
export function notaMontoConReparto(e: {
  techoCents: number;
  sumaCents: number;
  moneda: string;
}): string | null {
  if (!(e.techoCents > e.sumaCents)) return null;
  return `Con el monto nuevo (${enMoneda(e.techoCents, e.moneda)}) el reparto sigue sumando ${enMoneda(e.sumaCents, e.moneda)}: VuelaTour absorbería ${enMoneda(e.techoCents - e.sumaCents, e.moneda)}. Si esa diferencia también va a los aviones, usa «Editar reparto».`;
}

/** R15: reclasificar ENTRE dos categorías que se reparten, con reparto guardado. */
export function notaCategoriaEntreRepartibles(e: { antes: string; despues: string }): string | null {
  if (
    e.antes === e.despues ||
    !CATEGORIAS_REPARTIBLES.has(e.antes) ||
    !CATEGORIAS_REPARTIBLES.has(e.despues)
  ) {
    return null;
  }
  const base =
    "Las partes siguen en los mismos aviones y con los mismos montos; solo cambia el renglón donde se ven en el balance y en el reparto a socios.";
  if (e.despues === "FIJO") {
    return `${base} Como «Gasto fijo», cada parte resta en el grupo FIJO del reparto a socios de su avión.`;
  }
  if (e.antes === "FIJO") {
    return `${base} Al dejar de ser «Gasto fijo», cada parte resta en el grupo de gastos indirectos del reparto a socios.`;
  }
  return base;
}

/** R19: el gasto es de un mes que ya terminó (null = ninguno). */
export function notaRepartoMesTerminado(meses: string[]): string | null {
  if (meses.length === 0) return null;
  const libros = "(balance de los aviones, reparto a socios y lo que absorbe VuelaTour); si ya los enviaste, vuelve a generarlos.";
  if (meses.length === 1) {
    return `Es un gasto de ${meses[0]}, un mes que ya terminó: al guardar cambian los libros de ese mes ${libros}`;
  }
  return `Cambian los libros de ${unirMatriculas(meses)}, meses que ya terminaron ${libros}`;
}

export function textoRepartoMoneda(moneda: string): string {
  return `Los montos del reparto están en ${moneda}: para cambiar la moneda, primero elige «Un avión» y guarda (se quita el reparto); después vuelve a repartirlo en la moneda nueva.`;
}

export function textoRepartoSinMonto(mats: string[]): string {
  return `Captura el monto de ${mats.join(", ")} (o desmárcalos).`;
}

export function textoRepartoInactivos(mats: string[]): string {
  return mats.length === 1
    ? `${mats[0]} está inactivo: desmárcalo (solo se reparte entre aviones activos).`
    : `${unirMatriculas(mats)} están inactivos: desmárcalos (solo se reparte entre aviones activos).`;
}

export const MSG_REPARTO_SIN_AVIONES = "Marca los aviones del reparto (o elige «Un avión»).";
export const MSG_REPARTO_SIN_AVIONES_GUARDADO =
  "Marca al menos un avión. Para quitar el reparto, elige «Un avión» (se confirma al guardar).";
export const MSG_REPARTO_EXCEDE =
  "El reparto se pasa del total pagado — ajusta los montos (lo no asignado queda como gasto de VuelaTour).";
export const MSG_REPARTO_CARGANDO = "Espera a que carguen los aviones del reparto.";
export const MSG_REPARTO_CONCILIADO =
  "Este gasto tiene cargos del banco ligados: no se puede cambiar su monto, moneda ni medio de pago (desvincúlalo primero en Conciliación). No se guardó nada.";
export const MSG_REPARTO_INCOMPATIBLE =
  "Un gasto repartido no lleva avión individual ni vuelo, y su categoría debe repartirse: revisa «Avión», «Vuelo» y «Categoría». No se guardó nada.";

export function msgRepartoIncoherente(sumaCents: number, montoCents: number, moneda: string): string {
  const monto = enMoneda(montoCents, moneda);
  return `El reparto guardado (${enMoneda(sumaCents, moneda)}) suma más que el monto guardado del gasto (${monto}): primero baja el reparto a ${monto} o menos y guarda; después cambia el monto. No se guardó nada.`;
}

export const MSG_REPARTO_INVALIDO =
  "El reparto no es válido (aviones o montos): recarga y vuelve a intentar. No se guardó nada.";
export const AYUDA_RECHAZO_POR_REPARTO = "El reparto se ajusta aquí mismo: «Avión» → «Repartir entre aviones».";
export const TEXTO_LEYENDO_REPARTO = "Leyendo el reparto del gasto…";
export const TEXTO_FALLO_LECTURA_REPARTO = "No se pudo leer el reparto de este gasto.";
export const BOTON_REINTENTAR = "Reintentar";

export function textoFalloCargaAviones(resumen: string | null): string {
  return `No se pudieron cargar los aviones activos.${resumen ? ` Se conserva el reparto guardado (${resumen}).` : ""}`;
}

export function textoRepartoActualizado(resumen: string): string {
  return `El reparto guardado cambió mientras editabas: ahora está ${resumen}. Revisa tus montos antes de guardar.`;
}

export function textoRepartoDescubierto(resumen: string): string {
  return `Este gasto ya está repartido entre aviones (${resumen}). Revisa el reparto; si querías un solo avión, elige «Un avión» y guarda (se quitará el reparto).`;
}

/**
 * «N4142R $1,577.92 MXN · N621TX $1,577.92 MXN · N990GG $1,577.92 MXN» (por
 * matrícula, desconocida «¿?») + « · VuelaTour $X MXN» si el remanente es > 0;
 * [] ⇒ «sin reparto».
 */
export function resumenRepartoTexto(
  partes: ParteReparto[],
  moneda: string,
  remanenteCents?: number | null,
): string {
  if (partes.length === 0) return "sin reparto";
  const txt = ordenarPartes(partes)
    .map((p) => `${p.matricula ?? "¿?"} ${montoReparto(centavosDe(p.monto) / 100, moneda)}`)
    .join(" · ");
  return remanenteCents != null && remanenteCents > 0
    ? `${txt} · VuelaTour ${enMoneda(remanenteCents, moneda)}`
    : txt;
}

/** Resumen de una respuesta del API (con su remanente y su moneda). */
export function resumenDeRespuesta(r: RepartoResponse, monedaRespaldo: string): string {
  return resumenRepartoTexto(
    partesDeRespuesta(r),
    r.gasto?.moneda || monedaRespaldo,
    centavosDe(r.remanente_empresa),
  );
}

/**
 * Al QUITAR el reparto sin avión ni vuelo en una categoría que NECESITA
 * avión: no «lo absorbe VuelaTour», queda pendiente (revisión del 14-oct-2026).
 */
export const DESTINO_PENDIENTE_DE_AVION =
  "la bandeja de «Pendientes» (le falta avión; mientras no lo tenga, cuenta en Balance general VuelaTour · Otros gastos)";

/**
 * A dónde pasa el gasto al QUITAR el reparto (confirmación). Nunca llama
 * `hojaDestinoGasto(…, false, false)`: ese texto manda a repartir desde otra
 * pantalla, y el reparto se ajusta aquí.
 */
export function destinoTrasQuitar(e: {
  categoria: string;
  matricula: string | null;
  tieneVuelo: boolean;
}): string {
  const mat = e.matricula && e.matricula.trim() !== "" ? e.matricula : null;
  if (e.categoria === "PERSONAL_DUENO") return "fuera de los balances (gasto personal del dueño)";
  const empresa = CATEGORIAS_EMPRESA.has(e.categoria);
  if (empresa && mat) return `Balance general VuelaTour · Otros gastos (${mat} queda solo como referencia)`;
  if (empresa) return "Balance general VuelaTour · Otros gastos (lo absorbe VuelaTour)";
  if (!mat && !e.tieneVuelo) {
    // Una categoría que necesita avión (Servicios, Comida, Gasavión…) sin
    // avión NO es de VuelaTour: cuenta en «Pendientes» hasta asignárselo.
    return categoriaLlevaAvion(e.categoria)
      ? DESTINO_PENDIENTE_DE_AVION
      : "Balance general VuelaTour · Otros gastos (lo absorbe VuelaTour)";
  }
  if (e.tieneVuelo) return hojaDestinoGasto(e.categoria, true, !!mat);
  return `${hojaDestinoGasto(e.categoria, false, true)} (${mat})`;
}

/**
 * Texto del ALTA en el API (`expenses.service.ts`): la carga de combustible
 * se controla POR AVIÓN y un GAS sin avión rebota con 400. El PATCH dice
 * «…asigna la aeronave antes de quitarla.»; aquí va el del alta porque en el
 * diálogo elegir un vuelo con avión pone el avión.
 */
export const MSG_COMBUSTIBLE_NECESITA_AVION =
  "La carga de combustible necesita el avión: selecciona la aeronave (o un vuelo del cual tomarla).";

/**
 * Se frena ANTES de la red (revisión del 14-oct-2026): QUITAR el reparto
 * reclasificando a «Gasavión / Turbosina» sin avión. El planificador manda
 * primero el PUT [] (la categoría no se reparte) y el PATCH rebotaría con el
 * 400 del API DESPUÉS: los aviones ya habrían perdido su parte (falla a
 * medias). El vuelo no basta: en este camino viaja en una 2.ª llamada
 * DESPUÉS del PATCH, así que solo cuenta el avión del formulario (elegir un
 * vuelo con avión lo pone).
 */
export function errorQuitarRepartoSinAvion(e: {
  quitaReparto: boolean;
  categoria: string;
  aeronaveId: string | null | undefined;
}): string | null {
  if (!e.quitaReparto || e.categoria !== "GAS") return null;
  return e.aeronaveId ? null : MSG_COMBUSTIBLE_NECESITA_AVION;
}

// ===================== Confirmación única al guardar =====================

export const TITULO_QUITAR_REPARTO = "¿Quitar el reparto de este gasto?";
export const TITULO_CAMBIO_REPARTO = "¿Guardar el cambio del reparto?";
export const BOTON_QUITAR_Y_GUARDAR = "Quitar reparto y guardar";
export const BOTON_SI_GUARDAR = "Sí, guardar";
export const BOTON_REVISAR = "Revisar";
export const GUARDANDO = "Guardando…";

export interface ConfirmacionReparto {
  titulo: string;
  parrafos: string[];
  boton: string;
}

/**
 * La UNA confirmación del reparto (regla del cliente: lo destructivo
 * confirma, en cualquier mes): QUITAR el reparto, o un cambio que BAJA o
 * SACA a un avión, SUSTITUYE al avión único guardado o es el primer reparto
 * de un FIJO. Lo demás (primer reparto sin avión, solo subir o agregar) ⇒
 * null: sin diálogo (el mes terminado se dice en línea).
 */
export function confirmacionRepartoAlGuardar(e: {
  base: ParteReparto[];
  nuevo: ParteReparto[];
  quita: boolean;
  motivoQuitar: MotivoQuitarReparto | null;
  categoriaFinal: string;
  avionFinal: string | null;
  tieneVuelo: boolean;
  avionGuardado: string | null;
  moneda: string;
  fechas: Array<string | null | undefined>;
  hoy: string;
}): ConfirmacionReparto | null {
  const mesTerminado = notaRepartoMesTerminado(mesesTerminados(e.fechas, e.hoy));
  const resumenBase = resumenRepartoTexto(e.base, e.moneda);
  if (e.quita) {
    if (e.base.length === 0) return null;
    const parrafos: string[] = [];
    if (e.motivoQuitar === "CATEGORIA") {
      parrafos.push(
        `«${categoriaGastoLabel(e.categoriaFinal)}» no se reparte entre aviones, así que al guardar se quita el reparto.`,
      );
    } else {
      const eleccion = etiquetaUnoEsSinAvion(e.categoriaFinal) ? ETIQUETA_MODO_SIN_AVION : ETIQUETA_MODO_UNO;
      parrafos.push(`Elegiste «${eleccion}», así que al guardar se quita el reparto.`);
    }
    parrafos.push(`Hoy está repartido así: ${resumenBase}.`);
    parrafos.push(
      `Cada avión pierde su parte (en su balance y en su reparto a socios) y el gasto pasa a: ${destinoTrasQuitar({
        categoria: e.categoriaFinal,
        matricula: e.avionFinal,
        tieneVuelo: e.tieneVuelo,
      })}.`,
    );
    if (e.categoriaFinal === "INDIRECTO" && e.avionFinal) {
      parrafos.push(
        `Con un solo avión, este gasto resta en el balance de ${e.avionFinal}, pero no en su reparto a socios.`,
      );
    }
    if (e.categoriaFinal === "FIJO") {
      parrafos.push("En el reparto a socios, el gasto fijo vuelve a prorratearse entre todos los aviones activos.");
    }
    if (mesTerminado) parrafos.push(mesTerminado);
    return { titulo: TITULO_QUITAR_REPARTO, parrafos, boton: BOTON_QUITAR_Y_GUARDAR };
  }

  if (mismoReparto(itemsDePartes(e.base), itemsDePartes(e.nuevo))) return null;
  const quitas = quitasDelReparto(e.base, itemsDePartes(e.nuevo));
  const primero = e.base.length === 0;
  const sustituye = primero && !!e.avionGuardado;
  const primerFijo = primero && e.categoriaFinal === "FIJO";
  if (quitas.length === 0 && !sustituye && !primerFijo) return null;

  const parrafos: string[] = [];
  if (!primero) parrafos.push(`Hoy está repartido así: ${resumenBase}.`);
  parrafos.push(`Queda así: ${resumenRepartoTexto(e.nuevo, e.moneda)}.`);
  if (quitas.length > 0) {
    const lista = quitas
      .map(
        (q) =>
          `${q.matricula ?? "¿?"} (${enMoneda(q.antesCents, e.moneda)} → ${enMoneda(q.despuesCents, e.moneda)})`,
      )
      .join(" · ");
    parrafos.push(`Bajan o salen del reparto: ${lista}. Esa diferencia pasa a los demás aviones o a VuelaTour.`);
  }
  if (sustituye) {
    const mat = e.avionGuardado as string;
    parrafos.push(
      e.categoriaFinal === "INDIRECTO"
        ? `Hoy ${mat} carga este gasto en su balance, pero no en su reparto a socios. Repartido, el reparto sustituye a ${mat} y cada parte resta en el balance y en el reparto a socios de su avión. Si después quitas el reparto, el gasto no regresa a ${mat}: queda sin avión.`
        : `Hoy ${mat} es solo referencia (el gasto es de VuelaTour). Repartido, esa referencia se quita y cada parte resta en el balance y en el reparto a socios de su avión.`,
    );
  }
  if (primerFijo) parrafos.push(AVISO_REPARTO_FIJO);
  if (mesTerminado) parrafos.push(mesTerminado);
  return { titulo: TITULO_CAMBIO_REPARTO, parrafos, boton: BOTON_SI_GUARDAR };
}

/**
 * R24: lo que se frena ANTES de la red (toast.error y nada sale): aviones
 * cargando con cambios, ningún avión marcado, un marcado sin monto, un
 * inactivo marcado (si el reparto cambia), Σ > total pagado y la moneda
 * cambiada con un reparto guardado. null = se puede guardar.
 */
export function errorRepartoEnPantalla(e: {
  enReparto: boolean;
  editando: boolean;
  avionesCargando: boolean;
  sinBase: boolean;
  cambia: boolean;
  resumen: ResumenReparto;
  monedaCambiaConBase: boolean;
  monedaGuardada: string;
}): string | null {
  if (!e.enReparto) return null;
  if (e.editando && e.avionesCargando && (e.sinBase || e.cambia)) return MSG_REPARTO_CARGANDO;
  if (e.resumen.incluidos.length === 0) {
    return e.sinBase ? MSG_REPARTO_SIN_AVIONES : MSG_REPARTO_SIN_AVIONES_GUARDADO;
  }
  if (e.resumen.sinMonto.length > 0) return textoRepartoSinMonto(e.resumen.sinMonto);
  if (e.cambia && e.resumen.inactivos.length > 0) return textoRepartoInactivos(e.resumen.inactivos);
  if (e.resumen.excedidoCents > 0) return MSG_REPARTO_EXCEDE;
  if (e.monedaCambiaConBase) return textoRepartoMoneda(e.monedaGuardada);
  return null;
}

// ===================== Resultado del guardado =====================

/** Toast de 15 s: fallas parciales y falta de respuesta (la fila puede salir de la vista). */
export const TOAST_LARGO_MS = 15000;
/** Toast de 10 s: avisos (otra persona cambió el reparto, refuerzo del avión). */
export const TOAST_AVISO_MS = 10000;

export type ModoGuardadoReparto = "CREAR" | "EDITAR" | "QUITAR";

export interface ContextoResultadoReparto {
  modo: ModoGuardadoReparto;
  base: ParteReparto[];
  nuevo: ParteReparto[];
  /** Avión elegido en «Un avión» al quitar (null = sin avión). */
  matriculaFinal: string | null;
  categoria: string;
  moneda: string;
  /** El gasto queda ligado a un vuelo (al quitar sin avión). */
  tieneVuelo?: boolean;
}

export interface MensajeResultadoReparto {
  tipo: "exito" | "error" | "aviso";
  texto: string;
  /** Además del toast, banner dentro del bloque «Avión». */
  banner: boolean;
  toastMs?: number;
  /** El banner ofrece «Regresar el reparto anterior». */
  conRegresar: boolean;
}

const avionesN = (n: number) => `${n} ${n === 1 ? "avión" : "aviones"}`;

/** Toast de éxito del guardado con reparto (crear, editar o quitar). */
export function textoExitoGastoReparto(ctx: ContextoResultadoReparto): string {
  if (ctx.modo === "CREAR") return `Gasto verificado y repartido entre ${avionesN(ctx.nuevo.length)}`;
  if (ctx.modo === "EDITAR") return `Gasto verificado y reparto actualizado (${avionesN(ctx.nuevo.length)})`;
  if (ctx.matriculaFinal) return `Gasto verificado y reparto quitado: quedó en ${ctx.matriculaFinal}`;
  if (ctx.categoria === "FIJO") {
    return "Gasto verificado y reparto quitado: el gasto fijo vuelve al prorrateo entre los aviones activos";
  }
  if (ctx.categoria === "PERSONAL_DUENO") {
    return "Gasto verificado y reparto quitado: queda fuera de los balances (gasto personal del dueño)";
  }
  // Una categoría que necesita avión no la «absorbe VuelaTour» (revisión del 14-oct-2026).
  if (categoriaLlevaAvion(ctx.categoria)) {
    return ctx.tieneVuelo
      ? "Gasto verificado y reparto quitado: queda en la hoja de su vuelo"
      : "Gasto verificado y reparto quitado: queda pendiente de avión (pestaña «Pendientes»)";
  }
  return "Gasto verificado y reparto quitado: lo absorbe VuelaTour";
}

/** Texto para «el GASTO» en el camino de siempre: el del API (o «campo: error»). */
function textoErrorGasto(r: { error?: string; fieldErrors?: Record<string, string[]> }): string {
  if (r.fieldErrors) {
    const f = Object.keys(r.fieldErrors)[0];
    if (f) return `${f}: ${r.fieldErrors[f]?.[0] ?? "Validación falló"}`;
  }
  return r.error && r.error.trim() !== "" ? r.error : "Error desconocido";
}

/**
 * Qué se dice tras `guardarGastoConRepartoAction` (o si no contestó): textos
 * EXACTOS por código y variante. Los resúmenes usan lo que leyó o escribió el
 * API (con su remanente) cuando lo hay.
 */
export function mensajeResultadoGastoReparto(
  r: ResultadoGastoConReparto | { codigo: "SIN_RESPUESTA"; reparto?: RepartoResponse | null },
  ctx: ContextoResultadoReparto,
): MensajeResultadoReparto {
  const error = (texto: string, extra: Partial<MensajeResultadoReparto> = {}): MensajeResultadoReparto => ({
    tipo: "error",
    texto,
    banner: true,
    toastMs: TOAST_LARGO_MS,
    conRegresar: false,
    ...extra,
  });
  const actual = (rep?: RepartoResponse | null) =>
    rep ? resumenDeRespuesta(rep, ctx.moneda) : "sin reparto";
  const resumenBase = resumenRepartoTexto(ctx.base, ctx.moneda);

  if (r.codigo === "SIN_RESPUESTA") {
    return error(
      r.reparto
        ? `No hubo respuesta del servidor al guardar: no sabemos si el gasto se guardó. El reparto ahora está así: ${actual(r.reparto)}. Recarga la página y revisa el gasto antes de volver a guardar.`
        : TEXTO_SIN_RESPUESTA_GUARDAR,
    );
  }
  const motivo = motivoLegible(r.error);
  switch (r.codigo) {
    case "OK":
      return { tipo: "exito", texto: textoExitoGastoReparto(ctx), banner: false, conRegresar: false };
    case "BLOQUEO":
      return error(r.error && r.error.trim() !== "" ? r.error : MSG_REPARTO_INVALIDO, { toastMs: undefined });
    case "LECTURA":
      return error(
        `No se pudo leer el reparto actual del gasto (${motivo}). No se guardó nada; vuelve a intentarlo.`,
        { toastMs: undefined },
      );
    case "REPARTO_CAMBIO":
      return {
        tipo: "aviso",
        texto: `Otra persona cambió el reparto de este gasto mientras lo editabas. Ahora está: ${actual(r.reparto)}. No se guardó nada: revisa el reparto y vuelve a guardar.`,
        banner: true,
        toastMs: TOAST_AVISO_MS,
        conRegresar: false,
      };
    case "GASTO":
      return { tipo: "error", texto: textoErrorGasto(r), banner: false, conRegresar: false };
    case "GASTO_INCIERTO":
      return error(
        `No se pudo confirmar si el gasto se guardó (${motivo}). Cierra y vuelve a abrir el gasto para revisarlo antes de guardar otra vez.`,
      );
    case "PARCIAL_SIN_REPARTO":
      if (r.repartoEstado === "DISTINTO") {
        return error(
          `El gasto se guardó, pero el reparto quedó distinto al que pediste (pudo guardarse a medias): ahora está ${actual(r.reparto)}. Revísalo y pulsa «Guardar» para dejarlo como lo quieres.`,
          { conRegresar: true },
        );
      }
      if (r.repartoEstado === "DESCONOCIDO") {
        return error(
          `El gasto se guardó, pero no se pudo confirmar cómo quedó el reparto (${motivo}). Cierra y vuelve a abrir el gasto para revisarlo antes de guardar otra vez.`,
        );
      }
      return error(
        `El gasto se guardó, pero el reparto NO cambió: ${motivo}. Sigue como estaba (${resumenBase}). Pulsa «Guardar» otra vez para reintentar el reparto.`,
      );
    case "PARCIAL_SOLO_REPARTO": {
      const nuevo =
        ctx.modo === "QUITAR"
          ? "sin reparto (100 % VuelaTour)"
          : r.reparto
            ? actual(r.reparto)
            : resumenRepartoTexto(ctx.nuevo, ctx.moneda);
      return r.gastoIncierto
        ? error(
            `Se guardó el reparto (${nuevo}), pero no se pudo confirmar si el gasto se guardó (${motivo}). Cierra y vuelve a abrir el gasto para revisarlo antes de guardar otra vez.`,
            { conRegresar: true },
          )
        : error(
            `Se guardó el reparto (${nuevo}), pero el gasto NO se guardó: ${motivo}. Corrige y pulsa «Guardar», o regresa el reparto anterior.`,
            { conRegresar: true },
          );
    }
    case "SIN_NADA_REPARTO":
      if (r.repartoEstado === "DISTINTO") {
        return error(
          `El gasto NO se guardó y el reparto quedó distinto al que pediste (pudo guardarse a medias): ahora está ${actual(r.reparto)}. Revísalo y pulsa «Guardar» otra vez.`,
          { conRegresar: true },
        );
      }
      if (r.repartoEstado === "DESCONOCIDO") {
        return error(
          `No se pudo cambiar el reparto (${motivo}) ni confirmar cómo quedó. El gasto NO se guardó. Cierra y vuelve a abrir el gasto para revisarlo antes de guardar otra vez.`,
        );
      }
      return error(`No se guardó nada: el reparto no se pudo cambiar (${motivo}).`, { toastMs: undefined });
    default:
      return error(MSG_REPARTO_INVALIDO, { toastMs: undefined });
  }
}

// ===================== «Verificar / editar»: llamadas que no contestan =====================
//
// Revisión del 14-oct-2026: el camino de siempre (`verifyGastoAction`), la
// 2.ª llamada del vuelo y «Retirar confirmación» llamaban a la server action
// desnuda: un fallo de TRANSPORTE («Failed to find Server Action» tras un
// deploy, red caída) lanzaba en el cliente y la pantalla caía al error
// boundary sin decir si se guardó.

/** El guardado no contestó (pudo escribir o no). */
export const TEXTO_SIN_RESPUESTA_GUARDAR =
  "No hubo respuesta del servidor al guardar: no sabemos si se guardó. Recarga la página y revisa el gasto antes de volver a guardar.";

/** El gasto SÍ se guardó; la 2.ª llamada (ligar el vuelo) no contestó. */
export const TEXTO_VUELO_SIN_RESPUESTA =
  "Gasto guardado, pero no hubo respuesta al ligar el vuelo: recarga la página y revisa el vuelo del gasto.";

/** «Retirar confirmación» no contestó. */
export const TEXTO_RETIRAR_SIN_RESPUESTA =
  "No hubo respuesta del servidor: no sabemos si se retiró la confirmación. Recarga la página para revisarlo.";

/**
 * Enter en el monto de un avión (el editor vive DENTRO del formulario de
 * «Verificar / editar» y Enter lo enviaba como «Guardar»): el foco pasa al
 * monto del SIGUIENTE avión marcado, en el orden de las filas; null = no hay.
 */
export function siguienteMontoMarcado(
  filas: ReadonlyArray<Pick<AvionReparto, "id">>,
  seleccion: SeleccionReparto,
  idActual: string,
): string | null {
  const i = filas.findIndex((f) => f.id === idActual);
  if (i < 0) return null;
  return filas.slice(i + 1).find((f) => seleccion[f.id]?.incluir)?.id ?? null;
}

/** Aviso (no error) cuando el refuerzo no pudo quitar el avión individual. */
export function textoRefuerzoAvion(motivo: string): string {
  return `El reparto quedó guardado, pero el gasto todavía tiene el avión individual: vuelve a abrirlo y pulsa «Guardar» para quitarlo (${motivoLegible(motivo)}).`;
}

// ===================== «Regresar el reparto anterior» =====================

export const TITULO_REGRESAR_REPARTO = "¿Regresar el reparto anterior?";

export function textoConfirmarRegresar(resumen: string): string {
  return `El reparto vuelve a quedar así: ${resumen}. Cambia el balance de esos aviones y su reparto a socios.`;
}

export const BOTON_REGRESAR = "Regresar el reparto";
export const BOTON_REGRESAR_BANNER = "Regresar el reparto anterior";

export function textoRegresadoOk(resumen: string): string {
  return `Se regresó el reparto anterior (${resumen}).`;
}

export function textoRegresarError(motivo: string): string {
  return `No se pudo regresar el reparto anterior: ${motivoLegible(motivo)}`;
}

// ===================== RepartoDialog compartido (menú ⋯ y Otros gastos) =====================

/** Confirmación de «Quitar reparto»: FIJO vuelve al prorrateo; el resto, el literal de siempre. */
export function textoQuitarRepartoDialogo(categoria: string): string {
  return categoria === "FIJO"
    ? "El gasto queda en VuelaTour en el balance y, en el reparto a socios, vuelve a prorratearse entre todos los aviones activos. Puedes volver a repartirlo cuando quieras."
    : "El gasto queda 100% como gasto de VuelaTour (empresa): no restará a ningún avión. Puedes volver a repartirlo cuando quieras.";
}

export function toastRepartoQuitadoDialogo(categoria: string): string {
  return categoria === "FIJO"
    ? "Reparto eliminado: el gasto fijo vuelve al prorrateo entre los aviones activos"
    : "Reparto eliminado: el gasto queda 100% de VuelaTour";
}
