/**
 * «Factura NNNN» en Conciliación (13-oct-2026, API 0.0.75). Módulo PURO (sin
 * React ni red; prueba `__tests__/conciliacion-factura-concepto.test.ts`).
 *
 * El concepto que teclea quien paga un SPEI («fact vip 7360») dice QUÉ factura
 * se pagó. El NÚMERO lo lee SOLO el API (`factura-concepto.util.ts`, fuente
 * única: el panel NO parsea) y aquí solo se ROTULA lo que mandó:
 *  - el chip bajo la descripción de un movimiento (`chipFacturaConcepto`):
 *    gris «Factura 7360» · verde «· coincide» con el gasto ligado · ámbar
 *    «· el gasto dice 7361» / «· falta 7360» · ámbar «también en otro pago»
 *    cuando la misma factura aparece en otro cargo (posible pago doble). Abre
 *    Conciliación en OTRA pestaña buscando el número (`?mvq=`);
 *  - el cuadro de «Vincular gasto» (`avisoFacturaEnCandidatos`) y el renglón
 *    «★ Su folio coincide…» de cada candidato: es una SEÑAL dentro de su nivel
 *    de monto, jamás marca ni preselecciona.
 * Todo es ADITIVO: sin `factura_concepto` (API previo) no se pinta nada.
 */

import { diaMas } from "@/lib/admin/conciliacion-auto";
import { fmtMontoConciliacion } from "@/lib/admin/conciliacion-parcial";
import { hrefConciliacion } from "@/lib/admin/conciliacion-vista";
import { esDiaValido } from "@/lib/admin/url-params";
import { fmtDateOnly } from "@/lib/datetime";
import type {
  FacturaConceptoCandidatos,
  FacturaConceptoMovimiento,
  GastoCandidato,
  RepeticionFacturaConcepto,
} from "@/types/conciliacion";

/** Días antes y después de la fila (y de sus repetidas) que abre el chip. */
export const DIAS_BUSQUEDA_FACTURA = 7;

export type TonoChipFactura = "neutro" | "ok" | "aviso";

export interface ChipFacturaConcepto {
  /** «Factura 7360» · «Factura 7360 · coincide» · «Factura 7360 · el gasto dice 7361». */
  texto: string;
  tono: TonoChipFactura;
  /** Tooltip: qué significa y qué revisar. */
  titulo: string;
  /** «Ver en una pestaña nueva los movimientos con la factura 7360». */
  ariaLabel: string;
  /** Conciliación ±7 días buscando el número (pestaña nueva). */
  href: string;
  /** Chip ámbar «también en otro pago» (null si no se repite o no se verificó). */
  repetida: { texto: string; titulo: string } | null;
}

/** Lo que el panel necesita de `factura_concepto` (fila o candidatos). */
type FacturaBase = Pick<FacturaConceptoMovimiento, "tipo" | "numeros" | "texto" | "pista">;

/** «a» · «a y b» · «a, b y c». */
function listaY(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function numerosDe(fc: FacturaBase): string[] {
  return (Array.isArray(fc.numeros) ? fc.numeros : []).filter((n) => typeof n === "string" && n.trim() !== "");
}

/** «factura» o «prefactura» (en Corner la prefactura es el folio de la factura). */
function palabraDe(fc: FacturaBase): string {
  return fc.tipo === "PREFACTURA" ? "prefactura" : "factura";
}

/** «la factura 7360» · «las facturas 7359 y 7360» · «la prefactura 4409». */
function laFactura(fc: FacturaBase): string {
  const nums = numerosDe(fc);
  const pal = palabraDe(fc);
  if (nums.length > 1) return `las ${pal}s ${listaY(nums)}`;
  return nums.length === 1 ? `la ${pal} ${nums[0]}` : `la ${pal}`;
}

/** «esa factura» · «esas facturas». */
function esaFactura(fc: FacturaBase): string {
  const pal = palabraDe(fc);
  return numerosDe(fc).length > 1 ? `esas ${pal}s` : `esa ${pal}`;
}

const capitalizar = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** «30 sep 2026 · $2,231.38 · EJE SCOTIA (conciliado)». */
function lineaRepetida(r: RepeticionFacturaConcepto): string {
  return [
    r.fecha ? fmtDateOnly(r.fecha) : null,
    fmtMontoConciliacion(r.monto),
    (r.cuenta ?? "").trim() || null,
  ]
    .filter(Boolean)
    .join(" · ")
    .concat(r.conciliado === true ? " (conciliado)" : "");
}

/** El rango que abre el chip: de la fecha más vieja −7 a la más nueva +7 (fila y repetidas). */
function rangoBusqueda(fechas: readonly (string | null | undefined)[]): { desde: string | null; hasta: string | null } {
  const dias = fechas.map((f) => (typeof f === "string" ? f.slice(0, 10) : "")).filter((d) => esDiaValido(d)).sort();
  if (dias.length === 0) return { desde: null, hasta: null };
  return {
    desde: diaMas(dias[0], -DIAS_BUSQUEDA_FACTURA),
    hasta: diaMas(dias[dias.length - 1], DIAS_BUSQUEDA_FACTURA),
  };
}

/**
 * El chip «Factura NNNN» de un movimiento: texto, tono, tooltip, nombre
 * accesible, la liga (Conciliación ±7 días buscando el número, en pestaña
 * nueva) y, si la misma factura aparece en otro pago, el chip ámbar.
 * `ligados` null (abono, sin gasto o lote no leído) ⇒ gris; COINCIDE ⇒
 * verde; PARCIAL / NO_COINCIDE ⇒ ámbar; SIN_FOLIO ⇒ gris con cómo capturarla.
 */
export function chipFacturaConcepto(
  fc: FacturaConceptoMovimiento,
  ctx: { fecha: string; tipo: string },
): ChipFacturaConcepto {
  const nums = numerosDe(fc);
  const pal = palabraDe(fc);
  const lig = fc.ligados ?? null;
  const folios = (Array.isArray(lig?.folios) ? lig!.folios : []).filter((f) => typeof f === "string" && f.trim());
  const faltan = (Array.isArray(lig?.faltan) ? lig!.faltan : []).filter((f) => typeof f === "string" && f.trim());
  const generico =
    ctx.tipo === "CARGO"
      ? `El banco dice «${fc.texto}». Al vincular el gasto, los que tienen ${esaFactura(fc)} salen marcados con ★.`
      : `El banco dice «${fc.texto}».`;

  let texto = fc.texto;
  let tono: TonoChipFactura = "neutro";
  let titulo = generico;
  switch (lig?.estado) {
    case "COINCIDE":
      texto = `${fc.texto} · coincide`;
      tono = "ok";
      titulo =
        nums.length > 1
          ? `Los gastos vinculados tienen las mismas ${pal}s que dice el banco.`
          : `El gasto vinculado tiene la misma ${pal} que dice el banco.`;
      break;
    case "PARCIAL":
      tono = "aviso";
      if (faltan.length > 0) {
        texto = `${fc.texto} · falta ${listaY(faltan)}`;
        titulo = `El banco dice ${fc.texto} y en los gastos vinculados falta: ${listaY(faltan)}. Revisa si este pago cubre otra ${pal}.`;
      } else {
        // Todos los números del banco están, pero algún gasto ligado trae otro.
        texto = `${fc.texto} · el gasto dice ${listaY(folios.slice(0, 2))}`;
        titulo = `El banco dice ${fc.texto} y algún gasto vinculado tiene otra ${pal} (${listaY(folios)}). Revisa si este pago cubre otra ${pal}.`;
      }
      break;
    case "NO_COINCIDE":
      tono = "aviso";
      texto = folios.length > 0 ? `${fc.texto} · el gasto dice ${listaY(folios.slice(0, 2))}` : `${fc.texto} · no coincide`;
      titulo = `El banco dice que este pago es de ${laFactura(fc)}, pero ${
        folios.length > 1 ? `los gastos vinculados tienen ${listaY(folios)}` : `el gasto vinculado tiene la ${folios[0] ?? "otra"}`
      }. Revisa si se vinculó el gasto correcto: con montos iguales puede ser el de otro vuelo.`;
      break;
    case "SIN_FOLIO":
      titulo = `El gasto vinculado no tiene número de ${pal}: escríbelo en su «Folio» (o «fact ${
        nums[0] ?? "NNNN"
      }» en la primera línea de sus notas si la ${pal} ampara varios gastos) para poder compararlo.`;
      break;
    default:
      break;
  }

  const repetidas = (Array.isArray(fc.repetida_en) ? fc.repetida_en : []).filter(
    (r): r is RepeticionFacturaConcepto => !!r && typeof r === "object",
  );
  const varias = nums.length > 1;
  const repetida =
    repetidas.length === 0
      ? null
      : {
          texto: repetidas.length === 1 ? "también en otro pago" : `también en ${repetidas.length} pagos más`,
          titulo: `${capitalizar(laFactura(fc))} también ${varias ? "aparecen" : "aparece"} en: ${repetidas
            .map(lineaRepetida)
            .join("; ")}. Si es un pago en partes está bien; si no, revisa si se pagó dos veces.`,
        };

  const { desde, hasta } = rangoBusqueda([ctx.fecha, ...repetidas.map((r) => r.fecha)]);
  return {
    texto,
    tono,
    titulo,
    ariaLabel: `Ver en una pestaña nueva los movimientos con la ${pal} ${nums[0] ?? ""}`.trimEnd(),
    href: hrefConciliacion({ desde, hasta, buscar: nums[0] ?? null }),
    repetida,
  };
}

export interface AvisoFacturaCandidatos {
  /** «El banco dice: Factura 7360 (VIP)». */
  encabezado: string;
  /** «★ 1 gasto tiene esa factura (marcado con ★ en la lista).» (null sin coincidentes). */
  coincidentes: string | null;
  /** «Con la factura 7360 hay otro gasto que no sale aquí:» (null sin `otros_gastos`). */
  otrosTitulo: string | null;
  /** Ninguno la tiene capturada y no hay otros: cómo capturarla (null si no aplica). */
  sinCaptura: string | null;
}

/**
 * El cuadro de «Vincular gasto» cuando el concepto del cargo cita una
 * factura: lo que dice el banco, cuántos candidatos la tienen (★), los gastos
 * con esa factura que no salen como candidatos (ya conciliados, en efectivo…)
 * y, si nadie la tiene capturada, cómo capturarla. Con `otros_gastos` null
 * (no se pudo leer) no se afirma nada de los demás.
 */
export function avisoFacturaEnCandidatos(
  fc: FacturaConceptoCandidatos,
  candidatos: readonly Pick<GastoCandidato, "coincide_factura">[] | null | undefined,
): AvisoFacturaCandidatos {
  const nums = numerosDe(fc);
  const pal = palabraDe(fc);
  const n = (Array.isArray(candidatos) ? candidatos : []).filter((c) => c?.coincide_factura === true).length;
  const otros = Array.isArray(fc.otros_gastos) ? fc.otros_gastos.filter(Boolean) : null;
  const totalOtros = (otros ?? []).reduce(
    (acc, g) => acc + Math.max(Number.isFinite(Number(g.n)) ? Math.trunc(Number(g.n)) : 0, Array.isArray(g.gastos) ? g.gastos.length : 0),
    0,
  );
  const coincidentes =
    n === 0
      ? null
      : n === 1
        ? `★ 1 gasto tiene ${esaFactura(fc)} (marcado con ★ en la lista).`
        : `★ ${n} gastos tienen ${esaFactura(fc)} (marcados con ★ en la lista).`;
  const conLa = nums.length > 1 ? esaFactura(fc) : laFactura(fc);
  const otrosTitulo =
    otros && totalOtros > 0
      ? `Con ${conLa} hay ${totalOtros === 1 ? "otro gasto que no sale aquí" : `${totalOtros} gastos que no salen aquí`}:`
      : null;
  const sinCaptura =
    n === 0 && otros !== null && totalOtros === 0
      ? `Ningún gasto tiene ${nums.length > 1 ? "capturadas" : "capturada"} ${laFactura(fc)}. Escribe el número en el «Folio» del gasto (o «fact ${
          nums[0] ?? "NNNN"
        }» en la primera línea de sus notas si la ${pal} ampara varios gastos) para que el cruce funcione.`
      : null;
  return {
    encabezado: `El banco dice: ${fc.texto}${fc.pista ? ` (${fc.pista})` : ""}`,
    coincidentes,
    otrosTitulo,
    sinCaptura,
  };
}

/** Renglón verde del candidato cuyo folio es el número del concepto. */
export function ETIQUETA_COINCIDE_FACTURA(texto: string): string {
  return `★ Su folio coincide con el concepto del banco (${texto})`;
}

export const TITULO_COINCIDE_FACTURA =
  "El número que viene en el concepto del banco es el folio de este gasto. Es una señal, no una prueba: confirma también el monto antes de vincular.";

/** Para la búsqueda rápida: «factura 7360» encuentra la fila (la descripción dice «fact»). */
export function textoBusquedaFacturaConcepto(m: { factura_concepto?: { texto?: string | null } | null }): string {
  return m.factura_concepto?.texto ?? "";
}
