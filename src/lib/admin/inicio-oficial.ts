/**
 * «Fecha de inicio oficial» del sistema (16-oct-2026, API 0.0.84) — reglas
 * PURAS del panel. Pedido del cliente: «Quitemos todo lo de Agosto … para
 * que iniciemos en septiembre 2026 de forma oficial», porque agosto ya se
 * cerró en el sistema anterior.
 *
 * - La fecha vive en el API (`configuracion_sistema.fecha_inicio_oficial`) y
 *   llega en `GET /v1/me` → `config.inicio_oficial` («AAAA-MM-DD» de pared
 *   Cancún, o `null`). El panel NUNCA la escribe en duro: aquí no hay
 *   constante de fecha por defecto.
 * - `null` (sin fila, apagada, o un API previo sin la llave) ⇒ TODAS las
 *   funciones devuelven su entrada tal cual: cero cambios visibles.
 * - El piso solo OCULTA: el API ya recorta listados y reportes. El panel
 *   solo acota sus selectores, sube un `?desde` viejo de la URL (con aviso),
 *   recorta atajos y pinta el chip/franja de los registros de antes.
 *
 * Espejo de `src/common/inicio-oficial.util.ts` del API (invariante 86).
 */
import { MESES_LARGOS_ES } from "@/lib/datetime";
import { esDiaValido } from "./url-params";

/** «AAAA-MM-DD» del inicio oficial, o `null` = sin piso (comportamiento de siempre). */
export type InicioOficial = string | null;

const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

/** Valida lo que mande el API: solo un día real «AAAA-MM-DD»; lo demás ⇒ `null`. */
export function normalizarInicioOficial(valor: unknown): InicioOficial {
  return typeof valor === "string" && esDiaValido(valor) ? valor : null;
}

/**
 * La fecha a partir de la respuesta de `/v1/me`. Sin `config` o sin la llave
 * (API ≤ 0.0.83) ⇒ `null` ⇒ el panel se comporta como hoy (skew de deploy).
 */
export function inicioOficialDeMe(
  me: { config?: { inicio_oficial?: unknown } | null } | null | undefined,
): InicioOficial {
  return normalizarInicioOficial(me?.config?.inicio_oficial);
}

/** «2026-09-01» ⇒ «1-sep-2026». Inválida ⇒ la entrada tal cual. */
export function fechaInicioCorta(inicio: string): string {
  if (!esDiaValido(inicio)) return inicio;
  const [a, m, d] = inicio.split("-");
  return `${Number(d)}-${MESES_CORTOS[Number(m) - 1]}-${a}`;
}

/** «AAAA-MM» del mes del inicio (para `min` de un `type="month"`). */
export function mesInicio(inicio: InicioOficial): string | undefined {
  return inicio ? inicio.slice(0, 7) : undefined;
}

/** `min` de un `<input type="date">` de filtro: el inicio, o nada. */
export function minFechaFiltro(inicio: InicioOficial): string | undefined {
  return inicio ?? undefined;
}

/** Sube un `desde` anterior al inicio; vacío o `null` ⇒ la entrada tal cual. */
export function pisoDesde<T extends string | undefined | null>(
  desde: T,
  inicio: InicioOficial,
): T | string {
  if (!inicio || !desde) return desde;
  return desde < inicio ? inicio : desde;
}

/** Sube un mes «AAAA-MM» anterior al mes del inicio. */
export function pisoMes<T extends string | undefined | null>(
  mes: T,
  inicio: InicioOficial,
): T | string {
  const piso = mesInicio(inicio);
  if (!piso || !mes) return mes;
  return mes < piso ? piso : mes;
}

/** ¿El mes «AAAA-MM» es el del inicio o uno anterior? (flechas «‹ anterior»). */
export function esMesDelInicioOAnterior(mes: string, inicio: InicioOficial): boolean {
  const piso = mesInicio(inicio);
  return !!piso && mes <= piso;
}

function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Último día «AAAA-MM-DD» del mes de un día. */
function finDeMes(dia: string): string {
  const a = Number(dia.slice(0, 4));
  const m = Number(dia.slice(5, 7));
  return `${dia.slice(0, 7)}-${String(ultimoDiaDelMes(a, m)).padStart(2, "0")}`;
}

export interface RangoAjustado {
  desde?: string;
  hasta?: string;
  /** El periodo pedido caía (todo o en parte) antes del inicio y se movió. */
  ajustado: boolean;
}

/**
 * URL vieja o manipulada (contrato §e.5). Sin redirigir (evita bucles): la
 * página usa el rango devuelto y, con `ajustado`, pinta el aviso
 * `textoAvisoAjuste`.
 * - `hasta < inicio` ⇒ el MES DEL INICIO (del inicio al fin de ese mes, o
 *   hasta hoy si es el mes en curso).
 * - Solo `desde < inicio` ⇒ `desde = inicio`.
 * - Sin extremos (listas sin rango por defecto) no se inventa nada.
 */
export function ajustarRangoAlInicio(
  rango: { desde?: string | null; hasta?: string | null },
  inicio: InicioOficial,
  hoy: string,
): RangoAjustado {
  const desde = rango.desde || undefined;
  const hasta = rango.hasta || undefined;
  if (!inicio) return { desde, hasta, ajustado: false };
  if (hasta && hasta < inicio) {
    const fin = finDeMes(inicio);
    const tope = hoy >= inicio && hoy < fin ? hoy : fin;
    return { desde: inicio, hasta: tope, ajustado: true };
  }
  if (desde && desde < inicio) return { desde: inicio, hasta, ajustado: true };
  return { desde, hasta, ajustado: false };
}

/**
 * Igual que `ajustarRangoAlInicio` para pantallas por MES (`?mes=AAAA-MM`):
 * un mes anterior al del inicio pasa al mes del inicio.
 */
export function ajustarMesAlInicio(
  mes: string,
  inicio: InicioOficial,
): { mes: string; ajustado: boolean } {
  const piso = mesInicio(inicio);
  if (!piso || mes >= piso) return { mes, ajustado: false };
  return { mes: piso, ajustado: true };
}

/**
 * Meses que ofrece un selector de cierre, del más reciente al más viejo:
 * desde el mes del inicio (o desde enero de `anioSinInicio` con `null`,
 * como siempre) hasta el mes de `hoy`.
 */
export function mesesDesdeInicio(
  inicio: InicioOficial,
  hoy: string,
  anioSinInicio = 2026,
): string[] {
  const primero = mesInicio(inicio) ?? `${anioSinInicio}-01`;
  const out: string[] = [];
  let a = Number(hoy.slice(0, 4));
  let m = Number(hoy.slice(5, 7));
  // Tope de seguridad: un dato basura no cuelga el render.
  for (let i = 0; i < 600; i++) {
    const ym = `${a}-${String(m).padStart(2, "0")}`;
    if (ym < primero) break;
    out.push(ym);
    m -= 1;
    if (m === 0) {
      m = 12;
      a -= 1;
    }
  }
  return out;
}

/**
 * Un atajo de periodo ENTERO antes del inicio («Mes pasado» = agosto en
 * septiembre) no se ofrece.
 */
export function atajoAntesDelInicio(
  rango: { hasta?: string | null } | null | undefined,
  inicio: InicioOficial,
): boolean {
  return !!inicio && !!rango?.hasta && rango.hasta < inicio;
}

/**
 * Atajos de periodo (contrato §e.3), genérico sobre la forma de cada módulo:
 * - el que queda ENTERO antes del inicio se quita;
 * - una VENTANA hacia atrás («Últimos 90 días») que empieza antes del
 *   inicio se llama «Desde el 1-sep-2026» y arranca en el inicio.
 * Con `null`, la lista tal cual (misma referencia).
 */
export function recortarAtajos<
  A extends { desde?: string | null; hasta?: string | null; etiqueta: string },
>(atajos: A[], inicio: InicioOficial, esVentana: (a: A) => boolean = () => false): A[] {
  if (!inicio) return atajos;
  const out: A[] = [];
  for (const a of atajos) {
    if (atajoAntesDelInicio(a, inicio)) continue;
    if (esVentana(a) && a.desde && a.desde < inicio) {
      out.push({ ...a, desde: inicio, etiqueta: etiquetaDesdeInicio(inicio) });
      continue;
    }
    out.push(a);
  }
  return out;
}

/**
 * Ventana hacia atrás (`hoy − N`, p. ej. «Cruzar pendientes» 30 días o
 * «Por conciliar» 90 días) con piso: `max(hoy − N, inicio)`.
 */
export function ventanaConPiso(desde: string, inicio: InicioOficial): string {
  return inicio && desde < inicio ? inicio : desde;
}

/** Día de pared Cancún de un `date` («AAAA-MM-DD») o de un instante ISO. */
function diaCancun(fechaOTs: string): string | null {
  if (esDiaValido(fechaOTs)) return fechaOTs;
  const t = Date.parse(fechaOTs);
  if (Number.isNaN(t)) return null;
  // Cancún = UTC−5 todo el año (sin horario de verano desde 2015).
  return new Date(t - 5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * ¿El registro es de antes del inicio? Un instante se pasa primero a día
 * Cancún: `2026-09-01T04:59:59Z` es el 31-ago en Cancún ⇒ «antes».
 * Sin fecha, ilegible o `inicio = null` ⇒ `false`.
 */
export function esAntesDelInicio(
  fechaOTs: string | null | undefined,
  inicio: InicioOficial,
): boolean {
  if (!inicio || !fechaOTs) return false;
  const dia = diaCancun(fechaOTs);
  return dia !== null && dia < inicio;
}

/**
 * Cuadrícula del calendario (contrato §e.4): los días anteriores al inicio
 * van en gris y SIN eventos (filtro del panel; el API de calendario no se
 * toca porque lo usa la app). Con `null`, la lista tal cual.
 */
export function vaciarDiasAntesDelInicio<D extends { iso: string; events: unknown[] }>(
  dias: D[],
  inicio: InicioOficial,
): (D & { antesDelInicio?: true })[] {
  if (!inicio) return dias;
  return dias.map((d) => (d.iso < inicio ? { ...d, events: [], antesDelInicio: true as const } : d));
}

// ─── Textos (es-MX) ─────────────────────────────────────────────────────────

/** Chip junto a una liga o fila cruzada (contrato §c). */
export function textoChipAntesDelInicio(inicio: string): string {
  return `De antes del inicio oficial (${fechaInicioCorta(inicio)})`;
}

/** Franja arriba del detalle abierto por id (contrato §c). */
export function textoFranjaAntesDelInicio(inicio: string): string {
  return `Este registro es de antes del inicio oficial (${fechaInicioCorta(
    inicio,
  )}). Se conserva solo para consulta: no aparece en listados ni reportes.`;
}

/** Aviso cuando la URL pedía un periodo anterior y se ajustó (contrato §e.5). */
export function textoAvisoAjuste(inicio: string): string {
  return `El sistema arranca el ${fechaInicioCorta(
    inicio,
  )}; ajustamos el periodo a partir de esa fecha.`;
}

/** Aviso NO bloqueante bajo la fecha de una captura (contrato §e.7). */
export function textoAvisoCaptura(inicio: string): string {
  return `La fecha es anterior al inicio oficial (${fechaInicioCorta(
    inicio,
  )}): se guardará, pero no aparecerá en listados ni reportes.`;
}

/** Aviso de captura si la fecha (día o instante) cae antes del inicio; si no, `null`. */
export function avisoCapturaAntesDelInicio(
  fecha: string | null | undefined,
  inicio: InicioOficial,
): string | null {
  return inicio && esAntesDelInicio(fecha, inicio) ? textoAvisoCaptura(inicio) : null;
}

/** Etiqueta de la ventana recortada: «Desde el 1-sep-2026». */
export function etiquetaDesdeInicio(inicio: string): string {
  return `Desde el ${fechaInicioCorta(inicio)}`;
}

/** Reemplazo de «(todas las fechas)» / «todo el historial»: «desde el 1-sep-2026». */
export function textoDesdeInicio(inicio: string): string {
  return `desde el ${fechaInicioCorta(inicio)}`;
}

/**
 * Rótulo del acumulado de finanzas del avión (`metrics.finanzas_desde`,
 * API 0.0.84): «desde el 1-sep-2026» o, sin la llave, «acumulado» como
 * siempre.
 */
export function rotuloAcumuladoFinanzas(finanzasDesde: unknown): string {
  const desde = normalizarInicioOficial(finanzasDesde);
  return desde ? textoDesdeInicio(desde) : "acumulado";
}

/** `title` de una flecha «mes anterior» deshabilitada: «El sistema arranca en septiembre de 2026». */
export function textoArrancaEnMes(inicio: string): string {
  const m = Number(inicio.slice(5, 7));
  return `El sistema arranca en ${MESES_LARGOS_ES[m - 1] ?? inicio.slice(5, 7)} de ${inicio.slice(0, 4)}`;
}

/** Fila sintética de Caja chica: «Saldo inicial al 1-sep-2026». */
export function textoSaldoInicial(inicio: string): string {
  return `Saldo inicial al ${fechaInicioCorta(inicio)}`;
}

// ─── Auditoría 16-oct-2026 (API 0.0.85, llaves ADITIVAS) ───────────────────
//
// El API 0.0.85 dejó de mandar filas anteriores al inicio en tacómetros y
// cardex, y agregó llaves para rotular lo que ya viene recortado. TODAS son
// opcionales: sin ellas (API 0.0.84) cada función devuelve el texto o el
// cálculo de siempre. Ningún número se recalcula aquí: solo se LEE lo que
// el API ya calculó con el historial completo.

/** `saldo_inicial` de `GET /v1/aircraft/:id/tacometros` (0.0.85). */
export interface SaldoInicialTaco {
  /** Día del inicio oficial («AAAA-MM-DD»). */
  fecha: string;
  /** `taco_llegada` de la fila previa inmediata (null si no la capturaron). */
  taco: number | null;
}

/** Valida el `saldo_inicial` de tacómetros; ausente o mal formado ⇒ `null`. */
export function normalizarSaldoInicialTaco(raw: unknown): SaldoInicialTaco | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { fecha?: unknown; taco?: unknown };
  const fecha = normalizarInicioOficial(r.fecha);
  if (!fecha) return null;
  const taco = typeof r.taco === "number" && Number.isFinite(r.taco) ? r.taco : null;
  return { fecha, taco };
}

/**
 * «Salto en la cadena» del histórico de tacómetros (más reciente primero):
 * la salida de una fila no coincide con la llegada de la fila SIGUIENTE (más
 * vieja). Con el API 0.0.85 la fila previa al inicio ya no viaja: la fila
 * fechada más vieja se compara contra `saldo_inicial.taco`, que ES la
 * llegada de esa fila previa ⇒ el salto sale idéntico al de antes del
 * recorte. Las filas sin fecha (el API las ordena al final, después de las
 * anteriores al inicio) se comparan entre sí como siempre. Sin
 * `saldoInicial` (API 0.0.84 o sin filas previas) ⇒ el cálculo de siempre.
 */
export function saltosDeCadena<
  H extends { fecha: string | null; taco_salida: number | null; taco_llegada: number | null },
>(historial: H[], saldoInicial?: SaldoInicialTaco | null): (H & { salto: boolean })[] {
  let ultimaFechada = -1;
  if (saldoInicial) {
    for (let i = historial.length - 1; i >= 0; i--) {
      if (historial[i].fecha) {
        ultimaFechada = i;
        break;
      }
    }
  }
  return historial.map((h, i) => {
    const llegadaPrevia =
      i === ultimaFechada ? saldoInicial!.taco : (historial[i + 1]?.taco_llegada ?? null);
    const salto = h.taco_salida != null && llegadaPrevia != null && h.taco_salida !== llegadaPrevia;
    return { ...h, salto };
  });
}

/**
 * Lista vacía de un historial recortado: con renglón de saldo inicial dice
 * «Sin movimientos desde el 1-sep-2026.» (había historia antes); sin él, el
 * texto de siempre.
 */
export function textoSinFilasDesde(
  saldo: { fecha: string } | null | undefined,
  textoDeSiempre: string,
  sustantivo = "movimientos",
): string {
  return saldo ? `Sin ${sustantivo} ${textoDesdeInicio(saldo.fecha)}.` : textoDeSiempre;
}

/**
 * KPI de la ficha del avión: «Horas mes / año» o, con `metrics.anio_desde`
 * (0.0.85, el año cuenta desde el inicio), «Horas mes / desde el 1-sep-2026».
 */
export function rotuloHorasMesAnio(anioDesde: unknown): string {
  const desde = normalizarInicioOficial(anioDesde);
  return desde ? `Horas mes / ${textoDesdeInicio(desde)}` : "Horas mes / año";
}

/**
 * Total de honorarios del piloto externo: «Histórico» o, con
 * `honorarios.desde` (0.0.85), «Desde el 1-sep-2026».
 */
export function rotuloTotalHonorarios(desde: unknown): string {
  const d = normalizarInicioOficial(desde);
  return d ? etiquetaDesdeInicio(d) : "Histórico";
}

/**
 * Chip «Registradas» del resumen de Facturas emitidas: con `resumen.desde`
 * (0.0.85, conteos y totales desde el inicio) «Registradas desde el
 * 1-sep-2026»; sin la llave, «Registradas».
 */
export function rotuloRegistradas(desde: unknown): string {
  const d = normalizarInicioOficial(desde);
  return d ? `Registradas ${textoDesdeInicio(d)}` : "Registradas";
}

/**
 * «La cuenta no puede arrancar antes de septiembre de 2026 (inicio
 * oficial).» — el MISMO texto del 400 `CUENTA_ANTES_DEL_INICIO` del API
 * 0.0.85, para avisarlo en el formulario antes de guardar.
 */
export function textoCuentaAntesDelInicio(inicio: string): string {
  const m = Number(inicio.slice(5, 7));
  return `La cuenta no puede arrancar antes de ${MESES_LARGOS_ES[m - 1] ?? inicio.slice(5, 7)} de ${inicio.slice(0, 4)} (inicio oficial).`;
}
