/**
 * MANTENIMIENTO UNIFICADO del expediente del avión (17-nov-2026, API 0.0.140).
 * Pedido del cliente: «debemos crear un solo componente donde venga todo lo
 * de mantenimiento, no importa que sea un componente grande… para tenerlo
 * mejor ubicado» y «los datos de los cards que están hasta arriba… si el dato
 * ya aparece en otro componente más abajo vamos a omitirlo arriba».
 *
 * FUENTE ÚNICA (PURA) de las secciones de la card, de sus anclas y de lo que
 * dice cada mosaico del resumen. Los números NO se calculan aquí: las
 * órdenes y las discrepancias se CUENTAN y los componentes traen su estado
 * del API (`componentes-aeronave.ts`).
 *
 * El resumen NO repite el próximo servicio: Hobbs, «Próximo servicio» y
 * «Faltan» (con el estado de su orden) viven UNA sola vez, en la sección
 * «Horas y programa de servicio» que va justo debajo. Es la misma regla que
 * retiró el KPI de arriba: un dato no se pinta dos veces.
 */
import type { AeronaveDiscrepancia } from "@/types/aircraft";
import type { ComponenteAeronave, Mantenimiento } from "@/types/engineering";
import {
  resumenComponentes,
  textoMosaicoComponentes,
  type TonoVida,
} from "./componentes-aeronave";
import { TEXTO_NO_DISPONIBLE, type EstadoCarga } from "./ingenieria-errores";

/** Id de la card única (ancla de la página). */
export const ID_CARD_MANTENIMIENTO = "mantenimiento";

/**
 * Secciones de la card, en orden. `mantenimientos` es el ancla HISTÓRICA de
 * las órdenes (`ANCLA_MANTENIMIENTOS` de `proximo-servicio.ts` y los enlaces
 * «Poner fecha» / «Ver mantenimiento» apuntan ahí): no se renombra.
 */
export const SECCIONES_MANTENIMIENTO = [
  { id: "mantenimiento-resumen", etiqueta: "Resumen" },
  { id: "horas-programa", etiqueta: "Horas y programa" },
  { id: "mantenimientos", etiqueta: "Órdenes" },
  { id: "componentes", etiqueta: "Componentes" },
  { id: "discrepancias", etiqueta: "Discrepancias" },
] as const;

export type IdSeccionMantenimiento = (typeof SECCIONES_MANTENIMIENTO)[number]["id"];

export const TITULO_CARD_MANTENIMIENTO = "Mantenimiento";
export const DESCRIPCION_CARD_MANTENIMIENTO =
  "Todo lo de mantenimiento del avión en un solo lugar: horas y programa de servicio, órdenes con sus evidencias, componentes y discrepancias.";

export const TITULOS_SECCION: Record<
  Exclude<IdSeccionMantenimiento, "mantenimiento-resumen">,
  { titulo: string; descripcion: string }
> = {
  "horas-programa": {
    titulo: "Horas y programa de servicio",
    descripcion: "Conteo de horas del avión (último Hobbs) y cada cuándo le toca servicio.",
  },
  mantenimientos: {
    titulo: "Órdenes de mantenimiento",
    descripcion:
      "Servicios programados, en taller y realizados. Al terminar, sube el sticker del taller como evidencia.",
  },
  componentes: {
    titulo: "Componentes",
    descripcion:
      "Motores, hélices y piezas con vida límite: cuánto llevan, cuánto les queda y sus documentos.",
  },
  discrepancias: {
    titulo: "Discrepancias",
    descripcion: "Reportes de la tripulación y del taller, con su seguimiento.",
  },
};

/** Tono de un mosaico: rojo = urgente, ámbar = pide atención, verde = al día. */
export type TonoMosaico = "rojo" | "ambar" | "verde" | "neutro";

export const CLASE_VALOR_MOSAICO: Record<TonoMosaico, string> = {
  rojo: "text-destructive",
  ambar: "text-amber-600 dark:text-amber-400",
  verde: "text-emerald-600 dark:text-emerald-400",
  neutro: "",
};

export interface Mosaico {
  /** Rótulo chico de arriba. */
  rotulo: string;
  /** Lo que se lee de un vistazo. */
  valor: string;
  /** Renglón de apoyo. */
  hint?: string;
  tono: TonoMosaico;
  /** Ancla de la sección donde se resuelve. */
  href: string;
}

const plural = (n: number, uno: string, varios: string) =>
  n === 1 ? `1 ${uno}` : `${n} ${varios}`;

// ── Órdenes ─────────────────────────────────────────────────────────────────

export interface ResumenOrdenes {
  total: number;
  enTaller: number;
  programadas: number;
  /** Programadas a las que falta ponerles fecha. */
  sinFecha: number;
}

export function resumenOrdenes(
  mant: readonly Pick<Mantenimiento, "estado" | "fecha_programada">[],
): ResumenOrdenes {
  const r: ResumenOrdenes = { total: mant.length, enTaller: 0, programadas: 0, sinFecha: 0 };
  for (const m of mant) {
    if (m.estado === "EN_TALLER") r.enTaller += 1;
    else if (m.estado === "PROGRAMADO") {
      r.programadas += 1;
      if (!m.fecha_programada) r.sinFecha += 1;
    }
  }
  return r;
}

/** `mant` null = no se pudieron leer las órdenes ⇒ «—» (nunca «ninguna»). */
export function mosaicoOrdenes(
  mant: readonly Pick<Mantenimiento, "estado" | "fecha_programada">[] | null,
): Mosaico {
  const base = { rotulo: "Órdenes abiertas", href: "#mantenimientos" } as const;
  if (!mant) return { ...base, valor: "—", hint: "No se pudieron leer", tono: "neutro" };
  const r = resumenOrdenes(mant);
  if (r.enTaller > 0) {
    return {
      ...base,
      valor: `${r.enTaller} en taller`,
      hint:
        r.programadas > 0
          ? `y ${plural(r.programadas, "programada", "programadas")}`
          : "El avión está en servicio",
      tono: "ambar",
    };
  }
  if (r.programadas > 0) {
    return {
      ...base,
      valor: plural(r.programadas, "programada", "programadas"),
      hint:
        r.sinFecha > 0
          ? `${r.sinFecha} sin fecha: falta confirmarla`
          : "Con fecha confirmada",
      tono: r.sinFecha > 0 ? "ambar" : "neutro",
    };
  }
  return {
    ...base,
    valor: "Ninguna",
    hint: r.total > 0 ? "Todas completadas" : "Sin órdenes registradas",
    tono: r.total > 0 ? "verde" : "neutro",
  };
}

// ── Discrepancias ───────────────────────────────────────────────────────────

export interface ResumenDiscrepancias {
  abiertas: number;
  /** Abiertas de severidad ALTA: bloquean asignar el avión. */
  altas: number;
}

export function resumenDiscrepancias(
  discrepancias: readonly Pick<AeronaveDiscrepancia, "estado" | "severidad">[],
): ResumenDiscrepancias {
  const abiertas = discrepancias.filter((d) => d.estado !== "RESUELTA");
  return {
    abiertas: abiertas.length,
    altas: abiertas.filter((d) => d.severidad === "ALTA").length,
  };
}

export function mosaicoDiscrepancias(
  discrepancias: readonly Pick<AeronaveDiscrepancia, "estado" | "severidad">[],
): Mosaico {
  const base = { rotulo: "Discrepancias abiertas", href: "#discrepancias" } as const;
  const r = resumenDiscrepancias(discrepancias);
  if (r.altas > 0) {
    return {
      ...base,
      valor: `${plural(r.altas, "alta", "altas")} sin resolver`,
      hint:
        r.abiertas > r.altas
          ? `Bloquea asignar el avión · ${r.abiertas} abiertas en total`
          : "Bloquea asignar el avión a vuelos",
      tono: "rojo",
    };
  }
  if (r.abiertas > 0) {
    return {
      ...base,
      valor: plural(r.abiertas, "abierta", "abiertas"),
      hint: "Sin resolver",
      tono: "ambar",
    };
  }
  return {
    ...base,
    valor: "Ninguna",
    hint: discrepancias.length > 0 ? "Todas resueltas" : "Sin reportes",
    tono: discrepancias.length > 0 ? "verde" : "neutro",
  };
}

// ── Componentes ─────────────────────────────────────────────────────────────

const TONO_DE_VIDA: Record<TonoVida, TonoMosaico> = {
  rojo: "rojo",
  ambar: "ambar",
  verde: "verde",
  gris: "neutro",
};

/**
 * Mosaico «Componentes». Con la carga en curso, fallida o sin disponibilidad
 * el valor es «—» y el hint dice por qué: nunca «Sin componentes» cuando no
 * se sabe.
 */
export function mosaicoComponentes(
  estado: EstadoCarga,
  componentes: readonly Pick<ComponenteAeronave, "vida">[] | null | undefined,
): Mosaico {
  const base = { rotulo: "Componentes", href: "#componentes" } as const;
  if (estado === "cargando") return { ...base, valor: "—", hint: "Cargando…", tono: "neutro" };
  if (estado === "no_disponible") {
    return { ...base, valor: "—", hint: TEXTO_NO_DISPONIBLE, tono: "neutro" };
  }
  if (estado === "error" || !componentes) {
    return { ...base, valor: "—", hint: "No se pudieron leer", tono: "neutro" };
  }
  const t = textoMosaicoComponentes(resumenComponentes(componentes));
  return { ...base, valor: t.valor, hint: t.hint, tono: TONO_DE_VIDA[t.tono] };
}

/** Órdenes: la card unificada perdió el «N registrados» del encabezado; se dice aquí. */
export function textoConteoOrdenes(n: number): string {
  return n === 0
    ? "Sin mantenimientos registrados."
    : `${plural(n, "registrado", "registrados")} (programados y realizados).`;
}

export const TEXTO_ORDENES_NO_CARGARON =
  "No se pudieron cargar las órdenes de mantenimiento: NO están vacías, solo no se pudieron leer.";
