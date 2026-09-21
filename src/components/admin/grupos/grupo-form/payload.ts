import { cancunInputToIso } from "@/lib/datetime";
import { TEXTO_EXTRA_FUERA } from "@/lib/admin/extras";
import { tuasLineasAPayload } from "@/lib/admin/tuas";
import type {
  ArmarGrupoInput,
  AvionGrupoInput,
  CreateGrupoInput,
  EscalaPlantillaInput,
  ExtraGrupoInput,
  ReviseGrupoInput,
} from "@/types/grupos";
import type {
  AvionForm,
  ExtraGrupoForm,
  GrupoFormValues,
  PlantillaTramoForm,
} from "./types";

/**
 * Del formulario al payload del API (puro, sin React). Whitelist ESTRICTA:
 * el ValidationPipe rechaza campos extra, así que aquí solo viajan los del
 * contrato y solo cuando tienen valor.
 */

function num(v: number | "" | null | undefined): number | undefined {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function plantillaPayload(tramos: PlantillaTramoForm[]): EscalaPlantillaInput[] {
  return tramos
    .filter((t) => t.origen_iata && t.destino_iata)
    .map((t) => {
      const out: EscalaPlantillaInput = {
        origen_iata: t.origen_iata,
        destino_iata: t.destino_iata,
        millas_nauticas: Number(t.millas_nauticas) || 0,
      };
      if (t.es_ferry) out.es_ferry = true;
      if (t.requiere_pernocta) {
        out.requiere_pernocta = true;
        if (t.pernocta_costo_usd != null) out.pernocta_costo_usd = Number(t.pernocta_costo_usd);
      }
      if (t.tipo_parada === "SERVICIO") {
        out.tipo_parada = "SERVICIO";
        if (t.servicio_notas.trim()) out.servicio_notas = t.servicio_notas.trim();
      }
      if (t.notas.trim()) out.notas = t.notas.trim();
      if (t.pdf_oculto) out.pdf_oculto = true;
      return out;
    });
}

/** Falta la cantidad: la exige el grupo (no la cotización de un avión). */
export const TEXTO_CARGO_SIN_CANTIDAD = "Falta la cantidad: no se suma ni se imprime";

/**
 * REGLA ÚNICA del grupo (21-sep-2026): por qué un cargo NO viaja al armador
 * ni al API (null = sí viaja). De ella cuelgan `extrasPayload` (el filtro),
 * `cargoGrupoCompleto` (el editor, que numera las filas del armador) y
 * `extrasGrupoIncompletos` (el candado de guardado). Vivían separadas en tres
 * sitios: es exactamente la divergencia que trajo el bug de los extras.
 */
function motivoCargoGrupo(e: ExtraGrupoForm): string | null {
  const unitario = num(e.unitario);
  const cantidad = num(e.cantidad);
  if (!e.concepto.trim()) return TEXTO_EXTRA_FUERA.sin_nombre;
  if (unitario == null || unitario < 0) return TEXTO_EXTRA_FUERA.sin_monto;
  // Sin cantidad no hay línea que materializar: se omite hasta capturarla.
  if (!e.por_persona && (cantidad == null || cantidad < 0)) return TEXTO_CARGO_SIN_CANTIDAD;
  return null;
}

/** El cargo está completo ⇒ `extrasPayload` lo manda (misma regla, un solo sitio). */
export function cargoGrupoCompleto(e: ExtraGrupoForm): boolean {
  return motivoCargoGrupo(e) === null;
}

/**
 * Cargos del grupo que el operador YA empezó a capturar y que `extrasPayload`
 * dejaría fuera (21-sep-2026, misma regla que los extras de una cotización:
 * ningún renglón con algo capturado se descarta en silencio al guardar). Un
 * renglón en blanco —recién agregado— no cuenta: no molesta.
 */
export interface CargoGrupoIncompleto {
  indice: number;
  concepto: string;
  /** Texto largo, el MISMO de la cotización («Falta el monto: no se suma…»). */
  motivo: string;
  /** Qué falta, en una palabra: para redactar el aviso sin partir el motivo. */
  falta: "nombre" | "monto" | "cantidad";
}

export function extrasGrupoIncompletos(extras: ExtraGrupoForm[]): CargoGrupoIncompleto[] {
  const out: CargoGrupoIncompleto[] = [];
  extras.forEach((e, indice) => {
    const concepto = e.concepto.trim();
    const enBlanco = !concepto && num(e.unitario) == null && num(e.cantidad) == null;
    if (enBlanco) return;
    const motivo = motivoCargoGrupo(e);
    if (!motivo) return;
    const falta =
      motivo === TEXTO_EXTRA_FUERA.sin_nombre
        ? "nombre"
        : motivo === TEXTO_EXTRA_FUERA.sin_monto
          ? "monto"
          : "cantidad";
    out.push({ indice, concepto, motivo, falta });
  });
  return out;
}

/**
 * Aviso ÚNICO del candado de cargos del grupo (es-MX). "" = no hay nada que
 * frenar. Se redacta aquí —no en el componente— para que diga lo mismo si
 * mañana lo usa otra pantalla del grupo.
 */
export function avisoCargosGrupo(fuera: CargoGrupoIncompleto[]): string {
  if (fuera.length === 0) return "";
  if (fuera.length > 1) {
    return `Hay ${fuera.length} cargos que no entran al total: complétalos o quítalos.`;
  }
  const c = fuera[0];
  const quien = c.concepto ? `«${c.concepto}»` : `${c.indice + 1}`;
  return `El cargo ${quien} no entra al total: falta el ${c.falta}. Complétalo o quítalo.`;
}

/** Extras completos (concepto + unitario); los renglones a medias no viajan. */
export function extrasPayload(extras: ExtraGrupoForm[]): ExtraGrupoInput[] {
  const out: ExtraGrupoInput[] = [];
  for (const e of extras) {
    if (!cargoGrupoCompleto(e)) continue;
    const item: ExtraGrupoInput = {
      concepto: e.concepto.trim().slice(0, 120),
      unitario: num(e.unitario)!,
      moneda: e.moneda,
      aplica_iva: e.aplica_iva,
      por_persona: e.por_persona,
      reparto: e.por_persona ? "POR_PAX" : e.reparto,
    };
    if (e.id) item.id = e.id;
    if (!e.por_persona) item.cantidad = num(e.cantidad)!;
    out.push(item);
  }
  return out;
}

export function avionesPayload(aviones: AvionForm[]): AvionGrupoInput[] {
  return aviones
    .filter((a) => a.aeronave_id)
    .map((a) => {
      const out: AvionGrupoInput = {
        aeronave_id: a.aeronave_id,
        pax: Math.max(1, Math.floor(Number(a.pax) || 0)),
        rotaciones: a.rotaciones === 2 ? 2 : 1,
        piloto_id: a.piloto_id || null,
        copiloto_id: a.copiloto_id || null,
      };
      if (a.vuelo_id) out.vuelo_id = a.vuelo_id;
      const tarifa = num(a.tarifa_hora_override_usd);
      if (tarifa != null) out.tarifa_hora_override_usd = tarifa;
      const tiempo = num(a.tiempo_cobrable_override_hr);
      if (tiempo != null) out.tiempo_cobrable_override_hr = tiempo;
      if (a.fecha_salida_plan) {
        const iso = cancunInputToIso(a.fecha_salida_plan);
        if (iso) out.fecha_salida_plan = iso;
      }
      if (a.aceptar_discrepancia_alta) out.aceptar_discrepancia_alta = true;
      return out;
    });
}

export type ArmarResultado =
  | { payload: ArmarGrupoInput; falta: null }
  | { payload: null; falta: string };

/**
 * Payload de POST /armar o la razón (texto es-MX) por la que aún no se
 * puede calcular. Sin `aviones` capturados se manda la lista vacía: el
 * server PROPONE flota.
 */
export function armarPayloadDe(v: GrupoFormValues): ArmarResultado {
  const faltan: string[] = [];
  if (!v.cliente_id) faltan.push("cliente");
  if (!v.fecha_vuelo) faltan.push("fecha de salida");
  const pax = num(v.pasajeros_total);
  if (pax == null || pax < 1) faltan.push("pasajeros");
  const plantilla = plantillaPayload(v.escalas_plantilla);
  if (plantilla.length === 0) faltan.push("ruta");
  else {
    const sinMillas = plantilla.findIndex((t) => !(t.millas_nauticas > 0));
    if (sinMillas >= 0) faltan.push(`millas del tramo ${sinMillas + 1}`);
  }
  if (v.metodo_pago === "OTRO" && !v.metodo_pago_detalle.trim()) {
    faltan.push("nombre del método de pago");
  }
  if (faltan.length > 0) {
    return { payload: null, falta: `Completa: ${faltan.join(", ")}` };
  }
  const fechaIso = cancunInputToIso(v.fecha_vuelo);
  if (!fechaIso) return { payload: null, falta: "La fecha de salida no es válida" };

  const payload: ArmarGrupoInput = {
    cliente_id: v.cliente_id,
    fecha_vuelo: fechaIso,
    pasajeros_total: Math.floor(pax as number),
    escalas_plantilla: plantilla,
    tarifa_tipo: v.tarifa_tipo,
    metodo_pago: v.metodo_pago,
    pase_abordar: v.pase_abordar,
    extras_grupo: extrasPayload(v.extras_grupo),
    aviones: avionesPayload(v.aviones),
  };
  if (v.metodo_pago === "OTRO") payload.metodo_pago_detalle = v.metodo_pago_detalle.trim().slice(0, 80);
  const tc = num(v.tc_usd_mxn);
  if (tc != null && tc > 0) payload.tc_usd_mxn = tc;
  const ajuste = num(v.ajuste_grupo_usd);
  if (ajuste != null && ajuste !== 0) payload.ajuste_grupo_usd = Math.round(ajuste * 100) / 100;
  // TUAS capturadas: misma regla del cotizador (una línea MXN > 0 sin TC se
  // retiene fuera del cálculo; el wizard lo avisa y bloquea guardar).
  const tuas = tuasLineasAPayload(v.tuas_lineas, { tcCapturado: tc != null && tc > 0 });
  if (tuas.length > 0) payload.tuas_lineas = tuas;
  return { payload, falta: null };
}

/** Payload de POST /v1/grupos (alta). Requiere `armarPayloadDe` completo. */
export function createPayloadDe(v: GrupoFormValues, base: ArmarGrupoInput): CreateGrupoInput {
  const out: CreateGrupoInput = {
    ...base,
    nombre: v.nombre.trim().slice(0, 120),
    aviones: base.aviones ?? [],
    apartar: v.apartar,
    pdf_mostrar_anexo_aviones: v.pdf_mostrar_anexo_aviones,
    pdf_mostrar_subtotal_por_avion: v.pdf_mostrar_subtotal_por_avion,
    pdf_mostrar_precio_por_persona: v.pdf_mostrar_precio_por_persona,
    pdf_mostrar_tarifa: v.pdf_mostrar_tarifa,
  };
  if (v.notas.trim()) out.notas = v.notas.trim().slice(0, 2000);
  if (v.notas_internas.trim()) out.notas_internas = v.notas_internas.trim().slice(0, 2000);
  return out;
}

/**
 * Payload de POST /v1/grupos/:id/revise. Viaja TODO lo editable (mandar el
 * mismo valor es inocuo; lo que no viaja se conserva). `aviones` completo:
 * con vuelo_id actualiza, sin él crea, y los hijos vivos ausentes se
 * cancelan (la UI confirma antes de quitar uno).
 */
export function revisePayloadDe(v: GrupoFormValues, base: ArmarGrupoInput): ReviseGrupoInput {
  const out: ReviseGrupoInput = {
    motivo: v.motivo.trim().slice(0, 500),
    nombre: v.nombre.trim().slice(0, 120),
    fecha_vuelo: base.fecha_vuelo,
    pasajeros_total: base.pasajeros_total,
    escalas_plantilla: base.escalas_plantilla,
    tarifa_tipo: base.tarifa_tipo,
    metodo_pago: base.metodo_pago,
    pase_abordar: base.pase_abordar,
    extras_grupo: base.extras_grupo ?? [],
    ajuste_grupo_usd: base.ajuste_grupo_usd ?? 0,
    // Siempre explícito: omitirlo conservaría la cabecera y `[]` significa
    // "volver al catálogo" — lo capturado en el wizard es la verdad.
    tuas_lineas: base.tuas_lineas ?? [],
    aviones: base.aviones ?? [],
    solo_editables: v.solo_editables,
    notas: v.notas.trim().slice(0, 2000),
    notas_internas: v.notas_internas.trim().slice(0, 2000),
    pdf_mostrar_anexo_aviones: v.pdf_mostrar_anexo_aviones,
    pdf_mostrar_subtotal_por_avion: v.pdf_mostrar_subtotal_por_avion,
    pdf_mostrar_precio_por_persona: v.pdf_mostrar_precio_por_persona,
    pdf_mostrar_tarifa: v.pdf_mostrar_tarifa,
  };
  if (base.metodo_pago_detalle) out.metodo_pago_detalle = base.metodo_pago_detalle;
  if (base.tc_usd_mxn != null) out.tc_usd_mxn = base.tc_usd_mxn;
  return out;
}
