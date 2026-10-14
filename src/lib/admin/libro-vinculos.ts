/**
 * Llegada a la CELDA de un gasto en el libro en pantalla (13-oct-2026, API
 * 0.0.75, punto 5 del lote: «desde Conciliación, abrir el balance del avión o
 * el general en la celda del gasto») — FUENTE ÚNICA. PURO: sin React ni red.
 *
 * pyservices anota en cada celda los gastos que la componen (`vinculos`, con
 * los ids que le manda el API) y marca el libro con `vinculos_gasto: true`.
 * Aquí solo se BUSCA la celda y se redacta la franja que la explica: no se
 * decide a qué libro ni a qué mes va un gasto (eso es del API) y ningún
 * monto se suma ni se recalcula (los montos de la franja son los del API, en
 * pesos; un USD sin T.C. se dice, nunca se suma crudo).
 */
import { fmtMxn } from "@/lib/format";
import type { LibroExcel, LibroExcelCelda, LibroExcelVinculo } from "@/types/libro-excel";
import { letraColumna } from "./libro-excel";
import { esUuid } from "./url-params";

/** Alto EXACTO de la franja, borde incluido (`.xl-franja` de styles/libro-excel.css). */
export const ALTO_FRANJA_PX = 28;

/**
 * Qué celda gana cuando el gasto aparece en varias: la que ES su monto
 * (`fila`) antes que la que lo suma con otros, y esa antes que una nota o un
 * USD sin T.C. Un rol desconocido (contrato futuro) va al final.
 */
export const PRIORIDAD_ROL_VINCULO: Readonly<Record<LibroExcelVinculo["rol"], number>> = {
  fila: 0,
  suma: 1,
  nota: 2,
  sin_tc: 3,
};
const PRIORIDAD_ROL_DESCONOCIDO = 4;

export const TITULO_FRANJA_GASTO = "Celda del gasto que abriste desde Conciliación";
export const ETIQUETA_QUITAR_FRANJA_GASTO = "Quitar aviso";
export const TEXTO_GASTO_NO_ENCONTRADO =
  "Este gasto no está en este libro: puede ser de otro mes o del otro balance. Ábrelo desde Conciliación con «Ver en balance…» o cambia el periodo.";
export const TEXTO_LIBRO_SIN_VINCULOS =
  "Este libro todavía no marca las celdas de los gastos (falta actualizar el servidor): búscalo por su fecha y su monto.";

/** Dónde quedó el gasto en el libro. */
export interface HallazgoGasto {
  hojaIdx: number;
  hojaNombre: string;
  r: number;
  c: number;
  /** El vínculo de ESE gasto en la celda ganadora. */
  vinculo: LibroExcelVinculo;
  /** Gastos distintos que lleva la celda (cualquier rol). */
  enCelda: number;
  /** Gastos distintos que la celda SUMA (rol `suma`): una TUA anotada o un
   *  USD sin T.C. van en la celda pero no suman, así que no se cuentan en
   *  «la celda suma N gastos». */
  sumanEnCelda: number;
  /** Renglones distintos (hoja, fila) del libro donde aparece el gasto. */
  renglones: number;
  /** Otras columnas de la MISMA fila que suman otra parte de ese gasto
   *  (operación + FBO de una factura repartida). */
  otrasColumnas: string[];
}

export interface LlegadaGasto {
  gastoId: string;
  hallazgo: HallazgoGasto | null;
  /** El libro trae la bandera `vinculos_gasto`: si no encontró el gasto, es
   *  que no está (otro mes u otro balance), no que falte el servidor. */
  libroMarcaGastos: boolean;
}

export interface FranjaGasto {
  texto: string;
  tono: "ok" | "aviso";
  titulo: string;
}

const normalizarId = (id: string) => id.trim().toLowerCase();

/** Los vínculos a gastos de una celda; lo que no trae forma de vínculo se ignora. */
function vinculosGastoDe(celda: LibroExcelCelda): LibroExcelVinculo[] {
  const vs: unknown = celda.vinculos;
  if (!Array.isArray(vs)) return [];
  return vs.filter(
    (v): v is LibroExcelVinculo =>
      v != null &&
      typeof v === "object" &&
      (v as { tipo?: unknown }).tipo === "gasto" &&
      typeof (v as { id?: unknown }).id === "string" &&
      (v as { id: string }).id.trim() !== "",
  );
}

function prioridadDe(rol: unknown): number {
  return typeof rol === "string" && Object.prototype.hasOwnProperty.call(PRIORIDAD_ROL_VINCULO, rol)
    ? PRIORIDAD_ROL_VINCULO[rol as LibroExcelVinculo["rol"]]
    : PRIORIDAD_ROL_DESCONOCIDO;
}

/** «columna D» cuando el vínculo no trae su encabezado (nunca lanza). */
function columnaDe(v: LibroExcelVinculo, c: number): string {
  if (v.columna) return v.columna;
  return Number.isInteger(c) && c >= 1 ? `columna ${letraColumna(c)}` : "columna";
}

/**
 * La celda del gasto en el libro: recorre hojas y celdas EN ORDEN y gana la
 * de menor (prioridad del rol, hoja, fila, columna). null si el libro no
 * trae ese id en ninguna celda.
 */
export function buscarCeldaDeGasto(libro: LibroExcel, gastoId: string): HallazgoGasto | null {
  const id = normalizarId(gastoId);
  if (!id) return null;
  const hojas = Array.isArray(libro?.hojas) ? libro.hojas : [];
  let mejor: { hojaIdx: number; celda: LibroExcelCelda; vinculo: LibroExcelVinculo; prioridad: number } | null =
    null;
  const renglones = new Set<string>();
  for (let hojaIdx = 0; hojaIdx < hojas.length; hojaIdx++) {
    const celdas = Array.isArray(hojas[hojaIdx].celdas) ? hojas[hojaIdx].celdas : [];
    for (const celda of celdas) {
      for (const v of vinculosGastoDe(celda)) {
        if (normalizarId(v.id) !== id) continue;
        renglones.add(`${hojaIdx}:${celda.r}`);
        const prioridad = prioridadDe(v.rol);
        const gana =
          mejor == null ||
          prioridad < mejor.prioridad ||
          (prioridad === mejor.prioridad &&
            (hojaIdx < mejor.hojaIdx ||
              (hojaIdx === mejor.hojaIdx &&
                (celda.r < mejor.celda.r || (celda.r === mejor.celda.r && celda.c < mejor.celda.c)))));
        if (gana) mejor = { hojaIdx, celda, vinculo: v, prioridad };
      }
    }
  }
  if (!mejor) return null;
  const { hojaIdx, celda, vinculo } = mejor;
  const hoja = hojas[hojaIdx];
  const enLaCelda = vinculosGastoDe(celda);
  const otrasColumnas: string[] = [];
  for (const otra of [...(Array.isArray(hoja.celdas) ? hoja.celdas : [])].sort((a, b) => a.c - b.c)) {
    if (otra.r !== celda.r || otra.c === celda.c) continue;
    for (const v of vinculosGastoDe(otra)) {
      if (normalizarId(v.id) !== id || v.rol !== "suma") continue;
      const columna = columnaDe(v, otra.c);
      if (!otrasColumnas.includes(columna)) otrasColumnas.push(columna);
    }
  }
  return {
    hojaIdx,
    hojaNombre: hoja.nombre,
    r: celda.r,
    c: celda.c,
    vinculo,
    enCelda: new Set(enLaCelda.map((v) => normalizarId(v.id))).size,
    sumanEnCelda: new Set(enLaCelda.filter((v) => v.rol === "suma").map((v) => normalizarId(v.id))).size,
    renglones: renglones.size,
    otrasColumnas,
  };
}

/** La llegada de `?gasto=` a ESTE libro; null si el id no es uuid (se ignora). */
export function llegadaAGasto(libro: LibroExcel, gastoId: string | null | undefined): LlegadaGasto | null {
  if (!esUuid(gastoId)) return null;
  const id = gastoId as string;
  return {
    gastoId: id,
    hallazgo: buscarCeldaDeGasto(libro, id),
    libroMarcaGastos: libro?.vinculos_gasto === true,
  };
}

const esNumero = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** El texto de la franja verde: qué es ese gasto en ESA celda, con montos del API. */
export function textoFranjaGasto(h: HallazgoGasto): string {
  const v = h.vinculo;
  const hoja = `hoja «${h.hojaNombre}»`;
  const fila = v.fila ?? String(h.r);
  const columna = columnaDe(v, h.c);
  const monto = esNumero(v.monto_mxn) ? v.monto_mxn : null;
  const gasto = esNumero(v.gasto_mxn) ? v.gasto_mxn : null;
  let texto: string;
  switch (v.rol) {
    case "fila":
      // Un USD sin T.C. no tiene pesos: se dice antes que la parte del reparto.
      if (monto == null) texto = `Gasto en USD sin tipo de cambio (no suma en pesos) · ${hoja} · fila ${h.r}`;
      else if (v.parte === "reparto") texto = `Parte del reparto manual: ${fmtMxn(monto)} · ${hoja} · fila ${h.r}`;
      else if (v.parte === "remanente") texto = `Remanente del reparto manual: ${fmtMxn(monto)} · ${hoja} · fila ${h.r}`;
      else texto = `Gasto ${fmtMxn(monto)} · ${hoja} · fila ${h.r}`;
      break;
    case "suma": {
      const total = gasto ?? monto;
      const esParte = gasto != null && monto != null && Math.abs(gasto - monto) >= 0.005;
      texto = [
        total != null ? `Gasto ${fmtMxn(total)}` : "Gasto",
        esParte ? `en esta celda ${fmtMxn(monto)}` : null,
        hoja,
        `fila ${fila}`,
        columna,
        h.otrasColumnas.length > 0 ? `otra parte en ${h.otrasColumnas.join(" y ")}` : null,
        h.sumanEnCelda > 1 ? `la celda suma ${h.sumanEnCelda} gastos` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      break;
    }
    case "nota":
      texto = `Anotado sin sumar${gasto ? ` (${fmtMxn(gasto)})` : ""}: TUA o extensión de horario, traslado al cliente · ${hoja} · fila ${fila} · ${columna}`;
      break;
    case "sin_tc":
      texto = `Gasto en USD sin tipo de cambio: aún no suma en esta celda (captura su T.C. en Gastos) · ${hoja} · fila ${fila} · ${columna}`;
      break;
    default:
      texto = `Gasto · ${hoja} · fila ${fila}`;
  }
  return h.renglones > 1 ? `${texto} · aparece en ${h.renglones} renglones de este libro` : texto;
}

/** La franja de la llegada: verde con la celda, o ámbar diciendo por qué no está. */
export function franjaDeLlegada(l: LlegadaGasto): FranjaGasto {
  if (l.hallazgo) {
    const texto = textoFranjaGasto(l.hallazgo);
    return { texto, tono: "ok", titulo: `${TITULO_FRANJA_GASTO}: ${texto}` };
  }
  const texto = l.libroMarcaGastos ? TEXTO_GASTO_NO_ENCONTRADO : TEXTO_LIBRO_SIN_VINCULOS;
  return { texto, tono: "aviso", titulo: texto };
}

/**
 * `key` del libro en la página: con gasto, gasto · título · archivo. Cambiar
 * de periodo, de avión o de chip cambia el título o el archivo ⇒ el libro se
 * remonta y vuelve a saltar; un `router.refresh()` (RefreshOnFocus) conserva
 * la clave y NO salta. Sin gasto ⇒ null (sin key: el libro de siempre).
 */
export function claveSalto(
  gastoId: string | null | undefined,
  libro: Pick<LibroExcel, "titulo" | "archivo">,
): string | null {
  if (!gastoId) return null;
  return `${gastoId}|${libro.titulo}|${libro.archivo ?? ""}`;
}
