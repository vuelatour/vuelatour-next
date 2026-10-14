/**
 * CREAR EL GASTO DESDE «VINCULAR GASTO» (12-oct-2026). Pedido del cliente:
 * «crear gasto desde la opción de vincular el gasto… que ya venga una opción
 * para crearlo rápido, incluso si está prellenado» y «que se confirme bien
 * que no está el gasto… alguna alerta… y que con IA te ayude a validar que
 * no esté ya registrado para no duplicar, y si estamos muy seguros… que te
 * permita aplicarlo validando que tú das el visto bueno».
 *
 * FUENTE ÚNICA (PURA) de: el prellenado del alta a partir del cargo del
 * banco, la lista de POSIBLES DUPLICADOS (mismo monto, ±120 días, también
 * en efectivo y los ya conciliados), el veredicto de la IA (`sugerir`) y los
 * textos de la confirmación explícita. Crear + vincular los hace el diálogo;
 * aquí no hay red.
 */
import { fmtMonto } from "@/lib/format";
import { MEDIO_DOMICILIADO } from "@/lib/admin/medios-pago";
import type { AvionCatalogoGasto } from "@/lib/admin/combustibles";
import { fmtDateOnly } from "@/lib/datetime";
import type { GastoCreateValues } from "@/app/admin/expenses/schema";
import type {
  GastoCandidato,
  GastosCandidatosResponse,
  MovimientoBancario,
  SugerenciaConciliacion,
} from "@/types/conciliacion";

/** Ventana con la que se buscan posibles duplicados (la máxima del API). */
export const DIAS_DUPLICADOS = 120;
/** Diferencia de monto que todavía cuenta como «el mismo» (centavo de redondeo). */
export const TOLERANCIA_DUPLICADO = 0.01;
/** Confianza de la IA a partir de la cual se insiste en que YA está registrado. */
export const CONFIANZA_IA_ALTA = 0.7;

const centavos = (n: number) => Math.round(n * 100) / 100;
const numeroDe = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Terminación de tarjeta que trae la referencia del banco: SOLO si la
 * referencia tiene 8+ dígitos (misma regla que el auto-cruce del API: una
 * referencia de 6 dígitos no inventa tarjeta). null si no.
 */
export function terminacionDeReferencia(referencia: string | null | undefined): string | null {
  const digitos = (referencia ?? "").replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(-4) : null;
}

/**
 * Leyendas de un CARGO AUTOMÁTICO / recurrente del estado de cuenta
 * (13-oct-2026, «Pago domiciliado»). Casos reales de prod: «STR*AMAZON RET
 * REC Carg Recur.», «DLO*STARLINK Carg Recur.», «03 POR COBRANZA
 * DOMICILIADA». Con ancla de palabra: «RECURSOS HUMANOS» NO es recurrente.
 */
export const RE_CARGO_RECURRENTE = /\bCARG\.?\s*RECUR|\bRECURRENTE\b|DOMICILIA|CARGO\s+AUTOM|SUSCRIP/i;

/** ¿La descripción del cargo es la de un cargo automático/recurrente? Vacía ⇒ false. */
export function pareceCargoRecurrente(descripcion: string | null | undefined): boolean {
  const d = (descripcion ?? "").trim();
  return d !== "" && RE_CARGO_RECURRENTE.test(d);
}

/**
 * Valores del alta de gasto prellenados con el cargo (lo demás, el default
 * del formulario). Medio: un cargo automático/recurrente ⇒ «Pago domiciliado»
 * SIN tarjeta (13-oct-2026; gana a la regla de la referencia: «03 POR
 * COBRANZA DOMICILIADA» trae 20 dígitos y no es una tarjeta); si no, con
 * referencia de 8+ dígitos ⇒ tarjeta corporativa con esa terminación; si no,
 * transferencia. La oficina lo revisa antes de guardar (NOTA_PRELLENADO).
 */
export function prefillGastoDesdeCargo(
  mov: Pick<MovimientoBancario, "monto" | "fecha" | "descripcion" | "referencia">,
  monedaCuenta: string | null | undefined,
): Partial<GastoCreateValues> {
  const monto = centavos(Math.abs(numeroDe(mov.monto)));
  const recurrente = pareceCargoRecurrente(mov.descripcion);
  const terminacion = recurrente ? null : terminacionDeReferencia(mov.referencia);
  const notas = [mov.descripcion?.trim() || null, mov.referencia?.trim() ? `ref. ${mov.referencia.trim()}` : null]
    .filter(Boolean)
    .join(" · ");
  return {
    monto: monto > 0 ? monto.toFixed(2) : "",
    moneda: monedaCuenta === "USD" ? "USD" : "MXN",
    fecha_gasto: (mov.fecha ?? "").slice(0, 10),
    medio_pago: recurrente ? MEDIO_DOMICILIADO : terminacion ? "TARJETA_CORP" : "TRANSFERENCIA",
    tarjeta_terminacion: terminacion ?? "",
    notas,
  };
}

/** Texto del cargo para la cabecera del paso previo. */
export function textoResumenCargo(
  mov: Pick<MovimientoBancario, "monto" | "fecha" | "descripcion">,
  monedaCuenta: string | null | undefined,
): string {
  const monto = fmtMonto(Math.abs(numeroDe(mov.monto)), monedaCuenta ?? undefined);
  return `Cargo de ${monto} del ${fmtDateOnly(mov.fecha)}${mov.descripcion ? ` · ${mov.descripcion}` : ""}`;
}

/** Candidatos cuyo monto (o faltante) es EL del cargo: posibles duplicados. */
export function duplicadosDeCandidatos(
  candidatos: readonly GastoCandidato[] | null | undefined,
  montoCargo: string | number,
): GastoCandidato[] {
  const cargo = centavos(Math.abs(numeroDe(montoCargo)));
  return (candidatos ?? []).filter((c) => {
    const monto = Math.abs(numeroDe(c.monto));
    const faltante = c.faltante != null ? Math.abs(numeroDe(c.faltante)) : null;
    return (
      Math.abs(monto - cargo) <= TOLERANCIA_DUPLICADO + 0.000001 ||
      (faltante != null && faltante > 0 && Math.abs(faltante - cargo) <= TOLERANCIA_DUPLICADO + 0.000001)
    );
  });
}

export type VeredictoIa =
  | { tipo: "pendiente"; texto: string }
  | { tipo: "sugiere"; texto: string; gastoId: string; confianza: number; razon: string | null; alta: boolean }
  | { tipo: "sin_match"; texto: string }
  | { tipo: "no_disponible"; texto: string };

/** Lo que la IA (`POST movimientos/:id/sugerir`) dice del cargo, en una frase. */
export function veredictoIa(sug: SugerenciaConciliacion | null | undefined, cargando: boolean): VeredictoIa {
  if (cargando || sug === undefined) return { tipo: "pendiente", texto: "La IA está revisando si el cargo ya corresponde a un gasto registrado…" };
  if (!sug || !sug.disponible) {
    return {
      tipo: "no_disponible",
      texto: "La IA no está disponible en este momento: revisa la lista de posibles duplicados por tu cuenta.",
    };
  }
  if (sug.gasto_id_sugerido) {
    const pct = Math.round((sug.confianza ?? 0) * 100);
    const alta = (sug.confianza ?? 0) >= CONFIANZA_IA_ALTA;
    return {
      tipo: "sugiere",
      gastoId: sug.gasto_id_sugerido,
      confianza: sug.confianza ?? 0,
      razon: sug.razon ?? null,
      alta,
      texto: alta
        ? `La IA cree que este cargo YA corresponde a un gasto registrado (${pct} % de confianza): vincúlalo en vez de crear otro.`
        : `La IA ve un gasto parecido (${pct} % de confianza): revísalo antes de crear uno nuevo.`,
    };
  }
  return {
    tipo: "sin_match",
    texto: sug.motivo_sin_match
      ? `La IA no encontró un gasto registrado que corresponda: ${sug.motivo_sin_match}`
      : "La IA no encontró un gasto registrado que corresponda a este cargo.",
  };
}

/** Ficha del gasto que sugiere la IA (viaja en `candidatos` de la respuesta). */
export function fichaSugeridaIa(sug: SugerenciaConciliacion | null | undefined): GastoCandidato | null {
  if (!sug?.gasto_id_sugerido) return null;
  return sug.candidatos?.find((c) => c.id === sug.gasto_id_sugerido) ?? null;
}

export const TITULO_CREAR_DESDE_CARGO = "Crear el gasto desde este cargo";
export const BOTON_ABRIR_CREAR = "¿No está el gasto? Créalo";
export const TITULO_ABRIR_CREAR =
  "El gasto no se capturó: créalo prellenado con el monto, la fecha y la descripción del cargo, y queda vinculado en un solo paso";
export const ETIQUETA_DUPLICADOS = "Posibles duplicados (mismo monto, ±120 días)";
export const TEXTO_SIN_DUPLICADOS = "No hay ningún gasto con este monto en ±120 días (ni en efectivo, ni ya conciliado).";
export const TEXTO_BUSCANDO_DUPLICADOS = "Buscando gastos con el mismo monto…";
export const TEXTO_DUPLICADOS_NO_LEIDOS =
  "No se pudo leer la lista de posibles duplicados: revisa Gastos antes de crear uno nuevo.";
export const CASILLA_CONFIRMACION = "Revisé la lista y este gasto NO está registrado: crear uno nuevo.";
export const CASILLA_CONFIRMACION_IA_ALTA =
  "La IA cree que ya existe; aun así lo revisé y NO es el mismo: crear uno nuevo bajo mi visto bueno.";
export const BOTON_CREAR = "Crear el gasto";
export const BOTON_CREAR_DE_TODOS_MODOS = "Crear de todos modos";
export const BOTON_VOLVER = "Volver a la lista";
export const NOTA_PRELLENADO =
  "El alta se abre prellenada con el monto, la fecha, el medio de pago y la descripción del cargo; revisa la categoría, el avión o vuelo y el proveedor. Al guardar, el gasto queda vinculado a este cargo.";

/** Texto del botón de crear (insiste si la IA está segura de que ya existe). */
export function botonCrear(ia: VeredictoIa): string {
  return ia.tipo === "sugiere" && ia.alta ? BOTON_CREAR_DE_TODOS_MODOS : BOTON_CREAR;
}

/** Texto de la casilla (más dura si la IA está segura de que ya existe). */
export function casillaConfirmacion(ia: VeredictoIa): string {
  return ia.tipo === "sugiere" && ia.alta ? CASILLA_CONFIRMACION_IA_ALTA : CASILLA_CONFIRMACION;
}

/** Solo con la casilla marcada y sin lecturas en curso (la IA puede seguir cargando: no bloquea). */
export function puedeCrear(input: { confirmado: boolean; buscandoDuplicados: boolean }): boolean {
  return input.confirmado && !input.buscandoDuplicados;
}

/** Toast tras crear: vinculado o no (el gasto SÍ quedó). */
export function textoTrasCrear(vinculado: boolean, errorVinculo?: string | null): { titulo: string; descripcion?: string } {
  if (vinculado) return { titulo: "Gasto registrado y vinculado al cargo" };
  return {
    titulo: "Gasto registrado, pero NO quedó vinculado al cargo",
    descripcion: `${errorVinculo ? `${errorVinculo} ` : ""}Vincúlalo desde el menú del cargo («Vincular gasto»).`,
  };
}

/** De la respuesta de candidatos: los que son duplicado + si el API mandó excluidos. */
export function duplicadosDeRespuesta(
  r: GastosCandidatosResponse | null | undefined,
  montoCargo: string | number,
): { duplicados: GastoCandidato[]; excluidos: NonNullable<GastosCandidatosResponse["excluidos"]> } {
  return {
    duplicados: duplicadosDeCandidatos(r?.candidatos, montoCargo),
    excluidos: Array.isArray(r?.excluidos) ? r.excluidos : [],
  };
}

// ===== Catálogos del alta y el caso en efectivo =====


/** Lo que el formulario de gasto necesita (lo carga la página de Conciliación). */
export interface CatalogosGastoDesdeCargo {
  aircraft: AvionCatalogoGasto[];
  providers: { id: string; nombre: string }[];
}

/** El gasto se creó en EFECTIVO (u otro medio que no pasa por el banco): no se liga solo. */
export const MOTIVO_NO_BANCARIO_SIN_VINCULO =
  "Se registró en efectivo u otro medio que no pasa por el banco: vincúlalo desde «Vincular gasto» con «Incluir gastos en efectivo y otros medios» y una justificación.";

/** Nota de contexto del alta: el cargo + qué pasa al guardar. */
export function textoContextoCrear(
  mov: Pick<MovimientoBancario, "monto" | "fecha" | "descripcion">,
  monedaCuenta: string | null | undefined,
): string {
  return `${textoResumenCargo(mov, monedaCuenta)}. ${NOTA_PRELLENADO}`;
}
