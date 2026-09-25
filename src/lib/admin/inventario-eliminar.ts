/**
 * Baja de un movimiento del cardex con JUSTIFICACIÓN (21-sep-2026).
 *
 * Pedido del cliente (captura del «Cardex completo» de un ítem con tres
 * movimientos capturados por error el 29-ago): «podemos agregar una opción
 * para eliminar algunos movimientos, pero que al momento de eliminarlos pida
 * justificación y sepamos quién lo hizo».
 *
 * Este módulo es PURO (sin React ni red): SOLO arma los textos es-MX del
 * panel a partir de lo que respondió el API. La REGLA (si se puede o no) y
 * TODOS los números —existencia antes/después, montos de los gastos— los
 * decide el API (`evaluarEliminacion` + `previewEliminacionMovimiento`); aquí
 * jamás se recalcula un stock ni un costo: un segundo motor de cardex en
 * el panel es exactamente la clase de número paralelo que el proyecto prohíbe.
 *
 * Cuando el movimiento está BLOQUEADO se pinta el `mensaje` del API TAL CUAL:
 * es el único que sabe QUÉ hay que eliminar primero (nombra el movimiento y
 * su fecha). Aquí solo se le pone un título corto.
 */

import { fmtDateOnly, fmtDateTime } from "@/lib/datetime";
import { fmtMxn, fmtUsd } from "@/lib/format";
import { fmtPrecioUnitario } from "./inventario-utilidad";
import type {
  CostoVigente,
  CodigoBloqueoEliminacion,
  EliminacionMovimientoPreview,
  EliminarMovimientoResultado,
  GastoLigadoEliminacion,
  MovimientoEliminado,
} from "@/types/inventory";

// ───────────────────────── Motivo (justificación) ─────────────────────────

/** Mínimo del API y de la BD (`check char_length(btrim(motivo)) >= 10`). */
export const MOTIVO_MIN = 10;
/** Máximo del DTO del API (`@MaxLength(500)`). */
export const MOTIVO_MAX = 500;

export interface EstadoMotivo {
  /** Largo del motivo YA recortado (el API hace trim: los espacios no cuentan). */
  largo: number;
  valido: boolean;
  /** Caracteres que faltan para llegar al mínimo (0 si ya cumple). */
  faltan: number;
  /** Contador para la UI: «Faltan 4 caracteres» o «14 / 500». */
  contador: string;
}

/**
 * Estado del textarea obligatorio. Se mide con TRIM porque el API y la BD
 * validan el motivo recortado: diez espacios no son una justificación.
 */
export function estadoMotivo(motivo: string | null | undefined): EstadoMotivo {
  const limpio = (motivo ?? "").trim();
  const largo = limpio.length;
  const faltan = Math.max(0, MOTIVO_MIN - largo);
  return {
    largo,
    valido: largo >= MOTIVO_MIN && largo <= MOTIVO_MAX,
    faltan,
    contador:
      faltan > 0
        ? `Faltan ${faltan} ${faltan === 1 ? "carácter" : "caracteres"}`
        : `${largo} / ${MOTIVO_MAX}`,
  };
}

// ───────────────────────────── Formatos base ─────────────────────────────

/** Cantidad del cardex (mismo formato que la tabla: hasta 3 decimales). */
export function cantidadTxt(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

/**
 * Cantidad con la unidad del ítem tal como se capturó ("10 pzas", "2 litros").
 * Sin unidad se dice «unidad/unidades» — nunca se inventa el plural de una
 * unidad que escribió el operador.
 */
export function cantidadConUnidad(n: number, unidad?: string | null): string {
  const u = (unidad ?? "").trim();
  if (u) return `${cantidadTxt(n)} ${u}`;
  return `${cantidadTxt(n)} ${Math.abs(Number(n)) === 1 ? "unidad" : "unidades"}`;
}

/** Monto en la moneda del gasto: pesos con «MXN», dólares con «USD». */
export function montoTxt(monto: number | null | undefined, moneda?: string | null): string {
  if (monto == null || !Number.isFinite(Number(monto))) return "—";
  const m = (moneda ?? "MXN").toUpperCase();
  if (m === "USD") return `${fmtUsd(monto)} USD`;
  if (m === "MXN") return fmtMxn(monto);
  return `${Number(monto).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${m}`;
}

/** «la SALIDA» / «el AJUSTE»: el artículo correcto para la frase. */
export function articuloTipo(tipo: string): string {
  return tipo.toUpperCase() === "AJUSTE" ? "el" : "la";
}

/** «a XA-VGV» · «a toda la flota» · «» (sin destino). */
function destinoTxt(aeronave: string | null | undefined): string {
  const a = (aeronave ?? "").trim();
  if (!a) return "";
  if (a.toUpperCase() === "FLOTA") return " a toda la flota";
  return ` a ${a}`;
}

/** «la SALIDA de 10 pzas del 29 ago 2026 a XA-VGV». */
export function descripcionMovimiento(
  mov: { tipo: string; cantidad: number; fecha: string; aeronave: string | null },
  unidad?: string | null,
): string {
  return `${articuloTipo(mov.tipo)} ${mov.tipo.toUpperCase()} de ${cantidadConUnidad(
    mov.cantidad,
    unidad,
  )} del ${fmtDateOnly(mov.fecha)}${destinoTxt(mov.aeronave)}`;
}

// ─────────────────────────── Vista previa (permitido) ───────────────────────────

/** «Se eliminará la SALIDA de 10 pzas del 29 ago 2026 a XA-VGV.» */
export function fraseEliminacion(
  preview: EliminacionMovimientoPreview,
  unidad?: string | null,
): string {
  return `Se eliminará ${descripcionMovimiento(preview.movimiento, unidad)}.`;
}

/**
 * «Regresan 10 pzas a la existencia (de 111 a 121).» — los dos números los
 * manda el API (`stock_antes` / `stock_despues`), aquí solo se restan para
 * decir cuántas se mueven.
 */
export function fraseExistencia(
  preview: EliminacionMovimientoPreview,
  unidad?: string | null,
): string {
  const antes = Number(preview.stock_antes);
  const despues = Number(preview.stock_despues);
  const diff = Math.round((despues - antes) * 1000) / 1000;
  const rango = `(de ${cantidadTxt(antes)} a ${cantidadTxt(despues)})`;
  // Concordancia: con 1 pieza es «Regresa 1 …», no «Regresan 1 …» (lo cazó el
  // arnés con la ENTRADA de 1 del 29-ago, el caso de la captura del cliente).
  const una = Math.abs(diff) === 1;
  if (diff > 0)
    return `${una ? "Regresa" : "Regresan"} ${cantidadConUnidad(diff, unidad)} a la existencia ${rango}.`;
  if (diff < 0)
    return `${una ? "Se descuenta" : "Se descuentan"} ${cantidadConUnidad(
      -diff,
      unidad,
    )} de la existencia ${rango}.`;
  return `La existencia no cambia: queda en ${cantidadConUnidad(despues, unidad)}.`;
}

/** Σ de los gastos ligados (todos comparten moneda: el API resuelve una sola). */
function sumaGastos(gastos: GastoLigadoEliminacion[]): number {
  return Math.round(gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0) * 100) / 100;
}

/**
 * «También se elimina su gasto de $350.00 MXN cargado a XA-VGV.» — con
 * `para_flota` el movimiento generó N gastos prorrateados y se dicen todos.
 * Sin gastos se dice EXPLÍCITAMENTE que no se toca ninguno (el operador tiene
 * que saber si este borrado mueve dinero o no).
 */
export function fraseGastos(gastos: GastoLigadoEliminacion[]): string {
  if (gastos.length === 0) return "No tiene gastos de bodega ligados: no se toca ningún gasto.";
  if (gastos.length === 1) {
    const g = gastos[0];
    const destino = g.aeronave_matricula ? ` cargado a ${g.aeronave_matricula}` : "";
    return `También se elimina su gasto de ${montoTxt(g.monto, g.moneda)}${destino}.`;
  }
  return `También se eliminan los ${gastos.length} gastos de bodega que generó, ${montoTxt(
    sumaGastos(gastos),
    gastos[0]?.moneda,
  )} en total.`;
}

/** «$30.00 USD (05 sep 2026)»: un precio de compra con su fecha. */
export function precioConFecha(c: Pick<CostoVigente, "unitario" | "moneda" | "fecha">): string {
  return `${fmtPrecioUnitario(c.unitario, c.moneda)} (${fmtDateOnly(c.fecha)})`;
}

/**
 * API 0.0.36 (último precio de compra): quitar un movimiento ya NO cambia el
 * costo de ninguna salida —cada una guarda el costo con que se cobró—. Se
 * dice, para que nadie tema mover dinero ya cargado.
 */
export const NOTA_BAJA_SIN_RECOSTEO =
  "Ninguna salida cambia de costo: cada una guarda el costo con que se cobró.";

/**
 * Lo que SÍ puede cambiar: el ÚLTIMO PRECIO DE COMPRA (con él se valúa la
 * existencia y se cobra la siguiente salida). Con `cambia_precio_vigente`:
 * «El último precio de compra pasa de $30.00 USD (05 sep 2026) a $21.00 USD
 * (10 ago 2026): con él se valúa la existencia y se cobra la siguiente
 * salida.». null = no cambia (o API previo).
 */
export function fraseCambioPrecioVigente(preview: EliminacionMovimientoPreview): string | null {
  if (preview.cambia_precio_vigente !== true) return null;
  const antes = preview.precio_vigente_antes ?? null;
  const despues = preview.precio_vigente_despues ?? null;
  const cola = ": con él se valúa la existencia y se cobra la siguiente salida.";
  if (antes && despues) {
    return `El último precio de compra pasa de ${precioConFecha(antes)} a ${precioConFecha(despues)}${cola}`;
  }
  if (despues) return `El último precio de compra pasa a ${precioConFecha(despues)}${cola}`;
  return (
    "Sin este movimiento el producto se queda sin ninguna compra con costo: la existencia no se " +
    "valúa y las siguientes salidas saldrían sin cargo hasta registrar otra compra con costo."
  );
}

/**
 * Las frases del diálogo, en orden, cuando la baja SÍ se permite: qué se
 * elimina, cómo queda la existencia, qué gastos se van y —con el API
 * 0.0.36— que ninguna salida cambia de costo y, si aplica, el cambio del
 * último precio de compra en su propio renglón.
 */
export function lineasVistaPrevia(
  preview: EliminacionMovimientoPreview,
  unidad?: string | null,
): string[] {
  const lineas = [
    fraseEliminacion(preview, unidad),
    fraseExistencia(preview, unidad),
    fraseGastos(preview.gastos),
  ];
  // Marca del API nuevo: trae `cambia_precio_vigente` (aunque sea false).
  if ("cambia_precio_vigente" in preview) lineas.push(NOTA_BAJA_SIN_RECOSTEO);
  const precio = fraseCambioPrecioVigente(preview);
  if (precio) lineas.push(precio);
  return lineas;
}

/** Aviso permanente del diálogo: esto no se deshace, pero queda la huella. */
export const AVISO_IRREVERSIBLE =
  "No se puede deshacer. Queda registrado quién lo eliminó, cuándo y con qué motivo.";

// ─────────────────────────── Vista previa (bloqueado) ───────────────────────────

/**
 * Título CORTO del bloqueo. El «qué hacer» NO se escribe aquí: viene en el
 * `mensaje` del API, que es el único que sabe qué movimiento hay que eliminar
 * primero (lo nombra con su fecha). Duplicarlo aquí sería inventar una
 * segunda versión de la regla.
 */
export const TITULO_BLOQUEO: Record<CodigoBloqueoEliminacion, string> = {
  MOVIMIENTO_DE_COMPRA: "Nació de una compra",
  STOCK_NEGATIVO: "Dejaría la existencia en negativo",
  // Solo lo emite un API PREVIO (≤ 0.0.35, costo FIFO): con el último
  // precio de compra ninguna salida cambia de costo al quitar otra fila.
  CAMBIA_COSTO_FIFO: "El costo de otra salida cambiaría",
  GASTO_BLOQUEADO: "Su gasto ya no se puede tocar",
  TIPO_NO_SOPORTADO: "Este tipo de movimiento no se elimina",
};

export function tituloBloqueo(codigo: CodigoBloqueoEliminacion | null | undefined): string {
  if (codigo && codigo in TITULO_BLOQUEO) return TITULO_BLOQUEO[codigo];
  return "No se puede eliminar";
}

// ──────────────────────────── Resultado del borrado ────────────────────────────

/** Toast de éxito: existencia resultante + cuántos gastos se fueron. */
export function mensajeExito(
  res: Pick<EliminarMovimientoResultado, "gastos_eliminados" | "stock_resultante">,
  unidad?: string | null,
): string {
  const gastos =
    res.gastos_eliminados > 0
      ? ` · ${res.gastos_eliminados} ${
          res.gastos_eliminados === 1 ? "gasto de bodega eliminado" : "gastos de bodega eliminados"
        }`
      : "";
  return `Movimiento eliminado · existencia: ${cantidadConUnidad(
    res.stock_resultante,
    unidad,
  )}${gastos}`;
}

/**
 * Un API sin la baja desplegada (Nest responde 404 «Cannot DELETE /v1/…»).
 * Se distingue de «el movimiento ya no existe» por el `code`: los 404 del
 * servicio SÍ traen uno estable.
 */
export const MENSAJE_API_VIEJO =
  "Falta actualizar el API: esta versión todavía no permite eliminar movimientos del cardex. Avisa a sistemas.";

const CODIGOS_404_DEL_SERVICIO = ["MOVIMIENTO_NO_EXISTE", "MOVIMIENTO_DE_OTRO_ITEM"];

/** Resultado fallido de la server action (mismo shape que `ActionResult`). */
export interface FalloEliminacion {
  status?: number;
  code?: string;
  error?: string;
}

/** true = el API que contestó no conoce la ruta (backend sin desplegar). */
export function esApiSinBaja(res: FalloEliminacion): boolean {
  return res.status === 404 && !CODIGOS_404_DEL_SERVICIO.includes(res.code ?? "");
}

/**
 * Mensaje es-MX de un fallo. Los 409 (candados) y el 503 (migración
 * pendiente) llegan YA redactados por el API y se pintan tal cual: dicen qué
 * hacer. Aquí solo se traducen los casos que el API no puede explicar.
 */
export function mensajeErrorEliminacion(res: FalloEliminacion): string {
  if (esApiSinBaja(res)) return MENSAJE_API_VIEJO;
  if (res.status === 404) {
    return "Ese movimiento ya no existe (alguien más lo eliminó). Recarga la página.";
  }
  if (res.status === 403) {
    return "Solo un ADMIN puede eliminar movimientos del cardex.";
  }
  if (res.error?.trim()) return res.error.trim();
  return "No se pudo eliminar el movimiento.";
}

// ──────────────────────────── Historial de eliminados ────────────────────────────

export function tituloHistorial(n: number): string {
  return `Movimientos eliminados (${n})`;
}

/** «SALIDA de 10 pzas · 29 ago 2026 · XA-VGV». */
export function resumenEliminado(fila: MovimientoEliminado, unidad?: string | null): string {
  const partes = [
    `${fila.tipo.toUpperCase()} de ${cantidadConUnidad(fila.cantidad, unidad)}`,
    fmtDateOnly(fila.fecha_movimiento),
  ];
  const av = (fila.aeronave_matricula ?? "").trim();
  if (av) partes.push(av.toUpperCase() === "FLOTA" ? "toda la flota" : av);
  return partes.join(" · ");
}

/** QUIÉN y CUÁNDO (hora Cancún), que es justo lo que pidió el cliente. */
export function autorEliminado(fila: MovimientoEliminado): string {
  const quien = (fila.eliminado_por_nombre ?? "").trim() || "Usuario no identificado";
  return `${quien} · ${fmtDateTime(fila.eliminado_at)}`;
}

/** «1 gasto · $350.00 MXN» · «Sin gastos ligados». */
export function gastosEliminadosTxt(fila: MovimientoEliminado): string {
  if (!fila.gastos_eliminados) return "Sin gastos ligados";
  const etiqueta = `${fila.gastos_eliminados} ${fila.gastos_eliminados === 1 ? "gasto" : "gastos"}`;
  if (fila.monto_gastos == null) return etiqueta;
  return `${etiqueta} · ${montoTxt(fila.monto_gastos, fila.moneda_gastos)}`;
}

/**
 * La lectura del historial falló por algo que NO es «el API no conoce la
 * ruta»: se dice, JAMÁS se pinta la sección vacía (un «no hay eliminados»
 * falso es peor que no saber).
 */
export const TEXTO_HISTORIAL_NO_CARGO =
  "No se pudo cargar el historial de movimientos eliminados; recarga para reintentar.";
