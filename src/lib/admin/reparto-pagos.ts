/**
 * CUENTA CORRIENTE DE LOS SOCIOS — FUENTE ÚNICA PURA del panel (v2,
 * 1-oct-2026, API 0.0.50). Sin React ni red.
 *
 * Aclaración del cliente (audio): «cuando el socio dice: necesito que me
 * adelanten 70,000 pesos de mis utilidades, necesitamos poder grabarlo … y
 * que se lleve el HISTÓRICO de cuánto se le ha ido repartiendo, cuánto falta
 * por repartir, cómo se le repartió, la fecha de la entrega y algún
 * comprobante escaneado». Cada socio tiene UNA cuenta: utilidades que genera
 * (por mes y avión) menos lo que se le entrega. Un adelanto es una entrega
 * que deja el saldo negativo (ADELANTADO), no un error.
 *
 * Qué vive aquí: meses (rangos, etiquetas, opciones), etiquetas y COLORES del
 * estado de la cuenta, textos (banner de cuenta sin configurar, confirmación
 * de adelanto y de baja, errores por `code`), roles, validación de los dos
 * formularios y los cuerpos que viajan al API, la tolerancia al API previo y
 * los renglones del pre-cierre.
 *
 * Qué NO vive aquí: el dinero. Utilidad por mes, generado, entregado, por
 * entregar, saldo corrido, estado y el equivalente en USD de una entrega en
 * pesos los calcula el API. `estadoCuentaSocio` es un ESPEJO solo para
 * pintar un estado que el panel no reconoce; `generadoPorSocioEnPeriodo`
 * solo SUMA lo que ya pintan las tarjetas del reparto (en centavos).
 */

import { fmtDateTime, fmtDateOnly } from "@/lib/datetime";
import { fmtMonto, fmtTc, fmtUsd } from "@/lib/format";
import { esDiaValido, esUuid } from "@/lib/admin/url-params";
import type { AvionReparto } from "@/types/profit-sharing";
import type {
  AvionDeSocio,
  ConfigurarCuentaPayload,
  CrearPagoSocioPayload,
  CuentaSocio,
  DetalleExcesoSaldo,
  EstadoCuentaRespuesta,
  EstadoCuentaSocio,
  MetodoPagoSocio,
  MonedaPagoSocio,
  MovimientoCuenta,
  PagoSocio,
  PatchPagoSocioPayload,
  PreCierreSocioCuenta,
  ResultadoPagoSocio,
  ResumenCuentaSocio,
  ResumenMesCuenta,
  SociosCuentaRespuesta,
  SocioRef,
  TotalesCuentasSocios,
  UltimoPagoSocio,
} from "@/types/reparto-pagos";

// =============================================================================
// Meses
// =============================================================================

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;


const MES_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DIA_ESTRICTO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Mes de arranque de una cuenta SIN configurar (el API usa el mismo). */
export const MES_CUENTA_DEFAULT = "2026-09";

/** ¿`YYYY-MM` válido? */
export function esMesValido(mes: string | null | undefined): mes is string {
  return typeof mes === "string" && MES_RE.test(mes);
}

/** `2026-09-01` / `2026-09` ⇒ `2026-09`; otra cosa ⇒ null. */
export function mesDeFecha(fecha: string | null | undefined): string | null {
  const m = typeof fecha === "string" ? fecha.slice(0, 7) : "";
  return esMesValido(m) ? m : null;
}

/** Mes de un día `YYYY-MM-DD` (hoy Cancún) ⇒ `YYYY-MM`. */
export function mesActual(hoy: string): string | null {
  return esDiaValido(hoy) ? hoy.slice(0, 7) : null;
}

/** Último día del mes (aritmética UTC: sin zonas horarias). */
function ultimoDia(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** `YYYY-MM` ⇒ del día 1 al último día. Mes inválido ⇒ null. */
export function rangoDeMes(mes: string): { desde: string; hasta: string } | null {
  const m = esMesValido(mes) ? MES_RE.exec(mes) : null;
  if (!m) return null;
  const dd = String(ultimoDia(Number(m[1]), Number(m[2]))).padStart(2, "0");
  return { desde: `${mes}-01`, hasta: `${mes}-${dd}` };
}

/**
 * `YYYY-MM` si el periodo es EXACTAMENTE un mes calendario (desde = día 1,
 * hasta = su último día); si no, null.
 */
export function mesDePeriodo(
  desde: string | null | undefined,
  hasta: string | null | undefined,
): string | null {
  if (!desde || !hasta) return null;
  if (!DIA_ESTRICTO_RE.test(desde) || !DIA_ESTRICTO_RE.test(hasta)) return null;
  if (!esDiaValido(desde) || !esDiaValido(hasta)) return null;
  const mes = desde.slice(0, 7);
  const rango = rangoDeMes(mes);
  if (!rango) return null;
  return rango.desde === desde && rango.hasta === hasta ? mes : null;
}

/** `2026-01` + n meses (n puede ser negativo). */
export function sumarMeses(mes: string, n: number): string | null {
  const m = esMesValido(mes) ? MES_RE.exec(mes) : null;
  if (!m) return null;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  const anio = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${anio}-${String(mm).padStart(2, "0")}`;
}

/** Mes anterior a un día `YYYY-MM-DD` (hoy Cancún) ⇒ `YYYY-MM`. */
export function mesAnterior(hoy: string): string | null {
  const mes = mesActual(hoy);
  return mes ? sumarMeses(mes, -1) : null;
}

/** Atajo «Mes pasado» del reparto (el cliente cierra septiembre en octubre). */
export function rangoMesPasado(hoy: string): { desde: string; hasta: string } | null {
  const mes = mesAnterior(hoy);
  return mes ? rangoDeMes(mes) : null;
}

/** Tope de meses que arma `mesesDeRango` (20 años): un dato basura no cuelga. */
const MESES_MAX = 240;

/**
 * Meses de `desde` a `hasta` INCLUSIVE, en orden (`2026-09`, `2026-10`).
 * Invertido o inválido ⇒ [].
 */
export function mesesDeRango(desde: string, hasta: string): string[] {
  if (!esMesValido(desde) || !esMesValido(hasta) || desde > hasta) return [];
  const out: string[] = [];
  let m: string | null = desde;
  while (m && m <= hasta && out.length < MESES_MAX) {
    out.push(m);
    m = sumarMeses(m, 1);
  }
  return out;
}

/** `2026-09` ⇒ «Septiembre 2026». */
export function etiquetaMes(mes: string): string {
  const m = esMesValido(mes) ? MES_RE.exec(mes) : null;
  if (!m) return mes;
  const nombre = MESES[Number(m[2]) - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${m[1]}`;
}

/** Meses que se ofrecen como arranque de la cuenta: ESPEJO de
    `MESES_CUENTA_MAX` del API (máximo 36 meses atrás, contando el actual). */
export const MESES_ARRANQUE_CUENTA = 36;

/**
 * Opciones del «Mes de arranque» (del más reciente al más viejo). Incluye
 * el mes que ya tiene la cuenta aunque sea más viejo que la ventana.
 */
export function opcionesMesArranque(
  hoy: string,
  actual?: string | null,
): { value: string; label: string }[] {
  const fin = mesActual(hoy);
  if (!fin) return [];
  const inicio = sumarMeses(fin, -(MESES_ARRANQUE_CUENTA - 1)) ?? fin;
  const meses = mesesDeRango(inicio, fin);
  if (actual && esMesValido(actual) && !meses.includes(actual) && actual < fin) {
    meses.unshift(actual);
  }
  return meses.reverse().map((m) => ({ value: m, label: etiquetaMes(m) }));
}

/** Tope de meses de un estado de cuenta: ESPEJO de `MESES_ESTADO_CUENTA_MAX`
    del API (más ⇒ 400 RANGO_INVALIDO). */
export const MESES_ESTADO_CUENTA_MAX = 120;

/**
 * Filtro desde/hasta (`YYYY-MM`) del estado de cuenta leído de la URL. Todo
 * lo que el API rechazaría con 400 RANGO_INVALIDO (y «Reintentar» jamás
 * arreglaría) se corrige AQUÍ, antes de pedirlo:
 *  - un mes inválido se IGNORA (default del API);
 *  - un `hasta` SUELTO (sin `desde`) se descarta: el `desde` por defecto es
 *    el arranque de la cuenta, que el panel no conoce aquí, y un `hasta`
 *    anterior a él es un rango invertido. El selector manda siempre los dos;
 *  - el rango invertido se endereza (como `rangoFiltro` de las listas);
 *  - con `mesHoy` (mes en curso, Cancún): un mes FUTURO se recorta a hoy y
 *    un `desde` más viejo que el tope del API se sube al tope.
 */
export function filtroMesesCuenta(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  mesHoy?: string | null,
): { desde?: string; hasta?: string } {
  let d = esMesValido(desde) ? desde : undefined;
  let h = esMesValido(hasta) ? hasta : undefined;
  if (h && !d) h = undefined;
  if (d && h && d > h) [d, h] = [h, d];
  if (esMesValido(mesHoy)) {
    if (d && d > mesHoy) d = mesHoy;
    if (h && h > mesHoy) h = mesHoy;
    const tope = sumarMeses(h ?? mesHoy, -(MESES_ESTADO_CUENTA_MAX - 1));
    if (d && tope && d < tope) d = tope;
  }
  return { desde: d, hasta: h };
}

/**
 * Opciones de los selectores «Desde / Hasta» del estado de cuenta (del mes
 * en curso hacia atrás). Arrancan en el MÁS VIEJO entre el arranque de la
 * cuenta, el `desde` que se está viendo y `mesMinimo` (la entrega más
 * antigua fechada antes del arranque): así una entrega anterior al arranque
 * siempre se puede alcanzar desde el selector, y el valor que se ve nunca
 * queda fuera de la lista.
 */
export function opcionesFiltroMeses(p: {
  cuentaDesdeMes: string;
  desde?: string | null;
  mesActual: string;
  mesMinimo?: string | null;
}): { value: string; label: string }[] {
  if (!esMesValido(p.mesActual)) return [];
  const candidatos = [p.cuentaDesdeMes, p.desde, p.mesMinimo, p.mesActual].filter(esMesValido);
  let inicio = candidatos.reduce((min, m) => (m < min ? m : min), p.mesActual);
  const tope = sumarMeses(p.mesActual, -(MESES_ESTADO_CUENTA_MAX - 1));
  if (tope && inicio < tope) inicio = tope;
  return mesesDeRango(inicio, p.mesActual)
    .reverse()
    .map((m) => ({ value: m, label: etiquetaMes(m) }));
}

/**
 * A dónde lleva elegir un mes en «Desde» o «Hasta»: SIEMPRE los dos meses
 * (un `hasta` suelto se descartaría) y nunca un rango invertido — si el
 * nuevo `desde` pasa al `hasta`, éste lo sigue (y al revés).
 */
export function destinoFiltroMeses(
  campo: "desde" | "hasta",
  valor: string,
  desde: string,
  hasta: string,
): { desde: string; hasta: string } {
  if (campo === "desde") return { desde: valor, hasta: valor > hasta ? valor : hasta };
  return { desde: valor < desde ? valor : desde, hasta: valor };
}

/** Aviso cuando el rango de meses de la dirección no era válido. */
export const TEXTO_FILTRO_MESES_IGNORADO =
  "El rango de meses de la dirección no era válido: se muestra toda la cuenta.";

// =============================================================================
// Estado de la cuenta (el estado VIENE del API; esto solo pinta)
// =============================================================================

/** Tolerancia del API (como los cobros): $1.00 USD. */
export const TOLERANCIA_SALDO_USD = 1;

const centavos = (n: number) => Math.round((Number(n) || 0) * 100);

/**
 * ESPEJO del `estadoCuenta` del API, SOLO para pintar un estado que el panel
 * no reconoce. Jamás decide dinero: |saldo| ≤ $1 ⇒ AL_CORRIENTE; > $1 ⇒
 * POR_ENTREGAR; < −$1 ⇒ ADELANTADO.
 */
export function estadoCuentaSocio(saldoUsd: number): EstadoCuentaSocio {
  const s = centavos(saldoUsd);
  const tol = TOLERANCIA_SALDO_USD * 100;
  if (s > tol) return "POR_ENTREGAR";
  if (s < -tol) return "ADELANTADO";
  return "AL_CORRIENTE";
}

const CLASE_AMBAR =
  "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400";
const CLASE_VERDE =
  "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
const CLASE_AZUL = "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300";

export interface EstiloEstadoCuenta {
  etiqueta: string;
  /** Clases del badge (fondo, texto y borde). */
  clase: string;
  /** Tono para pruebas y para quien necesite el color sin el badge. */
  tono: "ambar" | "verde" | "azul";
  /** Texto del `title`. */
  titulo: string;
}

export const ESTADOS_CUENTA_SOCIO: Record<EstadoCuentaSocio, EstiloEstadoCuenta> = {
  AL_CORRIENTE: {
    etiqueta: "Al corriente",
    clase: CLASE_VERDE,
    tono: "verde",
    titulo: "Se le ha entregado lo que ha generado (tolerancia de $1 USD).",
  },
  POR_ENTREGAR: {
    etiqueta: "Por entregar",
    clase: CLASE_AMBAR,
    tono: "ambar",
    titulo: "Ha generado más de lo que se le ha entregado: hay utilidad por entregarle.",
  },
  ADELANTADO: {
    etiqueta: "Adelantado",
    clase: CLASE_AZUL,
    tono: "azul",
    titulo:
      "Se le ha entregado más de lo que ha generado (un adelanto): el saldo está a favor de VuelaTour y se descuenta de sus próximas utilidades.",
  },
};

function esEstadoConocido(e: unknown): e is EstadoCuentaSocio {
  return typeof e === "string" && e in ESTADOS_CUENTA_SOCIO;
}

/** Estilo del estado: el del API manda; uno desconocido se pinta con el espejo. */
export function estiloEstadoCuenta(
  estado: string | null | undefined,
  saldoUsd: number,
): EstiloEstadoCuenta & { estado: EstadoCuentaSocio } {
  const e = esEstadoConocido(estado) ? estado : estadoCuentaSocio(saldoUsd);
  return { estado: e, ...ESTADOS_CUENTA_SOCIO[e] };
}

/**
 * Color del NÚMERO del saldo según el estado (no según un umbral propio):
 * ámbar por entregar, azul adelantado, normal al corriente.
 */
export function claseTextoSaldo(estado: string | null | undefined, saldoUsd: number): string {
  const { tono } = estiloEstadoCuenta(estado, saldoUsd);
  if (tono === "ambar") return "text-amber-700 dark:text-amber-400";
  if (tono === "azul") return "text-sky-700 dark:text-sky-300";
  return "";
}

/**
 * Color del SALDO CORRIDO de un renglón de movimientos. El API no manda un
 * estado por renglón: el color sale del ESPEJO (`estadoCuentaSocio`, la misma
 * tolerancia de $1 del API). Solo pinta; el número es el del API.
 */
export function claseTextoSaldoCorrido(saldoUsd: number): string {
  return claseTextoSaldo(null, saldoUsd);
}

export const ETIQUETA_KPI_POR_ENTREGAR_HOY = "Por entregar hoy";
export const ETIQUETA_KPI_ADELANTADO = "Adelantado (a favor de VuelaTour)";

/**
 * KPI del saldo de UN socio. Con la cuenta ADELANTADA el KPI no dice «Por
 * entregar hoy −$2,387.84» (se leía como una deuda con signo raro): dice
 * «Adelantado (a favor de VuelaTour)» con el monto en positivo — las mismas
 * palabras que el diálogo («Adelantado: $X USD a favor de VuelaTour»). El
 * estado es el del API; el monto es su `por_entregar_usd` sin el signo.
 */
export function kpiSaldoCuenta(
  estado: string | null | undefined,
  saldoUsd: number,
): { etiqueta: string; monto: number; adelantado: boolean } {
  const e = estiloEstadoCuenta(estado, saldoUsd).estado;
  if (e === "ADELANTADO") {
    return { etiqueta: ETIQUETA_KPI_ADELANTADO, monto: Math.abs(Number(saldoUsd) || 0), adelantado: true };
  }
  return { etiqueta: ETIQUETA_KPI_POR_ENTREGAR_HOY, monto: Number(saldoUsd) || 0, adelantado: false };
}

/** Columna del saldo en las tablas de socios (conserva el signo). */
export const ETIQUETA_COLUMNA_SALDO = "Saldo por entregar";
/** La misma columna en el reparto (saldo de TODA la cuenta, no del periodo). */
export const ETIQUETA_COLUMNA_SALDO_ACUMULADO = "Saldo por entregar (acumulado)";

/**
 * Marca bajo un saldo NEGATIVO de las tablas: «adelantado» (en azul). Sale
 * del estado del API; null si no está adelantado.
 */
export function marcaSaldoAdelantado(
  estado: string | null | undefined,
  saldoUsd: number,
): string | null {
  return estiloEstadoCuenta(estado, saldoUsd).estado === "ADELANTADO" ? "adelantado" : null;
}

// =============================================================================
// Textos
// =============================================================================

export const TITULO_PAGOS_SOCIOS = "Pagos a socios";
export const RUTA_PAGOS_SOCIOS = "/admin/profit-sharing/socios";

/** Banner de un socio cuya cuenta NO está configurada (default del API). */
export const TEXTO_CUENTA_NO_CONFIGURADA =
  "La cuenta de este socio arranca en septiembre 2026 con saldo 0. Si hubo repartos anteriores, configura el mes de arranque y el saldo inicial.";

/** Para quien SOLO consulta (ANALISTA / SOCIO): no puede configurarla. */
export const TEXTO_CUENTA_NO_CONFIGURADA_LECTURA =
  "La cuenta de este socio arranca en septiembre 2026 con saldo 0. Si hubo repartos anteriores, la oficina la ajusta.";
/** El SOCIO viendo SU cuenta. */
export const TEXTO_CUENTA_NO_CONFIGURADA_PROPIA =
  "Tu cuenta arranca en septiembre 2026 con saldo 0. Si hubo repartos anteriores, la oficina la ajusta.";

/**
 * Texto de la cuenta sin configurar SEGÚN QUIÉN LA VE: la instrucción
 * «configura…» solo a quien puede hacerlo (ADMIN/FACTURACION); a quien solo
 * consulta, un texto informativo (nunca una orden que no puede cumplir).
 */
export function textoCuentaNoConfigurada(p: { puedeConfigurar: boolean; esPropia?: boolean }): string {
  if (p.puedeConfigurar) return TEXTO_CUENTA_NO_CONFIGURADA;
  return p.esPropia ? TEXTO_CUENTA_NO_CONFIGURADA_PROPIA : TEXTO_CUENTA_NO_CONFIGURADA_LECTURA;
}

/** El mismo aviso para la lista: cuántos socios están en el default. */
export function textoSociosSinConfigurar(n: number): string | null {
  if (n <= 0) return null;
  const quien = n === 1 ? "1 socio tiene" : `${n} socios tienen`;
  return `${quien} la cuenta sin configurar: arranca en septiembre 2026 con saldo 0. Si hubo repartos anteriores, configura el mes de arranque y el saldo inicial («Configurar cuenta»).`;
}

export const TEXTO_CUENTAS_NO_DISPONIBLES = "Disponible cuando se actualice el servidor.";

export const TEXTO_ERROR_CARGA_CUENTAS =
  "No se pudieron cargar las cuentas de los socios. Pulsa Reintentar; si sigue igual, avisa a sistemas.";

export const AYUDA_PAGOS_SOCIOS =
  "Cuenta corriente de cada socio: lo que ha generado con las utilidades de sus aviones, lo que se le ha entregado y lo que falta por entregar. Un adelanto deja el saldo en negativo y se descuenta de sus próximas utilidades.";

export const AYUDA_SECCION_POR_ENTREGAR =
  "Lo que generó cada socio en el periodo mostrado y su saldo acumulado por entregar (de toda su cuenta, no solo del periodo).";

export const ETIQUETA_REGISTRAR_ENTREGA = "Registrar entrega";
export const ETIQUETA_VER_CUENTA = "Ver cuenta";
export const ETIQUETA_CONFIGURAR_CUENTA = "Configurar cuenta";

/** «Registrar entrega a Mauricio Roque» (nombre accesible del botón). */
export function etiquetaRegistrarEntrega(socio: string): string {
  return `${ETIQUETA_REGISTRAR_ENTREGA} a ${socio}`;
}

/** «Por entregar hoy: $1,395.94 USD» o, con saldo a favor, «Adelantado…». */
export function textoPorEntregarHoy(porEntregarUsd: number | null | undefined): string {
  if (porEntregarUsd == null || !Number.isFinite(Number(porEntregarUsd))) {
    return "Por entregar hoy: no se pudo leer (el servidor lo revisa al guardar).";
  }
  const c = centavos(Number(porEntregarUsd));
  if (c < -TOLERANCIA_SALDO_USD * 100) {
    return `Adelantado: ${fmtUsd(-c / 100)} USD a favor de VuelaTour (no hay nada por entregar).`;
  }
  return `Por entregar hoy: ${fmtUsd(Math.max(0, c) / 100)} USD`;
}

/** «incluye $206.10 de Octubre 2026 (en curso)» (null si es 0). */
export function textoMesEnCurso(mesEnCursoUsd: number, mes: string | null): string | null {
  if (centavos(mesEnCursoUsd) === 0) return null;
  const nombre = mes ? etiquetaMes(mes) : "el mes en curso";
  return `incluye ${fmtUsd(mesEnCursoUsd)} de ${nombre} (en curso: cambia día con día)`;
}

/**
 * Columna «Generó …» de la sección del reparto: con un MES completo,
 * «Generó en Septiembre 2026»; si no, «Generó del 01 oct 2026 al 15 oct
 * 2026».
 */
export function etiquetaGeneroPeriodo(desde: string, hasta: string): string {
  const mes = mesDePeriodo(desde, hasta);
  if (mes) return `Generó en ${etiquetaMes(mes)}`;
  return `Generó del ${fmtDateOnly(desde)} al ${fmtDateOnly(hasta)}`;
}

export const METODOS_PAGO_SOCIO: readonly { value: MetodoPagoSocio; etiqueta: string }[] = [
  { value: "TRANSFERENCIA", etiqueta: "Transferencia" },
  { value: "EFECTIVO", etiqueta: "Efectivo" },
  { value: "CHEQUE", etiqueta: "Cheque" },
  { value: "OTRO", etiqueta: "Otro" },
];

export function etiquetaMetodoPagoSocio(m: string | null | undefined): string {
  return METODOS_PAGO_SOCIO.find((x) => x.value === m)?.etiqueta ?? (m || "—");
}

/**
 * Monto de una entrega tal como se entregó: «$1,000 USD» o, en pesos,
 * «$70,000 MXN · T.C. 18.5 · ≈ $3,783.78 USD» (el equivalente lo calculó el
 * API: `monto_usd`).
 */
export function textoMontoPago(
  pago: Pick<PagoSocio, "monto" | "moneda" | "tc_usd_mxn" | "monto_usd">,
): string {
  const base = fmtMonto(pago.monto, pago.moneda);
  if (pago.moneda !== "MXN") return base;
  const tc = fmtTc(pago.tc_usd_mxn);
  return [base, tc ? `T.C. ${tc}` : null, `≈ ${fmtUsd(pago.monto_usd)} USD`]
    .filter(Boolean)
    .join(" · ");
}

/** Nombre o «—» (usuario borrado: jamás un uuid). */
function nombre(n: string | null | undefined): string {
  const t = (n ?? "").trim();
  return t || "—";
}

/** «Septiembre 2026 · N4142R» / «N4142R» / null (sin mes ni avión). */
function piezasCorrespondeA(pago: Pick<PagoSocio, "periodo" | "mes" | "aeronave">): string | null {
  const mes = mesDeFecha(pago.mes) ?? mesDeFecha(pago.periodo);
  const matricula = (pago.aeronave?.matricula ?? "").trim();
  const partes = [mes ? etiquetaMes(mes) : null, matricula || null].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/**
 * Una entrega SIN mes ni avión es una entrega «a cuenta» (descuenta del
 * saldo total). NO se llama «adelanto»: esa palabra queda SOLO para el saldo
 * negativo (ADELANTADO) y la confirmación del 409 PAGO_EXCEDE_SALDO. Antes
 * el pago normal de septiembre salía rotulado «Adelanto a cuenta» junto a
 * un «Al corriente».
 */
export const TEXTO_A_CUENTA = "A cuenta (sin mes)";

/**
 * «Corresponde a Septiembre 2026 · N4142R», «Corresponde a N4142R», o
 * «A cuenta (sin mes)» (sin mes ni avión: es informativo, no reparte).
 */
export function textoCorrespondeA(
  pago: Pick<PagoSocio, "periodo" | "mes" | "aeronave">,
): string {
  const piezas = piezasCorrespondeA(pago);
  return piezas ? `Corresponde a ${piezas}` : TEXTO_A_CUENTA;
}

/**
 * Concepto del renglón de una ENTREGA en el estado de cuenta: «Entrega ·
 * corresponde a Septiembre 2026 · N4142R» o «Entrega a cuenta (sin mes)».
 * Sustituye en pantalla al `concepto` del API, que repetía monto, T.C. y
 * referencia (ya están en el detalle de abajo) y decía «Adelanto a cuenta»
 * para toda entrega sin mes. Solo texto: el importe y el saldo son del API.
 */
export function conceptoEntregaCuenta(
  pago: Pick<PagoSocio, "periodo" | "mes" | "aeronave">,
): string {
  const piezas = piezasCorrespondeA(pago);
  return piezas ? `Entrega · corresponde a ${piezas}` : "Entrega a cuenta (sin mes)";
}

/** Detalle de una entrega en piezas (fecha · monto · método · entregó · …). */
export function piezasPago(pago: PagoSocio): {
  fecha: string;
  monto: string;
  metodo: string;
  entrego: string;
  recibio: string | null;
  factura: string | null;
  referencia: string | null;
  corresponde: string;
  registro: string;
} {
  const recibio = (pago.recibido_por ?? "").trim();
  const factura = (pago.factura_folio ?? "").trim();
  const referencia = (pago.referencia ?? "").trim();
  return {
    fecha: fmtDateOnly(pago.fecha_pago),
    monto: textoMontoPago(pago),
    metodo: etiquetaMetodoPagoSocio(pago.metodo),
    entrego: `Entregó: ${nombre(pago.entregado_por_nombre)}`,
    recibio: recibio ? `Recibió: ${recibio}` : null,
    factura: factura ? `Factura ${factura}` : null,
    referencia: referencia ? `Ref. ${referencia}` : null,
    corresponde: textoCorrespondeA(pago),
    registro: `Registró ${nombre(pago.created_by_nombre)} · ${fmtDateTime(pago.created_at)}`,
  };
}

/** «01 oct 2026 · $1,000 USD · Transferencia» (o «Sin entregas»). */
export function textoUltimoPago(u: UltimoPagoSocio | null | undefined): string {
  if (!u) return "Sin entregas";
  return [fmtDateOnly(u.fecha_pago), fmtMonto(u.monto, u.moneda), etiquetaMetodoPagoSocio(u.metodo)].join(
    " · ",
  );
}

/** Nombre accesible del botón del comprobante de UNA entrega. */
export function etiquetaComprobantePago(pago: PagoSocio): string {
  const { fecha, monto } = piezasPago(pago);
  return pago.comprobante_path
    ? `Reemplazar el comprobante de la entrega del ${fecha} por ${monto}`
    : `Adjuntar comprobante de la entrega del ${fecha} por ${monto}`;
}

export const CONFIRMAR_REEMPLAZO_COMPROBANTE = {
  titulo: "¿Reemplazar el comprobante?",
  descripcion: "El nuevo es el que se verá; el anterior se guarda por seguridad.",
  boton: "Elegir el nuevo comprobante",
} as const;

export const ETIQUETAS_TIPO_MOVIMIENTO: Record<string, string> = {
  SALDO_INICIAL: "Saldo inicial",
  SALDO_ANTERIOR: "Saldo anterior",
  UTILIDAD: "Utilidad",
  ENTREGA: "Entrega",
};

export function etiquetaTipoMovimiento(tipo: string | null | undefined): string {
  return ETIQUETAS_TIPO_MOVIMIENTO[tipo ?? ""] ?? (tipo || "Movimiento");
}

/**
 * Importes de un movimiento para sus dos columnas, con la convención del
 * API: `cargo_usd` SUMA a lo por entregar («Generó (+)»: utilidad —negativa
 * en un mes con pérdida— o saldo inicial a su favor) y `abono_usd` RESTA
 * («Entregado (−)»: entregas o saldo inicial ya adelantado). Tal cual; 0 ⇒
 * null (celda vacía, no «$0»).
 */
export function importesMovimiento(
  m: Pick<MovimientoCuenta, "abono_usd" | "cargo_usd">,
): { suma: number | null; resta: number | null } {
  const c = centavos(m.cargo_usd);
  const a = centavos(m.abono_usd);
  return { suma: c !== 0 ? c / 100 : null, resta: a !== 0 ? a / 100 : null };
}

/** ¿Es un renglón de saldo (inicial / anterior) y no un movimiento? */
export function esRenglonDeSaldo(tipo: string | null | undefined): boolean {
  return tipo === "SALDO_INICIAL" || tipo === "SALDO_ANTERIOR";
}

/** Tarjeta «Por mes» del estado de cuenta (descripción y columna). La
    columna agrupa las entregas por su FECHA (así lo calcula el API), no por
    el mes al que corresponden: una entrega del 1-oct por septiembre cae en
    octubre. */
export const AYUDA_POR_MES_CUENTA =
  "Lo que generó el socio cada mes con sus aviones y lo que se le entregó en ese mes calendario (no necesariamente por ese mes; el saldo está en Movimientos).";
export const ETIQUETA_COLUMNA_ENTREGADO_POR_FECHA = "Entregado (por fecha de entrega)";

/** Leyenda de las columnas del estado de cuenta. */
export const AYUDA_COLUMNAS_CUENTA =
  "Generó: la utilidad de sus aviones cada mes (negativa si el avión tuvo pérdida). Entregado: lo que se le dio. Saldo: lo que queda por entregarle; en negativo, lo que se le adelantó.";

// =============================================================================
// Confirmaciones
// =============================================================================

/** Lee el `details` del 409 PAGO_EXCEDE_SALDO (tolerante). */
export function detalleExcesoSaldo(details: unknown): DetalleExcesoSaldo | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  const n = (k: string) => {
    const v = d[k];
    if (v === null || v === undefined || v === "") return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const porEntregar = n("por_entregar_usd");
  const monto = n("monto_usd");
  const exceso = n("exceso_usd");
  if (porEntregar == null || monto == null || exceso == null) return null;
  return { por_entregar_usd: porEntregar, monto_usd: monto, exceso_usd: exceso };
}

export const BOTON_REGISTRAR_ADELANTO = "Registrar como adelanto";
export const BOTON_GUARDAR_ADELANTO = "Guardar como adelanto";
export const BOTON_REVISAR_MONTO = "Revisar el monto";

/**
 * Texto de la confirmación del ADELANTO (409 PAGO_EXCEDE_SALDO). Los tres
 * números son del API: lo que vale la entrega en USD, lo que había por
 * entregar y el exceso (= el saldo que queda a favor de VuelaTour).
 */
export function confirmacionAdelanto(
  details: unknown,
  tipo: "alta" | "edicion" = "alta",
): { titulo: string; descripcion: string } {
  const d = detalleExcesoSaldo(details);
  const titulo = "Esta entrega es un ADELANTO";
  const verbo = tipo === "alta" ? "¿Registrar?" : "¿Guardar?";
  if (!d) {
    return {
      titulo,
      descripcion: `Esta entrega supera lo que hay por entregar al socio. Se registrará como ADELANTO y el saldo quedará a favor de VuelaTour. ${verbo}`,
    };
  }
  const porEntregar = Math.max(0, d.por_entregar_usd);
  return {
    titulo,
    descripcion: `Esta entrega de ${fmtUsd(d.monto_usd)} USD supera lo que hay por entregar (${fmtUsd(
      porEntregar,
    )} USD). Se registrará como ADELANTO y el saldo quedará a favor de VuelaTour por ${fmtUsd(
      d.exceso_usd,
    )} USD. ${verbo}`,
  };
}

export function confirmacionEliminarPago(
  pago: Pick<PagoSocio, "monto" | "moneda" | "fecha_pago">,
  socioNombre: string,
): { titulo: string; descripcion: string; boton: string } {
  return {
    titulo: "¿Eliminar esta entrega?",
    descripcion: `${fmtMonto(pago.monto, pago.moneda)} del ${fmtDateOnly(
      pago.fecha_pago,
    )} a ${socioNombre}. Dejará de contar como entregado y su saldo por entregar se recalcula. Queda registro de quién la eliminó y por qué.`,
    boton: "Eliminar entrega",
  };
}

/**
 * La LLAMADA al servidor falló (red, 413/502 de Vercel): no se sabe si la
 * entrega entró. Reintentar desde el MISMO diálogo es seguro (mismo
 * `client_request_id`: el API no duplica).
 */
export const TEXTO_FALLO_RED_PAGO =
  "No se pudo confirmar la entrega con el servidor (falló la conexión). Vuelve a intentarlo desde aquí: no se duplica.";

/** Igual para la baja (si ya se eliminó, el API dice PAGO_NO_EXISTE). */
export const TEXTO_FALLO_RED_BAJA =
  "No se pudo confirmar la baja con el servidor (falló la conexión). Vuelve a intentarlo; si ya se eliminó, la lista se actualizará.";

export const TEXTO_FALLO_RED_CUENTA =
  "No se pudo confirmar el cambio con el servidor (falló la conexión). Vuelve a intentarlo.";

// =============================================================================
// Errores del API en es-MX (por `code`)
// =============================================================================

export const CODIGO_CUENTA_NO_DISPONIBLE = "CUENTA_SOCIO_NO_DISPONIBLE";
/** v1 (API 0.0.49): se tolera igual que el de v2. */
export const CODIGO_PAGOS_NO_DISPONIBLE_V1 = "PAGOS_SOCIOS_NO_DISPONIBLE";
export const CODIGO_EXCEDE_SALDO = "PAGO_EXCEDE_SALDO";
export const CODIGO_SOCIO_INVALIDO = "SOCIO_INVALIDO";
/** Estado de cuenta de un socio que no existe (404). */
export const CODIGO_SOCIO_NO_EXISTE = "SOCIO_NO_EXISTE";
/** Un SOCIO pidió la cuenta de otro (403). */
export const CODIGO_SOCIO_SOLO_SU_CUENTA = "SOCIO_SOLO_SU_CUENTA";
export const CODIGO_SOCIO_AJENO = "SOCIO_NO_ES_DE_LA_AERONAVE";
export const CODIGO_PAGO_NO_EXISTE = "PAGO_NO_EXISTE";
/** Otra persona cambió la entrega en ese instante: la pantalla está vieja. */
export const CODIGO_PAGO_CAMBIO_CONCURRENTE = "PAGO_CAMBIO_CONCURRENTE";
/** Alguien más cambió el comprobante de la entrega. */
export const CODIGO_COMPROBANTE_CAMBIO = "COMPROBANTE_CAMBIO";
/** Rango de meses que el API rechaza (desde > hasta o > 120 meses). */
export const CODIGO_RANGO_INVALIDO = "RANGO_INVALIDO";

/** ¿El error dice que lo que hay en pantalla ya está viejo (hay que refrescar)? */
export function errorPideRefrescar(code: string | null | undefined): boolean {
  return (
    code === CODIGO_PAGO_NO_EXISTE ||
    code === CODIGO_PAGO_CAMBIO_CONCURRENTE ||
    code === CODIGO_COMPROBANTE_CAMBIO
  );
}

/**
 * Textos del PANEL que GANAN al del API: el panel hace algo distinto a lo
 * que el API sugiere (p. ej. refresca la lista solo) o el API no manda
 * mensaje (red, espera).
 */
const MENSAJES_PANEL: Record<string, string> = {
  [CODIGO_EXCEDE_SALDO]: "La entrega supera lo que hay por entregar al socio.",
  [CODIGO_PAGO_NO_EXISTE]: "Esa entrega ya no existe (alguien la eliminó). Actualizamos la lista.",
  [CODIGO_PAGO_CAMBIO_CONCURRENTE]:
    "Otra persona cambió esta entrega en este momento. Actualizamos la lista: revísala y vuelve a intentarlo.",
  [CODIGO_COMPROBANTE_CAMBIO]:
    "Alguien más cambió el comprobante de esta entrega. Actualizamos la lista.",
  SIN_CONEXION: "No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.",
  TIEMPO_AGOTADO: "El servidor tardó demasiado y se canceló la espera. Vuelve a intentarlo.",
  // El API manda «La llave client_request_id…»: jerga que el operador no
  // entiende. El panel dice qué hacer.
  CLIENT_REQUEST_ID_EN_USO:
    "Este registro ya se usó para otra entrega. Cierra el diálogo y vuelve a abrirlo para registrar la entrega.",
};

/**
 * RESPALDO por código cuando el API no manda un texto útil (vacío, técnico o
 * en inglés). Con texto en español, se pinta el del API: sabe más del caso.
 */
const MENSAJES_RESPALDO: Record<string, string> = {
  [CODIGO_CUENTA_NO_DISPONIBLE]:
    "Las cuentas de los socios todavía no están disponibles en el servidor. No se guardó nada.",
  [CODIGO_PAGOS_NO_DISPONIBLE_V1]:
    "Las cuentas de los socios todavía no están disponibles en el servidor. No se guardó nada.",
  [CODIGO_SOCIO_INVALIDO]:
    "Esa persona no está registrada como socia de ningún avión. Revisa los socios en la ficha del avión.",
  [CODIGO_SOCIO_NO_EXISTE]:
    "Ese socio no existe o no es socio de ningún avión. Revisa los socios en la ficha del avión.",
  [CODIGO_SOCIO_SOLO_SU_CUENTA]: "Solo puedes consultar tu propia cuenta.",
  CUENTA_DESDE_FUTURA: "La cuenta no puede arrancar en un mes futuro.",
  CUENTA_DESDE_FUERA_DE_RANGO:
    "La cuenta puede arrancar como máximo 36 meses atrás. Si hubo repartos antes, súmalos en el saldo inicial.",
  SALDO_INICIAL_INVALIDO:
    "Revisa el saldo inicial: un número en dólares con máximo 2 decimales (negativo si ya se le había adelantado).",
  [CODIGO_SOCIO_AJENO]:
    "Esa persona no es socia del avión elegido en «Corresponde a». Elige otro avión o déjalo en «Sin avión».",
  TC_FUERA_DE_RANGO: "Revisa el tipo de cambio: está fuera del rango razonable.",
};

const TECNICO =
  /^(Internal server error|Request failed|Bad Request|Not Found|Unauthorized|Forbidden|Conflict|Service Unavailable)$/i;
/** Mensajes de validación de class-validator (en inglés). */
const VALIDACION_EN_INGLES = /\b(should|must|property|is not|not allowed)\b/i;

/**
 * Mensaje es-MX para un error de la cuenta de socios. Los códigos propios se
 * traducen aquí (fuente única); un mensaje del API ya en español se respeta;
 * lo técnico o en inglés se cambia por un texto que dice qué hacer.
 */
export function mensajeErrorCuentaSocio(
  code: string | null | undefined,
  message: string | null | undefined,
  status?: number | null,
): string {
  if (code && MENSAJES_PANEL[code]) return MENSAJES_PANEL[code];
  const msg = (message ?? "").trim();
  const usable = msg !== "" && !TECNICO.test(msg) && !VALIDACION_EN_INGLES.test(msg);
  if (code && MENSAJES_RESPALDO[code]) return usable ? msg : MENSAJES_RESPALDO[code];
  if (status === 401) return "Tu sesión expiró. Recarga la página e inicia sesión.";
  if (status === 403) {
    return "Tu rol no tiene permiso para esta acción en las cuentas de los socios. Pide a un administrador que lo haga.";
  }
  if (status === 404 && /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/.test(msg)) {
    return "El servidor todavía no tiene esta función (falta actualizarlo). Avisa a sistemas.";
  }
  if (status === 400 && (!msg || VALIDACION_EN_INGLES.test(msg))) {
    return "El servidor rechazó un dato. Revisa el formulario y vuelve a intentarlo.";
  }
  if (code === "PARSE_ERROR" || !msg || TECNICO.test(msg)) {
    return `El servidor respondió con error${status ? ` ${status}` : ""}. Vuelve a intentarlo; si sigue igual, avisa a sistemas.`;
  }
  return msg;
}

// =============================================================================
// Roles (espejo de los @Roles del API; el candado real es el API)
// =============================================================================

/** `GET /v1/profit-sharing/socios*` (SOCIO: solo lo suyo). */
export const ROLES_LEEN_CUENTAS_SOCIOS = ["ADMIN", "ANALISTA", "FACTURACION", "SOCIO"] as const;
/** Entregas (alta/edición/baja/comprobante) y «Configurar cuenta». */
export const ROLES_REGISTRAN_ENTREGAS = ["ADMIN", "FACTURACION"] as const;

export function puedeVerCuentasSocios(rol: string | null | undefined): boolean {
  return (ROLES_LEEN_CUENTAS_SOCIOS as readonly string[]).includes(rol ?? "");
}

export function puedeRegistrarEntregas(rol: string | null | undefined): boolean {
  return (ROLES_REGISTRAN_ENTREGAS as readonly string[]).includes(rol ?? "");
}

// =============================================================================
// Carga (tolerancia al API previo y a la falta de migración)
// =============================================================================

/** Lo que devuelven las lecturas del server (nunca lanzan). */
export type CargaCuentas<T> =
  /** `filtroIgnorado`: el API rechazó el rango de meses (400 RANGO_INVALIDO)
      y se volvió a pedir SIN filtro (toda la cuenta). */
  | { estado: "ok"; datos: T; filtroIgnorado?: boolean }
  /** API previo (404 «Cannot GET»), sin migración (`disponible:false` o el
      503 con su código) ⇒ «Disponible cuando se actualice el servidor». */
  | { estado: "no-disponible" }
  /** 401/403: el rol no lee esto (o un SOCIO pidió la cuenta de otro). */
  | { estado: "sin-permiso" }
  /** El socio no existe (404/400 `SOCIO_INVALIDO`). */
  | { estado: "no-existe" }
  /** Red, 500, 502/503 de un deploy… ⇒ «No se pudieron cargar» (jamás vacío). */
  | { estado: "error" };

/**
 * Clasifica el fallo de una LECTURA. Un 503 a secas es Railway desplegando
 * (el fetcher ya reintentó): es un fallo, no «falta la migración».
 */
export function clasificarFalloCarga(
  status: number | null | undefined,
  code: string | null | undefined,
  message?: string | null,
): "no-disponible" | "sin-permiso" | "no-existe" | "error" {
  if (status === 401 || status === 403) return "sin-permiso";
  if (code === CODIGO_CUENTA_NO_DISPONIBLE || code === CODIGO_PAGOS_NO_DISPONIBLE_V1) {
    return "no-disponible";
  }
  if (code === CODIGO_SOCIO_INVALIDO || code === CODIGO_SOCIO_NO_EXISTE) return "no-existe";
  if (status === 404) {
    // Nest sin la ruta (API previo) dice «Cannot GET /v1/…».
    return /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/.test((message ?? "").trim())
      ? "no-disponible"
      : "no-existe";
  }
  return "error";
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function numONull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function aeronaveRef(v: unknown): { id: string; matricula: string } | null {
  const a = obj(v);
  if (!a || typeof a.id !== "string") return null;
  return { id: a.id, matricula: typeof a.matricula === "string" ? a.matricula : "" };
}

function socioRef(v: unknown): SocioRef | null {
  const s = obj(v);
  if (!s || typeof s.id !== "string") return null;
  return {
    id: s.id,
    nombre: typeof s.nombre === "string" && s.nombre.trim() ? s.nombre : "Socio",
    rol: texto(s.rol),
    estado: texto(s.estado),
  };
}

/** Tipos numéricos sanos (PostgREST puede mandar `numeric` como texto). */
export function normalizarPago(raw: unknown): PagoSocio | null {
  const p = obj(raw);
  if (!p || typeof p.id !== "string") return null;
  return {
    ...(p as unknown as PagoSocio),
    socio_id: typeof p.socio_id === "string" ? p.socio_id : "",
    aeronave_id: texto(p.aeronave_id),
    periodo: texto(p.periodo),
    mes: mesDeFecha(texto(p.mes)) ?? mesDeFecha(texto(p.periodo)),
    monto: num(p.monto),
    monto_usd: num(p.monto_usd),
    tc_usd_mxn: numONull(p.tc_usd_mxn),
    utilidad_snapshot_usd: numONull(p.utilidad_snapshot_usd),
    saldo_snapshot_usd: numONull(p.saldo_snapshot_usd),
    entregado_por: texto(p.entregado_por),
    referencia: texto(p.referencia),
    recibido_por: texto(p.recibido_por),
    factura_folio: texto(p.factura_folio),
    comprobante_path: texto(p.comprobante_path),
    comprobante_url: texto(p.comprobante_url),
    notas: texto(p.notas),
    entregado_por_nombre: texto(p.entregado_por_nombre),
    created_by: texto(p.created_by),
    created_by_nombre: texto(p.created_by_nombre),
    created_at: typeof p.created_at === "string" ? p.created_at : "",
    fecha_pago: typeof p.fecha_pago === "string" ? p.fecha_pago.slice(0, 10) : "",
    aeronave: aeronaveRef(p.aeronave),
  };
}

function normalizarCuenta(raw: unknown): CuentaSocio {
  const c = obj(raw) ?? {};
  return {
    cuenta_desde: mesDeFecha(texto(c.cuenta_desde)) ?? MES_CUENTA_DEFAULT,
    saldo_inicial_usd: num(c.saldo_inicial_usd),
    notas: texto(c.notas),
    configurada: c.configurada === true,
    updated_at: texto(c.updated_at),
  };
}

function textos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

function normalizarUltimoPago(raw: unknown): UltimoPagoSocio | null {
  const u = obj(raw);
  if (!u || typeof u.id !== "string") return null;
  return {
    id: u.id,
    fecha_pago: typeof u.fecha_pago === "string" ? u.fecha_pago.slice(0, 10) : "",
    monto: num(u.monto),
    moneda: typeof u.moneda === "string" ? u.moneda : "USD",
    monto_usd: num(u.monto_usd),
    metodo: typeof u.metodo === "string" ? u.metodo : "",
  };
}

function normalizarAvionDeSocio(raw: unknown): AvionDeSocio | null {
  const a = obj(raw);
  if (!a || typeof a.id !== "string") return null;
  return {
    id: a.id,
    matricula: typeof a.matricula === "string" ? a.matricula : "",
    porcentaje: num(a.porcentaje),
    vigente: a.vigente !== false,
    activa: a.activa !== false,
  };
}

function normalizarAviones(v: unknown): AvionDeSocio[] {
  return Array.isArray(v)
    ? v.map(normalizarAvionDeSocio).filter((a): a is AvionDeSocio => a !== null)
    : [];
}

/** Un renglón del resumen con tipos sanos (sin socio ⇒ null). */
export function normalizarResumen(raw: unknown): ResumenCuentaSocio | null {
  const r = obj(raw);
  const socio = socioRef(r?.socio);
  if (!r || !socio) return null;
  return {
    socio,
    cuenta: normalizarCuenta(r.cuenta),
    generado_usd: num(r.generado_usd),
    mes_en_curso_usd: num(r.mes_en_curso_usd),
    entregado_usd: num(r.entregado_usd),
    por_entregar_usd: num(r.por_entregar_usd),
    estado: typeof r.estado === "string" ? r.estado : "",
    ultimo_pago: normalizarUltimoPago(r.ultimo_pago),
    aviones: normalizarAviones(r.aviones),
    avisos: textos(r.avisos),
  };
}

function normalizarTotales(raw: unknown): TotalesCuentasSocios | null {
  const t = obj(raw);
  if (!t) return null;
  return {
    generado_usd: num(t.generado_usd),
    entregado_usd: num(t.entregado_usd),
    por_entregar_usd: num(t.por_entregar_usd),
    adelantado_usd: num(t.adelantado_usd),
    socios_por_entregar: num(t.socios_por_entregar),
    socios_adelantados: num(t.socios_adelantados),
  };
}

/**
 * `GET /v1/profit-sharing/socios` con tipos sanos. Algo que no es objeto ⇒
 * null (la página lo trata como fallo, nunca como «sin socios»).
 */
export function normalizarRespuestaSocios(raw: unknown): SociosCuentaRespuesta | null {
  const r = obj(raw);
  if (!r) return null;
  return {
    disponible: r.disponible !== false,
    hasta_mes: typeof r.hasta_mes === "string" ? r.hasta_mes.slice(0, 7) : "",
    socios: Array.isArray(r.socios)
      ? r.socios.map(normalizarResumen).filter((s): s is ResumenCuentaSocio => s !== null)
      : [],
    totales: normalizarTotales(r.totales),
  };
}

function normalizarMovimiento(raw: unknown): MovimientoCuenta | null {
  const m = obj(raw);
  if (!m || typeof m.tipo !== "string") return null;
  return {
    fecha: typeof m.fecha === "string" ? m.fecha.slice(0, 10) : "",
    tipo: m.tipo,
    concepto: typeof m.concepto === "string" ? m.concepto : "",
    mes: mesDeFecha(texto(m.mes)),
    aeronave: aeronaveRef(m.aeronave),
    porcentaje: numONull(m.porcentaje),
    cargo_usd: num(m.cargo_usd),
    abono_usd: num(m.abono_usd),
    saldo_usd: num(m.saldo_usd),
    en_curso: m.en_curso === true,
    pago: normalizarPago(m.pago),
  };
}

function normalizarMes(raw: unknown): ResumenMesCuenta | null {
  const m = obj(raw);
  const mes = mesDeFecha(texto(m?.mes));
  if (!m || !mes) return null;
  return {
    mes,
    utilidad_usd: num(m.utilidad_usd),
    en_curso: m.en_curso === true,
    entregado_usd: num(m.entregado_usd),
    por_avion: Array.isArray(m.por_avion)
      ? m.por_avion
          .map((a) => {
            const x = obj(a);
            const aeronave = aeronaveRef(x?.aeronave);
            if (!x || !aeronave) return null;
            return { aeronave, porcentaje: num(x.porcentaje), monto_usd: num(x.monto_usd) };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null)
      : [],
  };
}

/** `GET …/estado-cuenta` con tipos sanos (sin socio ⇒ null = fallo). */
export function normalizarEstadoCuenta(raw: unknown): EstadoCuentaRespuesta | null {
  const r = obj(raw);
  const socio = socioRef(r?.socio);
  if (!r || !socio) return null;
  const t = obj(r.totales) ?? {};
  const rango = obj(r.rango);
  return {
    disponible: r.disponible !== false,
    socio,
    cuenta: normalizarCuenta(r.cuenta),
    desde: mesDeFecha(texto(r.desde)) ?? "",
    hasta: mesDeFecha(texto(r.hasta)) ?? "",
    saldo_anterior_usd: num(r.saldo_anterior_usd),
    movimientos: Array.isArray(r.movimientos)
      ? r.movimientos.map(normalizarMovimiento).filter((m): m is MovimientoCuenta => m !== null)
      : [],
    por_mes: Array.isArray(r.por_mes)
      ? r.por_mes.map(normalizarMes).filter((m): m is ResumenMesCuenta => m !== null)
      : [],
    totales: {
      generado_usd: num(t.generado_usd),
      mes_en_curso_usd: num(t.mes_en_curso_usd),
      entregado_usd: num(t.entregado_usd),
      por_entregar_usd: num(t.por_entregar_usd),
      estado: typeof t.estado === "string" ? t.estado : "",
    },
    aviones: normalizarAviones(r.aviones),
    rango: rango
      ? {
          generado_usd: num(rango.generado_usd),
          entregado_usd: num(rango.entregado_usd),
          saldo_final_usd: num(rango.saldo_final_usd),
        }
      : null,
    avisos: textos(r.avisos),
  };
}

// =============================================================================
// Qué pinta cada pantalla
// =============================================================================

/** `/admin/profit-sharing/socios/<id>` (con el filtro de meses, si hay). */
export function hrefCuentaSocio(
  socioId: string,
  filtro?: { desde?: string | null; hasta?: string | null },
): string {
  const qs = new URLSearchParams();
  if (filtro?.desde && esMesValido(filtro.desde)) qs.set("desde", filtro.desde);
  if (filtro?.hasta && esMesValido(filtro.hasta)) qs.set("hasta", filtro.hasta);
  const q = qs.toString();
  return `${RUTA_PAGOS_SOCIOS}/${socioId}${q ? `?${q}` : ""}`;
}

/** Usuario elegible como «Entregó». */
export interface UsuarioEntrega {
  id: string;
  nombre: string;
}

/**
 * Lo que necesita el diálogo «Registrar entrega» de UN socio: sale del
 * renglón del resumen (`GET /socios`) y lo arma esta función, la misma en
 * las tres pantallas que lo abren.
 */
export interface ContextoEntrega {
  socio: { id: string; nombre: string };
  /** null = no se pudo leer (el API decide al guardar). */
  porEntregarUsd: number | null;
  /** Parte de `porEntregarUsd` que es utilidad del mes EN CURSO (todavía
      cambia): el diálogo lo dice junto a «Por entregar hoy». Del API. */
  mesEnCursoUsd: number;
  /** `YYYY-MM` del mes en curso (null = no se sabe: «el mes en curso»). */
  mesEnCurso: string | null;
  aviones: AvionDeSocio[];
  /** `YYYY-MM` de arranque de la cuenta (opciones de «Corresponde a»). */
  cuentaDesdeMes: string;
  /** «Corresponde al mes» prellenado: el mes COMPLETO que se ve en el
      Reparto (p. ej. «Mes pasado»). null = «Sin mes (a cuenta)». */
  mesSugerido: string | null;
}

/** Lo que la pantalla que abre el diálogo sabe además del renglón. */
export interface ExtrasContextoEntrega {
  /** `YYYY-MM` del mes en curso (el `hasta_mes` del resumen o hoy Cancún). */
  mesEnCurso?: string | null;
  /** Mes COMPLETO del periodo que se está viendo (Reparto con «Mes pasado»). */
  mesSugerido?: string | null;
}

export function contextoEntrega(
  r: ResumenCuentaSocio,
  extras: ExtrasContextoEntrega = {},
): ContextoEntrega {
  return {
    socio: { id: r.socio.id, nombre: r.socio.nombre },
    porEntregarUsd: r.por_entregar_usd,
    mesEnCursoUsd: Number(r.mes_en_curso_usd) || 0,
    mesEnCurso: esMesValido(extras.mesEnCurso) ? extras.mesEnCurso : null,
    aviones: r.aviones,
    cuentaDesdeMes: mesDeFecha(r.cuenta.cuenta_desde) ?? MES_CUENTA_DEFAULT,
    mesSugerido: esMesValido(extras.mesSugerido) ? extras.mesSugerido : null,
  };
}

/**
 * El mismo contexto desde el ESTADO DE CUENTA: sus `totales` son los de
 * TODA la cuenta HOY (aunque el filtro de meses sea otro), así que su
 * `por_entregar_usd` es el «por entregar hoy» del diálogo.
 */
export function contextoEntregaDeEstadoCuenta(
  e: EstadoCuentaRespuesta,
  extras: ExtrasContextoEntrega = {},
): ContextoEntrega {
  return {
    socio: { id: e.socio.id, nombre: e.socio.nombre },
    porEntregarUsd: e.totales.por_entregar_usd,
    mesEnCursoUsd: Number(e.totales.mes_en_curso_usd) || 0,
    mesEnCurso: esMesValido(extras.mesEnCurso) ? extras.mesEnCurso : null,
    aviones: e.aviones ?? [],
    cuentaDesdeMes: mesDeFecha(e.cuenta.cuenta_desde) ?? MES_CUENTA_DEFAULT,
    mesSugerido: esMesValido(extras.mesSugerido) ? extras.mesSugerido : null,
  };
}

// -----------------------------------------------------------------------------
// Entregas fechadas ANTES del arranque de la cuenta
// -----------------------------------------------------------------------------

/**
 * ¿El estado de cuenta ESCONDE entregas anteriores al arranque? Con el
 * `desde` en el arranque (o antes), lo único que el API junta en el renglón
 * SALDO_ANTERIOR («Saldo al cierre de …») son entregas fechadas antes de
 * `desde`: cuentan en el saldo pero no tienen renglón (ni Editar, ni
 * Eliminar, ni comprobante). Con un `desde` POSTERIOR al arranque el
 * SALDO_ANTERIOR es normal (utilidades y entregas previas al filtro).
 */
export function escondeEntregasAntesDelArranque(
  e: Pick<EstadoCuentaRespuesta, "desde" | "movimientos">,
  cuentaDesdeMes: string,
): boolean {
  if (!esMesValido(e.desde) || !esMesValido(cuentaDesdeMes) || e.desde > cuentaDesdeMes) return false;
  return e.movimientos.some((m) => m.tipo === "SALDO_ANTERIOR");
}

/** Último día ANTES del arranque (`2026-09` ⇒ `2026-08-31`). */
export function diaAntesDelArranque(cuentaDesdeMes: string): string | null {
  const previo = esMesValido(cuentaDesdeMes) ? sumarMeses(cuentaDesdeMes, -1) : null;
  return previo ? (rangoDeMes(previo)?.hasta ?? null) : null;
}

/**
 * Mes desde el que hay que ver la cuenta para que las entregas anteriores
 * al arranque salgan como movimientos: el de la MÁS ANTIGUA (si se pudo
 * leer) o, si no, la ventana de 36 meses del arranque; siempre dentro del
 * tope del API y nunca después del arranque.
 */
export function mesParaVerEntregasPrevias(p: {
  mesMasAntiguo: string | null;
  cuentaDesdeMes: string;
  mesActual: string;
}): string | null {
  if (!esMesValido(p.mesActual) || !esMesValido(p.cuentaDesdeMes)) return null;
  let mes =
    p.mesMasAntiguo && esMesValido(p.mesMasAntiguo)
      ? p.mesMasAntiguo
      : sumarMeses(p.mesActual, -(MESES_ARRANQUE_CUENTA - 1));
  if (!mes) return null;
  const tope = sumarMeses(p.mesActual, -(MESES_ESTADO_CUENTA_MAX - 1));
  if (tope && mes < tope) mes = tope;
  const previo = sumarMeses(p.cuentaDesdeMes, -1);
  if (previo && mes > previo) mes = previo;
  return mes;
}

/**
 * Aviso + enlace cuando el estado de cuenta esconde entregas previas. Va
 * junto al aviso del API («Hay N entrega(s) con fecha anterior al
 * arranque…: sí descuentan del saldo…»), así que NO lo repite: dice dónde
 * están y qué hacer.
 */
export function textoEntregasAntesDelArranque(n: number | null, cuentaDesdeMes: string): string {
  const arranque = `con fecha anterior al arranque (${etiquetaMes(cuentaDesdeMes)})`;
  if (n === 1) {
    return `La entrega ${arranque} va sumada en el «Saldo al cierre» y no tiene renglón aquí. Ábrela para verla, corregirla o adjuntar su comprobante.`;
  }
  const cuales = n == null ? "Las entregas" : `Las ${n} entregas`;
  return `${cuales} ${arranque} van sumadas en el «Saldo al cierre» y no tienen renglón aquí. Ábrelas para verlas, corregirlas o adjuntar su comprobante.`;
}
export const ETIQUETA_VER_ENTREGAS_PREVIAS = "Ver entregas anteriores al arranque";

/**
 * Aviso bajo la FECHA del diálogo cuando cae antes del arranque de la
 * cuenta (un dedazo de año: «2025» por «2026»). No bloquea —el API la
 * acepta y sí descuenta—, pero se dice ANTES de guardar.
 */
export function avisoFechaAntesDelArranque(
  fecha: string,
  cuentaDesdeMes: string,
): string | null {
  if (!esDiaValido(fecha) || !esMesValido(cuentaDesdeMes)) return null;
  if (fecha >= `${cuentaDesdeMes}-01`) return null;
  return `Esta fecha es anterior al arranque de la cuenta (${etiquetaMes(
    cuentaDesdeMes,
  )}): sí descontará del saldo, pero no saldrá en los movimientos desde el arranque. Revisa el año.`;
}

/** Lo que comparten todos los diálogos de la página (quién registra, etc.). */
export interface ContextoRegistro {
  /** Opciones de «Entregó» (usuarios activos; vacío si no se pudieron leer). */
  usuarios: UsuarioEntrega[];
  me: UsuarioEntrega;
  /** Hoy en Cancún del servidor (`YYYY-MM-DD`): solo RESPALDO. */
  hoy: string;
  /** T.C. oficial de referencia de HOY (prellena una entrega en pesos). */
  tcOficial: number | null;
}

/**
 * Lo que GENERÓ cada socio en el periodo de la página del reparto: la SUMA
 * (en centavos) de su `monto_usd` en las tarjetas de los aviones — los
 * mismos números que ya están en pantalla, no un cálculo nuevo.
 */
export function generadoPorSocioEnPeriodo(
  aviones: readonly Pick<AvionReparto, "reparto">[],
): Map<string, number> {
  const c = new Map<string, number>();
  for (const a of aviones) {
    for (const s of a.reparto ?? []) {
      c.set(s.socio_id, (c.get(s.socio_id) ?? 0) + centavos(s.monto_usd));
    }
  }
  return new Map([...c].map(([k, v]) => [k, v / 100]));
}

/** Renglón de «Socios · por entregar» del reparto. */
export interface FilaSocioPorEntregar {
  resumen: ResumenCuentaSocio;
  /** Lo que generó en el periodo mostrado (0 si no tiene socios ahí). */
  genero_periodo_usd: number;
}

/**
 * Renglones de la sección del reparto: TODOS los socios del resumen (un
 * SOCIO solo recibe el suyo), en el orden del API, con lo que generaron en
 * el periodo. Un socio del periodo que no está en el resumen no se inventa.
 */
export function filasSociosPorEntregar(
  socios: readonly ResumenCuentaSocio[],
  generado: ReadonlyMap<string, number>,
): FilaSocioPorEntregar[] {
  return socios.map((r) => ({ resumen: r, genero_periodo_usd: generado.get(r.socio.id) ?? 0 }));
}

/** Cuántos socios del resumen están en el default (sin configurar). */
export function sociosSinConfigurar(socios: readonly ResumenCuentaSocio[]): number {
  return socios.filter((s) => !s.cuenta.configurada).length;
}

/** Opciones de «Entregó» (usuarios activos + yo + el actual de la entrega). */
export function opcionesEntrego(
  usuarios: readonly UsuarioEntrega[],
  me: UsuarioEntrega | null | undefined,
  actual?: { id: string | null | undefined; nombre: string | null | undefined } | null,
): { value: string; label: string; description?: string }[] {
  const mapa = new Map<string, string>();
  for (const u of usuarios) if (u.id) mapa.set(u.id, u.nombre || "Usuario");
  if (me?.id && !mapa.has(me.id)) mapa.set(me.id, me.nombre || "Yo");
  if (actual?.id && !mapa.has(actual.id)) mapa.set(actual.id, actual.nombre || "Usuario");
  return [...mapa]
    .map(([value, label]) => ({
      value,
      label,
      ...(value === me?.id ? { description: "Tú" } : {}),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/** Valor del selector cuando NO corresponde a un mes / avión. */
export const SIN_MES = "SIN_MES";
export const SIN_AVION = "SIN_AVION";

/** Etiqueta de la opción «sin mes» del «Corresponde a». */
export const ETIQUETA_SIN_MES = "Sin mes (a cuenta)";

/**
 * «Corresponde a» · mes: «Sin mes (a cuenta)» y los meses de la cuenta,
 * del actual al de arranque.
 */
export function opcionesCorrespondeMes(
  cuentaDesdeMes: string,
  hoy: string,
  /** En la edición, el mes que ya tiene la entrega (aunque sea anterior). */
  actual?: string | null,
): { value: string; label: string }[] {
  const fin = mesActual(hoy);
  const desde = esMesValido(cuentaDesdeMes) ? cuentaDesdeMes : MES_CUENTA_DEFAULT;
  const meses = fin ? mesesDeRango(desde < fin ? desde : fin, fin).reverse() : [];
  if (actual && esMesValido(actual) && !meses.includes(actual)) meses.push(actual);
  return [
    { value: SIN_MES, label: ETIQUETA_SIN_MES },
    ...meses.map((m) => ({ value: m, label: etiquetaMes(m) })),
  ];
}

/** «Corresponde a» · avión: «Sin avión» y los aviones del socio. */
export function opcionesCorrespondeAvion(
  aviones: readonly AvionDeSocio[],
  /** En la edición, el avión que ya tiene la entrega (aunque no esté en la lista). */
  actual?: { id: string; matricula: string } | null,
): { value: string; label: string; description?: string }[] {
  const out: { value: string; label: string; description?: string }[] = [
    { value: SIN_AVION, label: "Sin avión" },
    ...aviones.map((a) => ({
      value: a.id,
      label: a.matricula || "Avión",
      description: `${fmtPct(a.porcentaje)}${a.vigente ? "" : " · ya no vigente"}`,
    })),
  ];
  if (actual?.id && !aviones.some((a) => a.id === actual.id)) {
    out.push({ value: actual.id, label: actual.matricula || "Avión" });
  }
  return out;
}

/** «69 %» · «33.333 %» · «12.5 %» (espejo de `fmtPorcentaje` del API). */
export function fmtPct(n: number): string {
  const r = Math.round((Number(n) || 0) * 1000) / 1000;
  return `${r} %`;
}

/** «N4142R 69 %», con «(ya no vigente)» si ya no es socio de ese avión hoy. */
export function textoAvionDeSocio(a: Pick<AvionDeSocio, "matricula" | "porcentaje" | "vigente">): string {
  return `${a.matricula || "(sin matrícula)"} ${fmtPct(a.porcentaje)}${a.vigente ? "" : " (ya no vigente)"}`;
}

// =============================================================================
// Formulario «Registrar entrega» / «Editar entrega»
// =============================================================================

export const REFERENCIA_MAX = 120;
export const RECIBIDO_POR_MAX = 120;
export const FACTURA_FOLIO_MAX = 60;
export const NOTAS_PAGO_MAX = 500;
export const NOTAS_CUENTA_MAX = 500;
export const MOTIVO_BAJA_MIN = 5;
export const MOTIVO_BAJA_MAX = 300;
/** Tope de una entrega: ESPEJO de `MONTO_PAGO_MAX` del API (numeric(12,2)). */
const MONTO_MAX = 99_999_999.99;

export interface FormPagoSocio {
  monto: string;
  moneda: MonedaPagoSocio;
  tc: string;
  fecha_pago: string;
  metodo: MetodoPagoSocio | "";
  entregado_por_id: string;
  recibido_por: string;
  referencia: string;
  factura_folio: string;
  notas: string;
  /** «Corresponde a» · `YYYY-MM` o `SIN_MES`. */
  mes: string;
  /** «Corresponde a» · uuid o `SIN_AVION`. */
  aeronave_id: string;
}

export type ErroresFormPago = Partial<Record<keyof FormPagoSocio, string>>;

/** «1,234.5» ⇒ 1234.5; vacío o basura ⇒ NaN. */
export function leerNumero(v: string): number {
  const limpio = (v ?? "").replace(/[\s,$]/g, "");
  if (!limpio) return NaN;
  return Number(limpio);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Prellenado del alta: monto = POR ENTREGAR del API (si es positivo), USD,
 * fecha de hoy (Cancún), «Entregó» = quien registra, sin avión y el mes
 * SUGERIDO (el mes completo que se ve en el Reparto) o «Sin mes (a
 * cuenta)». El MÉTODO NO se prellena: un medio de pago por defecto se cuela
 * sin que nadie lo revise (regla del 3-sep-2026 en gastos).
 */
export function formInicialAlta(p: {
  porEntregarUsd: number | null | undefined;
  hoy: string;
  meId: string | null | undefined;
  mesSugerido?: string | null;
}): FormPagoSocio {
  const porEntregar = Number(p.porEntregarUsd);
  return {
    monto:
      p.porEntregarUsd != null && Number.isFinite(porEntregar) && round2(porEntregar) > 0
        ? round2(porEntregar).toFixed(2)
        : "",
    moneda: "USD",
    tc: "",
    fecha_pago: p.hoy,
    metodo: "",
    entregado_por_id: p.meId ?? "",
    recibido_por: "",
    referencia: "",
    factura_folio: "",
    notas: "",
    // El API rechaza un mes FUTURO (MES_FUTURO): ese no se sugiere.
    mes:
      esMesValido(p.mesSugerido) && p.mesSugerido <= (mesActual(p.hoy) ?? "")
        ? p.mesSugerido
        : SIN_MES,
    aeronave_id: SIN_AVION,
  };
}

/**
 * Cambio de MONEDA. En el ALTA el monto llega prellenado con lo por entregar
 * en DÓLARES: si el operador pasa a MXN sin haberlo tocado, ese número ya no
 * significa nada y se VACÍA; al volver a USD con el campo vacío se restaura.
 * Al pasar a MXN con el T.C. vacío se prellena el T.C. oficial de HOY (si el
 * panel lo tiene). Un monto tecleado nunca se toca. En la EDICIÓN
 * (`montoPrellenado` null) solo cambia la moneda.
 */
export function formAlCambiarMoneda(
  form: FormPagoSocio,
  moneda: MonedaPagoSocio,
  montoPrellenado: string | null,
  tcOficial: number | null = null,
): FormPagoSocio {
  if (form.moneda === moneda) return form;
  const prellenado = (montoPrellenado ?? "").trim();
  const monto = form.monto.trim();
  let out: FormPagoSocio = { ...form, moneda };
  if (prellenado && moneda === "MXN" && monto === prellenado) out = { ...out, monto: "" };
  if (prellenado && moneda === "USD" && monto === "") out = { ...out, monto: prellenado };
  if (
    moneda === "MXN" &&
    form.tc.trim() === "" &&
    tcOficial != null &&
    Number.isFinite(tcOficial) &&
    tcOficial > 0
  ) {
    out = { ...out, tc: String(round6(tcOficial)) };
  }
  return out;
}

/** «Monto entregado (USD)» / «Monto entregado (MXN)»: la moneda a la vista. */
export function etiquetaMontoPago(moneda: MonedaPagoSocio): string {
  return `Monto entregado (${moneda})`;
}

/** Ayuda bajo el monto del ALTA. */
export function hintMontoPago(p: {
  moneda: MonedaPagoSocio;
  porEntregarUsd: number | null | undefined;
  alta: boolean;
}): string | null {
  if (!p.alta) return null;
  const porEntregar = Number(p.porEntregarUsd);
  const con = p.porEntregarUsd != null && Number.isFinite(porEntregar) && round2(porEntregar) > 0;
  if (p.moneda === "MXN") {
    return con
      ? `Captura el monto en pesos; por entregar ${fmtUsd(porEntregar)} USD.`
      : "Captura el monto en pesos.";
  }
  return con ? `Prellenado con lo que hay por entregar: ${fmtUsd(porEntregar)} USD.` : null;
}

/** Ayuda del T.C. (dice de dónde salió el prellenado). */
export function hintTcPago(p: { tc: string; tcOficial: number | null; hoy: string }): string {
  const base = "La entrega descuenta su equivalente en dólares (monto ÷ T.C.); el sistema lo calcula al guardar.";
  if (p.tcOficial != null && p.tc.trim() !== "" && round6(leerNumero(p.tc)) === round6(p.tcOficial)) {
    return `T.C. oficial de referencia de hoy (${fmtDateOnly(p.hoy)}) — puedes editarlo. ${base}`;
  }
  return base;
}

/** Formulario de edición con lo que ya tiene la entrega. */
export function formDePago(pago: PagoSocio): FormPagoSocio {
  return {
    monto: String(pago.monto),
    moneda: pago.moneda === "MXN" ? "MXN" : "USD",
    tc: pago.tc_usd_mxn != null ? String(pago.tc_usd_mxn) : "",
    fecha_pago: pago.fecha_pago,
    metodo: METODOS_PAGO_SOCIO.some((m) => m.value === pago.metodo)
      ? (pago.metodo as MetodoPagoSocio)
      : "",
    entregado_por_id: pago.entregado_por ?? "",
    recibido_por: pago.recibido_por ?? "",
    referencia: pago.referencia ?? "",
    factura_folio: pago.factura_folio ?? "",
    notas: pago.notas ?? "",
    mes: mesDeFecha(pago.mes) ?? mesDeFecha(pago.periodo) ?? SIN_MES,
    aeronave_id: pago.aeronave_id ?? SIN_AVION,
  };
}

/** Errores del formulario (vacío = válido). `hoy` = día Cancún. */
export function validarFormPago(form: FormPagoSocio, hoy: string): ErroresFormPago {
  const e: ErroresFormPago = {};
  const monto = leerNumero(form.monto);
  if (!Number.isFinite(monto) || round2(monto) <= 0) {
    e.monto = "Captura el monto que se entregó (mayor a 0).";
  } else if (monto > MONTO_MAX) {
    e.monto = "El monto es demasiado grande.";
  }
  if (form.moneda === "MXN") {
    const tc = leerNumero(form.tc);
    if (!Number.isFinite(tc) || tc <= 0) {
      e.tc = "Captura el tipo de cambio de la entrega en pesos.";
    }
  }
  if (!esDiaValido(form.fecha_pago)) {
    e.fecha_pago = "Elige la fecha en que se entregó.";
  } else if (esDiaValido(hoy) && form.fecha_pago > hoy) {
    e.fecha_pago = "La fecha de la entrega no puede ser futura.";
  }
  if (!METODOS_PAGO_SOCIO.some((m) => m.value === form.metodo)) {
    e.metodo = "Elige cómo se entregó.";
  }
  if (form.entregado_por_id && !esUuid(form.entregado_por_id)) {
    e.entregado_por_id = "Elige quién entregó el dinero.";
  }
  if (form.mes !== SIN_MES && !esMesValido(form.mes)) {
    e.mes = "Elige el mes o «Sin mes».";
  }
  if (form.aeronave_id !== SIN_AVION && !esUuid(form.aeronave_id)) {
    e.aeronave_id = "Elige el avión o «Sin avión».";
  }
  if (form.recibido_por.trim().length > RECIBIDO_POR_MAX) {
    e.recibido_por = `Máximo ${RECIBIDO_POR_MAX} caracteres.`;
  }
  if (form.referencia.trim().length > REFERENCIA_MAX) {
    e.referencia = `Máximo ${REFERENCIA_MAX} caracteres.`;
  }
  if (form.factura_folio.trim().length > FACTURA_FOLIO_MAX) {
    e.factura_folio = `Máximo ${FACTURA_FOLIO_MAX} caracteres.`;
  }
  if (form.notas.trim().length > NOTAS_PAGO_MAX) {
    e.notas = `Máximo ${NOTAS_PAGO_MAX} caracteres.`;
  }
  return e;
}

export function hayErrores(e: object): boolean {
  return Object.keys(e).length > 0;
}

/** Cuerpo del `POST` (el formulario ya validado). Vacíos NO viajan. */
export function payloadAltaPago(
  form: FormPagoSocio,
  ctx: {
    socio_id: string;
    client_request_id?: string;
    meId?: string | null;
    aceptar_exceso?: boolean;
  },
): CrearPagoSocioPayload {
  const out: CrearPagoSocioPayload = {
    socio_id: ctx.socio_id,
    monto: round2(leerNumero(form.monto)),
    moneda: form.moneda,
    fecha_pago: form.fecha_pago,
    metodo: form.metodo as MetodoPagoSocio,
  };
  if (form.moneda === "MXN") out.tc_usd_mxn = round6(leerNumero(form.tc));
  // «Entregó» = quien registra es el default del API: solo viaja otro.
  if (form.entregado_por_id && form.entregado_por_id !== ctx.meId) {
    out.entregado_por_id = form.entregado_por_id;
  }
  const opc = (v: string) => v.trim();
  if (opc(form.recibido_por)) out.recibido_por = opc(form.recibido_por);
  if (opc(form.referencia)) out.referencia = opc(form.referencia);
  if (opc(form.factura_folio)) out.factura_folio = opc(form.factura_folio);
  if (opc(form.notas)) out.notas = opc(form.notas);
  if (form.mes !== SIN_MES && esMesValido(form.mes)) out.mes = form.mes;
  if (form.aeronave_id !== SIN_AVION && esUuid(form.aeronave_id)) {
    out.aeronave_id = form.aeronave_id;
  }
  if (ctx.aceptar_exceso) out.aceptar_exceso = true;
  if (ctx.client_request_id) out.client_request_id = ctx.client_request_id;
  return out;
}

/**
 * Cuerpo del `PATCH`: SOLO lo que cambió. Pasar a USD manda
 * `tc_usd_mxn: null`; vaciar un texto opcional manda `null` (quitarlo); el
 * «corresponde a» en «Sin mes» / «Sin avión» manda `null`.
 */
export function cambiosPago(pago: PagoSocio, form: FormPagoSocio): PatchPagoSocioPayload {
  const out: PatchPagoSocioPayload = {};
  const monto = round2(leerNumero(form.monto));
  if (Number.isFinite(monto) && monto !== round2(Number(pago.monto))) out.monto = monto;
  const monedaAntes = pago.moneda === "MXN" ? "MXN" : "USD";
  if (form.moneda !== monedaAntes) out.moneda = form.moneda;
  if (form.moneda === "MXN") {
    const tc = round6(leerNumero(form.tc));
    const tcAntes = pago.tc_usd_mxn != null ? round6(Number(pago.tc_usd_mxn)) : null;
    if (Number.isFinite(tc) && (tc !== tcAntes || form.moneda !== monedaAntes)) out.tc_usd_mxn = tc;
  } else if (pago.tc_usd_mxn != null) {
    out.tc_usd_mxn = null;
  }
  if (form.fecha_pago !== pago.fecha_pago) out.fecha_pago = form.fecha_pago;
  if (form.metodo && form.metodo !== pago.metodo) out.metodo = form.metodo;
  if (form.entregado_por_id && form.entregado_por_id !== pago.entregado_por) {
    out.entregado_por_id = form.entregado_por_id;
  }
  const textoCambio = (llave: "recibido_por" | "referencia" | "factura_folio" | "notas") => {
    const nuevo = form[llave].trim();
    const antes = (pago[llave] ?? "").trim();
    if (nuevo !== antes) out[llave] = nuevo ? nuevo : null;
  };
  textoCambio("recibido_por");
  textoCambio("referencia");
  textoCambio("factura_folio");
  textoCambio("notas");
  const mesAntes = mesDeFecha(pago.mes) ?? mesDeFecha(pago.periodo);
  const mesNuevo = form.mes !== SIN_MES && esMesValido(form.mes) ? form.mes : null;
  if (mesNuevo !== mesAntes) out.mes = mesNuevo;
  const avionNuevo = form.aeronave_id !== SIN_AVION && esUuid(form.aeronave_id) ? form.aeronave_id : null;
  if (avionNuevo !== (pago.aeronave_id ?? null)) out.aeronave_id = avionNuevo;
  return out;
}

/** Lo que contesta una server action de entrega (forma de `ActionResult`). */
export interface RespuestaGuardarEntrega {
  ok: boolean;
  data?: ResultadoPagoSocio;
  error?: string;
  code?: string;
  details?: unknown;
}

/** Qué hace el diálogo después de guardar (PURO: lo prueban los tests). */
export type PasoTrasGuardarEntrega =
  /** Edición sin cambios: no se llamó al API. */
  | { paso: "sin-cambios" }
  /** 409 PAGO_EXCEDE_SALDO ⇒ confirmación del ADELANTO (reintenta con
      `aceptar_exceso` y la MISMA llave). */
  | { paso: "adelanto"; details: unknown }
  /** Otra persona la borró o la cambió ⇒ cerrar y refrescar. */
  | { paso: "refrescar"; mensaje: string }
  | { paso: "error"; mensaje: string }
  /** Alta registrada ⇒ paso 2: ofrecer el comprobante. */
  | { paso: "comprobante"; resultado: ResultadoPagoSocio }
  /** Edición guardada (o alta sin cuerpo) ⇒ cerrar. */
  | { paso: "cerrar" };

export function pasoTrasGuardarEntrega(
  res: RespuestaGuardarEntrega | null,
  tipo: "alta" | "edicion",
): PasoTrasGuardarEntrega {
  if (res === null) return { paso: "sin-cambios" };
  if (!res.ok) {
    if (res.code === CODIGO_EXCEDE_SALDO) return { paso: "adelanto", details: res.details };
    const mensaje = res.error ?? "No se pudo guardar la entrega.";
    return errorPideRefrescar(res.code) ? { paso: "refrescar", mensaje } : { paso: "error", mensaje };
  }
  if (tipo === "alta" && res.data) return { paso: "comprobante", resultado: res.data };
  return { paso: "cerrar" };
}

/** Contador bajo «¿Por qué se elimina?»: «3/300 · mínimo 5». */
export function textoContadorMotivo(motivo: string): { texto: string; falta: boolean } {
  const n = (motivo ?? "").trim().length;
  const falta = n < MOTIVO_BAJA_MIN;
  return {
    texto: `${n}/${MOTIVO_BAJA_MAX}${falta ? ` · mínimo ${MOTIVO_BAJA_MIN}` : ""}`,
    falta,
  };
}

/** Motivo de la baja: 5–300 caracteres. */
export function validarMotivoBaja(motivo: string): string | null {
  const t = (motivo ?? "").trim();
  if (t.length < MOTIVO_BAJA_MIN) {
    return `Escribe el motivo (al menos ${MOTIVO_BAJA_MIN} caracteres).`;
  }
  if (t.length > MOTIVO_BAJA_MAX) return `Máximo ${MOTIVO_BAJA_MAX} caracteres.`;
  return null;
}

// =============================================================================
// Formulario «Configurar cuenta»
// =============================================================================

export interface FormCuentaSocio {
  /** `YYYY-MM`. */
  cuenta_desde: string;
  saldo_inicial: string;
  notas: string;
}

export type ErroresFormCuenta = Partial<Record<keyof FormCuentaSocio, string>>;

/** Lo que ya tiene la cuenta (o el default del API si no está configurada). */
export function formDeCuenta(cuenta: CuentaSocio): FormCuentaSocio {
  return {
    cuenta_desde: mesDeFecha(cuenta.cuenta_desde) ?? MES_CUENTA_DEFAULT,
    saldo_inicial: String(round2(Number(cuenta.saldo_inicial_usd) || 0)),
    notas: cuenta.notas ?? "",
  };
}

export function validarFormCuenta(form: FormCuentaSocio, hoy: string): ErroresFormCuenta {
  const e: ErroresFormCuenta = {};
  const fin = mesActual(hoy);
  if (!esMesValido(form.cuenta_desde)) {
    e.cuenta_desde = "Elige el mes en que arranca la cuenta.";
  } else if (fin && form.cuenta_desde > fin) {
    e.cuenta_desde = "El mes de arranque no puede ser futuro.";
  }
  const saldo = leerNumero(form.saldo_inicial.replace(/^\s*−/, "-"));
  if (form.saldo_inicial.trim() === "") {
    e.saldo_inicial = "Captura el saldo inicial (0 si no había nada pendiente).";
  } else if (!Number.isFinite(saldo)) {
    e.saldo_inicial = "Captura un número (negativo si ya se le había adelantado).";
  } else if (Math.abs(saldo) > MONTO_MAX) {
    e.saldo_inicial = "El saldo es demasiado grande.";
  } else if (!/^-?\d*(\.\d{0,2})?$/.test(form.saldo_inicial.replace(/[\s,$]/g, "").replace(/^−/, "-"))) {
    // El API pide máximo 2 decimales: redondear en silencio cambiaría el saldo.
    e.saldo_inicial = "Máximo 2 decimales (centavos).";
  }
  if (form.notas.trim().length > NOTAS_CUENTA_MAX) {
    e.notas = `Máximo ${NOTAS_CUENTA_MAX} caracteres.`;
  }
  return e;
}

/** Cuerpo del `PUT …/cuenta` (formulario ya validado). */
export function payloadCuenta(form: FormCuentaSocio): ConfigurarCuentaPayload {
  const saldo = round2(leerNumero(form.saldo_inicial.replace(/^\s*−/, "-")));
  const notas = form.notas.trim();
  return {
    cuenta_desde: form.cuenta_desde,
    // -0 viaja como 0.
    saldo_inicial_usd: saldo === 0 ? 0 : saldo,
    notas: notas ? notas : null,
  };
}

/** ¿El formulario cambia algo de la cuenta? (sin cambios no se llama). */
export function cuentaCambia(cuenta: CuentaSocio, form: FormCuentaSocio): boolean {
  const p = payloadCuenta(form);
  return (
    !cuenta.configurada ||
    p.cuenta_desde !== (mesDeFecha(cuenta.cuenta_desde) ?? "") ||
    centavos(p.saldo_inicial_usd) !== centavos(cuenta.saldo_inicial_usd) ||
    (p.notas ?? "") !== (cuenta.notas ?? "").trim()
  );
}

/** Ayuda del saldo inicial (qué significa el signo). */
export const AYUDA_SALDO_INICIAL =
  "Positivo: lo que se le debía al socio al arrancar la cuenta. Negativo: lo que ya se le había adelantado de más. 0 si estaba al corriente.";

/**
 * Confirmación al CAMBIAR una cuenta ya configurada: el saldo del socio se
 * recalcula desde el mes de arranque (el histórico de entregas no se toca).
 */
export function confirmacionCambiarCuenta(
  socioNombre: string,
  form: FormCuentaSocio,
): { titulo: string; descripcion: string; boton: string } {
  const p = payloadCuenta(form);
  return {
    titulo: "¿Cambiar la cuenta de este socio?",
    descripcion: `La cuenta de ${socioNombre} arrancará en ${etiquetaMes(
      p.cuenta_desde,
    )} con saldo inicial de ${fmtUsd(
      p.saldo_inicial_usd,
    )} USD. Su saldo por entregar se recalcula; las entregas registradas no cambian.`,
    boton: "Sí, cambiar la cuenta",
  };
}

// =============================================================================
// Pre-cierre: socios por entregar / adelantados
// =============================================================================

export const CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR = "socios_por_entregar";
export const CLAVE_PRECIERRE_SOCIOS_ADELANTADOS = "socios_adelantados";

export function esClavePrecierreSocios(clave: string | null | undefined): boolean {
  return (
    clave === CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR || clave === CLAVE_PRECIERRE_SOCIOS_ADELANTADOS
  );
}

/** «Resolver →» del pre-cierre: la lista de cuentas de los socios. */
export function hrefPrecierreSocios(): string {
  return RUTA_PAGOS_SOCIOS;
}

export const MAX_SOCIOS_PRECIERRE = 8;

/**
 * Nota bajo «Socios con utilidad por entregar»: el pre-cierre cuenta las
 * utilidades HASTA el mes del cierre; «Pagos a socios» (a donde lleva
 * «Resolver →») muestra el saldo de HOY, que suma también el mes en curso.
 * Sin esta nota eran dos números distintos para lo mismo.
 */
export function notaPreCierreSocios(clave: string, mes: string | null | undefined): string | null {
  if (clave !== CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR) return null;
  const hasta = esMesValido(mes) ? ` hasta ${etiquetaMes(mes)}` : "";
  return `Montos con las utilidades${hasta}. En «Pagos a socios» el saldo es el de hoy: suma también la utilidad del mes en curso.`;
}

/**
 * Renglones del aviso: «Mauricio Roque · por entregar hasta Septiembre
 * 2026: $1,395.94 USD» / «Mauricio Roque · adelantado hoy: $2,387.84 USD».
 * Montos del API (`por_entregar_usd` = saldo con las utilidades HASTA el
 * mes del cierre; el adelanto es el de HOY); el «y N más» sale del `count`
 * (la lista viene topada en 50). `mes` = `item.mes` del API o, si no lo
 * manda, el mes del periodo del pre-cierre.
 */
export function lineasPreCierreSocios(
  socios: readonly PreCierreSocioCuenta[] | null | undefined,
  clave: string,
  max: number = MAX_SOCIOS_PRECIERRE,
  count?: number | null,
  mes?: string | null,
): { lineas: { key: string; texto: string }[]; restantes: number } {
  // `Array.isArray` sobre un arreglo readonly estrecha a `any[]`: se tipa a mano.
  const lista: readonly PreCierreSocioCuenta[] = Array.isArray(socios) ? socios : [];
  const adelantados = clave === CLAVE_PRECIERRE_SOCIOS_ADELANTADOS;
  const etiqueta = adelantados
    ? "adelantado hoy"
    : esMesValido(mes)
      ? `por entregar hasta ${etiquetaMes(mes)}`
      : "por entregar";
  const lineas = lista.slice(0, max).map((s, i) => {
    const nombreSocio =
      typeof s.socio === "string" ? s.socio : (s.socio?.nombre ?? "").trim() || "Socio";
    const saldo = numONull(s.por_entregar_usd);
    const adelanto = numONull(s.adelantado_usd);
    const monto = adelantados
      ? adelanto != null
        ? Math.abs(adelanto)
        : saldo != null
          ? Math.abs(saldo)
          : null
      : saldo;
    const texto = monto != null ? `${nombreSocio} · ${etiqueta}: ${fmtUsd(monto)} USD` : nombreSocio;
    const id = typeof s.socio === "object" && s.socio ? s.socio.id : nombreSocio;
    return { key: `${clave}-${id}-${i}`, texto };
  });
  const total = Math.max(lista.length, count ?? 0);
  return { lineas, restantes: Math.max(0, total - lineas.length) };
}
