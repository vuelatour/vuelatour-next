/**
 * T.U.R.M. = TSO, y el TBO que se pasó de la raya (22-sep-2026).
 *
 * **El reporte de la oficina**: «en la hélice del XB-ANU no está haciendo
 * bien la resta y se sale de parámetros». La ficha decía TSN 2,708.00 · TSO
 * 2,344.00 · TURM 364.00 · TBO 2,000 · **Restantes −344.00** · Vida usada
 * **100 %**, y en el formulario se habían capturado Horas totales 2708 y
 * TURM 364.
 *
 * Eran DOS defectos encadenados:
 *
 *  1. **El formulario leía el TURM al revés.** En la bitácora física
 *     T.U.R.M. = *Tiempo desde la Última Reparación Mayor* = **TSO**: las
 *     horas que el componente lleva **DESDE** su overhaul. El panel lo
 *     etiquetaba «horas del componente EN su último overhaul» y el API hacía
 *     `tso_base = horas_totales − turm_componente`, así que un TURM de 364
 *     (que ya era el TSO) se convertía en 2,708 − 364 = **2,344** y el
 *     componente aparecía con 344 horas de más sobre un TBO de 2,000. La
 *     corrección vive en el API (`tso_base = turm_componente`); aquí se
 *     corrige lo que el operador LEE al capturar, que es donde nació el error.
 *  2. **La ficha pintaba el vencido como si fuera un dato normal**:
 *     «−344.00 hrs» y una barra al 100 %. Un número negativo con la etiqueta
 *     «Restantes» no se lee como «se pasó»: se lee como que el sistema está
 *     mal. Desde hoy dice **«overhaul vencido por 344.00 h»** en rojo.
 *
 * Módulo PURO (sin React, sin `lib/format`): lo usan los dos formularios
 * (motor y hélice) y la ficha del avión, que es Server Component. Prueba en
 * `__tests__/overhaul-turm.test.ts`.
 *
 * Aquí NO se calcula ninguna hora: el TSN, el TSO, los restantes y el % de
 * vida los manda el API (`componenteEstado` vía snapshot). Esto solo redacta
 * y decide el tono.
 */

/** Etiqueta del campo TURM en los formularios de motor y hélice. */
export const ETIQUETA_TURM = "TURM (TSO)";

/**
 * Pista bajo la etiqueta. Dice DESDE en mayúsculas a propósito: es la palabra
 * que cambia el significado del número que se teclea.
 */
export const HINT_TURM = "horas DESDE el último overhaul (TSO)";

/** `title` del campo: la frase completa, como en la bitácora. */
export const TITULO_TURM =
  "T.U.R.M. = Tiempo desde la Última Reparación Mayor: las horas que el componente lleva VOLADAS desde su último overhaul (TSO), tal como aparece en la bitácora física. Sin overhaul, déjalo vacío.";

/** Ayuda al pie del bloque de horas (misma en motor y hélice). */
export const AYUDA_HORAS_COMPONENTE =
  "Estos campos son la FOTO de la bitácora al día del ajuste — no se quedan fijos: desde ahí el sistema sigue sumando solo con el tacómetro de cada vuelo. T.T. = horas totales del componente (TSN) y T.U.R.M. = horas DESDE su última reparación mayor (TSO), como en la bitácora física; sin overhaul, deja TURM vacío. Toca las horas SOLO para corregir la base.";

/**
 * Etiqueta del dato TURM en la ficha del componente.
 *
 * Con la lectura correcta, TURM **es** el TSO, así que el renglón repite el
 * número de «Desde el últ. overhaul (TSO)». Se conserva a propósito: T.U.R.M.
 * es el nombre que la oficina busca porque es el de la bitácora física —y el
 * que teclea en el formulario—, y quitarlo haría que la ficha y la bitácora
 * dejaran de parecerse. El `title` explica que es el mismo dato, para que
 * nadie lo lea como dos cuentas distintas.
 */
export const ETIQUETA_TURM_FICHA = "T.U.R.M. (bitácora)";

export const TITULO_TURM_FICHA =
  "Es el MISMO dato que «Desde el últ. overhaul (TSO)»: T.U.R.M. = Tiempo desde la Última Reparación Mayor. Se repite porque es el nombre que usa la bitácora física.";

/** Etiqueta del renglón de horas restantes cuando todavía quedan. */
export const ETIQUETA_RESTANTES = "Restantes a overhaul";

/** Etiqueta del mismo renglón cuando el overhaul ya se pasó. */
export const ETIQUETA_VENCIDO = "Overhaul";

export type TonoTbo = "ok" | "ambar" | "rojo";

export interface EstadoTbo {
  /** % para la BARRA, recortado a [0, 100] (una barra no pasa del 100). */
  pctBarra: number;
  /** % tal como lo manda el API, para el texto («118.9 %» es información). */
  pctTexto: number;
  /** true = el componente ya rebasó su TBO. */
  vencido: boolean;
  /** Horas PASADAS del TBO (positivas). null = vencido sin exceso (0 h) o no
   *  vencido: nunca se anuncia «vencido por 0.00 h». */
  excedidoHr: number | null;
  tono: TonoTbo;
}

/** Margen (h) con el que el overhaul ya se considera «a la vuelta». */
export const MARGEN_AMBAR_HR = 25;

/** Un decimal fijo para `es-MX` sin depender de `lib/format` (módulo PURO). */
function dec(n: number, digitos = 2): string {
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: digitos,
    maximumFractionDigits: digitos,
  }).format(n);
}

/**
 * Estado del ciclo TBO a partir de lo que respondió el API.
 *
 * `restanteHr` es `tbo_restante` (puede llegar NEGATIVO: el componente se
 * pasó) y `vidaUsadaPct` es `vida_usada_pct`. La barra se recorta al 100 %
 * —lo hacía ya el `style`, pero el número de al lado no— y el vencido se
 * decide por el RESTANTE, que es el dato que la oficina lee.
 */
export function estadoTbo({
  restanteHr,
  vidaUsadaPct,
}: {
  restanteHr: number | null | undefined;
  vidaUsadaPct: number | null | undefined;
}): EstadoTbo {
  const restante = Number.isFinite(Number(restanteHr)) && restanteHr != null ? Number(restanteHr) : null;
  const pct = Number.isFinite(Number(vidaUsadaPct)) && vidaUsadaPct != null ? Number(vidaUsadaPct) : 0;
  // El ciclo está cumplido en cuanto no quedan horas (misma regla que el
  // `agotado` de siempre). CUÁNTO se pasó se mide con los decimales que se
  // PINTAN: un −0.004 no se anuncia como «vencido por 0.00 h», que sonaría a
  // error de cuentas — ahí el ciclo está cumplido, sin exceso que contar.
  const vencido = restante != null && Number(restante.toFixed(2)) <= 0;
  const exceso =
    vencido && restante != null && Number(Math.abs(restante).toFixed(2)) > 0
      ? Math.abs(restante)
      : null;
  return {
    pctBarra: Math.min(100, Math.max(0, pct)),
    pctTexto: pct,
    vencido,
    excedidoHr: exceso,
    tono: vencido
      ? "rojo"
      : restante != null && restante <= MARGEN_AMBAR_HR
        ? "ambar"
        : pct >= 90
          ? "ambar"
          : "ok",
  };
}

/**
 * Renglón «Restantes a overhaul» de la ficha: etiqueta + valor, ya redactados.
 *
 * Vencido ⇒ «Overhaul: vencido por 344.00 h». NUNCA «−344.00 hrs» a secas:
 * ese número con esa etiqueta es lo que la oficina reportó como «no está
 * haciendo bien la resta».
 */
export function renglonRestantes(estado: EstadoTbo, restanteHr: number | null | undefined): {
  label: string;
  value: string;
} {
  if (restanteHr == null || !Number.isFinite(Number(restanteHr))) {
    return { label: ETIQUETA_RESTANTES, value: "—" };
  }
  if (estado.vencido) {
    return {
      label: ETIQUETA_VENCIDO,
      value:
        estado.excedidoHr != null
          ? `vencido por ${dec(estado.excedidoHr)} h`
          : "toca ahora (sin horas restantes)",
    };
  }
  return { label: ETIQUETA_RESTANTES, value: `${dec(Number(restanteHr))} hrs` };
}

/**
 * Texto que acompaña a la barra «Vida usada del TBO». Con el ciclo vencido no
 * dice «100 %» a secas (que suena a «justo a tiempo»): dice por cuánto se
 * pasó.
 */
export function textoVidaTbo(estado: EstadoTbo): string {
  if (estado.vencido) {
    return estado.excedidoHr != null
      ? `overhaul vencido por ${dec(estado.excedidoHr)} h`
      : "overhaul cumplido";
  }
  return `${dec(estado.pctTexto)} %`;
}

/**
 * Aviso de CAPTURA: el TSO no puede superar al TSN. Es el espejo del 400 del
 * API («el tiempo desde el overhaul no puede superar las horas totales») y
 * sustituye al viejo «el TSN es menor al TURM», que con la lectura correcta
 * del TURM ya no describía el problema.
 */
export function avisoTsoImposible({
  tsnHr,
  tsoHr,
}: {
  tsnHr: number | null | undefined;
  tsoHr: number | null | undefined;
}): string | null {
  const tsn = tsnHr == null ? null : Number(tsnHr);
  const tso = tsoHr == null ? null : Number(tsoHr);
  if (tsn == null || tso == null || !Number.isFinite(tsn) || !Number.isFinite(tso)) return null;
  if (tso <= tsn) return null;
  return `Revisar captura: el TSO (${dec(tso)} h desde el overhaul) no puede ser mayor que el tiempo total del componente (${dec(tsn)} h). Edita el componente y captura el T.T. real de la bitácora.`;
}
