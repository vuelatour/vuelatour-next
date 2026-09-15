/**
 * Conciliación AUTOMÁTICA: cómo se pinta en el panel lo que decidió el API
 * (15-sep-2026).
 *
 * Pedido del cliente: «no se están conciliando los gastos, salen como
 * pendiente». Además de arreglar el cruce (API), el panel tiene que:
 *   1) permitir volver a cruzar los pendientes («Cruzar pendientes»),
 *   2) DECIR por qué un movimiento sigue pendiente (sin candidato / ambiguo
 *      entre N / error), y
 *   3) ofrecer la sugerencia de la IA como PROPUESTA, nunca como liga
 *      automática.
 *
 * Este módulo es PURO (sin React ni red): solo arma los textos es-MX a partir
 * de lo que respondió el API. REGLA: nunca se inventa aquí un estado que el
 * API no mandó — todos los campos son ADITIVOS y un API sin desplegar
 * simplemente no los manda (la UI se comporta como antes).
 */

import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import {
  fmtMontoConciliacion,
  numeroDe,
  textoFaltanteGasto,
} from "@/lib/admin/conciliacion-parcial";
import { fmtDateOnly } from "@/lib/datetime";

// ───────────────────────── Motivo de «Pendiente» ─────────────────────────

export type MotivoPendienteCodigo =
  | "SIN_CANDIDATOS"
  | "SE_PUEDE_CRUZAR"
  | "AMBIGUO"
  | "SOLO_PARCIAL"
  | "GASTO_YA_CUBIERTO"
  | "FUERA_DE_VENTANA"
  | "NO_ES_DE_VUELO"
  | "ERROR"
  | "OTRO";

/** Texto base de cada motivo (el badge y su tooltip). */
const MOTIVOS: Record<
  MotivoPendienteCodigo,
  { etiqueta: string; detalle: string }
> = {
  SIN_CANDIDATOS: {
    etiqueta: "Sin candidato",
    detalle:
      "No hay ningún gasto sin conciliar que cuadre con este movimiento en la ventana de fechas. Captura el gasto, amplía la ventana de la cuenta o clasifícalo si no es de un vuelo.",
  },
  SE_PUEDE_CRUZAR: {
    etiqueta: "Se puede cruzar",
    detalle:
      "Hay UN gasto que cuadra en monto, fecha y moneda: el cruce automático todavía no ha corrido sobre este movimiento. Pulsa «Cruzar pendientes» (o vincúlalo tú desde el menú).",
  },
  AMBIGUO: {
    etiqueta: "Ambiguo",
    detalle:
      "Más de un gasto cuadra con este movimiento: el sistema NO liga cuando hay duda. Vincúlalo a mano (o pide la sugerencia con IA).",
  },
  SOLO_PARCIAL: {
    etiqueta: "Solo cubre una parte",
    detalle:
      "El gasto más parecido vale más que este movimiento: sería un pago parcial. Vincúlalo a mano para dejarlo como pago parcial.",
  },
  GASTO_YA_CUBIERTO: {
    etiqueta: "El gasto ya está cubierto",
    detalle:
      "El gasto que cuadra ya tiene cargos del banco que lo cubren. Si este cargo paga otra factura, captúrala; si es la misma, corrige el monto del gasto.",
  },
  FUERA_DE_VENTANA: {
    etiqueta: "Fuera de la ventana",
    detalle:
      "Hay un gasto igual pero con fecha fuera de la ventana de cruce de la cuenta. Vincúlalo a mano o amplía la ventana de la cuenta.",
  },
  NO_ES_DE_VUELO: {
    etiqueta: "No es de un vuelo",
    detalle:
      "El movimiento no corresponde a ningún gasto ni cobro capturado (comisión del banco, traspaso, impuesto…). Clasifícalo para que deje de contar como pendiente.",
  },
  ERROR: {
    etiqueta: "Error al cruzar",
    detalle:
      "El cruce automático de este movimiento falló. Los demás sí se procesaron: vuelve a intentarlo con «Cruzar pendientes» o vincúlalo a mano.",
  },
  OTRO: {
    etiqueta: "Pendiente",
    detalle: "Todavía no se ha conciliado con ningún gasto, cobro o clasificación.",
  },
};

/** Sinónimos que puede mandar el API (se normaliza y se mapea). */
const ALIAS_MOTIVO: Record<string, MotivoPendienteCodigo> = {
  SE_PUEDE_CRUZAR: "SE_PUEDE_CRUZAR",
  CRUZABLE: "SE_PUEDE_CRUZAR",
  SIN_CANDIDATO: "SIN_CANDIDATOS",
  SIN_CANDIDATOS: "SIN_CANDIDATOS",
  NO_CANDIDATOS: "SIN_CANDIDATOS",
  NINGUN_CANDIDATO: "SIN_CANDIDATOS",
  AMBIGUO: "AMBIGUO",
  AMBIGUA: "AMBIGUO",
  AMBIGUOS: "AMBIGUO",
  VARIOS_CANDIDATOS: "AMBIGUO",
  MULTIPLES_CANDIDATOS: "AMBIGUO",
  PARCIAL: "SOLO_PARCIAL",
  SOLO_PARCIAL: "SOLO_PARCIAL",
  GASTO_YA_CUBIERTO: "GASTO_YA_CUBIERTO",
  YA_CUBIERTO: "GASTO_YA_CUBIERTO",
  FUERA_DE_VENTANA: "FUERA_DE_VENTANA",
  FUERA_VENTANA: "FUERA_DE_VENTANA",
  NO_ES_DE_VUELO: "NO_ES_DE_VUELO",
  SIN_VUELO: "NO_ES_DE_VUELO",
  NO_APLICA: "NO_ES_DE_VUELO",
  ERROR: "ERROR",
  ERROR_CRUCE: "ERROR",
  FALLO: "ERROR",
};

/** MAYÚSCULAS sin acentos con `_` entre palabras (códigos del API). */
export function normalizaCodigo(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Movimiento tal como lo lee la tabla (campos ADITIVOS del API). */
export interface MovimientoPendienteInfo {
  conciliado?: boolean | null;
  /** Código del API: 'SIN_CANDIDATOS' | 'AMBIGUO' | … (aditivo). */
  motivo_pendiente?: string | null;
  /** Alias del mismo dato en la respuesta de `sugerir` (aditivo). */
  motivo_sin_match?: string | null;
  /** Cuántos gastos/cobros cuadraban (aditivo). */
  candidatos_n?: number | string | null;
  /** Mensaje del error que tumbó el cruce de ESTE movimiento (aditivo). */
  auto_match_error?: string | null;
}

export interface MotivoPendiente {
  codigo: MotivoPendienteCodigo;
  /** Badge corto: «Sin candidato», «Ambiguo entre 3», «Error al cruzar». */
  etiqueta: string;
  /** Tooltip: qué significa y qué hacer. */
  detalle: string;
  /** Candidatos que vio el API (null = no lo dijo). */
  candidatos: number | null;
}

/**
 * Por qué sigue pendiente un movimiento. `null` cuando ya está conciliado o
 * cuando el API no mandó nada (skew de deploy ⇒ badge «Pendiente» de siempre).
 */
export function motivoPendienteDe(
  m: MovimientoPendienteInfo | null | undefined,
): MotivoPendiente | null {
  if (!m || m.conciliado === true) return null;

  const crudo = (m.motivo_pendiente ?? m.motivo_sin_match ?? "").toString().trim();
  const nCrudo = m.candidatos_n;
  const candidatos =
    nCrudo == null || nCrudo === ""
      ? null
      : Number.isFinite(Number(nCrudo)) && Number(nCrudo) >= 0
        ? Math.trunc(Number(nCrudo))
        : null;

  // Sin código: se deduce de cuántos candidatos vio el API (si lo dijo).
  if (!crudo) {
    if (candidatos == null) return null;
    if (candidatos === 0) return { ...MOTIVOS.SIN_CANDIDATOS, codigo: "SIN_CANDIDATOS", candidatos };
    if (candidatos === 1) {
      return {
        codigo: "OTRO",
        etiqueta: "1 candidato",
        detalle:
          "Hay 1 gasto parecido pero el sistema no lo ligó solo (no cuadra exacto). Revísalo y vincúlalo a mano.",
        candidatos,
      };
    }
    return {
      ...MOTIVOS.AMBIGUO,
      codigo: "AMBIGUO",
      etiqueta: `Ambiguo entre ${candidatos}`,
      candidatos,
    };
  }

  const codigoNorm = normalizaCodigo(crudo);
  const codigo = ALIAS_MOTIVO[codigoNorm] ?? (codigoNorm in MOTIVOS ? (codigoNorm as MotivoPendienteCodigo) : null);

  // Código desconocido: si parece una frase, se pinta tal cual en el tooltip.
  if (!codigo) {
    const esFrase = /\s/.test(crudo) && crudo.length > 12;
    return {
      codigo: "OTRO",
      etiqueta: esFrase ? "Pendiente" : crudo,
      detalle: esFrase ? crudo : MOTIVOS.OTRO.detalle,
      candidatos,
    };
  }

  const base = MOTIVOS[codigo];
  let etiqueta = base.etiqueta;
  if (codigo === "AMBIGUO" && candidatos != null && candidatos >= 2) {
    etiqueta = `Ambiguo entre ${candidatos}`;
  }
  const error = (m.auto_match_error ?? "").toString().trim();
  const detalle = codigo === "ERROR" && error ? `${base.detalle} Detalle: ${error}` : base.detalle;
  return { codigo, etiqueta, detalle, candidatos };
}

/** Color del badge por motivo (ámbar = falta trabajo, rojo = error). */
export function tonoMotivo(codigo: MotivoPendienteCodigo): "ambar" | "rojo" | "gris" {
  if (codigo === "ERROR") return "rojo";
  if (codigo === "NO_ES_DE_VUELO" || codigo === "OTRO") return "gris";
  return "ambar";
}

// ───────────────────── Resultado del cruce (auto-match) ──────────────────

/** Criterios con los que el API pudo ligar (para el desglose del resumen). */
const CRITERIOS: Record<string, string> = {
  MONTO: "monto exacto",
  MONTO_EXACTO: "monto exacto",
  EXACTO: "monto exacto",
  TARJETA: "terminación de tarjeta",
  TERMINACION: "terminación de tarjeta",
  TERMINACION_TARJETA: "terminación de tarjeta",
  DESCRIPCION: "descripción del banco",
  TEXTO: "descripción del banco",
  REGLA: "regla automática",
  TRASPASO: "traspaso interno",
  PARCIAL: "pago parcial",
  FALTANTE: "pago parcial",
  TC: "tipo de cambio USD↔MXN",
  TC_IMPLICITO: "tipo de cambio USD↔MXN",
  COBRO: "cobro de vuelo",
  PAYWISE: "Paywise",
  IA: "sugerencia de la IA",
};

/** «monto exacto», «terminación de tarjeta»… (código crudo si no se conoce). */
export function etiquetaCriterio(criterio?: string | null): string {
  if (!criterio) return "cruce automático";
  return CRITERIOS[normalizaCodigo(criterio)] ?? criterio;
}

export interface AutoMatchResultadoLike {
  revisados?: number | null;
  conciliados?: number | null;
  ambiguos?: number | null;
  sin_candidato?: number | null;
  /** Sinónimo tolerado. */
  sin_candidatos?: number | null;
  traspasos?: number | null;
  /** El gasto candidato ya no admitía el cargo (409 legítimo). Aditivo. */
  rechazados?: number | null;
  errores?: number | null;
  /** {MONTO: 15, TARJETA: 4, …} (aditivo). */
  por_criterio?: Record<string, number | null | undefined> | null;
  /** Se alcanzó el tope de la corrida: quedan pendientes sin revisar. */
  truncado?: boolean | null;
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.trunc(x) : 0;
};

const plural = (cant: number, uno: string, varios: string) =>
  `${cant} ${cant === 1 ? uno : varios}`;

/** «Por monto exacto 15 · por terminación de tarjeta 4». */
export function lineaCriterios(
  porCriterio?: Record<string, number | null | undefined> | null,
): string | null {
  if (!porCriterio) return null;
  const partes = Object.entries(porCriterio)
    .filter(([, v]) => n(v) > 0)
    .sort((a, b) => n(b[1]) - n(a[1]))
    .map(([k, v]) => `${etiquetaCriterio(k)} ${n(v)}`);
  if (partes.length === 0) return null;
  const texto = partes.join(" · ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export interface ResumenAutoMatch {
  titulo: string;
  /** Una línea por resultado, en orden de importancia. */
  lineas: string[];
  descripcion: string;
  conciliados: number;
  pendientes: number;
  hayErrores: boolean;
}

/**
 * Resumen del cruce: SIEMPRE dice cuántos se revisaron y qué pasó con los que
 * no se cruzaron (un fallo de un movimiento no tumba el lote: se cuenta).
 */
export function resumenAutoMatch(r: AutoMatchResultadoLike | null | undefined): ResumenAutoMatch {
  const revisados = n(r?.revisados);
  const conciliados = n(r?.conciliados);
  const ambiguos = n(r?.ambiguos);
  const sinCandidato = n(r?.sin_candidato ?? r?.sin_candidatos);
  const traspasos = n(r?.traspasos);
  const rechazados = n(r?.rechazados);
  const errores = n(r?.errores);

  const titulo =
    revisados === 0
      ? "No había movimientos pendientes en ese rango"
      : conciliados === 0
        ? `Ninguno de los ${revisados} pendientes pudo cruzarse solo`
        : `${conciliados} de ${plural(revisados, "pendiente", "pendientes")} quedaron conciliados`;

  const lineas: string[] = [];
  if (traspasos > 0)
    lineas.push(`${plural(traspasos, "traspaso clasificado", "traspasos clasificados")} por regla`);
  if (ambiguos > 0)
    lineas.push(`${plural(ambiguos, "ambiguo", "ambiguos")} (más de un gasto cuadra: se vinculan a mano)`);
  if (sinCandidato > 0) lineas.push(`${sinCandidato} sin candidato`);
  if (rechazados > 0)
    lineas.push(
      `${rechazados} con el gasto ya cubierto (el candidato no admitía el cargo)`,
    );
  if (errores > 0)
    lineas.push(`${errores} con error (el resto sí se procesó)`);
  const criterios = lineaCriterios(r?.por_criterio);
  if (criterios) lineas.push(criterios);
  // El API revisa por tandas: decir «listo» cuando quedaron pendientes sin
  // mirar sería prometer lo que no pasó.
  if (r?.truncado === true)
    lineas.push("se alcanzó el tope de la corrida: vuelve a ejecutarlo para los que faltan");

  return {
    titulo,
    lineas,
    descripcion: lineas.join(" · "),
    conciliados,
    pendientes: Math.max(0, revisados - conciliados - traspasos),
    hayErrores: errores > 0,
  };
}

// ─────────────────────── Resultado de la importación ─────────────────────

export interface ErrorImportLike {
  error?: string | null;
  motivo?: string | null;
  mensaje?: string | null;
}

/** El motivo que más se repite entre los errores del job (o null). */
export function motivoMasComun(
  errores?: ErrorImportLike[] | null | undefined,
): string | null {
  if (!Array.isArray(errores) || errores.length === 0) return null;
  const cuenta = new Map<string, { texto: string; veces: number }>();
  for (const e of errores) {
    const texto = (e?.error ?? e?.motivo ?? e?.mensaje ?? "").toString().trim();
    if (!texto) continue;
    const clave = normalizaCodigo(texto).slice(0, 60);
    const previo = cuenta.get(clave);
    if (previo) previo.veces += 1;
    else cuenta.set(clave, { texto, veces: 1 });
  }
  if (cuenta.size === 0) return null;
  const top = [...cuenta.values()].sort((a, b) => b.veces - a.veces)[0];
  return top.texto.length > 160 ? `${top.texto.slice(0, 157)}…` : top.texto;
}

export interface ImportJobResumenLike extends AutoMatchResultadoLike {
  estado?: string | null;
  importados?: number | null;
  conciliados_auto?: number | null;
  duplicados_omitidos?: number | null;
  errores_detalle?: ErrorImportLike[] | null;
  error?: string | null;
  total_movimientos?: number | null;
}

export interface ResumenImport {
  titulo: string;
  descripcion: string;
  tono: "exito" | "info" | "error";
  /** true = hay movimientos ya insertados que conviene volver a cruzar. */
  sugerirRecruce: boolean;
}

/**
 * Resultado de una importación en palabras del operador: cuántos entraron,
 * cuántos se cruzaron y CON QUÉ criterio, cuántos quedaron pendientes y —si
 * el job murió a medias— que lo ya insertado se recupera con «Cruzar
 * pendientes» (el 15-sep el operador no vio que 101 movimientos SÍ entraron y
 * reimportó dos veces).
 */
export function resumenImportJob(job: ImportJobResumenLike | null | undefined): ResumenImport {
  const importados = n(job?.importados);
  const conciliados = n(job?.conciliados_auto ?? job?.conciliados);
  const dups = n(job?.duplicados_omitidos);
  const errores = n(job?.errores);
  const ambiguos = n(job?.ambiguos);
  const sinCandidato = n(job?.sin_candidato ?? job?.sin_candidatos);
  const traspasos = n(job?.traspasos);
  const rechazados = n(job?.rechazados);
  const criterios = lineaCriterios(job?.por_criterio);
  const comun = motivoMasComun(job?.errores_detalle);

  const detalle: string[] = [];
  if (traspasos > 0)
    detalle.push(`${plural(traspasos, "traspaso clasificado", "traspasos clasificados")} por regla`);
  if (ambiguos > 0) detalle.push(`${plural(ambiguos, "ambiguo", "ambiguos")}`);
  if (sinCandidato > 0) detalle.push(`${sinCandidato} sin candidato`);
  if (rechazados > 0)
    detalle.push(`${rechazados} con el gasto ya cubierto`);
  if (dups > 0) detalle.push(`${dups} ya existían (omitidos)`);
  if (criterios) detalle.push(criterios);
  if (errores > 0) {
    detalle.push(
      `${plural(errores, "movimiento con error", "movimientos con error")}${
        comun ? `: «${comun}»` : ""
      }`,
    );
  }

  if ((job?.estado ?? "") === "ERROR") {
    const err = (job?.error ?? "").toString().trim();
    return {
      titulo: "La importación se interrumpió",
      descripcion:
        (importados > 0
          ? `${plural(importados, "movimiento ya entró", "movimientos ya entraron")}: no vuelvas a importar el archivo — usa «Cruzar pendientes» para cruzarlos. `
          : "No se alcanzó a importar ningún movimiento. ") + (err ? `Detalle: ${err}` : ""),
      tono: "error",
      sugerirRecruce: importados > 0,
    };
  }

  if (importados === 0 && dups > 0) {
    return {
      titulo: `Los ${dups} movimientos ya estaban importados: no se duplicó nada`,
      descripcion:
        "El archivo quedó archivado. Si siguen saliendo como pendientes, usa «Cruzar pendientes» para volver a intentar el cruce.",
      tono: "info",
      sugerirRecruce: true,
    };
  }

  const pendientes = Math.max(0, importados - conciliados - traspasos);
  return {
    titulo: `Importados ${importados} · conciliados automáticamente ${conciliados}`,
    descripcion:
      detalle.join(" · ") +
      (pendientes > 0
        ? `${detalle.length ? " · " : ""}${pendientes} quedan pendientes de vincular`
        : ""),
    tono: errores > 0 ? "info" : "exito",
    sugerirRecruce: pendientes > 0 || errores > 0,
  };
}

// ────────────────────────── Sugerencias de la IA ─────────────────────────

export interface TextoConfianza {
  /** 0..100 redondeado. */
  pct: number;
  etiqueta: "Alta" | "Media" | "Baja";
  /** «Confianza alta (92 %)». */
  texto: string;
  tono: "alta" | "media" | "baja";
}

/**
 * Confianza de una propuesta. Acepta 0..1 (contrato) o 0..100 por si el API
 * la manda en porcentaje. NUNCA decide por sí sola: la IA propone y el
 * operador confirma.
 */
export function textoConfianza(c: unknown): TextoConfianza {
  const bruto = numeroDe(c);
  const pct = Math.max(0, Math.min(100, Math.round(bruto > 1 ? bruto : bruto * 100)));
  const etiqueta = pct >= 85 ? "Alta" : pct >= 60 ? "Media" : "Baja";
  const tono = pct >= 85 ? "alta" : pct >= 60 ? "media" : "baja";
  return { pct, etiqueta, texto: `Confianza ${etiqueta.toLowerCase()} (${pct} %)`, tono };
}

/** Gasto candidato tal como lo manda el API para vincular un CARGO. */
export interface GastoCandidatoConciliacion {
  id: string;
  fecha?: string | null;
  fecha_gasto?: string | null;
  monto: string | number;
  moneda?: string | null;
  proveedor?: string | null;
  categoria?: string | null;
  lugar?: string | null;
  /** Primera línea de las notas del gasto (lo que empata con el banco). */
  notas?: string | null;
  notas_primera_linea?: string | null;
  tarjeta_terminacion?: string | null;
  matricula?: string | null;
  vuelo_folio?: number | null;
  medio_pago?: string | null;
  conciliado?: boolean | null;
  /** T.C. implícito cuando el gasto es USD y el cargo MXN. */
  tc_implicito?: number | string | null;
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
}

/** Primera línea (no vacía) de un texto multilínea. */
export function primeraLinea(texto?: string | null): string | null {
  if (!texto) return null;
  const linea = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return linea && linea.length > 0 ? linea : null;
}

/** «Aterrizaje · $125.82 MXN · 04/09/2026 · ASUR» (línea principal). */
export function etiquetaCandidatoGasto(g: GastoCandidatoConciliacion): string {
  const fecha = g.fecha ?? g.fecha_gasto ?? null;
  return [
    categoriaGastoLabel(g.categoria ?? ""),
    `${fmtMontoConciliacion(g.monto)} ${g.moneda ?? "MXN"}`,
    fecha ? fmtDateOnly(fecha) : null,
    g.proveedor ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Segunda línea del candidato: los datos que DESEMPATAN a ojo — terminación
 * de tarjeta, lugar/nota (lo que casa con la descripción del banco),
 * matrícula, vuelo, pago parcial y T.C. implícito.
 */
export function descripcionCandidatoGasto(g: GastoCandidatoConciliacion): string | null {
  const nota = primeraLinea(g.notas_primera_linea ?? g.notas);
  const tc = numeroDe(g.tc_implicito);
  const partes = [
    g.tarjeta_terminacion ? `Tarjeta ****${g.tarjeta_terminacion}` : null,
    g.lugar ?? null,
    nota && nota !== g.lugar ? nota : null,
    g.matricula ? g.matricula.toUpperCase() : null,
    g.vuelo_folio != null ? `vuelo #${g.vuelo_folio}` : null,
    textoFaltanteGasto({
      monto: g.monto,
      moneda: g.moneda,
      conciliado: g.conciliado ?? false,
      monto_vinculado: g.monto_vinculado,
      faltante: g.faltante,
    }),
    tc > 0 ? `T.C. ${tc.toFixed(2)}` : null,
    g.conciliado === true && !g.faltante ? "ya cubierto por el banco" : null,
  ].filter(Boolean) as string[];
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** Propuesta de la IA para un movimiento (POST /conciliacion/sugerir-lote). */
export interface PropuestaConciliacionLike {
  movimiento_id: string;
  gasto_id_sugerido?: string | null;
  confianza?: number | string | null;
  razon?: string | null;
  evidencias?: string[] | null;
  motivo_sin_match?: string | null;
  /** 2.ª y 3.ª opción de la IA. El API las manda como
   *  `{gasto_id, confianza, razon}` (NO fichas de gasto) y sus ids ya están
   *  en `candidatos`; se aceptan las dos formas y solo se usan las que
   *  traen ficha completa. */
  alternativas?: Array<
    GastoCandidatoConciliacion | { gasto_id: string; confianza?: number; razon?: string }
  > | null;
  candidatos?: GastoCandidatoConciliacion[] | null;
  /** Ficha del gasto sugerido, si el API la embebió. */
  gasto?: GastoCandidatoConciliacion | null;
  /** Ficha del movimiento, si el API la embebió. */
  movimiento?: {
    id?: string;
    fecha?: string | null;
    monto?: string | number | null;
    tipo?: string | null;
    descripcion?: string | null;
    referencia?: string | null;
  } | null;
}

/** Solo las entradas que traen ficha de gasto (id + monto), en orden. */
function fichas(
  p: PropuestaConciliacionLike | null | undefined,
): GastoCandidatoConciliacion[] {
  const lista = [...(p?.alternativas ?? []), ...(p?.candidatos ?? [])];
  return lista.filter(
    (g): g is GastoCandidatoConciliacion =>
      typeof (g as { id?: unknown })?.id === "string",
  );
}

/**
 * Ficha del gasto propuesto: `gasto` embebido o, si no vino, el candidato con
 * ese id dentro de `alternativas`/`candidatos`. null = el API mandó un id sin
 * ficha (la UI pinta solo el id y deja vincular igual).
 */
export function gastoDePropuesta(
  p: PropuestaConciliacionLike | null | undefined,
): GastoCandidatoConciliacion | null {
  if (!p?.gasto_id_sugerido) return null;
  if (p.gasto && p.gasto.id === p.gasto_id_sugerido) return p.gasto;
  const lista = fichas(p);
  return lista.find((g) => g.id === p.gasto_id_sugerido) ?? p.gasto ?? null;
}

/** Alternativas SIN el sugerido (para «o elige otro»). */
export function alternativasDePropuesta(
  p: PropuestaConciliacionLike | null | undefined,
): GastoCandidatoConciliacion[] {
  const vistos = new Set<string>();
  return fichas(p).filter((g) => {
    if (g.id === p?.gasto_id_sugerido || vistos.has(g.id)) return false;
    vistos.add(g.id);
    return true;
  });
}

// ──────────────────── Clasificación automática (reglas) ──────────────────

/**
 * Movimiento conciliado por REGLA (traspaso interno, comisión del banco…):
 * el API deja `notas = 'Regla: <patrón>'`. Devuelve el patrón para pintarlo
 * como automático; null cuando lo clasificó una persona.
 */
export function reglaAutomaticaDe(
  m: { notas?: string | null; clasificacion_auto?: boolean | null } | null | undefined,
): string | null {
  if (!m) return null;
  const linea = primeraLinea(m.notas);
  const match = linea?.match(/^regla\s*:\s*(.+)$/i);
  if (match) return match[1].trim();
  return m.clasificacion_auto === true ? "regla automática" : null;
}

// ─────────────────────────── Rango de fechas ─────────────────────────────

/**
 * Día de pared ± N días sobre un `YYYY-MM-DD` (aritmética en UTC sobre la
 * fecha SIN hora: nunca corre el día como haría `new Date(dia)` local).
 * El rango de «Cruzar pendientes» es de días de pared Cancún, igual que el
 * resto del módulo.
 */
export function diaMas(dia: string, n: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return dia;
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
