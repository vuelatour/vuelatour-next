/**
 * Nómina: un espacio propio (15-oct-2026) — FUENTE ÚNICA PURA de la pantalla
 * `/admin/nomina`: sin React ni red (lo prueba `__tests__/nomina.test.ts`).
 * Solo importa libs puras (`lib/datetime`, `lib/format`,
 * `lib/admin/medios-pago`) porque también la usa el menú (`nav-items.ts`).
 *
 * Pedido del cliente (textual): «Necesitamos un nuevo espacio debajo de Gastos
 * y Otros Gastos que se llame Nomina para tener en ese apartado todo lo de
 * nomina».
 *
 * Reglas que NO cambian (las decide el API, invariante 10 y «Pendientes» de su
 * CLAUDE.md): «Nómina» (`NOMINA`) es categoría de EMPRESA —va a «otros
 * gastos» del Balance general VuelaTour aunque traiga avión o vuelo—, no resta
 * en ningún avión ni en el reparto salvo que se REPARTA a mano
 * (`gasto_reparto`, desde «Verificar / editar» u «Otros gastos») y no pide
 * avión (no es pendiente de la bandeja). La fecha del gasto es la del PAGO
 * (decisión del 13-oct-2026): de ella salen el mes y la quincena.
 *
 * Aquí el panel solo SUMA montos ya registrados: en CENTAVOS enteros y POR
 * MONEDA (MXN y USD jamás se mezclan). No infiere a la persona de las notas
 * (texto libre): agrupar por persona es la fase 2, con un campo
 * «Beneficiario» que decide el cliente.
 */
import { MESES_LARGOS_ES } from "@/lib/datetime";
import { fmtMonto } from "@/lib/format";
import { medioPagoLabel } from "@/lib/admin/medios-pago";

// ═══════════════════════════════ Categoría, ruta y roles ═══════════════════════════════

/** Código de la categoría (enum `categoria_gasto` del API; su etiqueta es «Nómina»). */
export const CATEGORIA_NOMINA = "NOMINA";

/** Ruta de la pantalla (la del ítem del menú). */
export const RUTA_NOMINA = "/admin/nomina";

/**
 * Quién ve la pantalla: los MISMOS roles que «Gastos» y «Otros gastos», que ya
 * enseñan estos gastos (no se abre exposición nueva). El menú los toma de aquí.
 */
export const ROLES_NOMINA = ["ADMIN", "COORDINADOR", "FACTURACION"] as const;

export type RolNomina = (typeof ROLES_NOMINA)[number];

/**
 * ¿Este rol ve la pantalla «Nómina»? Sin rol (`/me` falló) ⇒ false: la página
 * falla CERRADO, como Gastos personales (los sueldos son dato sensible).
 */
export function puedeVerNomina(rol: string | null | undefined): boolean {
  return typeof rol === "string" && (ROLES_NOMINA as readonly string[]).includes(rol);
}

// ═══════════════════════════════ Mes «YYYY-MM» (día de pared Cancún) ═══════════════════════════════

const ANIO_MIN = 2000;
const ANIO_MAX = 2100;
const MES_RE = /^(\d{4})-(\d{2})$/;

interface PartesMes {
  anio: number;
  mes: number;
}

function partesMes(valor: unknown): PartesMes | null {
  if (typeof valor !== "string") return null;
  const m = MES_RE.exec(valor);
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (anio < ANIO_MIN || anio > ANIO_MAX || mes < 1 || mes > 12) return null;
  return { anio, mes };
}

/**
 * Partes de un mes YA validado (`mesNominaDeUrl`). Uno inválido no debería
 * llegar; si llega, vale enero de 2000 en vez de lanzar (nada en esta pantalla
 * manda al error boundary por un texto).
 */
function partes(mes: string): PartesMes {
  return partesMes(mes) ?? { anio: ANIO_MIN, mes: 1 };
}

const pad2 = (n: number): string => String(n).padStart(2, "0");
const claveMes = (p: PartesMes): string => `${p.anio}-${pad2(p.mes)}`;

const DIAS_DEL_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const esBisiesto = (anio: number): boolean =>
  (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;

/** Último día REAL del mes (28/29/30/31) por aritmética de calendario: sin `Date` ni zona. */
function ultimoDiaDelMes(p: PartesMes): number {
  return p.mes === 2 && esBisiesto(p.anio) ? 29 : DIAS_DEL_MES[p.mes - 1];
}

/** «oct», «sep»: los tres primeros caracteres de `MESES_LARGOS_ES` (sin otra tabla). */
function mesCorto(p: PartesMes): string {
  return MESES_LARGOS_ES[p.mes - 1].slice(0, 3);
}

/** ¿«YYYY-MM» con mes 01–12 y año 2000–2100? (lo que la pantalla acepta en `?mes=`). */
export function esMesNomina(valor: unknown): valor is string {
  return partesMes(valor) !== null;
}

/** Mes de `hoy` (`todayCancun()`, «YYYY-MM-DD», día de pared Cancún). */
export function mesDeHoyNomina(hoy: string): string {
  return hoy.slice(0, 7);
}

/**
 * `?mes=` de la URL ⇒ ese mes si es válido; cualquier otra cosa (vacío,
 * «2026-13», «2026-1», un día, un arreglo, basura) se IGNORA y vale el mes de
 * hoy en Cancún. Regla de `url-params`: nunca un 400 ni un throw.
 */
export function mesNominaDeUrl(valor: unknown, hoy: string): string {
  return esMesNomina(valor) ? valor : mesDeHoyNomina(hoy);
}

/** Primer y último día REAL del mes: «2026-02-01» … «2026-02-28» (bisiestos incluidos). */
export function rangoMesNomina(mes: string): { desde: string; hasta: string } {
  const p = partes(mes);
  const clave = claveMes(p);
  return { desde: `${clave}-01`, hasta: `${clave}-${pad2(ultimoDiaDelMes(p))}` };
}

/** «octubre 2026» (meses de `MESES_LARGOS_ES`, la tabla única de `lib/datetime`). */
export function etiquetaMesNomina(mes: string): string {
  const p = partes(mes);
  return `${MESES_LARGOS_ES[p.mes - 1]} ${p.anio}`;
}

/** Meses vecinos con cruce de año: «2026-01» ⇒ { anterior: «2025-12», siguiente: «2026-02» }. */
export function mesesVecinos(mes: string): { anterior: string; siguiente: string } {
  const p = partes(mes);
  const anterior = p.mes === 1 ? { anio: p.anio - 1, mes: 12 } : { anio: p.anio, mes: p.mes - 1 };
  const siguiente = p.mes === 12 ? { anio: p.anio + 1, mes: 1 } : { anio: p.anio, mes: p.mes + 1 };
  return { anterior: claveMes(anterior), siguiente: claveMes(siguiente) };
}

/**
 * ¿`mes` es posterior al mes de hoy (Cancún)? El enlace «siguiente ›» no se
 * ofrece hacia el futuro. Compara «YYYY-MM» como texto: el formato fijo
 * ordena igual que el calendario.
 */
export function esMesFuturoNomina(mes: string, hoy: string): boolean {
  return mes > mesDeHoyNomina(hoy);
}

// ═══════════════════════════════ Quincena (por la fecha del PAGO) ═══════════════════════════════

export type Quincena = 1 | 2;

const DIA_RE = /^\d{4}-\d{2}-(\d{2})$/;

/**
 * Quincena de un `fecha_gasto` «YYYY-MM-DD» por el TEXTO del día: 1–15 ⇒ 1,
 * 16–31 ⇒ 2. Jamás `new Date` sobre el texto: un día sin hora se lee como
 * medianoche UTC y en Cancún (UTC−5) cae en el día anterior (el 16 pasaría a
 * la 1.ª).
 * Ilegible (vacío, con hora, día 00 o 32) ⇒ null.
 */
export function quincenaDeFecha(fecha: string | null | undefined): Quincena | null {
  if (typeof fecha !== "string") return null;
  const m = DIA_RE.exec(fecha.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  if (dia < 1 || dia > 31) return null;
  return dia <= 15 ? 1 : 2;
}

/** «1ª quincena · 1–15 oct» / «2ª quincena · 16–31 oct» (con el último día REAL del mes). */
export function etiquetaQuincena(mes: string, q: Quincena): string {
  const p = partes(mes);
  const corto = mesCorto(p);
  return q === 1
    ? `1ª quincena · 1–15 ${corto}`
    : `2ª quincena · 16–${ultimoDiaDelMes(p)} ${corto}`;
}

// ═══════════════════════════════ Dinero: SOLO se suma lo registrado ═══════════════════════════════

const DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

/**
 * Monto (texto de PostgREST o número) ⇒ centavos ENTEROS. El texto se lee
 * dígito a dígito, sin pasar por coma flotante («5663.86» ⇒ 566386; un 3.er
 * decimal ≥ 5 redondea alejándose de cero). Ilegible (vacío, «1,234.56»,
 * NaN, infinito, fuera de rango) ⇒ 0: un monto que no se lee cuenta 0 y no
 * tumba la pantalla.
 */
export function centavosDeMonto(valor: unknown): number {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return 0;
    const c = Math.sign(valor) * Math.round(Math.abs(valor) * 100);
    return Number.isSafeInteger(c) ? c || 0 : 0;
  }
  if (typeof valor !== "string") return 0;
  const m = DECIMAL_RE.exec(valor.trim());
  if (!m) return 0;
  const [, signo, entero, decimales = ""] = m;
  let c = Number(entero) * 100 + Number(`${decimales}00`.slice(0, 2));
  if (decimales.length > 2 && Number(decimales[2]) >= 5) c += 1;
  if (!Number.isSafeInteger(c)) return 0;
  return (signo === "-" ? -c : c) || 0;
}

/** Total de UNA moneda (pesos o dólares; nunca mezclados). */
export interface PorMoneda {
  moneda: string;
  total: number;
}

/** Total de un medio de pago en UNA moneda. */
export interface PorMedio {
  moneda: string;
  medio: string;
  total: number;
}

export interface QuincenaNomina {
  quincena: Quincena;
  /** Por moneda (MXN, USD, el resto); vacío = sin pagos en esa quincena. */
  total: PorMoneda[];
  pagos: number;
}

export interface ResumenNomina {
  /** Total del mes por moneda: MXN, USD y el resto; jamás una suma entre monedas. */
  total: PorMoneda[];
  /** Pagos (gastos) del mes. */
  pagos: number;
  /** Por moneda y, dentro de cada una, de mayor a menor total. */
  porMedio: PorMedio[];
  /** Siempre las dos: la 1.ª (días 1–15) y la 2.ª (16 al último). */
  quincenas: [QuincenaNomina, QuincenaNomina];
  /**
   * Pagos sin fecha legible: cuentan en el total, en ninguna quincena. Con
   * `fecha_gasto` DATE NOT NULL no debería pasar; si pasa, se DICE.
   */
  sinQuincena: number;
}

/** Lo que el resumen lee de cada gasto (un `Gasto` del API sirve tal cual). */
export interface GastoNominaResumen {
  fecha_gasto?: string | null;
  monto?: string | number | null;
  moneda?: string | null;
  medio_pago?: string | null;
}

const textoLimpio = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** MXN primero, luego USD, luego el resto (A–Z) y al final la moneda que no se pudo leer. */
function rangoMoneda(moneda: string): number {
  if (moneda === "MXN") return 0;
  if (moneda === "USD") return 1;
  return moneda ? 2 : 3;
}

const compararTexto = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const compararMonedas = (a: string, b: string): number =>
  rangoMoneda(a) - rangoMoneda(b) || compararTexto(a, b);

function sumar(acumulado: Map<string, number>, moneda: string, centavos: number): void {
  acumulado.set(moneda, (acumulado.get(moneda) ?? 0) + centavos);
}

function porMonedaDe(acumulado: Map<string, number>): PorMoneda[] {
  return [...acumulado.entries()]
    .sort(([a], [b]) => compararMonedas(a, b))
    .map(([moneda, centavos]) => ({ moneda, total: centavos / 100 }));
}

/**
 * Resumen del mes con los gastos YA registrados: total, pagos, desglose por
 * medio de pago y las dos quincenas. Toda suma en CENTAVOS enteros (0.1 + 0.2
 * = 0.30 exacto) y por moneda: MXN y USD nunca se suman entre sí.
 */
export function resumenNomina(gastos: readonly GastoNominaResumen[]): ResumenNomina {
  const total = new Map<string, number>();
  const medios = new Map<string, { moneda: string; medio: string; centavos: number }>();
  const porQuincena = { 1: new Map<string, number>(), 2: new Map<string, number>() };
  const pagosQuincena = { 1: 0, 2: 0 };
  let sinQuincena = 0;

  for (const g of gastos) {
    const moneda = textoLimpio(g.moneda);
    const medio = textoLimpio(g.medio_pago);
    const centavos = centavosDeMonto(g.monto);
    sumar(total, moneda, centavos);
    const clave = `${moneda}\u0000${medio}`;
    const previo = medios.get(clave);
    if (previo) previo.centavos += centavos;
    else medios.set(clave, { moneda, medio, centavos });
    const q = quincenaDeFecha(g.fecha_gasto ?? null);
    if (q) {
      sumar(porQuincena[q], moneda, centavos);
      pagosQuincena[q] += 1;
    } else {
      sinQuincena += 1;
    }
  }

  const porMedio = [...medios.values()]
    .sort(
      (a, b) =>
        compararMonedas(a.moneda, b.moneda) || b.centavos - a.centavos || compararTexto(a.medio, b.medio),
    )
    .map(({ moneda, medio, centavos }) => ({ moneda, medio, total: centavos / 100 }));

  return {
    total: porMonedaDe(total),
    pagos: gastos.length,
    porMedio,
    quincenas: [
      { quincena: 1, total: porMonedaDe(porQuincena[1]), pagos: pagosQuincena[1] },
      { quincena: 2, total: porMonedaDe(porQuincena[2]), pagos: pagosQuincena[2] },
    ],
    sinQuincena,
  };
}

export const MONEDA_DESCONOCIDA = "(moneda desconocida)";

/**
 * «$109,921.46 MXN» · «$1,200 USD» (`fmtMonto`, la regla única de los montos
 * con su moneda: la MISMA de la columna «Monto» de la tabla); sin moneda:
 * «$300 (moneda desconocida)».
 */
export function montoNomina(total: number, moneda: string): string {
  return moneda ? fmtMonto(total, moneda) : `${fmtMonto(total)} ${MONEDA_DESCONOCIDA}`;
}

export const MEDIO_DESCONOCIDO = "Sin medio de pago";

/** Etiqueta del medio (`medios-pago.ts`, la fuente única); sin medio ⇒ «Sin medio de pago». */
export function etiquetaMedioNomina(medio: string): string {
  return medio ? medioPagoLabel(medio) : MEDIO_DESCONOCIDO;
}

// ═══════════════════════════════ Enlaces y Excel ═══════════════════════════════

/** «/admin/nomina?mes=2026-09». */
export function hrefMesNomina(mes: string): string {
  return `${RUTA_NOMINA}?mes=${claveMes(partes(mes))}`;
}

/**
 * Gastos con la categoría «Nómina» y las fechas del mes (lo lee
 * `leerFiltrosGastos`): «/admin/expenses?categoria=NOMINA&desde=…&hasta=…».
 */
export function hrefGastosNomina(mes: string): string {
  const { desde, hasta } = rangoMesNomina(mes);
  const params = new URLSearchParams({ categoria: CATEGORIA_NOMINA, desde, hasta });
  return `/admin/expenses?${params.toString()}`;
}

/** Query de «Exportar Excel» (`GET /v1/expenses/export`): la categoría y el mes de la pantalla. */
export function queryExcelNomina(mes: string): { categoria: string; desde: string; hasta: string } {
  const { desde, hasta } = rangoMesNomina(mes);
  return { categoria: CATEGORIA_NOMINA, desde, hasta };
}

/** «nomina-2026-10.xlsx». */
export function nombreExcelNomina(mes: string): string {
  return `nomina-${claveMes(partes(mes))}.xlsx`;
}

// ═══════════════════════════════ Textos de la pantalla ═══════════════════════════════

export const TITULO_NOMINA = "Nómina";

export const DESCRIPCION_NOMINA =
  "Todo lo de la nómina en un solo lugar: sueldos del personal y de los pilotos, cuotas del IMSS e INFONAVIT y la asesoría de la nómina (los gastos con categoría «Nómina»). Es gasto de VuelaTour: va a «otros gastos» del Balance general; si una parte le toca a un avión, repártela desde «Verificar / editar».";

export const ETIQUETA_REGISTRAR_NOMINA = "Registrar pago de nómina";

export const AYUDA_CAPTURA_NOMINA =
  "En «Notas» escribe a quién se le pagó y qué quincena (p. ej. «Luis · 1a oct»): así lo encuentras con la búsqueda de la tabla.";

export const NOTA_QUINCENA = "La quincena sale de la fecha del gasto (la del pago).";

export const ETIQUETA_VER_EN_GASTOS = "Ver en Gastos";

/** `title` de «Ver en Gastos»: a dónde lleva. */
export function tituloVerEnGastos(mes: string): string {
  return `Abre Gastos con la categoría «Nómina» y las fechas de ${etiquetaMesNomina(mes)}.`;
}

/** Vacío con la lista CARGADA (con la lista caída se dice que falló, jamás esto). */
export function tituloVacioNomina(mes: string): string {
  return `Sin pagos de nómina en ${etiquetaMesNomina(mes)}`;
}

export const DESCRIPCION_VACIO_NOMINA =
  "Aquí aparecen los gastos con categoría «Nómina» del mes elegido. Regístralos con «Registrar pago de nómina» o, si se capturaron con otra categoría, cámbiala a «Nómina» en Gastos → «Verificar / editar».";

export const TITULO_ERROR_NOMINA = "No se pudo cargar la nómina";

/** Mismo espíritu que `DESCRIPCION_ERROR_LISTA_GASTOS`: se dice que falló, nunca «sin pagos». */
export const DESCRIPCION_ERROR_NOMINA =
  "El servidor no respondió: todavía no sabemos qué pagos de nómina hay en este mes. Pulsa Reintentar; el mes elegido se conserva.";

/** «1 pago» · «12 pagos». */
export function textoPagos(n: number): string {
  return n === 1 ? "1 pago" : `${n} pagos`;
}

export const SIN_PAGOS_QUINCENA = "Sin pagos";

/** «Total de octubre 2026» (primera tarjeta del resumen). */
export function tituloTotalMesNomina(mes: string): string {
  return `Total de ${etiquetaMesNomina(mes)}`;
}

/** «Pagos de nómina · octubre 2026» (título de la tabla; el conteo va aparte). */
export function tituloListaNomina(mes: string): string {
  return `Pagos de nómina · ${etiquetaMesNomina(mes)}`;
}

/** Nombre accesible de la región de la tabla. */
export const ETIQUETA_LISTA_NOMINA = "Pagos de nómina";

export const DESCRIPCION_LISTA_NOMINA =
  "Cada pago es un gasto completo: su menú ⋯ trae «Verificar / editar», «Repartir entre aviones» y «Eliminar», y en su renglón están el comprobante, la facturación y el banco.";

/** Nombre accesible del resumen del mes. */
export const ETIQUETA_RESUMEN_NOMINA = "Resumen de la nómina del mes";

/** Nombre accesible del desglose por medio de pago. */
export const ETIQUETA_POR_MEDIO_NOMINA = "Por medio de pago";

/** Nombre accesible de la navegación entre meses. */
export const ETIQUETA_NAV_MESES_NOMINA = "Cambiar de mes";

/** «Ver la nómina de septiembre 2026» (`aria-label` y `title` de «‹ mes» / «mes ›»). */
export function tituloIrAMesNomina(mes: string): string {
  return `Ver la nómina de ${etiquetaMesNomina(mes)}`;
}

/** Con el corte defensivo de la lista, el resumen dice que suma solo lo que cargó. */
export function avisoResumenIncompleto(mostrados: number, total: number): string {
  return `El resumen suma solo lo que cargó (${mostrados} de ${total} pagos): recarga la página para ver el total completo del mes.`;
}

/** Pagos sin fecha legible (no deberían existir: `fecha_gasto` es DATE NOT NULL). */
export function textoSinQuincena(n: number): string {
  return n === 1
    ? "1 pago no tiene una fecha legible: cuenta en el total, pero en ninguna quincena."
    : `${n} pagos no tienen una fecha legible: cuentan en el total, pero en ninguna quincena.`;
}
