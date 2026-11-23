/**
 * COBRO «CON UTILIDADES DEL SOCIO» — FUENTE ÚNICA PURA del panel (23-nov-2026,
 * API 0.0.148). Sin React ni red.
 *
 * Pedido del dueño: los socios (dueños de los aviones) a veces pagan un vuelo
 * propio «descontándolo de sus utilidades». No entra dinero: el API registra
 * con UNA llamada (`POST /v1/profit-sharing/vuelos/:id/cobro-utilidades`) dos
 * cosas ligadas — el COBRO del vuelo (método interno OTRO) y una ENTREGA al
 * socio en «Pagos a socios» — y al quitar el cobro da de baja también la
 * entrega.
 *
 * Reglas que viven aquí:
 *  - «Utilidades del socio» es una OPCIÓN DE LA PANTALLA, no un método de
 *    cobro: su valor (`METODO_UTILIDADES_SOCIO`) es un centinela que JAMÁS
 *    viaja al API y NO se agrega a `METODOS_PAGO` (esa lista es espejo de las
 *    etiquetas del API y del recibo; `metodos-pago.test.ts` la congela).
 *  - Solo en el ALTA, solo en la página del vuelo (quien monta la ficha le
 *    pasa el contexto), solo DIRECCION y FACTURACION, nunca en un cancelado.
 *  - Qué socio y qué avión se proponen, la fecha (de su MES se descuenta), el
 *    renglón del saldo, la validación y el cuerpo que viaja.
 *  - El 409 `PAGO_EXCEDE_SALDO` NO es un error: es la MISMA confirmación de
 *    adelanto de «Registrar entrega» (`confirmacionAdelanto`), que se reenvía
 *    con `aceptar_exceso` y la MISMA `client_request_id`.
 *  - Cómo se LEE un cobro así en la lista de cobros y qué se confirma al
 *    quitarlo.
 *
 * Qué NO vive aquí: el dinero. Lo por entregar de cada avión, el exceso y el
 * saldo que queda son del API; el «Después de este cobro» es solo una RESTA a
 * la vista (lo por entregar − los pesos del cobro) que el API vuelve a decidir
 * al guardar.
 */
import { fmtMonto, fmtMxn } from "@/lib/format";
import { cancunInputToIso, isoToCancunInput } from "@/lib/datetime";
import { normalizarTexto } from "@/lib/admin/busqueda";
import { esDiaValido, esUuid } from "@/lib/admin/url-params";
import { METODOS_PAGO, metodoPagoLabel } from "@/lib/admin/metodos-pago";
import {
  BOTON_REGISTRAR_ADELANTO,
  CODIGO_EXCEDE_SALDO,
  NOTAS_PAGO_MAX,
  confirmacionAdelanto,
  esMesValido,
  etiquetaMes,
  fmtPct,
  saldosPorAvion,
} from "@/lib/admin/reparto-pagos";
import type { CobroUtilidadesPayload, CobroUtilidadesSocio, FlightCobro } from "@/types/flights";
import type { ResumenCuentaSocio } from "@/types/reparto-pagos";

type Moneda = "USD" | "MXN";

const centavos = (n: number) => Math.round((Number(n) || 0) * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Número finito de un valor de formulario; vacío / basura ⇒ null. */
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// =============================================================================
// La opción del selector (solo de la pantalla)
// =============================================================================

/**
 * Valor CENTINELA de la opción en el selector «Método de cobro». Solo existe
 * en la pantalla: no es un `MetodoPago`, no está en `METODOS_PAGO` y jamás
 * se manda al API (el cuerpo del cobro con utilidades ni siquiera lleva
 * método).
 */
export const METODO_UTILIDADES_SOCIO = "__UTILIDADES_SOCIO__";
export const ETIQUETA_UTILIDADES_SOCIO = "Utilidades del socio";
export const AYUDA_UTILIDADES_SOCIO = "El socio paga su vuelo con sus utilidades: no entra dinero";

/** Espejo del `@Roles` de `POST …/cobro-utilidades` (y de quitar ese cobro). */
export const ROLES_COBRO_UTILIDADES = ["DIRECCION", "FACTURACION"] as const;

export function puedeCobrarConUtilidades(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_COBRO_UTILIDADES as readonly string[]).includes(rol);
}

/**
 * Lo que la PÁGINA DEL VUELO le pasa a la ficha «Registrar cobro» para que
 * ofrezca la opción. Las demás pantallas que montan la misma ficha
 * (cotización, auditoría de Paywise) no lo pasan ⇒ ahí la opción no existe.
 */
export interface ContextoCobroUtilidades {
  /** El avión que voló (propone «de las utilidades de qué avión»). */
  aeronaveId: string | null;
  /** El cliente del vuelo: si es un socio, se preselecciona. */
  clienteNombre: string | null;
  /** Fecha del vuelo (ISO o `YYYY-MM-DD`): la fecha del cobro por defecto. */
  fechaVuelo: string | null;
}

/** ¿La ficha ofrece «Utilidades del socio»? */
export function ofreceCobroConUtilidades(p: {
  contexto: ContextoCobroUtilidades | null | undefined;
  rol: string | null | undefined;
  enEdicion: boolean;
  cancelado: boolean;
}): boolean {
  return p.contexto != null && !p.enEdicion && !p.cancelado && puedeCobrarConUtilidades(p.rol);
}

export interface OpcionMetodoCobro {
  value: string;
  label: string;
  description: string;
}

/**
 * Opciones del selector «Método de cobro»: los métodos de SIEMPRE (misma
 * lista, mismo orden) y, solo si se ofrece, «Utilidades del socio» AL FINAL.
 */
export function opcionesMetodoCobro(conUtilidades: boolean): OpcionMetodoCobro[] {
  const metodos = METODOS_PAGO.map((m) => ({ value: m.value as string, label: m.label, description: m.hint }));
  return conUtilidades
    ? [
        ...metodos,
        {
          value: METODO_UTILIDADES_SOCIO,
          label: ETIQUETA_UTILIDADES_SOCIO,
          description: AYUDA_UTILIDADES_SOCIO,
        },
      ]
    : metodos;
}

// =============================================================================
// Socios y aviones que se ofrecen
// =============================================================================

export interface AvionParaCobro {
  id: string;
  matricula: string;
  porcentaje: number;
  /** false = ya no es socio de ese avión hoy (se ofrece, dicho). */
  vigente: boolean;
  /**
   * Lo por entregar de MESES CERRADOS contra lo que el API medirá el cobro si
   * se elige este avión (cuenta por avión: el saldo de ESE avión; cuenta de
   * siempre: el de toda la cuenta). null = el dato no llegó ⇒ no se pinta
   * ningún número.
   */
  porEntregarCerradoMxn: number | null;
}

export interface SocioParaCobro {
  id: string;
  nombre: string;
  aviones: AvionParaCobro[];
  /** true = la cuenta se lleva POR AVIÓN (cada saldo es el de su avión). */
  cuentaPorAvion: boolean;
  /** Lo ya adelantado «a cuenta general», en positivo (0 si no hay): el API
      lo descuenta del saldo del avión al medir el cobro. */
  adelantadoGeneralMxn: number;
}

/**
 * Los socios que pueden pagar un vuelo con sus utilidades, tal como los
 * manda `GET /v1/profit-sharing/socios` y en su orden: fuera la propia
 * EMPRESA (`socio.es_empresa`: su «por entregar» es dinero que se debe a sí
 * misma) y quien no tiene ningún avión. Solo lleva lo que la ficha lee.
 */
export function sociosParaCobro(
  resumenes: readonly ResumenCuentaSocio[] | null | undefined,
): SocioParaCobro[] {
  const out: SocioParaCobro[] = [];
  for (const r of resumenes ?? []) {
    if (r.socio.es_empresa === true || !esUuid(r.socio.id)) continue;
    const saldos = saldosPorAvion(r);
    const general = saldos?.find((s) => !s.aeronave) ?? null;
    const deToda = numero(r.por_entregar_cerrado_mxn);
    const aviones: AvionParaCobro[] = [];
    for (const a of r.aviones ?? []) {
      if (!esUuid(a.id) || aviones.some((x) => x.id === a.id)) continue;
      const seccion = saldos?.find((s) => s.aeronave?.id === a.id) ?? null;
      aviones.push({
        id: a.id,
        matricula: (a.matricula ?? "").trim(),
        porcentaje: Number(a.porcentaje) || 0,
        vigente: a.vigente !== false,
        porEntregarCerradoMxn: saldos ? (seccion ? numero(seccion.por_entregar_cerrado_mxn) : null) : deToda,
      });
    }
    if (aviones.length === 0) continue;
    out.push({
      id: r.socio.id,
      nombre: r.socio.nombre,
      aviones,
      cuentaPorAvion: saldos !== null,
      adelantadoGeneralMxn:
        general && centavos(general.por_entregar_mxn) < 0 ? Math.abs(general.por_entregar_mxn) : 0,
    });
  }
  return out;
}

/**
 * El socio que se PRESELECCIONA: el que se llama igual que el cliente del
 * vuelo (sin acentos ni mayúsculas). Sin coincidencia, o con dos socios del
 * mismo nombre, "" (se elige a mano: jamás se adivina a quién se le descuenta).
 */
export function socioPreseleccionado(
  socios: readonly SocioParaCobro[],
  clienteNombre: string | null | undefined,
): string {
  const buscado = normalizarTexto(clienteNombre);
  if (!buscado) return "";
  const iguales = socios.filter((s) => normalizarTexto(s.nombre) === buscado);
  return iguales.length === 1 ? iguales[0].id : "";
}

/**
 * El avión que se propone para ese socio: el del VUELO si es socio ahí; si
 * no, su ÚNICO avión; con varios y ninguno el del vuelo, "" (obliga a elegir).
 */
export function avionPorDefecto(
  socio: SocioParaCobro | null | undefined,
  aeronaveVueloId: string | null | undefined,
): string {
  if (!socio) return "";
  if (aeronaveVueloId && socio.aviones.some((a) => a.id === aeronaveVueloId)) return aeronaveVueloId;
  return socio.aviones.length === 1 ? socio.aviones[0].id : "";
}

export function socioDe(
  socios: readonly SocioParaCobro[],
  socioId: string | null | undefined,
): SocioParaCobro | null {
  return socios.find((s) => s.id === socioId) ?? null;
}

/** Opciones de «Socio que paga» (sus matrículas como segunda línea). */
export function opcionesSocioCobro(
  socios: readonly SocioParaCobro[],
): { value: string; label: string; description?: string }[] {
  return socios.map((s) => {
    const matriculas = s.aviones.map((a) => a.matricula).filter(Boolean);
    return {
      value: s.id,
      label: s.nombre,
      ...(matriculas.length > 0 ? { description: matriculas.join(" · ") } : {}),
    };
  });
}

/** Opciones de «¿De las utilidades de qué avión?» (los aviones de ESE socio). */
export function opcionesAvionCobro(
  socio: SocioParaCobro | null | undefined,
  aeronaveVueloId: string | null | undefined,
): { value: string; label: string; description: string }[] {
  return (socio?.aviones ?? []).map((a) => ({
    value: a.id,
    label: a.matricula || "Avión",
    description: [
      fmtPct(a.porcentaje),
      a.vigente ? null : "ya no vigente",
      aeronaveVueloId && a.id === aeronaveVueloId ? "el avión de este vuelo" : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

export const ETIQUETA_SOCIO_QUE_PAGA = "Socio que paga";
export const ETIQUETA_AVION_UTILIDADES = "¿De las utilidades de qué avión?";
export const AYUDA_AVION_UTILIDADES =
  "Puede ser un avión distinto al que voló: es el avión de cuyas utilidades se descuenta.";

// =============================================================================
// Carga de los socios (al elegir la opción)
// =============================================================================

export type CargaSociosCobro =
  | { estado: "sin-cargar" }
  | { estado: "cargando" }
  | { estado: "ok"; socios: SocioParaCobro[] }
  /** `reintentable: false` = falta de permiso o servidor sin actualizar:
      volver a pedirlo no lo arregla (no se ofrece «Reintentar»). */
  | { estado: "error"; mensaje: string; reintentable: boolean };

export const CARGA_SOCIOS_SIN_CARGAR: CargaSociosCobro = { estado: "sin-cargar" };

/**
 * Estado de la carga a partir de lo que contestó la server action
 * (`sociosParaCobroUtilidadesAction`: `code` = por qué no se pudo leer).
 */
export function cargaSociosDeRespuesta(res: {
  ok: boolean;
  data?: SocioParaCobro[] | null;
  error?: string | null;
  code?: string | null;
}): CargaSociosCobro {
  if (res.ok && Array.isArray(res.data)) return { estado: "ok", socios: res.data };
  return {
    estado: "error",
    mensaje: (res.error ?? "").trim() || mensajeCargaSocios("error"),
    reintentable: res.code !== "sin-permiso" && res.code !== "no-disponible",
  };
}

/** Bajo el selector, al elegir la opción: qué va a pasar (no entra dinero). */
export const NOTA_COBRO_CON_UTILIDADES =
  "No entra dinero: se registra el cobro del vuelo y se le descuenta al socio en Pagos a socios.";

export const TEXTO_CARGANDO_SOCIOS = "Cargando los socios…";
export const TEXTO_SIN_SOCIOS =
  "No hay socios con avión registrados. Revisa los socios en la ficha de cada avión.";
export const TEXTO_FALLO_RED_SOCIOS =
  "No se pudieron cargar los socios (falló la conexión). Vuelve a intentarlo.";

/** Por qué no se pudo leer la lista de socios, en palabras del operador. */
export function mensajeCargaSocios(
  estado: "no-disponible" | "sin-permiso" | "no-existe" | "error",
): string {
  switch (estado) {
    case "no-disponible":
      return "Las cuentas de los socios todavía no están disponibles en el servidor (falta actualizarlo). Avisa a sistemas.";
    case "sin-permiso":
      return "Tu usuario no puede consultar las cuentas de los socios. Pide a Dirección o a Facturación que registre este cobro.";
    default:
      return "No se pudieron cargar los socios. Vuelve a intentarlo; si sigue igual, avisa a sistemas.";
  }
}

// =============================================================================
// Moneda, fecha y saldo
// =============================================================================

/**
 * Moneda por defecto: si el vuelo tiene total EN PESOS (`monto_total_mxn`),
 * MXN — la cuenta del socio es en pesos —; si no, USD. El monto lo pone la
 * regla de siempre de la ficha (lo pendiente).
 */
export function monedaPorDefectoUtilidades(montoTotalMxn: number | null | undefined): Moneda {
  return montoTotalMxn != null && Number.isFinite(montoTotalMxn) && montoTotalMxn > 0 ? "MXN" : "USD";
}

/** Día de Cancún (`YYYY-MM-DD`) de una fecha ISO o de un día a secas. */
function diaCancunDe(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (esDiaValido(valor)) return valor;
  const dia = isoToCancunInput(valor).slice(0, 10);
  return esDiaValido(dia) ? dia : null;
}

/**
 * Fecha del cobro por defecto: la FECHA DEL VUELO (día de Cancún) — de su mes
 * se descuentan las utilidades —; si el vuelo es futuro o no tiene fecha, hoy.
 */
export function fechaPorDefectoUtilidades(
  fechaVuelo: string | null | undefined,
  hoy: string,
): string {
  const dia = diaCancunDe(fechaVuelo);
  if (!dia) return hoy;
  return esDiaValido(hoy) && dia > hoy ? hoy : dia;
}

/** «Se descuenta de las utilidades de Noviembre 2026 (el mes de esta fecha).» */
export function ayudaFechaUtilidades(fecha: string | null | undefined): string {
  const mes = esDiaValido(fecha) ? (fecha as string).slice(0, 7) : null;
  return mes && esMesValido(mes)
    ? `Se descuenta de las utilidades de ${etiquetaMes(mes)} (el mes de esta fecha).`
    : "Elige la fecha: de su mes se descuentan las utilidades.";
}

/** Los pesos que el cobro descuenta de la cuenta (MXN = monto; USD = monto × T.C.). */
function pesosDelCobro(monto: unknown, moneda: Moneda, tc: unknown): number | null {
  const m = numero(monto);
  if (m == null || !(m > 0)) return null;
  if (moneda === "MXN") return round2(m);
  const t = numero(tc);
  return t != null && t > 0 ? round2(m * round6(t)) : null;
}

export interface SaldoUtilidadesTexto {
  /** «Por entregar a Mauricio Roque de N4142R (meses cerrados): $X. Después de este cobro: $Y.» */
  texto: string;
  /** Segunda línea: ya hay adelantos «a cuenta general» que el API descuenta. */
  adelantoGeneral: string | null;
}

/**
 * Renglón informativo (gris) bajo el avión elegido: lo por entregar de MESES
 * CERRADOS de ese avión (`por_entregar_cerrado_mxn`, el número contra el que
 * el API decide un adelanto) y cómo queda después de este cobro. Sin el dato
 * ⇒ null (no se pinta ningún número). Con adelantos «a cuenta general» no se
 * dice el «después»: esa resta la hace el API y aquí no se inventa.
 */
export function textoSaldoUtilidades(p: {
  socio: SocioParaCobro | null | undefined;
  avionId: string | null | undefined;
  monto: unknown;
  moneda: Moneda;
  tc: unknown;
}): SaldoUtilidadesTexto | null {
  const avion = p.socio?.aviones.find((a) => a.id === p.avionId) ?? null;
  if (!p.socio || !avion || avion.porEntregarCerradoMxn == null) return null;
  const saldo = avion.porEntregarCerradoMxn;
  // En una cuenta que NO se lleva por avión el número es el de toda la
  // cuenta: solo se le pone la matrícula si ese es su único avión.
  const deAvion =
    avion.matricula && (p.socio.cuentaPorAvion || p.socio.aviones.length === 1)
      ? ` de ${avion.matricula}`
      : "";
  const base =
    centavos(saldo) > 0
      ? `Por entregar a ${p.socio.nombre}${deAvion} (meses cerrados): ${fmtMxn(saldo)}.`
      : `No hay utilidades por entregar a ${p.socio.nombre}${deAvion} en meses cerrados (saldo: ${fmtMxn(saldo)}).`;
  if (p.socio.cuentaPorAvion && centavos(p.socio.adelantadoGeneralMxn) > 0) {
    return {
      texto: base,
      adelantoGeneral: `Ya se le adelantaron ${fmtMxn(p.socio.adelantadoGeneralMxn)} a cuenta general: el sistema los descuenta de lo que hay por entregar de este avión.`,
    };
  }
  const descuenta = pesosDelCobro(p.monto, p.moneda, p.tc);
  if (descuenta == null) return { texto: base, adelantoGeneral: null };
  const despuesC = centavos(saldo) - centavos(descuenta);
  const adelanto = despuesC < 0 ? " Quedará como adelanto: al guardar se te pedirá confirmarlo." : "";
  return {
    texto: `${base} Después de este cobro: ${fmtMxn(despuesC / 100)}.${adelanto}`,
    adelantoGeneral: null,
  };
}

// =============================================================================
// Validación y cuerpo que viaja
// =============================================================================

/** Banda del T.C. que acepta el API (400 `TC_FUERA_DE_RANGO` fuera de ella). */
export const TC_UTILIDADES_MIN = 15;
export const TC_UTILIDADES_MAX = 25;

/** Por qué se pide el T.C. también en dólares (la cuenta del socio es en pesos). */
export function ayudaTcUtilidades(moneda: Moneda): string {
  return moneda === "USD"
    ? "La cuenta del socio es en pesos: se le descuenta monto × T.C."
    : "Necesario para saber cuánto cubre del total del vuelo en USD.";
}

export interface FormCobroUtilidades {
  socioId: string;
  avionId: string;
  monto: unknown;
  moneda: Moneda;
  tc: unknown;
  /** `YYYY-MM-DD` (día de Cancún). */
  fecha: string;
  notas: string;
}

export type ErroresCobroUtilidades = Partial<
  Record<"socio" | "avion" | "monto" | "tc" | "fecha" | "notas", string>
>;

/** Errores del formulario en modo «Utilidades del socio» (vacío = válido). */
export function validarCobroUtilidades(
  f: FormCobroUtilidades,
  ctx: { socios: readonly SocioParaCobro[]; hoy: string },
): ErroresCobroUtilidades {
  const e: ErroresCobroUtilidades = {};
  const socio = socioDe(ctx.socios, f.socioId);
  if (!socio) {
    e.socio = "Elige el socio que paga el vuelo.";
  } else if (!socio.aviones.some((a) => a.id === f.avionId)) {
    e.avion = "Elige de las utilidades de qué avión se descuenta.";
  }
  const monto = numero(f.monto);
  if (monto == null || !(round2(monto) > 0)) e.monto = "Captura el monto (mayor a 0).";
  // T.C. en las DOS monedas: la cuenta del socio es en pesos.
  const tc = numero(f.tc);
  if (tc == null || !(tc > 0)) {
    e.tc =
      f.moneda === "USD"
        ? "Captura el tipo de cambio: dice cuántos pesos se le descuentan al socio."
        : "Captura el tipo de cambio (para saber cuánto cubre del total del vuelo en USD).";
  } else if (tc < TC_UTILIDADES_MIN || tc > TC_UTILIDADES_MAX) {
    e.tc = `Revisa el tipo de cambio: debe estar entre ${TC_UTILIDADES_MIN} y ${TC_UTILIDADES_MAX}.`;
  }
  if (!esDiaValido(f.fecha)) {
    e.fecha = "Elige la fecha: de su mes se descuentan las utilidades.";
  } else if (esDiaValido(ctx.hoy) && f.fecha > ctx.hoy) {
    e.fecha = "La fecha no puede ser futura: de su mes se descuentan las utilidades.";
  }
  // Las notas van también a la entrega del socio (tope de «Pagos a socios»).
  if (f.notas.trim().length > NOTAS_PAGO_MAX) e.notas = `Máximo ${NOTAS_PAGO_MAX} caracteres.`;
  return e;
}

/**
 * Cuerpo del `POST …/cobro-utilidades` (el formulario ya validado). SIN
 * método: «Utilidades del socio» no es un método de cobro. La fecha viaja al
 * mediodía de Cancún (su día y su mes no se mueven con la zona horaria).
 */
export function payloadCobroUtilidades(
  f: FormCobroUtilidades,
  ctx: { clientRequestId: string; aceptarExceso?: boolean },
): CobroUtilidadesPayload {
  const notas = f.notas.trim();
  return {
    socio_id: f.socioId,
    aeronave_id: f.avionId,
    monto: round2(Number(f.monto)),
    moneda: f.moneda,
    tc_usd_mxn: round6(Number(f.tc)),
    fecha_cobro: cancunInputToIso(`${f.fecha.slice(0, 10)}T12:00`),
    ...(notas ? { notas } : {}),
    ...(ctx.aceptarExceso ? { aceptar_exceso: true as const } : {}),
    client_request_id: ctx.clientRequestId,
  };
}

// =============================================================================
// Después de guardar
// =============================================================================

/** Lo que contesta la server action (forma de `ActionResult`). */
export interface RespuestaCobroUtilidades {
  ok: boolean;
  data?: { idempotente?: boolean } | null;
  error?: string | null;
  code?: string | null;
  details?: unknown;
  status?: number | null;
}

/** Qué hace la ficha después de guardar (PURO: lo prueban los tests). */
export type PasoTrasCobroUtilidades =
  /** 409 PAGO_EXCEDE_SALDO ⇒ confirmación del ADELANTO (se reenvía con
      `aceptar_exceso` y la MISMA llave). NO es un error. */
  | { paso: "adelanto"; details: unknown }
  | { paso: "error"; mensaje: string }
  /** Quedó (o ya estaba: replay de la misma llave). */
  | { paso: "listo"; idempotente: boolean };

export function pasoTrasCobroUtilidades(res: RespuestaCobroUtilidades): PasoTrasCobroUtilidades {
  if (res.ok) return { paso: "listo", idempotente: res.data?.idempotente === true };
  if (res.code === CODIGO_EXCEDE_SALDO) return { paso: "adelanto", details: res.details };
  return { paso: "error", mensaje: mensajeErrorCobroUtilidades(res) };
}

/**
 * Confirmación del ADELANTO para el cobro con utilidades: los MISMOS números
 * y la misma redacción que «Registrar entrega» (`confirmacionAdelanto`, que
 * lee el `details` del API), precedidos por qué pasó en palabras del cobro.
 */
export function confirmacionAdelantoCobro(
  details: unknown,
  fecha: string | null | undefined,
): { titulo: string; descripcion: string; confirmar: string; cancelar: string } {
  const base = confirmacionAdelanto(details, "alta", "cobro");
  const mes = esDiaValido(fecha) ? (fecha as string).slice(0, 7) : null;
  const deMes = mes && esMesValido(mes) ? `de ${etiquetaMes(mes)}` : "de ese mes";
  return {
    titulo: base.titulo,
    descripcion: `Las utilidades ${deMes} todavía no alcanzan o no han cerrado. ${base.descripcion}`,
    confirmar: BOTON_REGISTRAR_ADELANTO,
    cancelar: "Cancelar",
  };
}

/** Toast de éxito. */
export function textoCobroUtilidadesRegistrado(socioNombre: string | null | undefined): string {
  const socio = (socioNombre ?? "").trim() || "el socio";
  return `Cobro registrado con utilidades de ${socio}. Se descontó en Pagos a socios.`;
}

/** El reintento con la misma llave encontró el cobro ya hecho. */
export const TEXTO_COBRO_UTILIDADES_YA_REGISTRADO = "Ese cobro ya estaba registrado; no se duplicó.";

/** La LLAMADA al servidor falló: reintentar desde la misma ficha no duplica. */
export const TEXTO_FALLO_RED_COBRO_UTILIDADES =
  "No se pudo confirmar el cobro con el servidor (falló la conexión). Vuelve a intentarlo desde aquí: no se duplica.";

// =============================================================================
// Errores del API en es-MX (por `code`)
// =============================================================================

export const CODIGO_COBRO_CON_UTILIDADES = "COBRO_CON_UTILIDADES";
export const CODIGO_COBRO_UTILIDADES_SOLO_DIRECCION = "COBRO_CON_UTILIDADES_SOLO_DIRECCION";
export const CODIGO_COBRO_UTILIDADES_NO_DISPONIBLE = "COBRO_UTILIDADES_NO_DISPONIBLE";

/**
 * RESPALDO por código cuando el API no manda un texto útil (vacío, técnico o
 * en inglés). Con texto en español se pinta el del API: sabe más del caso.
 */
const MENSAJES_RESPALDO: Record<string, string> = {
  [CODIGO_EXCEDE_SALDO]: "El cobro supera lo que hay por entregar al socio.",
  COBRO_EXCEDE_SALDO: "El monto rebasa lo que falta por cobrar de este vuelo. Revisa el monto.",
  SOCIO_NO_ES_DE_LA_AERONAVE: "Esa persona no es socia del avión elegido. Elige otro avión.",
  SOCIO_INVALIDO:
    "Esa persona no está registrada como socia de ningún avión. Revisa los socios en la ficha del avión.",
  MONTO_INVALIDO: "Revisa el monto: debe ser mayor a 0.",
  TC_REQUERIDO: "Captura el tipo de cambio: la cuenta del socio es en pesos.",
  TC_FUERA_DE_RANGO: `Revisa el tipo de cambio: debe estar entre ${TC_UTILIDADES_MIN} y ${TC_UTILIDADES_MAX}.`,
  MES_CERRADO: "Ese mes ya está cerrado. Reábrelo en Reportes para registrar el cobro.",
  [CODIGO_COBRO_UTILIDADES_NO_DISPONIBLE]:
    "El cobro con utilidades del socio todavía no está disponible en el servidor (falta actualizarlo). No se guardó nada: avisa a sistemas.",
  [CODIGO_COBRO_CON_UTILIDADES]:
    "Este cobro se pagó con utilidades del socio: su monto, moneda, tipo de cambio, fecha y método no se corrigen. Si está mal, quítalo y regístralo de nuevo.",
  [CODIGO_COBRO_UTILIDADES_SOLO_DIRECCION]:
    "Solo Dirección y Facturación pueden quitar un cobro pagado con utilidades del socio (también se quita su entrega en Pagos a socios).",
};

/** Textos del PANEL que ganan al del API (jerga que el operador no entiende). */
const MENSAJES_PANEL: Record<string, string> = {
  CLIENT_REQUEST_ID_EN_USO:
    "Este registro ya se usó para otro cobro. Cierra el formulario y vuelve a abrirlo para registrarlo.",
};

const TECNICO =
  /^(Internal server error|Request failed|Bad Request|Not Found|Unauthorized|Forbidden|Forbidden resource|Conflict|Service Unavailable|Bad Gateway|Error desconocido)$/i;
/** Mensajes de validación de class-validator (en inglés). */
const VALIDACION_EN_INGLES = /\b(should|must|property|is not|not allowed)\b/i;

/**
 * Mensaje es-MX de un rechazo del cobro con utilidades (alta, corrección o
 * baja). El texto del API ya viene en español y se respeta SIEMPRE que sea
 * legible; lo técnico o en inglés se cambia por uno que dice qué hacer.
 */
export function mensajeErrorCobroUtilidades(res: {
  code?: string | null;
  error?: string | null;
  status?: number | null;
}): string {
  const code = res.code ?? "";
  if (MENSAJES_PANEL[code]) return MENSAJES_PANEL[code];
  const msg = (res.error ?? "").trim();
  const usable = msg !== "" && !TECNICO.test(msg) && !VALIDACION_EN_INGLES.test(msg) && !/^Cannot (GET|POST|PATCH|PUT|DELETE)\b/.test(msg);
  if (MENSAJES_RESPALDO[code]) return usable ? msg : MENSAJES_RESPALDO[code];
  if (res.status === 404 && /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/.test(msg)) {
    return "El servidor todavía no tiene esta función (falta actualizarlo). No se guardó nada: avisa a sistemas.";
  }
  if (res.status === 401 || code === "UNAUTHORIZED") {
    return "Tu sesión expiró. Recarga la página e inicia sesión.";
  }
  if (res.status === 403 || code === "FORBIDDEN") {
    return "Solo Dirección y Facturación pueden cobrar un vuelo con utilidades del socio.";
  }
  if (usable) return msg;
  if (res.status === 400) return "El servidor rechazó un dato. Revisa el formulario y vuelve a intentarlo.";
  return "No se pudo registrar el cobro con utilidades. Vuelve a intentarlo; si sigue igual, avisa a sistemas.";
}

// =============================================================================
// Cómo se LEE en la lista de cobros
// =============================================================================

type CobroConUtilidades = Pick<FlightCobro, "utilidades">;

/** La liga a la entrega del socio, o null (cobro normal / API previo). */
export function utilidadesDeCobro(c: CobroConUtilidades | null | undefined): CobroUtilidadesSocio | null {
  const u = c?.utilidades;
  return u && typeof u === "object" ? u : null;
}

/** ¿El socio pagó este cobro con sus utilidades? */
export function esCobroConUtilidades(c: CobroConUtilidades | null | undefined): boolean {
  return utilidadesDeCobro(c) !== null;
}

/**
 * El «método» de un cobro tal como se lee en las cards: el de siempre, o
 * «Utilidades del socio · Mauricio Roque» (nunca «Otro», que es solo el
 * método interno con el que el API lo guarda).
 */
export function etiquetaMetodoDeCobro(
  c: Pick<FlightCobro, "metodo_cobro" | "utilidades">,
): string {
  const u = utilidadesDeCobro(c);
  if (!u) return metodoPagoLabel(c.metodo_cobro);
  const socio = (u.socio_nombre ?? "").trim();
  return socio ? `${ETIQUETA_UTILIDADES_SOCIO} · ${socio}` : ETIQUETA_UTILIDADES_SOCIO;
}

/** «Descontado de N4142R · Noviembre 2026» (lo que venga; sin nada, null). */
export function detalleUtilidadesDeCobro(c: CobroConUtilidades | null | undefined): string | null {
  const u = utilidadesDeCobro(c);
  if (!u) return null;
  const mes = typeof u.mes === "string" ? u.mes.slice(0, 7) : "";
  const partes = [(u.matricula ?? "").trim() || null, esMesValido(mes) ? etiquetaMes(mes) : null].filter(Boolean);
  return partes.length > 0 ? `Descontado de ${partes.join(" · ")}` : null;
}

/**
 * «Liquidado con: …» de la card del vuelo. El API deriva
 * `metodo_cobro_final` del último abono que dejó el vuelo liquidado; si ese
 * cobro se pagó con utilidades llega "OTRO" (su método interno). Cuando TODOS
 * los cobros positivos con método OTRO del vuelo son con utilidades, ese
 * «Otro» solo puede ser uno de ellos ⇒ se dice «Utilidades del socio». Con un
 * «Otro» de verdad en la lista no se adivina: queda «Otro».
 */
export function etiquetaMetodoCobroFinal(
  metodoFinal: string | null | undefined,
  cobros: readonly Pick<FlightCobro, "monto" | "metodo_cobro" | "utilidades">[],
): string {
  if (metodoFinal === "OTRO") {
    const otros = cobros.filter((c) => c.metodo_cobro === "OTRO" && Number(c.monto) > 0);
    if (otros.length > 0 && otros.every((c) => esCobroConUtilidades(c))) return ETIQUETA_UTILIDADES_SOCIO;
  }
  return metodoPagoLabel(metodoFinal);
}

/** `title` del renglón «Descontado de…». */
export const TITULO_DETALLE_UTILIDADES =
  "No entró dinero: el socio pagó con sus utilidades. Está descontado en Pagos a socios.";

/** Por qué un cobro con utilidades no lleva «Editar» (el API responde 409). */
export const TEXTO_COBRO_UTILIDADES_NO_SE_EDITA =
  "Se pagó con utilidades del socio y está descontado en Pagos a socios: su monto, moneda, tipo de cambio, fecha y método no se corrigen aquí. Si está mal, quítalo y regístralo de nuevo.";

/**
 * ¿Se pinta «Eliminar» en este cobro? Uno con utilidades, solo DIRECCION y
 * FACTURACION (otro rol recibe 403 `COBRO_CON_UTILIDADES_SOLO_DIRECCION`);
 * los demás cobros, como siempre (esta regla no opina).
 */
export function puedeEliminarCobro(
  c: CobroConUtilidades | null | undefined,
  rol: string | null | undefined,
): boolean {
  return !esCobroConUtilidades(c) || puedeCobrarConUtilidades(rol);
}

/**
 * Confirmación ESPECÍFICA al quitar un cobro con utilidades: se va también
 * la entrega al socio. null = un cobro normal (la confirmación de siempre).
 */
export function confirmacionEliminarCobroUtilidades(
  c: Pick<FlightCobro, "monto" | "moneda" | "utilidades"> | null | undefined,
): string | null {
  const u = utilidadesDeCobro(c);
  if (!c || !u) return null;
  const socio = (u.socio_nombre ?? "").trim() || "el socio";
  return `Se quitará el cobro y también la entrega de ${fmtMonto(c.monto, c.moneda)} a ${socio} en Pagos a socios. El vuelo volverá a quedar pendiente de cobro.`;
}

/** Toast tras quitarlo. */
export const TEXTO_COBRO_UTILIDADES_ELIMINADO =
  "Cobro eliminado; también se quitó la entrega al socio en Pagos a socios.";
