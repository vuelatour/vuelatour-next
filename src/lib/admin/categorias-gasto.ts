/**
 * FUENTE ÚNICA de etiquetas es-MX para las categorías de gasto del API.
 * Antes cada tabla/diálogo tenía su propio mapa (o pintaba el código crudo
 * tipo PERSONAL_DUENO): toda pantalla nueva debe consumir de aquí.
 *
 * SOLO PRESENTACIÓN: los códigos del enum (GAS, OTRO, …) NO cambian en BD,
 * DTOs, comparaciones ni prompts. La tabla canónica (etiqueta + destino por
 * default) es idéntica en panel, app y API — cambiarla aquí exige cambiarla
 * en los otros dos.
 */
export const CATEGORIA_GASTO_LABELS: Record<string, string> = {
  // Combustible de aviación (gasavión 100LL / turbosina). Los candados de
  // litros y avión siguen colgando del código GAS.
  GAS: "Gasavión / Turbosina",
  ATERRIZAJE: "Aterrizaje",
  OPERACIONES: "Operaciones",
  TUAS: "TUAS",
  FBO: "FBO",
  COMIDA: "Comida",
  HOTEL: "Hotel",
  TAXI: "Taxi / estacionamiento",
  REFACCION: "Refacción",
  PERMISO: "Permiso",
  // Honorario del freelance que voló el avión (doc 3.7): gasto directo del vuelo.
  PILOTO_EXTERNO: "Piloto externo (honorario)",
  // Pago al vendedor (28-sep-2026): SIEMPRE con vuelo; se aparea con la
  // comisión cobrada en «otros movimientos» del Balance general y reemplaza
  // la PROVISIÓN (invariante 31 del API). No es costo del avión.
  COMISION_VENDEDOR: "Comisión del vendedor",
  // LEGADO: ya no se ofrece en captura/verificación (se retiró de los
  // dropdowns), pero la etiqueta se conserva para pintar gastos históricos.
  FIJO: "Gasto fijo",
  // Gasto de la operación SIN vuelo (avión opcional): hoja "Gastos
  // Indirectos" del balance del avión (o repartible desde la pantalla
  // Otros gastos; cada parcial cae en esa misma hoja del avión elegido).
  INDIRECTO: "Gastos indirectos de avión",
  // Nómina del personal: sin vuelo; avión opcional (piloto de un solo avión).
  NOMINA: "Nómina",
  // Servicio/mantenimiento DE UN AVIÓN sin vuelo (taller, seguros del avión…).
  SERVICIOS: "Servicios (avión)",
  // Gasolina de coches/camionetas — nunca combustible de aviación (ese es GAS).
  GASOLINA: "Gasolina (vehículos)",
  // LEGADO: gasto de un visitante de trabajo (fondo de visita / tarjeta
  // corporativa). Ya no se ofrece en captura/verificación; la etiqueta se
  // conserva para pintar gastos históricos.
  VISITA: "Visita",
  // Fuera del dinero de la empresa: ni balances, ni reparto, ni pre-cierre.
  PERSONAL_DUENO: "Gasto personal del dueño",
  // La categoría OTRO se renombró SOLO en presentación: la pantalla
  // /admin/otros-gastos y la hoja "otros gastos" del Balance general
  // conservan su nombre (son gastos de EMPRESA, no esta categoría).
  OTRO: "Otros gastos VuelaTour",
};

/** Etiqueta legible de una categoría, con fallback capitalizado para
 *  categorías nuevas que el panel aún no conozca ("PISTA_VIP" → "Pista vip"). */
export function categoriaGastoLabel(cat: string): string {
  if (CATEGORIA_GASTO_LABELS[cat]) return CATEGORIA_GASTO_LABELS[cat];
  const limpio = cat.replaceAll("_", " ").toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

const DESTINO_DIRECTO_VUELO = "Gastos directos del vuelo (en el balance del avión)";
const DESTINO_INDIRECTO_AVION = "Gastos indirectos del avión (en el balance del avión)";
const DESTINO_OTROS_EMPRESA = "Otros gastos (Balance general VuelaTour)";

/**
 * "¿A dónde se va el gasto POR DEFAULT?" — texto que acompaña (en verde) a
 * cada categoría en el selector de captura/verificación. Es la regla general
 * de la categoría; la oficina luego puede reacomodarlo (ligar vuelo/avión,
 * repartir). Pedido del cliente (2-sep-2026): tabla canónica compartida con
 * app y API — NO es una regla nueva de clasificación, solo la explica.
 */
export const DESTINO_POR_DEFECTO: Record<string, string> = {
  GAS: "Combustible (en el balance del avión)",
  OPERACIONES: DESTINO_DIRECTO_VUELO,
  ATERRIZAJE: DESTINO_DIRECTO_VUELO,
  TUAS: DESTINO_DIRECTO_VUELO,
  FBO: DESTINO_DIRECTO_VUELO,
  COMIDA: DESTINO_DIRECTO_VUELO,
  HOTEL: DESTINO_DIRECTO_VUELO,
  TAXI: DESTINO_DIRECTO_VUELO,
  PILOTO_EXTERNO: DESTINO_DIRECTO_VUELO,
  // NO empieza con «Gastos directos del vuelo» ni es el destino de empresa:
  // no resta al avión ni va a «otros gastos» (idéntico al API y la app).
  COMISION_VENDEDOR:
    "Pago al vendedor (otros movimientos VuelaTour; no es costo del avión)",
  REFACCION:
    "Inventario en el Balance general VuelaTour; al salir del inventario se vende al avión y cae en sus Gastos Indirectos",
  PERMISO: "Hoja de permisos (en el balance del avión)",
  INDIRECTO: DESTINO_INDIRECTO_AVION,
  SERVICIOS: DESTINO_INDIRECTO_AVION,
  NOMINA: DESTINO_OTROS_EMPRESA,
  GASOLINA: DESTINO_OTROS_EMPRESA,
  OTRO: DESTINO_OTROS_EMPRESA,
  FIJO: DESTINO_OTROS_EMPRESA,
  VISITA: DESTINO_OTROS_EMPRESA,
  PERSONAL_DUENO: "Gastos personales de los dueños (fuera de la empresa)",
};

/** Destino por default de una categoría; "" si el panel no la conoce. */
export function destinoPorDefecto(categoria: string): string {
  return DESTINO_POR_DEFECTO[categoria] ?? "";
}

/**
 * Categorías que se OFRECEN al capturar un gasto nuevo, en el orden del
 * selector. La verificación agrega ATERRIZAJE y la categoría legado del
 * gasto (FIJO/VISITA no se capturan; la fuente única conserva sus etiquetas
 * para pintar gastos históricos).
 */
export const CATEGORIAS_CAPTURA: readonly string[] = [
  "GAS",
  "OPERACIONES",
  "TUAS",
  "FBO",
  "COMIDA",
  "HOTEL",
  "TAXI",
  "REFACCION",
  "PERMISO",
  // Honorario del freelance que voló el avión (doc 3.7): resta en el reparto
  // como gasto directo del vuelo.
  "PILOTO_EXTERNO",
  // Pago al vendedor (28-sep-2026): exige vuelo; va a «otros movimientos».
  "COMISION_VENDEDOR",
  // Sin vuelo (avión opcional): INDIRECTO/NOMINA; SERVICIOS es del avión.
  "INDIRECTO",
  "NOMINA",
  "SERVICIOS",
  // Sin vuelo NI avión: gasolina de coches y gasto personal del dueño
  // (fuera de balances/reparto/pre-cierre).
  "GASOLINA",
  "PERSONAL_DUENO",
  "OTRO",
];

/**
 * Clases del texto verde "a dónde se va por default" dentro del selector
 * (descripción secundaria de la opción). `whitespace-normal` porque el
 * destino de REFACCION no cabe en una línea; el `!` (important de Tailwind
 * v4) hace que el verde sobreviva al hover/highlight del ComboboxItem, que
 * pinta TODOS sus descendientes con `data-highlighted:**:text-accent-foreground`.
 */
export const DESTINO_CLASSNAME =
  "whitespace-normal leading-tight text-green-600! dark:text-green-400!";

/** Opción del selector de categoría (alta y verificación): etiqueta + destino
 *  por default en verde. Compatible con SearchableSelectOption. */
export function opcionCategoriaGasto(value: string): {
  value: string;
  label: string;
  description: string;
  descriptionClassName: string;
} {
  return {
    value,
    label: categoriaGastoLabel(value),
    description: destinoPorDefecto(value),
    descriptionClassName: DESTINO_CLASSNAME,
  };
}

/**
 * Gastos generales SIN vuelo repartibles entre aviones — SINCRONIZADA con la
 * regla del API (gasto_reparto): cambiar allá exige cambiar aquí.
 */
export const CATEGORIAS_REPARTIBLES: ReadonlySet<string> = new Set([
  "OTRO",
  "FIJO",
  "INDIRECTO",
  "GASOLINA",
  "VISITA",
  "NOMINA",
]);

// ===== Comisión del vendedor como gasto (28-sep-2026) =====
//
// Pedido del cliente: «¿cómo registro el pago de la comisión a Saab para que
// aparezca en otros movimientos? Si lo capturo como "Otros gastos VuelaTour"
// me lo manda a la hoja otros gastos y queda duplicado». El pago real al
// vendedor se captura con esta categoría LIGADO AL VUELO: en «otros
// movimientos» del Balance general (y «Otros ingresos» del Libro Dinero) se
// aparea con la comisión cobrada al cliente y REEMPLAZA a la PROVISIÓN. No es
// costo del avión, no va a «otros gastos», no se reparte. Espejo del API
// (`common/categoria-gasto.util.ts`, invariante 31) y de la app.

/** Código del pago real al vendedor (espejo de `CATEGORIA_PAGO_VENDEDOR` del API). */
export const CATEGORIA_PAGO_VENDEDOR = "COMISION_VENDEDOR";

/**
 * Vuelo obligatorio para TODOS los roles, la oficina incluida (espejo de
 * `categoriaExigeVueloSiempre` del API: 400 `GASTO_REQUIERE_VUELO` en alta y
 * edición; respaldo en BD con el CHECK `gasto_comision_vendedor_exige_vuelo`).
 */
export function categoriaExigeVueloSiempre(cat: string): boolean {
  return cat === CATEGORIA_PAGO_VENDEDOR;
}

/** Mismo texto que el 400 `GASTO_REQUIERE_VUELO` del API para esta categoría. */
export const MSG_GASTO_REQUIERE_VUELO_COMISION =
  "Esta categoría es del vuelo: elige el vuelo. «Comisión del vendedor» siempre se registra con el vuelo al que pertenece.";

/** Ayuda del formulario (alta y verificación) al elegir la categoría. */
export const AYUDA_COMISION_VENDEDOR =
  "Se aparea con la comisión cobrada al cliente en la hoja «otros movimientos» del balance general y reemplaza la PROVISIÓN de ese vuelo; si pagas de menos o de más, la hoja lo marca con «faltan» o «excede». Registra un gasto por vuelo: si una sola transferencia paga varios vuelos (o los aviones de un grupo), captura un gasto por vuelo con su parte. No es costo del avión. No la captures como «Otros gastos VuelaTour»: quedaría duplicada.";

/** Hint del campo «Vuelo» cuando la categoría lo exige. */
export const HINT_VUELO_COMISION =
  "Obligatorio: la comisión se aparea con lo cobrado en ese vuelo. La lista trae los vuelos de los últimos 90 días.";

/** Ventana del selector de vuelos (días alrededor de la fecha del gasto). */
export interface VentanaVuelosCercanos {
  diasAtras: number;
  diasAdelante: number;
  limit: number;
}

/** La de siempre: ±15 días, 100 vuelos (Paywise, verificación, alta). */
export const VENTANA_VUELOS_DEFAULT: VentanaVuelosCercanos = {
  diasAtras: 15,
  diasAdelante: 15,
  limit: 100,
};

/** La comisión se paga días o semanas DESPUÉS del vuelo: 90 días hacia
 *  atrás (el API admite `limit ≤ 500` en /v1/flights). */
export const VENTANA_VUELOS_COMISION: VentanaVuelosCercanos = {
  diasAtras: 90,
  diasAdelante: 15,
  limit: 500,
};

/** null = ok; texto = bloquear el guardado (antes de subir nada). */
export function errorVueloObligatorio(
  categoria: string,
  vueloId: string | null | undefined,
): string | null {
  if (!categoriaExigeVueloSiempre(categoria)) return null;
  return vueloId ? null : MSG_GASTO_REQUIERE_VUELO_COMISION;
}

/**
 * La IA jamás pisa una categoría que no sabe sugerir: si el humano eligió
 * «Comisión del vendedor», la lectura del ticket (que llega segundos
 * después) no la cambia. Tampoco la PROPONE (pyservices no la sugiere; si
 * algún día llegara, un pago al vendedor lo decide la oficina, no la IA).
 */
export function iaPuedeCambiarCategoria(
  actual: string,
  sugerida: string | null | undefined,
): boolean {
  if (!sugerida) return false;
  if (actual === CATEGORIA_PAGO_VENDEDOR) return false;
  return sugerida !== CATEGORIA_PAGO_VENDEDOR;
}

/**
 * Categorías de EMPRESA — «la categoría de empresa manda sobre el vuelo»
 * (regla del cliente, 11-sep-2026): van SIEMPRE a la hoja «otros gastos» del
 * Balance general aunque traigan vuelo o avión sellados. SINCRONIZADA con
 * `CATEGORIAS_GASTO_EMPRESA` del API (se deriva allá del destino
 * `Otros gastos (Balance general VuelaTour)`; aquí se escribe literal y el
 * test la congela contra `DESTINO_POR_DEFECTO`).
 */
export const CATEGORIAS_EMPRESA: ReadonlySet<string> = new Set([
  "OTRO",
  "NOMINA",
  "GASOLINA",
  "FIJO",
  "VISITA",
]);

const HOJA_OTROS_GASTOS_SIN_NADA =
  "Balance general VuelaTour · Otros gastos (repártelo desde la pantalla Otros gastos para cargarlo a aviones)";

/**
 * "¿A qué hoja del balance cae este gasto CON LO ELEGIDO?" — precisión
 * dinámica (categoría + vuelo + avión) para la segunda línea del hint bajo el
 * select de categoría (alta y verificación); la primera línea es el destino
 * por default (destinoPorDefecto). Refleja las reglas del API (balance por
 * avión + Balance general). Orden de evaluación:
 * - PERSONAL_DUENO → fuera de todos los balances;
 * - COMISION_VENDEDOR → «otros movimientos» (reemplaza la provisión);
 * - EMPRESA (OTRO/NOMINA/GASOLINA/FIJO/VISITA) → SIEMPRE «otros gastos» del
 *   general (desde el 11-sep-2026); el vuelo/avión quedan de referencia —
 *   antes decía «hoja del vuelo» y justo esa pista confundió al cliente
 *   (28-sep-2026: capturó la comisión como «Otros gastos VuelaTour»);
 * - con vuelo: TUAS → «otros movimientos» (apareado con las TUAS cobradas;
 *   en la hoja del vuelo solo es nota); GAS → Combustible (por avión y mes);
 *   PERMISO → Permisos; lo demás → la hoja de ese vuelo;
 * - sin avión ni vuelo → hoja Otros gastos del Balance general VuelaTour;
 * - GAS con avión → hoja Combustible; PERMISO con avión → hoja Permisos;
 * - REFACCION manual con avión → hoja Gastos Indirectos (la hoja
 *   Refacciones se alimenta SOLO de las salidas de bodega);
 * - INDIRECTO/SERVICIOS y demás con avión → hoja Gastos Indirectos.
 */
export function hojaDestinoGasto(
  categoria: string,
  tieneVuelo: boolean,
  tieneAvion: boolean,
): string {
  if (categoria === "PERSONAL_DUENO") return "Fuera de balances (personal)";
  if (categoria === CATEGORIA_PAGO_VENDEDOR) {
    return "Balance general VuelaTour · Otros movimientos (reemplaza la provisión del pago al vendedor)";
  }
  if (CATEGORIAS_EMPRESA.has(categoria)) {
    if (tieneVuelo) {
      return "Balance general VuelaTour · Otros gastos (el vuelo queda solo como referencia)";
    }
    if (tieneAvion) {
      return "Balance general VuelaTour · Otros gastos (el avión queda solo como referencia; para cargarlo a aviones usa el reparto)";
    }
    return HOJA_OTROS_GASTOS_SIN_NADA;
  }
  if (tieneVuelo) {
    if (categoria === "TUAS") {
      return "Balance general VuelaTour · Otros movimientos (apareado con las TUAS cobradas; en la hoja del vuelo solo es nota)";
    }
    if (categoria === "GAS") {
      return "Balance del avión · Combustible (por avión y mes; el vuelo es referencia)";
    }
    if (categoria === "PERMISO") return "Balance del avión · Permisos";
    return "Balance del avión · hoja del vuelo";
  }
  if (!tieneAvion) return HOJA_OTROS_GASTOS_SIN_NADA;
  if (categoria === "GAS") return "Balance del avión · Combustible";
  if (categoria === "PERMISO") return "Balance del avión · Permisos";
  // REFACCION manual incluida: la hoja Refacciones es solo bodega.
  return "Balance del avión · Gastos Indirectos";
}
