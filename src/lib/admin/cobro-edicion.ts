/**
 * CORREGIR UN COBRO ya registrado (26-sep-2026).
 *
 * Pedido del cliente con la captura de la cotización #315 «Beh Kay» (card
 * «Cobros del vuelo» con dos cobros, cada uno SOLO con recibo y bote de
 * basura): «Necesito que me ayudes a habilitar una opción para poder editar
 * los cobros en las cotizaciones, porque ahorita pasó que grabaron mal un
 * cobro del 17 de septiembre y no podemos editarlo de forma sencilla para
 * corregirlo». La única salida era borrarlo y recapturarlo.
 *
 * El API YA lo permite (`PATCH /v1/flights/cobros/:cobroId`, ADMIN y
 * FACTURACION, `FlightsService.updateCobro`, que recalcula la bandera
 * `cobrado` con `cobrosEnUsd`). Este módulo es la FUENTE ÚNICA (PURA, sin
 * React) de todo lo que el panel decide al corregir:
 *
 *  - quién ve «Editar» (`puedeEditarCobro`, espejo del `@Roles` del PATCH);
 *  - qué se puede corregir según el TIPO de cobro (`edicionDeCobro`), espejo
 *    EXACTO de los candados de `updateCobro`:
 *      · parte de un SOBRE de grupo ⇒ no se ofrece (409 COBRO_DE_GRUPO: se
 *        corrige desde el grupo);
 *      · REEMBOLSO (monto negativo) ⇒ el API rechaza tocar monto, moneda,
 *        T.C. y comisión (400); el panel además deja de solo lectura el
 *        método y la cuenta (son el «dinero» del movimiento);
 *      · CONCILIADO con el banco (liga directa) ⇒ mismo candado del API
 *        (monto, moneda, T.C., comisión) + método y cuenta de solo lectura;
 *      · de un ANTICIPO ⇒ el API rechaza monto, moneda, método y comisión
 *        (409 COBRO_DE_ANTICIPO); el T.C. SÍ se corrige (no toca el saldo
 *        del anticipo); la cuenta queda de solo lectura (es la del anticipo);
 *  - el formulario prellenado (`formularioDesdeCobro`), el DIFF que se manda
 *    (`cambiosDeCobro`: SOLO lo que cambió, nunca el formulario entero) y las
 *    líneas «antes → después» de la confirmación;
 *  - la validación propia de la edición (`erroresEdicionCobro`) y los textos
 *    de error del API en es-MX (`mensajeErrorEdicionCobro`).
 *
 * Aquí NO se calcula ningún cobrado ni saldo: eso lo recalcula el API. La
 * única cuenta es la COMISIÓN que resultará, con la MISMA expresión que el
 * API (`Math.round(monto × (pct / 100) × 100) / 100`) — la confirmación tiene
 * que decir exactamente lo que va a quedar guardado.
 */
import type { FlightCobro } from "@/types/flights";
import type { MetodoPago } from "@/types/quote";
import { CUENTAS_COBRO, type CuentaCobro } from "@/lib/admin/cobros";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { fmtMonto, fmtTc } from "@/lib/format";
import { cancunInputToIso, fmtDateOnly, isoToCancunInput } from "@/lib/datetime";

export type MonedaCobro = "USD" | "MXN";

// ═══════════════════════════════ Roles ═══════════════════════════════

/** Espejo del `@Roles(Rol.ADMIN, Rol.FACTURACION)` de `PATCH cobros/:id`. */
export const ROLES_EDITAR_COBRO = ["ADMIN", "FACTURACION"] as const;

export function puedeEditarCobro(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_EDITAR_COBRO as readonly string[]).includes(rol);
}

/**
 * ¿La card dice «corrígelo con «Editar»»? Solo si quien mira puede corregir
 * y hay AL MENOS un cobro con el botón (si todos son partes de un sobre de
 * grupo no hay «Editar» que señalar).
 */
export function hayCobrosEditables(
  cobros: readonly FlightCobro[],
  rol: string | null | undefined,
): boolean {
  return puedeEditarCobro(rol) && cobros.some((c) => edicionDeCobro(c).ofrecer);
}

// ═══════════════════ Qué se puede corregir de cada cobro ═══════════════════

export type MotivoCandadoCobro = "REEMBOLSO" | "CONCILIADO" | "ANTICIPO";

export interface EdicionCobro {
  /** false = parte de un sobre de grupo: no se ofrece «Editar» por vuelo. */
  ofrecer: boolean;
  /** Por qué no se ofrece (solo sobre de grupo). */
  razonSinEditar: string | null;
  /** Monto, moneda, método, comisión y cuenta van de SOLO LECTURA. */
  dineroBloqueado: boolean;
  /** El T.C. va de solo lectura (el API lo trata como dinero). */
  tcBloqueado: boolean;
  motivo: MotivoCandadoCobro | null;
  /** Explicación para el operador (es-MX) cuando algo va bloqueado. */
  explicacion: string | null;
}

/** Texto único: por qué una parte de sobre no se corrige desde el vuelo. */
export const TEXTO_SOBRE_NO_SE_EDITA =
  "Los cobros que son parte de un sobre de grupo se corrigen, re-parten o eliminan desde el grupo (Cobros del grupo).";

/** Parte de un sobre de grupo (misma regla que `esParteDeSobre`). */
function esParteDeSobre(c: Pick<FlightCobro, "cobro_grupo" | "cobro_grupo_id">): boolean {
  return c.cobro_grupo != null || c.cobro_grupo_id != null;
}

/**
 * Conciliado por LIGA DIRECTA (o del sobre) con un movimiento del banco. Un
 * cobro conciliado «vía el anticipo» NO cuenta: el candado del API
 * (`assertCobroSinConciliar` → `movimientoDeCobro`) solo mira la liga
 * directa y la del sobre, y ahí el T.C. sí se corrige.
 */
function conciliadoDirecto(c: Pick<FlightCobro, "conciliado" | "conciliado_via">): boolean {
  return c.conciliado === true && c.conciliado_via !== "ANTICIPO";
}

export function edicionDeCobro(c: FlightCobro): EdicionCobro {
  if (esParteDeSobre(c)) {
    return {
      ofrecer: false,
      razonSinEditar: TEXTO_SOBRE_NO_SE_EDITA,
      dineroBloqueado: true,
      tcBloqueado: true,
      motivo: null,
      explicacion: null,
    };
  }
  if (Number(c.monto) < 0) {
    return {
      ofrecer: true,
      razonSinEditar: null,
      dineroBloqueado: true,
      tcBloqueado: true,
      motivo: "REEMBOLSO",
      explicacion:
        "Es un reembolso: su dinero (monto, moneda, método, T.C., comisión y cuenta) no se corrige. Si está mal, elimínalo y vuelve a registrarlo. Aquí puedes corregir la fecha, la referencia y las notas.",
    };
  }
  if (conciliadoDirecto(c)) {
    return {
      ofrecer: true,
      razonSinEditar: null,
      dineroBloqueado: true,
      tcBloqueado: true,
      motivo: "CONCILIADO",
      explicacion:
        "Está conciliado con un movimiento del banco: su dinero (monto, moneda, método, T.C., comisión y cuenta) no se corrige mientras siga ligado. Si está mal, desvincúlalo primero en Conciliación. Aquí puedes corregir la fecha, la referencia y las notas.",
    };
  }
  if (c.anticipo) {
    const conTc = c.moneda === "MXN";
    return {
      ofrecer: true,
      razonSinEditar: null,
      dineroBloqueado: true,
      tcBloqueado: false,
      motivo: "ANTICIPO",
      explicacion: `Salió del anticipo ${c.anticipo.etiqueta}: su monto, moneda, método, comisión y cuenta vienen del anticipo. Para cambiarlos, desaplícalo y vuelve a aplicarlo desde Ingresos → Anticipos. Aquí puedes corregir ${conTc ? "el T.C., " : ""}la fecha, la referencia y las notas.`,
    };
  }
  return {
    ofrecer: true,
    razonSinEditar: null,
    dineroBloqueado: false,
    tcBloqueado: false,
    motivo: null,
    explicacion: null,
  };
}

/** Tooltip del botón «Editar» (dice de antemano qué se puede corregir). */
export function tituloBotonEditarCobro(c: FlightCobro, e: EdicionCobro = edicionDeCobro(c)): string {
  switch (e.motivo) {
    case "REEMBOLSO":
      return "Corregir este reembolso: fecha, referencia y notas";
    case "CONCILIADO":
      return "Corregir este cobro: está conciliado con el banco, solo fecha, referencia y notas";
    case "ANTICIPO":
      return c.moneda === "MXN"
        ? "Corregir este cobro: viene de un anticipo, solo T.C., fecha, referencia y notas"
        : "Corregir este cobro: viene de un anticipo, solo fecha, referencia y notas";
    default:
      return "Corregir este cobro (monto, método, fecha, referencia…)";
  }
}

/** Nombre accesible del botón: «Editar cobro de $3,400 MXN». */
export function etiquetaBotonEditarCobro(c: FlightCobro): string {
  const monto = Number(c.monto);
  return `${monto < 0 ? "Editar reembolso" : "Editar cobro"} de ${fmtMonto(Math.abs(monto), c.moneda)}`;
}

/** Título de la ficha en modo edición. */
export function tituloFichaEdicion(c: FlightCobro): string {
  return Number(c.monto) < 0 ? "Corregir reembolso" : "Corregir cobro";
}

/**
 * Subtítulo de la ficha: «Cobro del 17 sep 2026 · $68,205.55 MXN ·
 * Registró: Itzi. Solo se guarda lo que cambies…». El nombre lo manda el API
 * (`registrado_por_nombre`); sin él no se pinta (misma regla que
 * `textoRegistroCobro`).
 */
export function descripcionFichaEdicion(c: FlightCobro, registro: string | null): string {
  const dia = isoToCancunInput(c.fecha_cobro).slice(0, 10);
  const que = Number(c.monto) < 0 ? "Reembolso" : "Cobro";
  const partes = [
    `${que} del ${dia ? fmtDateOnly(dia) : "—"}`,
    fmtMonto(c.monto, c.moneda),
    ...(registro ? [registro] : []),
  ];
  return `${partes.join(" · ")}. Solo se guarda lo que cambies y antes de guardar verás el antes y el después.`;
}

/** Encabezado del recuadro de lo que va de solo lectura. */
export const TITULO_SOLO_LECTURA_COBRO = "Lo que no se corrige aquí";

/**
 * Renglones del recuadro de SOLO LECTURA (reembolso, conciliado, anticipo):
 * el dinero tal como está guardado, con su moneda. Vacío si nada va
 * bloqueado.
 */
export function datosSoloLecturaCobro(
  c: FlightCobro,
  e: EdicionCobro = edicionDeCobro(c),
): { etiqueta: string; valor: string }[] {
  if (!e.dineroBloqueado) return [];
  const filas: { etiqueta: string; valor: string }[] = [
    { etiqueta: "Monto", valor: fmtMonto(c.monto, c.moneda) },
    { etiqueta: "Método", valor: metodoPagoLabel(c.metodo_cobro) },
  ];
  const cuenta = (c.cuenta_destino ?? "").trim();
  if (cuenta) filas.push({ etiqueta: "Cuenta", valor: cuenta });
  const cm = numeroDe(c.comision_banco_monto);
  filas.push({
    etiqueta: "Comisión del banco",
    valor: cm != null && cm > 0 ? fmtMonto(cm, c.moneda) : "Sin comisión",
  });
  if (e.tcBloqueado && c.moneda === "MXN") {
    filas.push({ etiqueta: "Tipo de cambio", valor: fmtTc(c.tc_usd_mxn) || "sin T.C." });
  }
  return filas;
}

/** Pista del T.C. en edición (sin el caso «prellenado», que es del alta). */
export function hintTcEdicion(inicial: InicialEdicionCobro, tcActual: unknown): string {
  const t = numeroDe(tcActual);
  if (inicial.valores.moneda === "MXN" && inicial.valores.tc_usd_mxn === "" && !(t != null && t > 0)) {
    return "Este cobro no tiene T.C. propio: se convierte con el de la cotización. Captúralo si fue otro.";
  }
  return "Corrígelo si se capturó mal: cambia cuánto cuenta este cobro en USD.";
}

/** Pista de una cuenta capturada antes del catálogo fijo (alias libre). */
export function hintCuentaLegada(legada: string): string {
  return `Capturada antes como «${legada}» (fuera de la lista). Se conserva si no eliges otra.`;
}

// ═══════════════════════ Números (helpers puros) ═══════════════════════

/** Número finito de un valor del formulario; vacío/null/NaN ⇒ null. */
export function numeroDe(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Comisión en dinero de un % — EXACTAMENTE la expresión del API. */
function comisionDePct(monto: number, pct: number): number {
  return Math.round(monto * (pct / 100) * 100) / 100;
}

// ═══════════════════════ Formulario prellenado ═══════════════════════

/** Valores del formulario de cobro (misma forma que `CobroFormSheet`). */
export interface ValoresEdicionCobro {
  monto: unknown;
  moneda: string;
  metodo_cobro: string;
  tc_usd_mxn?: unknown;
  comision_banco_pct?: unknown;
  comision_banco_monto?: unknown;
  referencia?: string;
  cuenta_destino?: string;
  /** YYYY-MM-DD (día de pared en Cancún). */
  fecha_cobro?: string;
  notas?: string;
}

export interface InicialEdicionCobro {
  valores: {
    /** POSITIVO siempre (un reembolso se guarda negativo; aquí va su valor). */
    monto: number;
    moneda: MonedaCobro;
    metodo_cobro: MetodoPago;
    /** "" = el cobro no tiene T.C. propio. */
    tc_usd_mxn: number | "";
    comision_banco_pct: number | "";
    comision_banco_monto: number | "";
    referencia: string;
    /** "" = sin cuenta o una cuenta fuera del catálogo (ver `cuentaLegada`). */
    cuenta_destino: CuentaCobro | "";
    fecha_cobro: string;
    notas: string;
  };
  /** Cuenta capturada antes del catálogo fijo (alias libre): se conserva. */
  cuentaLegada: string | null;
  /** Hora de pared (Cancún, HH:mm) del cobro: se conserva al cambiar el día. */
  horaCancun: string;
}

function esCuentaDelCatalogo(v: string | null | undefined): v is CuentaCobro {
  return CUENTAS_COBRO.some((c) => c.value === v);
}

/**
 * ¿Cómo se prellena la comisión? El cobro guarda las DOS formas (% y monto),
 * y no se sabe cuál tecleó quien lo registró. Regla determinista:
 *  - si el % guardado, aplicado al monto con la expresión del API, da
 *    EXACTAMENTE la comisión guardada (y cabe en el tope de 20 %), se prellena
 *    el % — así, si se corrige el monto, la comisión se recalcula igual que en
 *    el API y la vista previa del formulario dice la verdad;
 *  - si no (se capturó como monto directo y el % es derivado con 4
 *    decimales), se prellena el MONTO: es el dinero que retuvo el banco.
 */
function comisionInicial(
  montoAbs: number,
  c: Pick<FlightCobro, "comision_banco_pct" | "comision_banco_monto">,
): { pct: number | ""; monto: number | "" } {
  const cmRaw = numeroDe(c.comision_banco_monto);
  const pctRaw = numeroDe(c.comision_banco_pct);
  const cm = cmRaw != null && cmRaw > 0 ? round2(cmRaw) : null;
  const pct = pctRaw != null && pctRaw > 0 ? pctRaw : null;
  if (cm == null && pct == null) return { pct: "", monto: "" };
  if (pct != null && pct <= 20 && (cm == null || comisionDePct(montoAbs, pct) === cm)) {
    return { pct, monto: "" };
  }
  return { pct: "", monto: cm ?? "" };
}

export function formularioDesdeCobro(c: FlightCobro): InicialEdicionCobro {
  const montoAbs = round2(Math.abs(Number(c.monto) || 0));
  const tc = numeroDe(c.tc_usd_mxn);
  const comision = comisionInicial(montoAbs, c);
  const cuentaRaw = (c.cuenta_destino ?? "").trim();
  const pared = isoToCancunInput(c.fecha_cobro); // «YYYY-MM-DDTHH:mm» Cancún
  return {
    valores: {
      monto: montoAbs,
      moneda: c.moneda === "MXN" ? "MXN" : "USD",
      metodo_cobro: c.metodo_cobro,
      tc_usd_mxn: tc != null && tc > 0 ? tc : "",
      comision_banco_pct: comision.pct,
      comision_banco_monto: comision.monto,
      referencia: c.referencia ?? "",
      cuenta_destino: esCuentaDelCatalogo(cuentaRaw) ? cuentaRaw : "",
      fecha_cobro: pared.slice(0, 10),
      notas: c.notas ?? "",
    },
    cuentaLegada: cuentaRaw && !esCuentaDelCatalogo(cuentaRaw) ? cuentaRaw : null,
    horaCancun: pared.slice(11, 16) || "12:00",
  };
}

// ═══════════════════════ Diff: qué viaja al API ═══════════════════════

/**
 * Cuerpo de `PATCH /v1/flights/cobros/:cobroId` (`UpdateCobroDto`). SOLO lo
 * que cambió: el API corre con `forbidNonWhitelisted` y compara el dinero de
 * un cobro de anticipo contra el vigente — mandar el formulario completo es
 * mandar cambios que nadie pidió.
 */
export interface PatchCobro {
  monto?: number;
  moneda?: MonedaCobro;
  metodo_cobro?: MetodoPago;
  /**
   * null = quitar el T.C. (el cobro pasó de pesos a DÓLARES: un cobro en
   * dólares no guarda T.C., igual que en el alta — ver `cambiosDeCobro`).
   */
  tc_usd_mxn?: number | null;
  /** 0 = quitar la comisión. */
  comision_banco_pct?: number;
  comision_banco_monto?: number;
  /** null = quitar la cuenta. */
  cuenta_destino?: CuentaCobro | null;
  /** null = vaciar. */
  referencia?: string | null;
  /** ISO UTC (día elegido + la hora de pared original del cobro). */
  fecha_cobro?: string;
  notas?: string | null;
}

export type CampoCambioCobro =
  | "monto"
  | "metodo_cobro"
  | "tc_usd_mxn"
  | "comision"
  | "cuenta_destino"
  | "referencia"
  | "fecha_cobro"
  | "notas";

export interface LineaCambioCobro {
  campo: CampoCambioCobro;
  etiqueta: string;
  antes: string;
  despues: string;
}

export interface CambiosCobro {
  patch: PatchCobro;
  lineas: LineaCambioCobro[];
  hayCambios: boolean;
  /** ¿Cambia algo que mueve el cobrado (monto, moneda, T.C., comisión)? */
  tocaDinero: boolean;
}

type FormaComision =
  | { tipo: "ninguna" }
  | { tipo: "pct"; pct: number }
  | { tipo: "monto"; monto: number };

/** Misma precedencia que el formulario y el API: el monto directo manda. */
function formaComision(pct: unknown, monto: unknown): FormaComision {
  const m = numeroDe(monto);
  if (m != null && m > 0) return { tipo: "monto", monto: round2(m) };
  const p = numeroDe(pct);
  if (p != null && p > 0) return { tipo: "pct", pct: round6(p) };
  return { tipo: "ninguna" };
}

function mismaForma(a: FormaComision, b: FormaComision): boolean {
  if (a.tipo !== b.tipo) return false;
  if (a.tipo === "pct" && b.tipo === "pct") return a.pct === b.pct;
  if (a.tipo === "monto" && b.tipo === "monto") return a.monto === b.monto;
  return true;
}

function comisionQueQueda(montoCobro: number, f: FormaComision): number {
  if (f.tipo === "monto") return f.monto;
  if (f.tipo === "pct") return comisionDePct(montoCobro, f.pct);
  return 0;
}

function textoComision(monto: number, moneda: string, f: FormaComision): string {
  if (!(monto > 0)) return "sin comisión";
  const base = fmtMonto(monto, moneda);
  return f.tipo === "pct" ? `${base} (${f.pct} %)` : base;
}

function textoLibre(v: string, vacio: string): string {
  const t = v.trim().replace(/\s+/g, " ");
  if (!t) return vacio;
  return t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

/**
 * Qué cambió entre el cobro y el formulario, en DOS formas: el `patch` que
 * viaja al API (solo lo que cambió) y las `lineas` «antes → después» de la
 * confirmación. Lo bloqueado por el tipo de cobro JAMÁS viaja, aunque el
 * formulario traiga otro valor.
 *
 * Comisión (WYSIWYG): si se corrige el MONTO de un cobro cuya comisión es un
 * monto directo, el API la recalcularía con el % derivado (4 decimales); por
 * eso se reenvía el monto de comisión que el operador VE. Con comisión en %
 * no hace falta: el API aplica el mismo % guardado y la línea de la
 * confirmación ya dice el resultado.
 */
export function cambiosDeCobro(
  cobro: FlightCobro,
  inicial: InicialEdicionCobro,
  valores: ValoresEdicionCobro,
  edicion: EdicionCobro,
): CambiosCobro {
  const patch: PatchCobro = {};
  const lineas: LineaCambioCobro[] = [];
  const ini = inicial.valores;
  let tocaDinero = false;

  let monedaDespues: MonedaCobro = ini.moneda;
  if (!edicion.dineroBloqueado) {
    // ---- Monto y moneda (una sola línea: el monto va con SU moneda) ----
    monedaDespues = valores.moneda === "USD" || valores.moneda === "MXN" ? valores.moneda : ini.moneda;
    const m = numeroDe(valores.monto);
    const montoDespues = m != null ? round2(m) : ini.monto;
    const cambiaMonto = montoDespues !== ini.monto;
    const cambiaMoneda = monedaDespues !== ini.moneda;
    if (cambiaMonto) patch.monto = montoDespues;
    if (cambiaMoneda) patch.moneda = monedaDespues;
    if (cambiaMonto || cambiaMoneda) {
      tocaDinero = true;
      lineas.push({
        campo: "monto",
        etiqueta: "Monto",
        antes: fmtMonto(ini.monto, ini.moneda),
        despues: fmtMonto(montoDespues, monedaDespues),
      });
    }

    // ---- Método ----
    if (valores.metodo_cobro && valores.metodo_cobro !== ini.metodo_cobro) {
      patch.metodo_cobro = valores.metodo_cobro as MetodoPago;
      lineas.push({
        campo: "metodo_cobro",
        etiqueta: "Método",
        antes: metodoPagoLabel(ini.metodo_cobro),
        despues: metodoPagoLabel(valores.metodo_cobro),
      });
    }

    // ---- Comisión del banco ----
    const formaAntes = formaComision(ini.comision_banco_pct, ini.comision_banco_monto);
    const formaDespues = formaComision(valores.comision_banco_pct, valores.comision_banco_monto);
    if (!mismaForma(formaAntes, formaDespues)) {
      if (formaDespues.tipo === "monto") patch.comision_banco_monto = formaDespues.monto;
      else if (formaDespues.tipo === "pct") patch.comision_banco_pct = formaDespues.pct;
      else patch.comision_banco_pct = 0;
    } else if (cambiaMonto && formaDespues.tipo === "monto") {
      patch.comision_banco_monto = formaDespues.monto;
    }
    const cmGuardada = numeroDe(cobro.comision_banco_monto);
    const cmAntes = cmGuardada != null && cmGuardada > 0 ? round2(cmGuardada) : 0;
    const cmDespues = comisionQueQueda(montoDespues, formaDespues);
    if (cmAntes !== cmDespues || (cmDespues > 0 && cambiaMoneda)) {
      tocaDinero = true;
      lineas.push({
        campo: "comision",
        etiqueta: "Comisión del banco",
        antes: textoComision(cmAntes, ini.moneda, formaAntes),
        despues: textoComision(cmDespues, monedaDespues, formaDespues),
      });
    }

    // ---- Cuenta destino ----
    const cuentaAntes = ini.cuenta_destino;
    const cuentaDespues = (valores.cuenta_destino ?? "").trim();
    if (cuentaDespues !== cuentaAntes) {
      patch.cuenta_destino = esCuentaDelCatalogo(cuentaDespues) ? cuentaDespues : null;
      lineas.push({
        campo: "cuenta_destino",
        etiqueta: "Cuenta destino",
        antes: cuentaAntes || inicial.cuentaLegada || "Sin especificar",
        despues: cuentaDespues || "Sin especificar",
      });
    }
  }

  // ---- Tipo de cambio ----
  // Misma regla que el ALTA (el formulario jamás manda T.C. en dólares y
  // `createCobro` no le pone uno): un cobro en DÓLARES no guarda T.C. Al
  // pasar de pesos a dólares se QUITA (`null`): si se quedara, el balance
  // por avión y el Libro Dinero convertirían ese cobro con el T.C. viejo en
  // vez del T.C. de venta del vuelo (leen `c.tc_usd_mxn ?? K`), distinto de
  // un cobro idéntico registrado en dólares. Revisión adversaria 26-sep-2026:
  // en producción ningún cobro en USD tiene T.C.
  const pasaAUsd = ini.moneda === "MXN" && monedaDespues === "USD";
  const pasaAMxn = ini.moneda !== "MXN" && monedaDespues === "MXN";
  if (pasaAUsd) {
    if (ini.tc_usd_mxn !== "") {
      patch.tc_usd_mxn = null;
      tocaDinero = true;
      lineas.push({
        campo: "tc_usd_mxn",
        etiqueta: "Tipo de cambio",
        antes: fmtTc(ini.tc_usd_mxn),
        despues: "no aplica (cobro en USD)",
      });
    }
  } else if (!edicion.tcBloqueado && monedaDespues === "MXN") {
    const t = numeroDe(valores.tc_usd_mxn);
    const tcDespues = t != null && t > 0 ? round6(t) : null;
    const tcAntes = ini.tc_usd_mxn === "" ? null : round6(ini.tc_usd_mxn);
    // Al pasar de dólares a pesos el T.C. viaja SIEMPRE (aunque coincida con
    // uno que el cobro traía en dólares): desde ahora es el que convierte.
    if (tcDespues != null && (tcDespues !== tcAntes || pasaAMxn)) {
      patch.tc_usd_mxn = tcDespues;
      tocaDinero = true;
      lineas.push({
        campo: "tc_usd_mxn",
        etiqueta: "Tipo de cambio",
        antes: tcAntes != null && !pasaAMxn ? fmtTc(tcAntes) : "sin T.C.",
        despues: fmtTc(tcDespues),
      });
    }
  }

  // ---- Referencia ----
  const refAntes = ini.referencia.trim();
  const refDespues = (valores.referencia ?? "").trim();
  if (refDespues !== refAntes) {
    patch.referencia = refDespues || null;
    lineas.push({
      campo: "referencia",
      etiqueta: "Referencia",
      antes: textoLibre(refAntes, "(vacía)"),
      despues: textoLibre(refDespues, "(vacía)"),
    });
  }

  // ---- Fecha del cobro (día de pared en Cancún; conserva la hora) ----
  const diaDespues = (valores.fecha_cobro ?? "").slice(0, 10);
  if (diaDespues && diaDespues !== ini.fecha_cobro) {
    const iso = cancunInputToIso(`${diaDespues}T${inicial.horaCancun}`);
    if (iso) {
      patch.fecha_cobro = iso;
      lineas.push({
        campo: "fecha_cobro",
        etiqueta: "Fecha del cobro",
        antes: ini.fecha_cobro ? fmtDateOnly(ini.fecha_cobro) : "—",
        despues: fmtDateOnly(diaDespues),
      });
    }
  }

  // ---- Notas ----
  const notasAntes = ini.notas.trim();
  const notasDespues = (valores.notas ?? "").trim();
  if (notasDespues !== notasAntes) {
    patch.notas = notasDespues || null;
    lineas.push({
      campo: "notas",
      etiqueta: "Notas",
      antes: textoLibre(notasAntes, "(vacías)"),
      despues: textoLibre(notasDespues, "(vacías)"),
    });
  }

  return {
    patch,
    lineas,
    hayCambios: Object.keys(patch).length > 0,
    tocaDinero,
  };
}

// ═══════════════════════ Validación de la edición ═══════════════════════

export type CampoErrorEdicion =
  | "monto"
  | "tc_usd_mxn"
  | "comision_banco_pct"
  | "comision_banco_monto"
  | "fecha_cobro"
  | "notas";

export const MSG_TC_REQUERIDO = "TC requerido para cobros en MXN (para conciliar con total USD)";

/**
 * El motivo de un reembolso vive en sus notas («Reembolso: …», obligatorio
 * al registrarlo — auditoría): al corregir se puede reescribir, no borrar.
 */
export const MSG_MOTIVO_REEMBOLSO =
  "El motivo del reembolso es obligatorio: corrígelo, pero no dejes las notas vacías.";

/**
 * Reglas que el esquema del alta no cubre en edición:
 *  - el monto (> 0) y la comisión (< monto) solo si el dinero se puede tocar;
 *  - el T.C. en pesos es obligatorio SALVO en un cobro que YA estaba en pesos
 *    sin T.C. propio (el API lo convierte con el de la cotización): corregir
 *    su fecha no obliga a inventar un T.C.; vaciar uno que existía, sí se
 *    frena;
 *  - la fecha no puede quedar vacía;
 *  - un REEMBOLSO no puede quedarse sin notas (ahí vive su motivo).
 */
export function erroresEdicionCobro(
  inicial: InicialEdicionCobro,
  valores: ValoresEdicionCobro,
  edicion: EdicionCobro,
): Partial<Record<CampoErrorEdicion, string>> {
  const errores: Partial<Record<CampoErrorEdicion, string>> = {};
  const ini = inicial.valores;
  let monedaDespues: string = ini.moneda;
  if (!edicion.dineroBloqueado) {
    monedaDespues = valores.moneda;
    const m = numeroDe(valores.monto);
    if (!(m != null && m > 0)) {
      errores.monto = "Monto debe ser > 0";
    } else {
      const forma = formaComision(valores.comision_banco_pct, valores.comision_banco_monto);
      const cm = comisionQueQueda(round2(m), forma);
      if (cm > 0 && cm >= round2(m)) {
        errores[forma.tipo === "monto" ? "comision_banco_monto" : "comision_banco_pct"] =
          "La comisión no puede ser mayor o igual al monto del cobro.";
      }
    }
  }
  if (!edicion.tcBloqueado && monedaDespues === "MXN") {
    const t = numeroDe(valores.tc_usd_mxn);
    const yaSinTc = ini.moneda === "MXN" && ini.tc_usd_mxn === "";
    if (!(t != null && t > 0) && !yaSinTc) errores.tc_usd_mxn = MSG_TC_REQUERIDO;
  }
  const dia = (valores.fecha_cobro ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !cancunInputToIso(`${dia}T12:00`)) {
    errores.fecha_cobro = "Pon la fecha del cobro.";
  }
  if (
    edicion.motivo === "REEMBOLSO" &&
    ini.notas.trim() !== "" &&
    (valores.notas ?? "").trim() === ""
  ) {
    errores.notas = MSG_MOTIVO_REEMBOLSO;
  }
  return errores;
}

// ═══════════════════════ Textos de la confirmación ═══════════════════════

export const TITULO_CONFIRMAR_EDICION = "¿Guardar la corrección?";
export const TEXTO_SIN_CAMBIOS_COBRO = "No cambiaste nada del cobro.";
export const NOTA_RECALCULO_COBRO =
  "El cobrado y el saldo del vuelo se recalculan al guardar.";
export const TEXTO_COBRO_CORREGIDO = "Cobro corregido";

/** «Cobro del 15 sep 2026 · vuelo #315. Esto es lo que cambia:» */
export function descripcionConfirmarEdicion(c: FlightCobro, folio: number | null | undefined): string {
  const dia = isoToCancunInput(c.fecha_cobro).slice(0, 10);
  const que = Number(c.monto) < 0 ? "Reembolso" : "Cobro";
  const vuelo = folio != null && folio > 0 ? ` · vuelo #${folio}` : "";
  return `${que} del ${dia ? fmtDateOnly(dia) : "—"}${vuelo}. Esto es lo que cambia:`;
}

/** Subtexto del toast de éxito: «Cambió: monto, fecha del cobro.» */
export function resumenCambiosCobro(lineas: readonly LineaCambioCobro[]): string {
  if (lineas.length === 0) return "";
  const nombres = lineas.map((l) => l.etiqueta.toLowerCase());
  return `Cambió: ${nombres.join(", ")}.`;
}

// ═══════════════════════ Errores del API en es-MX ═══════════════════════

/** Heurística: el texto viene del framework (inglés), no de una regla del API. */
function pareceTextoTecnico(msg: string): boolean {
  return /\b(must|should|expected|failed|not found|is not|internal server error|request failed|bad request|bad gateway|service unavailable)\b/i.test(
    msg,
  );
}

/**
 * Mensaje del rechazo del PATCH para el operador. Las reglas de dinero del
 * API ya vienen en español (conciliado, reembolso, anticipo, sobre, comisión
 * ≥ monto) y se pintan TAL CUAL; lo técnico (validación en inglés, 404, 403,
 * Railway reiniciando) se traduce.
 */
export function mensajeErrorEdicionCobro(res: {
  error?: string | null;
  code?: string | null;
}): string {
  const msg = (res.error ?? "").trim();
  switch (res.code) {
    case "COBRO_DE_GRUPO":
      return msg || "Este cobro es parte de un sobre de grupo: se corrige desde el grupo (Cobros del grupo).";
    case "COBRO_DE_ANTICIPO":
      return (
        msg ||
        "Este cobro salió de un anticipo: para cambiar el monto, desaplícalo y vuelve a aplicarlo desde Ingresos → Anticipos."
      );
    case "NOT_FOUND":
      return "Este cobro ya no existe (alguien lo eliminó). Recarga la página.";
    case "FORBIDDEN":
      return "Solo administración y facturación pueden corregir cobros.";
    case "UNAUTHORIZED":
      return "Tu sesión expiró. Vuelve a entrar e inténtalo de nuevo.";
    case "PARSE_ERROR":
      return "El servidor no respondió (puede estar reiniciándose). Espera un minuto e inténtalo de nuevo: la corrección NO se guardó.";
  }
  if (/should not exist/i.test(msg)) {
    return "El servidor todavía no acepta esta corrección (falta actualizar el API). Avísale a sistemas: la corrección NO se guardó.";
  }
  if (!msg || pareceTextoTecnico(msg)) {
    return "No se pudo guardar la corrección del cobro. Revisa los datos e inténtalo de nuevo.";
  }
  return msg;
}
