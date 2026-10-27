/**
 * Cardex del producto como LISTA POR FECHA — 18-oct-2026 (API 0.0.92).
 *
 * Pedido del cliente: «debemos cambiar el formato del Cardex del producto en
 * forma de lista por orden de fecha, de esa forma quedan más claros los
 * movimientos que ha tenido el producto con sus entradas, salidas y
 * movimientos».
 *
 * La ficha deja las tres columnas COMPRAS | VENTAS | RESUMEN y pinta UNA
 * lista cronológica: las compras y las ventas de `GET items/:id/resumen`
 * mezcladas por `orden` (la posición del movimiento en el cardex COMPLETO que
 * manda el API: fecha, alta, id) y agrupadas por MES, con el renglón del mes
 * que también manda el API (`meses[]`: stock al inicio, entradas, vendidas,
 * stock al final, vendido y utilidad). El panel NO recalcula stock, costo ni
 * utilidad: ordena, agrupa y redacta.
 *
 * Todo aquí es PURO (prueba `__tests__/inventario-cardex-lista.test.ts`).
 */

import { MESES_LARGOS_ES } from "@/lib/datetime";
import { fmtMxn } from "@/lib/format";
import { cantidadConUnidad } from "@/lib/admin/inventario-eliminar";
import { numeroONulo, textoMonto } from "@/lib/admin/inventario-utilidad";
import type {
  MesCardexResumen,
  ResumenCompra,
  ResumenTraspaso,
  ResumenVenta,
} from "@/types/inventory";

/**
 * Un renglón de la lista: una compra (o devolución/ajuste), una salida o,
 * desde el 27-oct-2026 (API 0.0.111), un traspaso entre bodegas.
 */
export type FilaCardexLista =
  | { clase: "compra"; fecha: string; existencia: number | null; compra: ResumenCompra }
  | { clase: "venta"; fecha: string; existencia: number | null; venta: ResumenVenta }
  | { clase: "traspaso"; fecha: string; existencia: number | null; traspaso: ResumenTraspaso };

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** «2026-08-29» ⇒ «2026-08»; ilegible ⇒ null. */
function mesDeFecha(fecha: string | null | undefined): string | null {
  const m = (fecha ?? "").slice(0, 7);
  return MES_RE.test(m) ? m : null;
}

const ordenDe = (o: unknown): number | null =>
  typeof o === "number" && Number.isFinite(o) ? o : null;

/**
 * Compras y ventas en UNA lista, de la más vieja a la más nueva.
 *
 * Con el API 0.0.92 cada fila trae `orden` y se ordena por él (el mismo orden
 * del cardex en Excel). Con un API previo (sin `orden` en alguna fila): por
 * fecha y, el mismo día, primero lo que ENTRÓ y luego lo que salió,
 * conservando el orden en que vino cada bloque.
 */
export function filasCardexPorFecha(
  compras: readonly ResumenCompra[],
  ventas: readonly ResumenVenta[],
  traspasos: readonly ResumenTraspaso[] = [],
): FilaCardexLista[] {
  const filas: { fila: FilaCardexLista; orden: number | null; clase: 0 | 1 | 2; i: number }[] = [
    ...compras.map((c, i) => ({
      fila: {
        clase: "compra" as const,
        fecha: c.fecha,
        existencia: numeroONulo(c.stock_despues),
        compra: c,
      },
      orden: ordenDe(c.orden),
      clase: 0 as const,
      i,
    })),
    ...ventas.map((v, i) => ({
      fila: {
        clase: "venta" as const,
        fecha: v.fecha,
        existencia: numeroONulo(v.remanente),
        venta: v,
      },
      orden: ordenDe(v.orden),
      clase: 1 as const,
      i,
    })),
    // Traspasos entre bodegas (27-oct-2026): no cambian la existencia.
    ...traspasos.map((t, i) => ({
      fila: {
        clase: "traspaso" as const,
        fecha: t.fecha,
        existencia: numeroONulo(t.stock_despues),
        traspaso: t,
      },
      orden: ordenDe(t.orden),
      clase: 2 as const,
      i,
    })),
  ];
  const conOrden = filas.every((f) => f.orden != null);
  filas.sort((a, b) => {
    if (conOrden) return (a.orden as number) - (b.orden as number);
    const fa = a.fila.fecha ?? "";
    const fb = b.fila.fecha ?? "";
    if (fa !== fb) return fa < fb ? -1 : 1;
    if (a.clase !== b.clase) return a.clase - b.clase;
    return a.i - b.i;
  });
  return filas.map((f) => f.fila);
}

/** «2026-08» ⇒ «Agosto 2026»; el mes de hoy lleva « (en curso)». Ilegible ⇒ tal cual. */
export function etiquetaMesCardex(mes: string, enCurso = false): string {
  if (!MES_RE.test(mes)) return mes;
  const nombre = MESES_LARGOS_ES[Number(mes.slice(5, 7)) - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${mes.slice(0, 4)}${enCurso ? " (en curso)" : ""}`;
}

/** Un mes de la lista: su renglón del API (si vino) y sus movimientos. */
export interface GrupoMesCardex {
  /** YYYY-MM. */
  mes: string;
  /** «Agosto 2026» / «Octubre 2026 (en curso)». */
  etiqueta: string;
  /** El renglón del mes del API; null = API previo (sin `meses`). */
  resumen: MesCardexResumen | null;
  filas: FilaCardexLista[];
}

/**
 * Agrupa la lista por MES (del más viejo al más nuevo). Con `meses` del API
 * hay un grupo por cada mes que manda —también los que no tuvieron
 * movimientos: el stock se arrastra—; un movimiento cuyo mes no vino en
 * `meses` (o un API previo) abre su propio grupo sin renglón.
 */
export function gruposCardexPorMes(
  filas: readonly FilaCardexLista[],
  meses?: readonly MesCardexResumen[] | null,
): GrupoMesCardex[] {
  const grupos = new Map<string, GrupoMesCardex>();
  for (const m of meses ?? []) {
    if (!m || !MES_RE.test(m.mes) || grupos.has(m.mes)) continue;
    grupos.set(m.mes, {
      mes: m.mes,
      etiqueta: etiquetaMesCardex(m.mes, m.en_curso === true),
      resumen: m,
      filas: [],
    });
  }
  // Fecha ilegible: se queda con el mes anterior de la lista (nunca se pierde).
  let ultimo: string | null = null;
  const sinMes: FilaCardexLista[] = [];
  for (const f of filas) {
    const mes: string | null = mesDeFecha(f.fecha) ?? ultimo;
    if (!mes) {
      sinMes.push(f);
      continue;
    }
    ultimo = mes;
    let g = grupos.get(mes);
    if (!g) {
      g = { mes, etiqueta: etiquetaMesCardex(mes), resumen: null, filas: [] };
      grupos.set(mes, g);
    }
    g.filas.push(f);
  }
  const lista = [...grupos.values()].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
  if (sinMes.length > 0) {
    if (lista.length > 0) lista[0].filas.unshift(...sinMes);
    else lista.push({ mes: "", etiqueta: "Sin fecha", resumen: null, filas: sinMes });
  }
  return lista;
}

/** Pieza del renglón del mes: «Stock al inicio» · «0 cuarto (qt)». */
export interface PiezaMesCardex {
  titulo: string;
  valor: string;
}

/**
 * Explicación de «Vendidas» (la misma nota que el Excel del cardex): cuenta
 * TODAS las salidas a los aviones, con precio o a costo.
 */
export const TITULO_VENDIDAS_MES =
  "Todas las salidas a los aviones del mes, con precio o a costo: lo que bajó el stock.";

/**
 * Stock al inicio · Entradas · Vendidas · Stock al final (en el mes en curso,
 * «Stock hoy»). Los números son los del API tal cual.
 */
export function piezasMesCardex(
  m: MesCardexResumen,
  unidad: string | null | undefined,
): PiezaMesCardex[] {
  const c = (n: unknown) => cantidadConUnidad(numeroONulo(n) ?? 0, unidad);
  return [
    { titulo: "Stock al inicio", valor: c(m.stock_inicio) },
    { titulo: "Entradas", valor: c(m.entradas) },
    { titulo: "Vendidas", valor: c(m.unidades_vendidas) },
    { titulo: m.en_curso ? "Stock hoy" : "Stock al final", valor: c(m.stock_final) },
  ];
}

/**
 * Dinero del mes: «Vendido $5,421.20 MXN · utilidad +$1,084.24 MXN». Solo
 * con ventas con precio en el mes; si no, null.
 */
export function textoDineroMes(m: MesCardexResumen): string | null {
  const vendido = numeroONulo(m.vendido_mxn);
  const utilidad = numeroONulo(m.utilidad_mxn);
  if (vendido == null && utilidad == null) return null;
  const partes: string[] = [];
  if (vendido != null) partes.push(`Vendido ${fmtMxn(vendido)}`);
  if (utilidad != null) partes.push(`utilidad ${textoMonto(utilidad, "MXN")}`);
  return partes.join(" · ");
}

/** El mes no tuvo movimientos (el stock se arrastró). */
export const SIN_MOVIMIENTOS_MES = "Sin movimientos en el mes.";

/** La lista entera está vacía. */
export const SIN_MOVIMIENTOS_CARDEX =
  "Sin movimientos todavía. Registra una entrada para dar de alta stock.";

/** Encabezado de la lista en la ficha. */
export const TITULO_CARDEX_LISTA = "Cardex del producto · por fecha";
