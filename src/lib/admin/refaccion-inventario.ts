/**
 * REFACCIÓN: «Directo al avión» o «A Inventario/Tienda» (12-oct-2026, API
 * 0.0.72, invariante 57 del API). Pedido del cliente: «si se selecciona un
 * avión al dar de alta un gasto de un artículo de inventario, una nota
 * visual: entra a inventario pero se asignará/venderá a ese avión, quedando
 * la traza del artículo»; «el gasto asignado directo al avión se va al avión
 * sin cambiar el precio de venta; desde inventario debe pedir precio de venta
 * obligatorio; el gasto REFACCION crea el ítem si no existe».
 *
 * FUENTE ÚNICA (PURA) del alta de gasto: el destino por default, el
 * sub-formulario de inventario (artículo existente o nuevo, unidades, precio
 * de venta OBLIGATORIO, «vender al avión»), el bloque `inventario` que viaja
 * al API, las notas que explican qué va a pasar, el toast por etapa y los
 * errores. El API es quien entra la pieza (compra → recibir → precio →
 * salida); aquí no hay red.
 */
import { fmtMonto } from "@/lib/format";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import type { GastoInventarioResultado } from "@/types/expenses";

export type { GastoInventarioResultado };

export type DestinoRefaccion = "AVION" | "INVENTARIO";

export const TITULO_DESTINO_REFACCION = "¿A dónde va la refacción?";
export const ETIQUETA_DESTINO: Record<DestinoRefaccion, string> = {
  AVION: "Directo al avión",
  INVENTARIO: "A Inventario/Tienda",
};
export const AYUDA_DESTINO: Record<DestinoRefaccion, string> = {
  AVION: "Gasto indirecto del avión; no pasa por la bodega",
  INVENTARIO: "Entra a la bodega como compra recibida (el artículo se crea si no existe)",
};

/** Desde «Gastos del vuelo» la pieza es de ese avión; en el alta general, a la bodega. */
export function destinoRefaccionInicial(opts: { conVueloPrefijado: boolean }): DestinoRefaccion {
  return opts.conVueloPrefijado ? "AVION" : "INVENTARIO";
}

export const NOTA_DIRECTO_AVION =
  "Se carga directo al avión (hoja Gastos Indirectos) sin pasar por Inventario/Tienda: no cambia el precio de venta de ningún artículo.";
export const NOTA_DIRECTO_AVION_SIN_AVION =
  "Elige el avión al que se carga la refacción, o pásala a Inventario/Tienda.";
export const NOTA_INVENTARIO_SIN_AVION =
  "La pieza entra a Inventario/Tienda como compra recibida (el artículo se crea si no existe) con este gasto como su costo. Se vende al avión cuando le des salida desde Inventario/Tienda.";

/**
 * «Créalo por la suma» de Conciliación (14-oct-2026, API 0.0.77, invariante 76
 * del API): desde VARIOS cargos del banco la refacción va SOLO «Directo al
 * avión». = `MENSAJE_INVENTARIO_NO_DESDE_CARGOS` del API (400
 * INVENTARIO_NO_DESDE_CARGOS; prueba de paridad).
 */
export const NOTA_INVENTARIO_NO_DESDE_CARGOS =
  "Una refacción que entra a Inventario/Tienda no se registra desde varios cargos: regístrala en Gastos y vincula los cargos después.";
/** Desde varios cargos y sin avión elegido (sin «o pásala a Inventario/Tienda»: ahí no se puede). */
export const NOTA_ELIGE_AVION_REFACCION = "Elige el avión al que se carga la refacción.";

/** La nota del bloque «¿A dónde va la refacción?» en el alta por la suma (solo «Directo al avión»). */
export function notaRefaccionDesdeCargos(conAvion: boolean): string {
  return `${conAvion ? NOTA_DIRECTO_AVION : NOTA_ELIGE_AVION_REFACCION} ${NOTA_INVENTARIO_NO_DESDE_CARGOS}`;
}

/** La nota de la TRAZA (punto 1 del cliente): con avión elegido. */
export function notaInventarioConAvion(p: {
  matricula: string;
  vender: boolean;
  precioVenta: string;
  moneda: string;
}): string {
  if (!p.vender) {
    return `La pieza entra a Inventario/Tienda con este gasto como su costo y se queda en bodega: véndela a ${p.matricula} cuando le des salida desde Inventario/Tienda (hasta entonces el avión no recibe cargo).`;
  }
  const precio = Number(p.precioVenta);
  const precioTxt = Number.isFinite(precio) && p.precioVenta.trim() !== "" ? ` a ${fmtMonto(precio, p.moneda)} c/u` : "";
  return `La pieza entra a Inventario/Tienda y, al guardar, sale vendida a ${p.matricula}${precioTxt}: en su cardex queda la traza (entrada + salida) y el avión recibe el cargo de bodega. Este gasto es el costo de la compra, no un cargo al avión.`;
}

export const ETIQUETA_ARTICULO = "Artículo de Inventario/Tienda";
export const OPCION_ARTICULO_NUEVO = "__nuevo__";
export const ETIQUETA_ARTICULO_NUEVO = "＋ Artículo nuevo (se crea al guardar)";
export const PLACEHOLDER_ARTICULO = "Busca por nombre o número de parte";
export const ETIQUETA_NOMBRE_NUEVO = "Nombre del artículo";
export const ETIQUETA_NUMERO_PARTE = "Número de parte";
export const ETIQUETA_CATEGORIA_ITEM = "Categoría del artículo";
export const PLACEHOLDER_CATEGORIA_ITEM = "Refacción";
export const ETIQUETA_CANTIDAD = "Unidades que entran";
export const ETIQUETA_PRECIO_VENTA = "Precio de venta unitario";
export const HINT_PRECIO_VENTA =
  "Obligatorio: lo que se le cobra al avión por cada unidad al darle salida (0 = a costo, sin utilidad). Queda guardado en la ficha del artículo.";
export const ETIQUETA_VENDER_AL_AVION = "Vender al avión al guardar";
export const HINT_VENDER_AL_AVION =
  "Apagado: la pieza se queda en bodega y se vende después desde Inventario/Tienda.";

export interface FormInventarioRefaccion {
  /** uuid del artículo existente, `OPCION_ARTICULO_NUEVO` o "" (sin elegir). */
  item_id: string;
  nombre: string;
  numero_parte: string;
  categoria: string;
  cantidad: string;
  precio_venta: string;
  precio_venta_moneda: "MXN" | "USD";
  vender_al_avion: boolean;
}

export function formInventarioVacio(moneda: string): FormInventarioRefaccion {
  return {
    item_id: "",
    nombre: "",
    numero_parte: "",
    categoria: "",
    cantidad: "1",
    precio_venta: "",
    precio_venta_moneda: moneda === "USD" ? "USD" : "MXN",
    vender_al_avion: true,
  };
}

/** Lo que el selector necesita de cada artículo (lo manda el API de inventario). */
export interface ArticuloParaRefaccion {
  id: string;
  nombre: string;
  numero_parte?: string | null;
  unidad?: string | null;
  stock?: number | string | null;
  precio_venta?: number | string | null;
  precio_venta_moneda?: "MXN" | "USD" | null;
}

/** Al elegir: el precio de venta de la ficha se PRELLENA (editable); «nuevo» o vacío lo limpia. */
export function formAlElegirArticulo(
  form: FormInventarioRefaccion,
  eleccion: string,
  articulo: ArticuloParaRefaccion | null,
): FormInventarioRefaccion {
  if (eleccion !== OPCION_ARTICULO_NUEVO && articulo) {
    const precio = articulo.precio_venta != null ? Number(articulo.precio_venta) : NaN;
    return {
      ...form,
      item_id: articulo.id,
      nombre: "",
      numero_parte: "",
      categoria: "",
      precio_venta: Number.isFinite(precio) ? String(precio) : form.precio_venta,
      precio_venta_moneda: articulo.precio_venta_moneda ?? form.precio_venta_moneda,
    };
  }
  return { ...form, item_id: eleccion === OPCION_ARTICULO_NUEVO ? OPCION_ARTICULO_NUEVO : "" };
}

/** «Filtro CH48110 · CH48110» con la existencia debajo. */
export function opcionesArticulos(articulos: readonly ArticuloParaRefaccion[]): SearchableSelectOption[] {
  return [
    { value: OPCION_ARTICULO_NUEVO, label: ETIQUETA_ARTICULO_NUEVO },
    ...articulos.map((a) => {
      const stock = a.stock != null && Number.isFinite(Number(a.stock)) ? Number(a.stock) : null;
      return {
        value: a.id,
        label: a.numero_parte ? `${a.nombre} · ${a.numero_parte}` : a.nombre,
        description:
          stock != null ? `Existencia ${stock}${a.unidad ? ` ${a.unidad}` : ""}` : undefined,
      };
    }),
  ];
}

/** Lo que viaja en `inventario` del POST /v1/expenses (sin cadenas vacías). */
export interface InventarioPayload {
  item_id?: string;
  nombre?: string;
  numero_parte?: string;
  categoria?: string;
  cantidad: number;
  precio_venta: number;
  precio_venta_moneda: "MXN" | "USD";
  vender_al_avion: boolean;
}

export type VeredictoInventario =
  | { ok: true; inventario: InventarioPayload }
  | { ok: false; error: string };

/**
 * Valida el sub-formulario ANTES de guardar (espejo de las reglas del API,
 * con los textos del operador): artículo elegido o nombre nuevo, unidades >
 * 0, precio de venta capturado (0 = a costo) y avión si se vende al guardar.
 */
export function payloadInventario(
  form: FormInventarioRefaccion,
  ctx: { aeronaveId: string },
): VeredictoInventario {
  const nuevo = form.item_id === OPCION_ARTICULO_NUEVO;
  const nombre = form.nombre.trim();
  if (!form.item_id) return { ok: false, error: "Elige el artículo de Inventario/Tienda o «Artículo nuevo»." };
  if (nuevo && !nombre) return { ok: false, error: "Escribe el nombre del artículo nuevo." };
  const cantidad = Number(form.cantidad);
  if (!(cantidad > 0)) return { ok: false, error: "Captura cuántas unidades entran (mayor a 0)." };
  const precioTxt = form.precio_venta.trim();
  const precio = Number(precioTxt);
  if (precioTxt === "" || !Number.isFinite(precio) || precio < 0) {
    return { ok: false, error: "Captura el precio de venta unitario (0 = a costo). Es obligatorio para una refacción que entra a Inventario/Tienda." };
  }
  const vender = form.vender_al_avion && !!ctx.aeronaveId;
  return {
    ok: true,
    inventario: {
      ...(nuevo ? { nombre } : { item_id: form.item_id }),
      ...(nuevo && form.numero_parte.trim() ? { numero_parte: form.numero_parte.trim() } : {}),
      ...(nuevo && form.categoria.trim() ? { categoria: form.categoria.trim() } : {}),
      cantidad,
      precio_venta: Math.round(precio * 100) / 100,
      precio_venta_moneda: form.precio_venta_moneda,
      vender_al_avion: vender,
    },
  };
}

/** Hoja de destino para el hint de la categoría cuando la refacción va a la bodega. */
export function hojaDestinoRefaccionInventario(p: { tieneAvion: boolean; vender: boolean }): string {
  if (p.tieneAvion && p.vender) {
    return "Inventario/Tienda (compra recibida) · el avión recibe el cargo de bodega por su salida (hoja Refacciones)";
  }
  return "Inventario/Tienda (compra recibida) · al avión por su salida de bodega (hoja Refacciones)";
}

// ===== Respuesta del API (`GastoInventarioResultado`, en types/expenses.ts) =====

/** El toast tras guardar: todo bien en verde; una etapa fallida en ámbar con qué hacer. */
export function toastRefaccionInventario(
  r: GastoInventarioResultado | null | undefined,
  matricula?: string | null,
): { tipo: "success" | "warning"; titulo: string; descripcion?: string } {
  if (!r) return { tipo: "success", titulo: "Gasto registrado" };
  if (r.error || r.avisos.length > 0) {
    return {
      tipo: "warning",
      titulo: r.compra_id ? "Gasto registrado; revisa la bodega" : "Gasto registrado, pero NO entró a Inventario/Tienda",
      descripcion: r.avisos.join(" "),
    };
  }
  const folio = r.compra_folio != null ? ` (compra #${r.compra_folio})` : "";
  const articulo = r.item_nombre ? `«${r.item_nombre}»` : "la pieza";
  const creado = r.item_creado ? ", artículo nuevo" : "";
  if (r.salida) {
    const cargo = r.salida.gasto_id ? ` y se vendió a ${matricula ?? "el avión"} por ${fmtMonto(r.salida.monto, r.salida.moneda)}` : ` y salió a ${matricula ?? "el avión"} a costo`;
    return { tipo: "success", titulo: `Refacción registrada: ${articulo} entró a Inventario/Tienda${folio}${creado}${cargo}` };
  }
  return { tipo: "success", titulo: `Refacción registrada: ${articulo} entró a Inventario/Tienda${folio}${creado}; véndela al avión desde su salida` };
}

export const MSG_INVENTARIO_API_VIEJO =
  "Este servidor todavía no admite la entrada a Inventario/Tienda desde el alta de gasto: guarda la refacción «Directo al avión» o, para la bodega, crea la compra desde el menú ⋯ del gasto.";

/** 400 «property inventario should not exist» = API previo al 0.0.72. */
export function esApiSinInventario(error: string | null | undefined): boolean {
  return /property inventario should not exist/i.test(error ?? "");
}

/** Mensaje del alta cuando el API rechazó el bloque (código estable o texto). */
export function mensajeErrorInventario(error: string | null | undefined): string {
  if (esApiSinInventario(error)) return MSG_INVENTARIO_API_VIEJO;
  return error ?? "No se pudo registrar la refacción.";
}
