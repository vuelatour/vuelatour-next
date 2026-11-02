/**
 * «PISTAS POR PAGAR»: casilla «marcar / desmarcar todas» y el cuadro
 * «Factura y pago» del lote (2-nov-2026, API 0.0.115, invariante 114 del
 * API). Pedido de la oficina: «una casilla para deseleccionar todas las
 * pistas marcadas y aparte un cuadro donde pueda poner número de factura y
 * fecha de pago».
 *
 * Qué hace el API con el lote: la factura queda como «Factura NNNN» en la
 * PRIMERA línea de las notas de cada gasto (una factura de VIP SAESA ampara
 * varios aterrizajes y el folio del gasto es único en la BD; Conciliación
 * lee esa línea) y la fecha de pago queda como fecha del gasto en lugar de
 * la del aterrizaje (futura ⇒ por pagar). PURO (prueba
 * `__tests__/pistas-seleccion.test.ts`).
 */
import { fmtDateOnly } from "@/lib/datetime";

export interface SeleccionPista {
  incluir: boolean;
  monto: string;
}

export type EstadoSeleccion = "NINGUNA" | "ALGUNAS" | "TODAS";

/** ¿Cuántas de las filas visibles están marcadas? */
export function estadoSeleccion(
  ids: readonly string[],
  sel: Record<string, SeleccionPista>,
): EstadoSeleccion {
  if (ids.length === 0) return "NINGUNA";
  const n = ids.filter((id) => sel[id]?.incluir).length;
  if (n === 0) return "NINGUNA";
  return n === ids.length ? "TODAS" : "ALGUNAS";
}

/** Marca o desmarca TODAS las filas visibles; el monto capturado se conserva. */
export function alternarTodas(
  ids: readonly string[],
  sel: Record<string, SeleccionPista>,
  incluir: boolean,
): Record<string, SeleccionPista> {
  const out: Record<string, SeleccionPista> = { ...sel };
  for (const id of ids) out[id] = { monto: sel[id]?.monto ?? "", incluir };
  return out;
}

/**
 * Qué hace un clic en la casilla del encabezado: sin ninguna marcada ⇒
 * marcar todas; con alguna o todas ⇒ DESMARCAR todas (lo que pidió la
 * oficina: el diálogo preselecciona casi todo y quería limpiarlo de un
 * golpe).
 */
export function siguienteAlternar(estado: EstadoSeleccion): boolean {
  return estado === "NINGUNA";
}

export const TITULO_CASILLA_TODAS: Record<EstadoSeleccion, string> = {
  NINGUNA: "Marcar todas",
  ALGUNAS: "Desmarcar todas",
  TODAS: "Desmarcar todas",
};

export const AYUDA_FACTURA_PAGO =
  "Opcional, para todo el lote. La factura queda como «Factura NNNN» en la primera línea de las notas " +
  "de cada gasto (así la reconoce Conciliación; el CFDI se amarra después en Facturas recibidas) y la " +
  "fecha de pago queda como fecha del gasto en lugar de la del aterrizaje. Vacíos = como hasta hoy.";

/** Lo que viaja al API además de los renglones (vacíos no viajan). */
export function extrasDelLote(p: {
  facturaFolio: string;
  fechaPago: string;
}): { factura_folio?: string; fecha_pago?: string } {
  const folio = p.facturaFolio.replace(/\s+/g, " ").trim();
  const fecha = p.fechaPago.trim();
  return {
    ...(folio ? { factura_folio: folio } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(fecha) ? { fecha_pago: fecha } : {}),
  };
}

/** Toast: «3 gastos de pista creados · factura 7360 · pagados el 18 oct 2026». */
export function textoPistasGeneradas(
  creados: number,
  p: { facturaFolio?: string; fechaPago?: string } = {},
): string {
  const partes = [
    creados === 1 ? "1 gasto de pista creado" : `${creados} gastos de pista creados`,
  ];
  const extras = extrasDelLote({
    facturaFolio: p.facturaFolio ?? "",
    fechaPago: p.fechaPago ?? "",
  });
  if (extras.factura_folio) partes.push(`factura ${extras.factura_folio}`);
  if (extras.fecha_pago) {
    partes.push(
      `${creados === 1 ? "pagado" : "pagados"} el ${fmtDateOnly(extras.fecha_pago)}`,
    );
  }
  return partes.join(" · ");
}
