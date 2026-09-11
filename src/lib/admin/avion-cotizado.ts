import type { AvionFichaMin } from "@/types/quotes-persisted";

/**
 * Helpers PUROS del avión COTIZADO (feedback del cliente 4-sep-2026): en
 * el previo del cotizador, en el detalle y en el PDF se muestra el TIPO
 * de avión cotizado — el MODELO (Seneca, Kodiak, Meridian, Cessna…), NUNCA
 * la matrícula — porque a veces se cotiza en un avión y la ruta operativa
 * va en otro. La lista de modelos la manda el API (`modelos_cotizados`,
 * fuente única con el PDF); aquí solo se formatea.
 */

function limpio(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

/**
 * "Piper Seneca V" / "Seneca V · Cessna 206" (modelos distintos separados
 * por «·»). Precedencia: externo → SOLO el modelo del avión ajeno (la
 * referencia de tarifa no se enseña); lista del API si trae algo; si no,
 * el modelo del snapshot/breakdown. null si no hay nada que mostrar.
 */
export function modelosCotizadosTexto(input: {
  esExterno?: boolean | null;
  externoModelo?: string | null;
  /** `modelos_cotizados` del API (GET /v1/quotes/:id). */
  modelos?: string[] | null;
  /** `breakdown.aeronave.modelo` / `calculo_snapshot.aeronave.modelo`. */
  modelo?: string | null;
}): string | null {
  if (input.esExterno) return limpio(input.externoModelo);
  const lista = (input.modelos ?? []).map((m) => limpio(m)).filter((m): m is string => !!m);
  const unicos = lista.filter((m, i) => lista.indexOf(m) === i);
  if (unicos.length > 0) return unicos.join(" · ");
  return limpio(input.modelo);
}

/** «Cotizado en: Piper Seneca V» (null sin modelo). */
export function textoCotizadoEn(
  input: Parameters<typeof modelosCotizadosTexto>[0],
): string | null {
  const m = modelosCotizadosTexto(input);
  return m ? `Cotizado en: ${m}` : null;
}

/**
 * «opera en XB-ANU (Cessna 206)» cuando el avión OPERATIVO del vuelo es
 * distinto al COTIZADO (aquí sí matrícula: es vista interna). null si
 * coinciden, si falta alguno (externo, sin avión) o si el API no los manda.
 */
export function textoOperaEn(
  cotizada: AvionFichaMin | null | undefined,
  operativa: AvionFichaMin | null | undefined,
): string | null {
  if (!cotizada || !operativa) return null;
  if (cotizada.id === operativa.id) return null;
  const matricula = limpio(operativa.matricula);
  const modelo = limpio(operativa.modelo);
  if (!matricula && !modelo) return null;
  const ficha = matricula ? `${matricula}${modelo ? ` (${modelo})` : ""}` : modelo;
  return `opera en ${ficha}`;
}

/**
 * Ficha mínima que puede llegar en cualquiera de las formas con las que el
 * API ha expuesto un avión: objeto (`{id, matricula, modelo}`), texto suelto
 * ("Cessna 206") o nada. Se lee así porque `aeronave_cotizada` /
 * `aeronave_utilizada` son ADITIVOS (11-sep-2026): mientras el API no los
 * mande, el panel cae a lo que ya existía. El `id` se conserva porque es lo
 * único con lo que se puede decidir si el avión cambió de verdad.
 */
interface FichaLeida {
  /** id del avión cuando el API lo manda: ÚNICA forma fiable de comparar. */
  id: string | null;
  matricula: string | null;
  modelo: string | null;
}

function fichaDe(valor: unknown): FichaLeida | null {
  if (!valor) return null;
  if (typeof valor === "string") {
    const t = limpio(valor);
    return t ? { id: null, matricula: null, modelo: t } : null;
  }
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    const id = typeof o.id === "string" ? limpio(o.id) : null;
    const matricula = typeof o.matricula === "string" ? limpio(o.matricula) : null;
    const modelo = typeof o.modelo === "string" ? limpio(o.modelo) : null;
    if (!matricula && !modelo) return null;
    return { id, matricula, modelo };
  }
  return null;
}

/** "XB-ANU · Cessna 206" (o solo lo que haya). null si no hay nada. */
function fichaTexto(f: FichaLeida | null): string | null {
  if (!f) return null;
  if (f.matricula && f.modelo) return `${f.matricula} · ${f.modelo}`;
  return f.matricula ?? f.modelo;
}

/** Forma mínima de la cotización que leen los helpers (tolerante al API viejo). */
export interface QuoteAeronaves {
  es_externo?: boolean | null;
  avion_externo_modelo?: string | null;
  avion_externo_matricula?: string | null;
  modelos_cotizados?: string[] | null;
  aeronave_cotizada?: unknown;
  /** Campo NUEVO del API (11-sep-2026): va al RAÍZ de la cotización / del
   *  snapshot de vuelo, NO dentro de `calculo_snapshot`. */
  aeronave_utilizada?: unknown;
  aeronave_operativa?: unknown;
  calculo_snapshot?: unknown;
  /** Avión asignado al vuelo (respaldo si el API no manda la ficha). */
  aeronave_id?: string | null;
}

/**
 * CONTROL INTERNO (11-sep-2026): «Aeronave cotizada» = con la que se pactó
 * el precio (MODELO del snapshot vigente, nunca matrícula: al cliente se le
 * vende un tipo de avión) y «Aeronave utilizada» = la que hoy tiene asignada
 * el vuelo (matrícula · modelo, porque es vista interna). Si difieren, la
 * oficina debe verlo sin abrir el vuelo.
 *
 * Precedencia (todo ADITIVO, tolera que el API no mande los campos nuevos):
 * campos del RAÍZ que manda el API (`aeronave_cotizada` / `aeronave_utilizada`
 * — ahí viven de verdad, no dentro de `calculo_snapshot`) → los mismos
 * nombres dentro del snapshot (por si algún payload los anida) →
 * `aeronave_operativa` → `modelos_cotizados` / `calculo_snapshot.aeronave` →
 * catálogo por `aeronave_id`. En externos el avión ajeno es ambos.
 *
 * `difieren` se decide por ID cuando el API manda las dos fichas (dos aviones
 * distintos PUEDEN compartir modelo: comparar el texto daría un falso «son el
 * mismo»). Sin ids se compara el modelo utilizado contra los modelos
 * COTIZADOS —en plural: una cotización puede rotar de avión por tramo y
 * `modelos_cotizados` trae varios—, para no pintar la alerta ámbar en un
 * vuelo donde nadie cambió nada.
 */
export function aeronavesDeCotizacion(
  quote: QuoteAeronaves,
  /** Catálogo de aviones para resolver `aeronave_id` cuando el API no manda
   *  la ficha del avión operativo. */
  catalogo?: ReadonlyArray<{ id: string; matricula?: string | null; modelo?: string | null }>,
): {
  cotizada: string | null;
  utilizada: string | null;
  difieren: boolean;
} {
  const snap = (quote.calculo_snapshot ?? null) as Record<string, unknown> | null;
  const snapAeronave = fichaDe(snap?.aeronave);

  const externoFicha = quote.es_externo
    ? fichaDe({
        matricula: quote.avion_externo_matricula ?? null,
        modelo: quote.avion_externo_modelo ?? null,
      })
    : null;

  // COTIZADA: solo el modelo (lo que ve el cliente en el PDF). El campo del
  // RAÍZ manda: es el que devuelve GET /v1/quotes/:id y el snapshot del vuelo.
  const cotizadaFicha =
    fichaDe(quote.aeronave_cotizada) ?? fichaDe(snap?.aeronave_cotizada);
  const cotizada =
    (quote.es_externo ? externoFicha?.modelo : null) ??
    cotizadaFicha?.modelo ??
    modelosCotizadosTexto({
      esExterno: quote.es_externo,
      externoModelo: quote.avion_externo_modelo,
      modelos: quote.modelos_cotizados,
      modelo: snapAeronave?.modelo,
    });

  // Último respaldo: la ficha del avión asignado, sacada del catálogo.
  const delCatalogo =
    quote.aeronave_id && catalogo
      ? (catalogo.find((a) => a.id === quote.aeronave_id) ?? null)
      : null;
  // UTILIZADA: `aeronave_utilizada` del RAÍZ primero. No es un detalle: el API
  // la resuelve como `vuelo.aeronave_id` y, si el vuelo no tiene avión a nivel
  // cabecera, con el del primer tramo vivo — justo el caso en el que
  // `aeronave_operativa` viene null y el panel diría «Sin asignar» teniendo el
  // dato.
  const utilizadaFicha =
    fichaDe(quote.aeronave_utilizada) ??
    fichaDe(snap?.aeronave_utilizada) ??
    fichaDe(quote.aeronave_operativa) ??
    externoFicha ??
    fichaDe(delCatalogo);
  const utilizada = fichaTexto(utilizadaFicha);

  return {
    cotizada,
    utilizada,
    difieren: difierenAviones(cotizadaFicha, utilizadaFicha, cotizada),
  };
}

/**
 * ¿El avión cotizado y el utilizado son distintos? Por ID si el API mandó las
 * dos fichas (regla del API, que compara igual); si no, por MODELO contra el
 * conjunto de modelos cotizados (`cotizadaTexto` puede traer varios unidos con
 * « · » cuando la cotización rota de avión por tramo). Sin datos suficientes:
 * false — nunca se inventa una alerta.
 */
function difierenAviones(
  cotizada: FichaLeida | null,
  utilizada: FichaLeida | null,
  cotizadaTexto: string | null,
): boolean {
  if (cotizada?.id && utilizada?.id) return cotizada.id !== utilizada.id;
  const modeloUtilizado = limpio(utilizada?.modelo ?? null);
  if (!modeloUtilizado || !cotizadaTexto) return false;
  const usado = modeloUtilizado.toLocaleLowerCase("es-MX");
  const cotizados = cotizadaTexto
    .split("·")
    .map((m) => m.trim().toLocaleLowerCase("es-MX"))
    .filter(Boolean);
  return !cotizados.includes(usado);
}
