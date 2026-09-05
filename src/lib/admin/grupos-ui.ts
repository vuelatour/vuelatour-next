import { ESTADO_STYLES } from "./estado-vuelo";
import { estadoCobroSemaforo, type EstadoCobroSemaforo } from "./cobros";
import { fmtMontoUnitario } from "./extras";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import type {
  AeronaveEnTallerDetails,
  AvionGrupoDetalle,
  CapacidadExcedidaDetails,
  CobroConciliadoDetails,
  CobroDeGrupoDetails,
  Consolidado,
  ConsolidadoTuas,
  EstadoGrupo,
  GrupoApiError,
  GrupoDetalle,
  GrupoEmbedVuelo,
  HijosCongeladosDetails,
  HijosNoConfirmablesDetails,
  LineaConsolidada,
  MesCerradoDetails,
  ModoParticionCobro,
  MotivoCongelado,
  OpcionCapacidad,
  OperacionTuas,
  ParteAvionConsolidada,
  ParticionNoCuadraDetails,
  PaxNoCuadranDetails,
  PilotoDuplicadoDetails,
  ReembolsoExcedeDetails,
  RepartoExtraGrupo,
  RevisionAMediasDetails,
  SquawkAltaDetails,
  TuasAeropuertoConsolidado,
  TuasAvionConsolidado,
  VueloConGrupo,
} from "@/types/grupos";

/**
 * Helpers PUROS de presentación de la cotización de GRUPO (sin React, sin
 * red, sin dinero calculado): folio, estado derivado, textos de error en
 * es-MX a partir de los 409 estructurados del API, etiquetas de reparto,
 * badge "Grupo G-12 · avión 3 de 7" y semáforo de cobro (fuente única
 * `estadoCobroSemaforo`). Los montos que se pintan aquí vienen del API.
 */

// =====================================================================
// Folio
// =====================================================================

/** "G-12" a partir de 12, "12" o "G-12" (null/inválido ⇒ "G-?"). */
export function folioTexto(folio: number | string | null | undefined): string {
  if (folio == null || folio === "") return "G-?";
  const n = String(folio).trim().replace(/^g-?/i, "");
  return /^\d+$/.test(n) ? `G-${n}` : "G-?";
}

// =====================================================================
// Estado derivado
// =====================================================================

/** Orden para selects/filtros (mismo del API). */
export const ESTADOS_GRUPO = [
  "RESERVA",
  "COTIZADO",
  "CONFIRMADO_PARCIAL",
  "CONFIRMADO",
  "EN_CURSO",
  "COMPLETADO",
  "CANCELADO",
] as const satisfies readonly EstadoGrupo[];

export const ESTADO_GRUPO_LABEL: Record<EstadoGrupo, string> = {
  RESERVA: "Reserva tentativa",
  COTIZADO: "Cotizado",
  CONFIRMADO_PARCIAL: "Confirmado parcial",
  CONFIRMADO: "Confirmado",
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

/**
 * Clases del badge por estado — MISMOS colores que el estado de vuelo
 * (`ESTADO_STYLES`) para que un grupo confirmado se vea igual que un vuelo
 * confirmado; los dos estados propios del grupo (parcial / en curso) toman
 * ámbar y violeta. Uso: `<Badge variant="outline" className={…}>`.
 */
export const ESTADO_GRUPO_STYLES: Record<EstadoGrupo, string> = {
  RESERVA: ESTADO_STYLES.RESERVA,
  COTIZADO: ESTADO_STYLES.COTIZADO,
  CONFIRMADO_PARCIAL: ESTADO_STYLES.SOLICITUD,
  CONFIRMADO: ESTADO_STYLES.CONFIRMADO,
  EN_CURSO: ESTADO_STYLES.EN_VUELO,
  COMPLETADO: ESTADO_STYLES.COMPLETADO,
  CANCELADO: ESTADO_STYLES.CANCELADO,
};

export interface BadgeEstadoGrupo {
  label: string;
  className: string;
  /** Variante del `Badge` de ui (siempre outline + className de color). */
  variant: "outline";
  /** Leyenda corta para tooltip/title. */
  title: string;
}

const ESTADO_GRUPO_TITLE: Record<EstadoGrupo, string> = {
  RESERVA: "Flota apartada; el precio se cierra al confirmar",
  COTIZADO: "Cotizado, sin confirmar",
  CONFIRMADO_PARCIAL: "Algunos aviones confirmados y otros no",
  CONFIRMADO: "Todos los aviones confirmados",
  EN_CURSO: "Algún avión ya salió o ya volvió",
  COMPLETADO: "Todos los aviones completaron su vuelo",
  CANCELADO: "Grupo cancelado",
};

/** Todo lo que necesita un `<Badge>` para pintar el estado del grupo. */
export function estadoGrupoBadge(estado: EstadoGrupo): BadgeEstadoGrupo {
  return {
    label: ESTADO_GRUPO_LABEL[estado] ?? estado,
    className: ESTADO_GRUPO_STYLES[estado] ?? "",
    variant: "outline",
    title: ESTADO_GRUPO_TITLE[estado] ?? "",
  };
}

// =====================================================================
// Consolidado
// =====================================================================

/** Etiqueta corta de la clave de una línea del consolidado (chip que
 *  antecede al concepto). Fuente única del wizard y del detalle. */
export const CLAVE_CONSOLIDADO_LABEL: Record<string, string> = {
  TIEMPO_VUELO: "Servicio aéreo",
  TUAS: "TUAS",
  EXTRA: "Cargo",
  IVA: "IVA",
  PERNOCTA: "Pernocta",
  AJUSTE: "Ajuste",
  COMISION_VENDEDOR: "Comisión del vendedor",
};

// ---------------------------------------------------------------------
// Operación "sutil" de cada línea (feedback 4-sep-2026): texto muted que
// enseña CÓMO salió el número, construido SOLO con los campos `operacion`
// que manda el API (nada de aritmética: sin campos, sin texto). Formato
// es-MX; unitarios siempre a 2 decimales (fmtMontoUnitario).
// ---------------------------------------------------------------------

/** "10.90 h" (horas cobrables, 2 decimales). */
function textoHoras(h: number): string {
  return `${fmtDecimal(h, 2)} h`;
}

/** "16 %" / "8.5 %" (porcentaje 0-100 con espacio, estilo es-MX). */
function textoPorcentaje(pct: number): string {
  return `${fmtDecimal(pct, Number.isInteger(pct) ? 0 : 2)} %`;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** "XB-ANU exenta" / "XB-ANU, N4142R exentas" (null sin exentos). */
export function textoAvionesExentos(
  op: Pick<OperacionTuas, "aviones_exentos"> | null | undefined,
): string | null {
  const nombres = (op?.aviones_exentos ?? [])
    .map((a) => a.matricula ?? (a.posicion != null ? `avión ${a.posicion}` : null))
    .filter((x): x is string => !!x);
  if (nombres.length === 0) return null;
  return `${nombres.join(", ")} ${nombres.length === 1 ? "exenta" : "exentas"}`;
}

/**
 * Operación de UNA línea del consolidado, debajo del concepto:
 * - Servicio aéreo «7 aeronaves · 10.90 h»
 * - TUAS «CUN · 44 pax × $20.85» (+ « · XB-ANU exenta»)
 * - Cargo «44 × $85.00»
 * - Pernocta «2 paradas × $150.00»
 * - IVA «16 % de $18,622.00»
 * - Ajuste «sobre $18,622.00»
 * null cuando el API no manda la operación o le faltan campos.
 */
export function textoOperacionLinea(linea: Pick<LineaConsolidada, "operacion">): string | null {
  const op = linea.operacion;
  if (!op) return null;
  switch (op.tipo) {
    case "SERVICIO":
      return `${plural(op.aviones, "aeronave", "aeronaves")} · ${textoHoras(op.horas_total_hr)}`;
    case "TUAS": {
      // El concepto ya dice «TUA CUN»: aquí solo la cuenta «44 pax × $20.85».
      let base = `${op.pax_gravados} pax`;
      if (op.unitario != null) base += ` × ${fmtMontoUnitario(op.unitario, op.moneda)}`;
      const exentos = textoAvionesExentos(op);
      return exentos ? `${base} · ${exentos}` : base;
    }
    case "EXTRA":
      return op.cantidad != null && op.unitario != null
        ? `${op.cantidad} × ${fmtMontoUnitario(op.unitario, op.moneda)}`
        : null;
    case "IVA":
      return op.pct != null && op.base_usd != null
        ? `${textoPorcentaje(op.pct)} de ${fmtMontoUnitario(op.base_usd, "USD")}`
        : null;
    case "PERNOCTA":
      return op.unitario_usd != null
        ? `${plural(op.paradas, "parada", "paradas")} × ${fmtMontoUnitario(op.unitario_usd, "USD")}`
        : plural(op.paradas, "parada", "paradas");
    case "AJUSTE":
      return `sobre ${fmtMontoUnitario(op.base_usd, "USD")}`;
    default:
      return null;
  }
}

/** "12 pax × $20.85" para un hijo gravado; "exenta · razón" si exento. */
export function textoOperacionTuasAvion(d: TuasAvionConsolidado): string {
  if (d.exento) return d.razon ? `exenta · ${d.razon}` : "exenta";
  const unit = d.unitario != null ? ` × ${fmtMontoUnitario(d.unitario, d.moneda)}` : "";
  return `${d.pax} pax${unit}`;
}

/**
 * Operación de la PARTE de un avión dentro de una línea («por avión»):
 * Servicio aéreo «1.50 h × $1,750.00»; TUAS «12 pax × $20.85» / «exenta».
 * null en el resto (cargos, IVA…) o sin campos del API.
 */
export function textoOperacionParte(
  linea: Pick<LineaConsolidada, "operacion">,
  parte: ParteAvionConsolidada,
): string | null {
  const op = linea.operacion;
  if (!op) return null;
  if (op.tipo === "SERVICIO") {
    if (parte.horas_hr == null) return null;
    return parte.tarifa_hora_usd != null
      ? `${textoHoras(parte.horas_hr)} × ${fmtMontoUnitario(parte.tarifa_hora_usd, "USD")}`
      : textoHoras(parte.horas_hr);
  }
  if (op.tipo === "TUAS") {
    const d = op.detalle_por_avion.find((x) => x.key === parte.key);
    if (d) return textoOperacionTuasAvion(d);
    return parte.exento ? "exenta" : null;
  }
  return null;
}

/** «$21,601.52 ÷ 44» (null si el API no manda `por_persona`). */
export function textoOperacionPorPersona(c: Pick<Consolidado, "por_persona">): string | null {
  const p = c.por_persona;
  if (!p || !(p.pasajeros_total > 0)) return null;
  return `${fmtMontoUnitario(p.total_usd, "USD")} ÷ ${p.pasajeros_total}`;
}

/** Porcentaje de la línea IVA del consolidado («16 %»), si viene uniforme. */
export function textoIvaPct(c: Pick<Consolidado, "desglose">): string | null {
  const op = (c.desglose ?? []).find((l) => l.clave === "IVA")?.operacion;
  return op?.tipo === "IVA" && op.pct != null ? textoPorcentaje(op.pct) : null;
}

/**
 * Operación de un aeropuerto del apartado TUAS: «44 × $20.85» (unitario
 * uniforme), «44 pax · unitario distinto por avión» o null si todos los
 * aviones quedaron exentos ahí.
 */
export function textoOperacionTuasAeropuerto(ap: TuasAeropuertoConsolidado): string | null {
  if (!(ap.pax_gravados > 0)) return null;
  if (ap.unitario == null) return `${ap.pax_gravados} pax · unitario distinto por avión`;
  return `${ap.pax_gravados} × ${fmtMontoUnitario(ap.unitario, ap.moneda)}`;
}

/** Resumen plegado de la sección TUAS: «$917.00 · 2 aeropuertos». */
export function resumenTuasGrupo(tuas: ConsolidadoTuas | null | undefined): string {
  if (!tuas) return "Se llena al calcular";
  const n = tuas.aeropuertos.length;
  if (n === 0) return "Sin TUAS";
  if (tuas.total_usd === 0) return `Sin cobro · ${plural(n, "aeropuerto", "aeropuertos")}`;
  return `${fmtUsd(tuas.total_usd)} · ${plural(n, "aeropuerto", "aeropuertos")}`;
}

/** "Avión 2 · XB-ANU (Cessna 206)" para las filas «por avión». */
export function etiquetaParteAvion(
  p: Pick<ParteAvionConsolidada, "posicion" | "matricula" | "modelo">,
): string {
  const base = p.posicion != null ? `Avión ${p.posicion}` : "Avión";
  const matricula = p.matricula ? ` · ${p.matricula}` : "";
  const modelo = p.modelo ? ` (${p.modelo})` : "";
  return `${base}${matricula}${modelo}`;
}

// =====================================================================
// Reparto de extras
// =====================================================================

export const REPARTO_EXTRA_LABEL: Record<RepartoExtraGrupo, string> = {
  POR_PAX: "Por persona",
  PROPORCIONAL: "Repartido por pasajeros",
  ANCLA: "Todo a un avión",
};

/** "Por persona" / "Repartido por pasajeros" / "Todo a un avión". */
export function etiquetaReparto(reparto: RepartoExtraGrupo | null | undefined): string {
  return (reparto && REPARTO_EXTRA_LABEL[reparto]) || REPARTO_EXTRA_LABEL.POR_PAX;
}

// =====================================================================
// Sobre de cobro: modo de partición
// =====================================================================

export const MODO_PARTICION_LABEL: Record<ModoParticionCobro, string> = {
  LIQUIDACION: "Liquidación",
  PROPORCIONAL: "Proporcional al precio",
  MANUAL: "Manual",
};

/** "Liquidación" / "Proporcional al precio" / "Manual" (desconocido ⇒ crudo). */
export function etiquetaModoParticion(modo: string | null | undefined): string {
  if (!modo) return "—";
  return MODO_PARTICION_LABEL[modo as ModoParticionCobro] ?? modo;
}

/**
 * Explicación de UNA línea del modo detectado (vista previa del sobre).
 * En un reembolso el proporcional va por lo COBRADO de cada avión, no por
 * su precio.
 */
export function explicacionModoParticion(
  modo: string | null | undefined,
  opts: { esReembolso?: boolean } = {},
): string {
  switch (modo) {
    case "LIQUIDACION":
      return "El pago cubre lo que falta: cada avión recibe exactamente su saldo y queda cobrado.";
    case "PROPORCIONAL":
      return opts.esReembolso
        ? "Se devuelve a cada avión en proporción a lo que tiene cobrado."
        : "Pago parcial: se reparte en proporción al precio de cada avión (los centavos sobrantes van al avión ancla).";
    case "MANUAL":
      return "Montos capturados a mano por avión; deben sumar exacto el monto del sobre.";
    default:
      return "";
  }
}

// =====================================================================
// Badge del HIJO: "Grupo G-12 · avión 3 de 7"
// =====================================================================

/** Embed `grupo` del vuelo desenvuelto (PostgREST puede mandar arreglo). */
export function grupoDeVuelo(v: VueloConGrupo | null | undefined): GrupoEmbedVuelo | null {
  const g = v?.grupo;
  if (!g) return null;
  return Array.isArray(g) ? (g[0] ?? null) : g;
}

/**
 * Texto del badge de liga del hijo. `grupo` acepta el folio (12 / "G-12")
 * o cualquier objeto con `folio` (embed del vuelo, listado o detalle).
 * Sin posición ⇒ "Grupo G-12"; sin total ⇒ "Grupo G-12 · avión 3".
 */
export function textoGrupoBadge(
  grupo: number | string | { folio: number | string | null } | null | undefined,
  posicion?: number | null,
  total?: number | null,
): string {
  const folio = typeof grupo === "object" && grupo !== null ? grupo.folio : grupo;
  const partes = [`Grupo ${folioTexto(folio)}`];
  if (posicion != null) {
    partes.push(`avión ${posicion}${total != null && total > 0 ? ` de ${total}` : ""}`);
  }
  return partes.join(" · ");
}

// =====================================================================
// Semáforo de cobro (fuente única: estadoCobroSemaforo)
// =====================================================================

/**
 * Semáforo de UN hijo con las entradas crudas del detalle (mejor que el
 * `semaforo_cobro` básico del API: distingue interno, cancelado con cobros,
 * MXN sin TC). RESERVA/SOLICITUD/COTIZADO = aún no hay nada que cobrar.
 */
export function semaforoCobroHijo(
  a: AvionGrupoDetalle,
  opts: { esInterno?: boolean } = {},
): EstadoCobroSemaforo {
  return estadoCobroSemaforo({
    montoTotalUsd: a.total_usd,
    cobrado: a.cobrado,
    totalCobradoUsd: a.cobrado_usd,
    sinTcCount: a.sin_tc_count,
    enCotizacion: a.estado === "RESERVA" || a.estado === "SOLICITUD" || a.estado === "COTIZADO",
    cancelado: a.cancelado,
    esInterno: opts.esInterno,
  });
}

/** Semáforo del GRUPO: Σ de hijos vivos (total del consolidado vs cobrado_usd). */
export function semaforoCobroGrupo(g: GrupoDetalle): EstadoCobroSemaforo {
  const vivos = g.aviones.filter((a) => !a.cancelado);
  return estadoCobroSemaforo({
    montoTotalUsd: g.consolidado.total_usd,
    cobrado: vivos.length > 0 && vivos.every((a) => a.cobrado),
    totalCobradoUsd: g.cobrado_usd,
    sinTcCount: vivos.reduce((s, a) => s + (a.sin_tc_count ?? 0), 0),
    enCotizacion: g.estado === "RESERVA" || g.estado === "COTIZADO",
    cancelado: g.estado === "CANCELADO",
    esInterno: g.cliente?.es_interno === true,
  });
}

// =====================================================================
// Opciones de capacidad del armador
// =====================================================================

/** Título de la tarjeta de acción cuando faltan asientos. */
export function tituloOpcionCapacidad(op: OpcionCapacidad): string {
  switch (op.tipo) {
    case "DOBLE_ROTACION": {
      const delta = op.costo_delta_usd >= 0 ? `+${fmtUsd(op.costo_delta_usd)}` : fmtUsd(op.costo_delta_usd);
      return `Doble vuelta de ${op.matricula} (${delta})`;
    }
    case "REACTIVAR": {
      const ficha = [op.modelo, op.asientos != null ? `${op.asientos} asientos` : null]
        .filter(Boolean)
        .join(", ");
      return `Reactivar ${op.matricula}${ficha ? ` (${ficha})` : ""}${op.cubre ? "" : " · no alcanza para todos"}`;
    }
    case "EXTERNO":
      return "Avión externo";
    default:
      return "Opción";
  }
}

// =====================================================================
// Errores 409 → texto es-MX
// =====================================================================

/** Etiqueta es-MX del motivo por el que un hijo está congelado (fuente
 *  única: mensajes 409, wizard de revisión y detalle). */
export const MOTIVO_CONGELADO_LABEL: Record<MotivoCongelado, string> = {
  "ya facturado": "ya facturado",
  "ya cobrado": "ya cobrado",
  "mes cerrado": "mes cerrado",
  COMPLETADO: "ya voló",
};

/** "1", "1 y 3", "1, 2 y 3". */
function listaY(items: (string | number)[]): string {
  const s = items.map(String);
  if (s.length <= 1) return s.join("");
  return `${s.slice(0, -1).join(", ")} y ${s[s.length - 1]}`;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function textoCapacidad(d: CapacidadExcedidaDetails): string {
  const vueltas =
    d.rotaciones > 1
      ? ` × ${d.rotaciones} vueltas (${d.asientos * d.rotaciones} lugares)`
      : "";
  return `El ${d.matricula} tiene ${d.asientos} asientos${vueltas} y le asignaste ${d.pax} pasajeros (avión ${d.posicion}). Reparte pasajeros en otro avión, usa doble vuelta o un avión externo.`;
}

function textoPax(d: PaxNoCuadranDetails): string {
  if (d.faltan > 0) {
    return `Faltan ${d.faltan} pasajeros por acomodar (${d.pax_asignados} de ${d.pasajeros_total}).`;
  }
  if (d.faltan < 0) {
    return `Sobran ${-d.faltan} pasajeros: los aviones suman ${d.pax_asignados} y el grupo es de ${d.pasajeros_total}.`;
  }
  return `Los pasajeros por avión suman ${d.pax_asignados} y el grupo es de ${d.pasajeros_total}.`;
}

function textoPilotoDuplicado(d: PilotoDuplicadoDetails): string {
  const partes = d.map(
    (p) => `${p.nombre ?? "un piloto"} en aviones ${listaY(p.posiciones)}`,
  );
  return `Piloto repetido: ${partes.join("; ")}. Un piloto solo puede ir en un avión del grupo.`;
}

function textoCongelados(d: HijosCongeladosDetails): string {
  const items = d.map(
    (h) =>
      `${h.posicion != null ? `avión ${h.posicion} ` : ""}#${h.folio} ${MOTIVO_CONGELADO_LABEL[h.motivo] ?? h.motivo}`,
  );
  const todosVolaron = d.length > 0 && d.every((h) => h.motivo === "COMPLETADO");
  const consejo = todosVolaron
    ? "Quita del grupo solo los aviones que no salieron."
    : "Puedes aplicar el cambio solo a los aviones editables (el total del grupo cambia) o dejarlos como están.";
  return `Hay aviones congelados (${items.join("; ")}). ${consejo}`;
}

function textoNoConfirmables(d: HijosNoConfirmablesDetails): string {
  return `Hay aviones sin cotizar (${d.map((h) => `#${h.folio}`).join(", ")}): revisa el grupo antes de confirmar.`;
}

function textoAMedias(d: RevisionAMediasDetails, message: string): string {
  const aplicado = d.aplicados.length ? `se aplicó ${listaY(d.aplicados)}` : "no se aplicó ningún avión";
  const creados = d.creados.length
    ? ` Se crearon ${d.creados.length} avión(es) nuevo(s), que se conservan.`
    : "";
  const fallo = /fall[oó]:\s*(.+?)(?:\.\s*La cabecera|$)/i.exec(message)?.[1]?.trim();
  return `La revisión quedó a medias: ${aplicado}${fallo ? `; falló: ${fallo}` : ""}.${creados} Vuelve a guardar la revisión para completar los aviones restantes (el grupo ya está en la versión ${d.version}).`;
}

function textoMesCerrado(d: MesCerradoDetails): string {
  const items = d.map(
    (h) => `${h.posicion != null ? `avión ${h.posicion} ` : ""}#${h.folio}`,
  );
  return `No se puede tocar este cobro del grupo: tiene partes en vuelos de un mes ya cerrado (${listaY(items)}). Lo que ya se cerró no se modifica; si hace falta un ajuste, regístralo como un cobro o reembolso nuevo.`;
}

function textoReembolsoExcede(d: ReembolsoExcedeDetails): string {
  if (d.length === 0) {
    return "Ningún avión del grupo tiene cobros de los cuales devolver: no hay nada que reembolsar.";
  }
  const items = d.map(
    (e) =>
      `${e.posicion != null ? `avión ${e.posicion}` : `#${e.folio ?? "?"}`}${e.matricula ? ` (${e.matricula})` : ""} devolvería ${fmtUsd(e.reembolso_usd)} y solo tiene ${fmtUsd(e.cobrado_usd)} cobrados`,
  );
  return `El reembolso supera lo cobrado de ${d.length === 1 ? "un avión" : `${d.length} aviones`}: ${items.join("; ")}. Baja el monto o reparte a mano lo que devuelve cada avión.`;
}

function textoNoCuadra(d: ParticionNoCuadraDetails): string {
  // El API manda `diferencia = monto − suma`: positiva ⇒ las partes se
  // quedan CORTAS (faltan); negativa ⇒ se pasan (sobran). Montos nativos
  // (USD o MXN): se pintan con "$" a secas, como el mensaje del API.
  const signo = d.diferencia > 0 ? "faltan" : "sobran";
  return `Las partes suman ${fmtUsd(d.suma)} y el monto del sobre es ${fmtUsd(d.monto)}: ${signo} ${fmtUsd(Math.abs(d.diferencia))}. Ajusta los montos por avión hasta que sumen exacto.`;
}

/**
 * Mensaje claro en es-MX para cada 409 estructurado del API. Para códigos
 * sin plantilla (CONFLICT, BAD_REQUEST, red…) devuelve el mensaje del API,
 * que ya viene redactado para el usuario. Si el API respondió "No se creó
 * el grupo (nada quedó a medias)" conservando el código original, se
 * antepone esa aclaración.
 */
export function mensajeErrorGrupo(err: GrupoApiError): string {
  const d = err.details;
  const prefijo = /^No se creó el grupo/i.test(err.message)
    ? "No se creó el grupo (nada quedó a medias). "
    : "";
  let texto: string | null = null;
  switch (err.error) {
    case "CAPACIDAD_EXCEDIDA":
      if (esObjeto(d) && typeof d.matricula === "string" && typeof d.pax === "number") {
        texto = textoCapacidad(d as unknown as CapacidadExcedidaDetails);
      }
      break;
    case "PAX_NO_CUADRAN":
      if (esObjeto(d) && typeof d.pax_asignados === "number") {
        texto = textoPax(d as unknown as PaxNoCuadranDetails);
      }
      break;
    case "PILOTO_DUPLICADO":
      if (Array.isArray(d) && d.length > 0) texto = textoPilotoDuplicado(d as PilotoDuplicadoDetails);
      break;
    case "AERONAVE_EN_TALLER":
      if (esObjeto(d) && typeof d.matricula === "string") {
        const t = d as unknown as AeronaveEnTallerDetails;
        texto = `El ${t.matricula} (avión ${t.posicion}) está en taller: no se puede vender en el grupo. Cámbialo por otro avión.`;
      }
      break;
    case "SQUAWK_ALTA_SIN_RESOLVER":
      if (esObjeto(d) && typeof d.matricula === "string") {
        const t = d as unknown as SquawkAltaDetails;
        const lista = (t.discrepancias ?? []).map((x) => x.descripcion).filter(Boolean).join("; ");
        texto = `El ${t.matricula} (avión ${t.posicion}) tiene discrepancias ALTAS sin resolver${lista ? ` (${lista})` : ""}. Puedes usarlo de todos modos: se avisará al mecánico.`;
      }
      break;
    case "SIN_FLOTA":
      texto =
        "No hay aviones activos disponibles (fuera de taller) con asientos para armar el grupo. Reactiva un avión en Aeronaves o cotiza con un externo.";
      break;
    case "HIJOS_CONGELADOS":
      if (Array.isArray(d) && d.length > 0) texto = textoCongelados(d as HijosCongeladosDetails);
      break;
    case "HIJOS_NO_CONFIRMABLES":
      if (Array.isArray(d) && d.length > 0) texto = textoNoConfirmables(d as HijosNoConfirmablesDetails);
      break;
    case "REVISION_A_MEDIAS":
      if (esObjeto(d) && Array.isArray(d.aplicados)) {
        texto = textoAMedias(d as unknown as RevisionAMediasDetails, err.message);
      }
      break;
    // ---- Sobre de cobro (Fase 2) ----
    case "COBRO_DE_GRUPO": {
      const folio = esObjeto(d) ? (d as unknown as CobroDeGrupoDetails).grupo_folio : null;
      texto = `Este cobro es parte del sobre del grupo ${folioTexto(folio)}: se edita o elimina desde «Cobros del grupo» en el detalle del grupo, no desde el vuelo.`;
      break;
    }
    case "COBRO_CONCILIADO": {
      const mov = esObjeto(d) ? (d as unknown as CobroConciliadoDetails).movimiento_bancario_id : null;
      texto = `Este cobro del grupo ya está conciliado con un movimiento bancario${mov ? ` (${mov.slice(0, 8)}…)` : ""}. Desvincúlalo primero en Conciliación y vuelve a intentarlo.`;
      break;
    }
    case "MES_CERRADO":
      if (Array.isArray(d) && d.length > 0) texto = textoMesCerrado(d as MesCerradoDetails);
      break;
    case "REEMBOLSO_EXCEDE":
      if (Array.isArray(d)) texto = textoReembolsoExcede(d as ReembolsoExcedeDetails);
      break;
    case "PARTICION_NO_CUADRA":
      if (esObjeto(d) && typeof d.suma === "number" && typeof d.monto === "number") {
        texto = textoNoCuadra(d as unknown as ParticionNoCuadraDetails);
      }
      break;
    case "HIJO_INVALIDO":
      // El API ya explica cuál (ajeno, cancelado, repetido, signo, AUTO+manual).
      texto = err.message?.trim()
        ? `${err.message.trim()} Revisa la partición por avión y vuelve a intentarlo.`
        : "La partición manual incluye un avión que no es del grupo o ya está cancelado.";
      break;
    case "COMISION_INVALIDA":
      texto = err.message?.trim()
        ? err.message.trim()
        : "La comisión del banco no es válida: no puede ser mayor o igual al monto ni ir en un reembolso.";
      break;
    case "SIN_TC":
      texto =
        "Captura el tipo de cambio: sin TC un cobro en pesos no se puede partir entre los aviones ni sumar al total en USD.";
      break;
    case "SIN_HIJOS":
      texto = "El grupo no tiene aviones vivos entre los cuales repartir el cobro.";
      break;
    case "MONTO_CERO":
      texto = "El monto no puede ser 0.";
      break;
    default:
      break;
  }
  const base = texto ?? err.message?.trim();
  return `${prefijo}${base || "Ocurrió un error inesperado. Intenta de nuevo; si persiste, avisa a soporte."}`;
}
