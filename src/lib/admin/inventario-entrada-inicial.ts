/**
 * ENTRADA INICIAL del alta de producto (formulario del panel) — qué se
 * registra en el cardex al crear el ítem y qué se le dice al operador.
 *
 * Pedido del cliente (28-sep-2026): «me ayudas a poder agregar productos sin
 * costo ya que lo tenemos como pendiente, pero necesitamos ingresarlo a la
 * bodega». Hasta hoy el alta con «Entrada inicial» exigía costo > 0 y la
 * pieza no podía entrar a bodega sin su precio.
 *
 * REGLA:
 * - **Sin costo = decisión EXPLÍCITA, nunca accidente.** Cantidad > 0 con el
 *   costo vacío o en 0 ⇒ `COSTO_PENDIENTE`: el formulario pide confirmación
 *   (`TITULO_CONFIRMAR_SIN_COSTO` / `textoConfirmarSinCosto`) antes de crear.
 * - Con costo pendiente el T.C. NO se exige (no hay nada que convertir) y el
 *   movimiento viaja como `moneda: "USD", costo_unitario_usd: 0` — igual que
 *   la carga masiva. El API lo acepta (`@Min(0)`, CHECK `>= 0` en BD), no fija
 *   el último precio de compra (`fijaPrecio` exige > 0) y lo lista el filtro
 *   `sin_costo=true` (banner «entradas sin costo» de Inventario). «Editar
 *   costo» fija después la moneda real.
 * - Con costo > 0 NADA cambia: MXN exige T.C., costo sin cantidad avisa, y el
 *   payload es el de siempre.
 *
 * PURO (prueba `__tests__/inventario-entrada-inicial.test.ts`): el
 * componente no redacta estas frases ni arma el movimiento a mano.
 */

export type MonedaEntrada = "MXN" | "USD";

/** Lo capturado en el bloque «Entrada inicial (opcional)» (todo texto). */
export interface EntradaInicialCaptura {
  cantidad?: string | null;
  /** Costo unitario EN LA MONEDA elegida. */
  costo?: string | null;
  moneda: MonedaEntrada;
  tc?: string | null;
}

/** Movimiento ENTRADA tal como viaja a `createMovimientoAction` (sin fecha ni notas). */
export interface MovimientoEntradaInicial {
  tipo: "ENTRADA";
  cantidad: string;
  moneda: MonedaEntrada;
  costo_unitario_usd?: string | number;
  costo_unitario_mxn?: string;
  tc_usd_mxn?: string;
}

export type DecisionEntradaInicial =
  /** Sin cantidad ni costo: el producto nace sin entrada (stock 0). */
  | { tipo: "NINGUNA" }
  /** Algo falta o sobra: no se crea NADA hasta corregirlo. */
  | { tipo: "ERROR"; mensaje: string }
  /** Compra con su costo (> 0): lo de siempre. */
  | { tipo: "CON_COSTO"; cantidad: number; movimiento: MovimientoEntradaInicial }
  /** Entra a bodega con el costo PENDIENTE: exige confirmación explícita. */
  | { tipo: "COSTO_PENDIENTE"; cantidad: number; movimiento: MovimientoEntradaInicial };

export const MSG_COSTO_SIN_CANTIDAD =
  "Captura cuántas piezas entran (cantidad inicial) o borra el costo.";
export const MSG_TC_INICIAL = "Captura el tipo de cambio (MXN por USD) de la compra inicial.";
export const MSG_CANTIDAD_INVALIDA =
  "La cantidad inicial debe ser un número mayor a 0 (mínimo 0.01), o déjala vacía.";
export const MSG_COSTO_INVALIDO =
  "El costo unitario no puede ser negativo: captúralo, o déjalo vacío si aún no lo tienes.";
/**
 * Costo > 0 que la BD guardaría como $0 (revisión adversaria 28-sep-2026):
 * `costo_unitario_usd` es numeric(14,4) y el API convierte los pesos con
 * `round(mxn / tc, 4)`. «0.00001» pasaba como CON_COSTO y la pieza entraba
 * SIN costo sin pasar por la confirmación.
 */
export const MSG_COSTO_EN_CERO =
  "Ese costo unitario es tan chico que se guardaría como $0: captura el costo real, o déjalo vacío si aún no lo tienes (queda pendiente).";

/** Número de un campo de texto: "" ⇒ 0; basura ⇒ NaN. */
function numeroDe(txt: string): number {
  return txt === "" ? 0 : Number(txt);
}

/** Redondeo a N decimales (half-up, como `round` del API y numeric de Postgres). */
function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

/**
 * ¿Este costo (> 0) quedaría en $0.0000 USD en `costo_unitario_usd`? En USD
 * se mira el número tal cual; en pesos, `costo / tc` con el T.C. capturado
 * (sin T.C. el API usa el oficial del día, que aquí no se conoce: solo se
 * frena lo que ya es 0 a 4 decimales en pesos).
 */
export function costoSeGuardariaEnCero(costo: number, moneda: MonedaEntrada, tc?: number | null): boolean {
  if (!(costo > 0)) return false;
  if (moneda === "USD") return redondear(costo, 4) === 0;
  if (redondear(costo, 4) === 0) return true;
  const tcN = Number(tc);
  return tcN > 0 ? redondear(costo / redondear(tcN, 4), 4) === 0 : false;
}

/**
 * Qué es el COSTO capturado de una ENTRADA (fuente única para el alta y para
 * «Registrar movimiento»): `PENDIENTE` = vacío o 0 (pide confirmación),
 * `CON_COSTO` = > 0 y se guarda como tal, `ERROR` = negativo, ilegible o tan
 * chico que se guardaría en $0.
 */
export function clasificarCostoEntrada(c: {
  costo?: string | number | null;
  moneda: MonedaEntrada;
  tc?: string | number | null;
}): { tipo: "PENDIENTE" } | { tipo: "CON_COSTO"; costo: number } | { tipo: "ERROR"; mensaje: string } {
  const costoN = numeroDe(String(c.costo ?? "").trim());
  if (Number.isNaN(costoN) || costoN < 0) return { tipo: "ERROR", mensaje: MSG_COSTO_INVALIDO };
  if (!(costoN > 0)) return { tipo: "PENDIENTE" };
  const tcN = Number(String(c.tc ?? "").trim() || "0");
  if (costoSeGuardariaEnCero(costoN, c.moneda, tcN)) {
    return { tipo: "ERROR", mensaje: MSG_COSTO_EN_CERO };
  }
  return { tipo: "CON_COSTO", costo: costoN };
}

/**
 * Qué hacer con la entrada inicial al crear el producto. FUENTE ÚNICA de la
 * validación y del movimiento: el componente solo agrega fecha y notas.
 */
export function decidirEntradaInicial(c: EntradaInicialCaptura): DecisionEntradaInicial {
  const cantTxt = (c.cantidad ?? "").trim();
  const costoTxt = (c.costo ?? "").trim();
  const tcTxt = (c.tc ?? "").trim();
  const cantN = numeroDe(cantTxt);

  if (Number.isNaN(cantN) || cantN < 0) return { tipo: "ERROR", mensaje: MSG_CANTIDAD_INVALIDA };
  // `cantidad` es numeric(12,2) con CHECK > 0: «0.004» se redondea a 0.00 y
  // la ENTRADA rebotaba DESPUÉS de crear el producto. Se frena antes.
  if (cantN > 0 && redondear(cantN, 2) === 0) {
    return { tipo: "ERROR", mensaje: MSG_CANTIDAD_INVALIDA };
  }
  // Negativo/ilegible ⇒ error; un costo > 0 que se guardaría en $0.0000 USD
  // tampoco es «con costo» (entraría sin costo y SIN la confirmación).
  const costo = clasificarCostoEntrada({ costo: costoTxt, moneda: c.moneda, tc: tcTxt });
  if (costo.tipo === "ERROR") return costo;

  if (cantN > 0 && costo.tipo === "PENDIENTE") {
    // Costo pendiente: USD 0, sin costo MXN ni T.C. (nada que convertir).
    return {
      tipo: "COSTO_PENDIENTE",
      cantidad: cantN,
      movimiento: { tipo: "ENTRADA", cantidad: cantTxt, moneda: "USD", costo_unitario_usd: 0 },
    };
  }
  if (cantN > 0) {
    if (c.moneda === "MXN" && !(Number(tcTxt) > 0)) {
      return { tipo: "ERROR", mensaje: MSG_TC_INICIAL };
    }
    return {
      tipo: "CON_COSTO",
      cantidad: cantN,
      movimiento: {
        tipo: "ENTRADA",
        cantidad: cantTxt,
        moneda: c.moneda,
        ...(c.moneda === "MXN"
          ? { costo_unitario_mxn: costoTxt, tc_usd_mxn: tcTxt }
          : { costo_unitario_usd: costoTxt }),
      },
    };
  }
  if (costo.tipo === "CON_COSTO") return { tipo: "ERROR", mensaje: MSG_COSTO_SIN_CANTIDAD };
  return { tipo: "NINGUNA" };
}

/** ¿Lo capturado dejaría el costo pendiente? (aviso en línea del formulario). */
export function costoQuedaPendiente(c: EntradaInicialCaptura): boolean {
  return decidirEntradaInicial(c).tipo === "COSTO_PENDIENTE";
}

/** «1 unidad» / «2.5 unidades» (es-MX, hasta 2 decimales como el cardex). */
export function textoUnidades(n: number): string {
  if (n === 1) return "1 unidad";
  return `${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })} unidades`;
}

// ───────────────── Textos de la confirmación y del aviso ─────────────────

export const TITULO_CONFIRMAR_SIN_COSTO = "¿Registrar la entrada sin costo?";
export const BOTON_REGISTRAR_SIN_COSTO = "Registrar sin costo";
export const BOTON_CAPTURAR_COSTO = "Capturar el costo";

/** Dónde se completa el costo EN EL PANEL (la ficha no tiene «Editar costo» en «Compras»: vive en el cardex). */
export const DONDE_COMPLETAR_COSTO =
  "Lo completas después desde la ficha del producto («Cardex completo» → «Editar costo») " +
  "o con «Completar costo» en el aviso de entradas sin costo de Inventario.";

/**
 * Cuerpo de la confirmación. `conPrecioVenta`: el producto trae precio de
 * venta propio ⇒ la salida SÍ se carga al avión a ese precio (API
 * `precioVentaDeSalida`, origen PRECIO_PRODUCTO) aunque el costo esté
 * pendiente; decir «sin cargo al avión» sería falso.
 *
 * Revisión adversaria (28-sep-2026), fidelidad con el API:
 *  - el costo de cada salida queda CONGELADO en su fila: completar después el
 *    costo NO cobra las salidas que ya se hicieron (`TEXTOS_INVENTARIO.
 *    sinCostoVigente` del API: «esta se queda sin cargo»). Sin decirlo, el
 *    operador daba salidas creyendo que se cobrarían al completar el costo;
 *  - en el panel «Editar costo» NO está en el bloque «Compras» de la ficha
 *    (ahí solo la banda «Abrir el cardex para corregir el costo»): vive en
 *    «Cardex completo»; el aviso de Inventario dice «Completar costo».
 */
export function textoConfirmarSinCosto(cantidad: number, conPrecioVenta = false): string {
  const salidas = conPrecioVenta
    ? "las salidas de esta pieza salen con costo $0 (al avión se le carga solo el precio de venta del producto) y conservan ese costo $0 aunque después lo captures"
    : "las salidas de esta pieza se cobran a $0 (sin cargo al avión) y así se quedan aunque después captures el costo";
  return (
    `La pieza entra a bodega con ${textoUnidades(cantidad)} y el costo queda PENDIENTE. ` +
    `Mientras no lo captures, ${salidas}; la pieza tampoco cuenta en el valorizado. ` +
    DONDE_COMPLETAR_COSTO
  );
}

/**
 * «Registrar movimiento» → ENTRADA sin costo de un producto que YA existe.
 * Una entrada a $0 no fija el último precio de compra (`fijaPrecio` del API
 * exige > 0), así que lo que pasa depende de lo que el producto ya tenga:
 *  - `costoVigente === null` (sin ninguna compra con costo) ⇒ el MISMO texto
 *    del alta (las salidas salen a $0);
 *  - con costo vigente ⇒ las salidas siguen con ese precio y estas piezas se
 *    valúan a él (valorizado = existencia × último precio de compra);
 *  - `undefined` (API previo: no se sabe) ⇒ los dos casos, sin adivinar.
 */
export function textoConfirmarEntradaSinCosto(
  cantidad: number,
  opts: { conPrecioVenta?: boolean; tieneCostoVigente?: boolean | null } = {},
): string {
  if (opts.tieneCostoVigente === false) {
    return textoConfirmarSinCosto(cantidad, opts.conPrecioVenta);
  }
  const inicio = `Entran ${textoUnidades(cantidad)} con el costo PENDIENTE ($0). `;
  if (opts.tieneCostoVigente === true) {
    return (
      inicio +
      "Una entrada sin costo no cambia el precio de compra: las salidas siguen usando el último " +
      "precio de compra que ya tiene el producto y estas piezas se valúan a ese precio. " +
      DONDE_COMPLETAR_COSTO
    );
  }
  return (
    inicio +
    "Una entrada sin costo no cambia el precio de compra: si el producto ya tiene una compra con " +
    "costo, las salidas siguen usando ese precio; si no tiene ninguna, salen a $0 y así se quedan " +
    "aunque después captures el costo. " +
    DONDE_COMPLETAR_COSTO
  );
}

/** Ayuda del costo en «Registrar movimiento» → ENTRADA. */
export const HINT_COSTO_ENTRADA_PENDIENTE =
  "Si aún no lo tienes, déjalo vacío: la entrada queda con el costo pendiente (se te pide confirmarlo).";

/**
 * ¿El producto ya tiene una compra con costo? Lee `costo_vigente` (API
 * 0.0.36, en la lista y en el detalle): `null` = ninguna, objeto = sí,
 * AUSENTE = API previo ⇒ `undefined` (no se adivina).
 */
export function tieneCostoVigenteDe(item: object): boolean | undefined {
  if (!("costo_vigente" in item)) return undefined;
  const v = (item as { costo_vigente?: unknown }).costo_vigente;
  return v === undefined ? undefined : v != null;
}

/** Toast de «Registrar movimiento» tras una ENTRADA con el costo pendiente. */
export function textoEntradaRegistradaSinCosto(cantidad: number): string {
  return `Entrada registrada con ${textoUnidades(cantidad)}. Costo pendiente: complétalo con «Editar costo» en el cardex.`;
}

/** Toast al terminar el alta con el costo pendiente. */
export function textoProductoCreadoSinCosto(cantidad: number): string {
  return `Producto creado con ${textoUnidades(cantidad)}. Costo pendiente: complétalo en la ficha del producto.`;
}

/** Aviso ámbar bajo los campos mientras el costo va vacío (o en 0) con cantidad. */
export const AVISO_COSTO_PENDIENTE =
  "Sin costo: la pieza entra a bodega con el costo pendiente (se te pedirá confirmarlo al crear el producto).";

/** Frase de la ayuda del bloque «Entrada inicial (opcional)». */
export const AYUDA_COSTO_PENDIENTE =
  "Si aún no tienes el costo, déjalo vacío: la pieza entra a bodega y el costo queda pendiente para completarlo después.";

/** Ayuda del T.C. cuando el costo queda pendiente (no se exige). */
export const HINT_TC_COSTO_PENDIENTE =
  "No hace falta mientras el costo quede pendiente: se captura junto con el costo.";

/** Notas del movimiento (las de siempre: no dicen «pendiente» porque se completa después). */
export const NOTA_ENTRADA_INICIAL = "Stock inicial (alta del ítem)";
