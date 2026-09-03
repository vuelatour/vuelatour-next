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

/**
 * "¿A qué hoja del balance cae este gasto CON LO ELEGIDO?" — precisión
 * dinámica (categoría + vuelo + avión) para la segunda línea del hint bajo el
 * select de categoría (alta y verificación); la primera línea es el destino
 * por default (destinoPorDefecto). Refleja las reglas del balance por avión
 * de pyservices:
 * - ligado a un vuelo → la hoja de ese vuelo;
 * - GAS con avión → hoja Combustible; PERMISO con avión → hoja Permisos;
 * - REFACCION manual con avión → hoja Gastos Indirectos (la hoja
 *   Refacciones se alimenta SOLO de las salidas de bodega);
 * - INDIRECTO/NOMINA/SERVICIOS y demás con avión → hoja Gastos Indirectos;
 * - sin avión ni vuelo → hoja Otros gastos del Balance general VuelaTour
 *   (repartible desde la pantalla Otros gastos: cada parcial cae en la hoja
 *   Gastos Indirectos del avión elegido, con la nota reparto manual);
 * - PERSONAL_DUENO → fuera de todos los balances.
 */
export function hojaDestinoGasto(
  categoria: string,
  tieneVuelo: boolean,
  tieneAvion: boolean,
): string {
  if (categoria === "PERSONAL_DUENO") return "Fuera de balances (personal)";
  if (tieneVuelo) return "Balance del avión · hoja del vuelo";
  if (!tieneAvion) {
    return "Balance general VuelaTour · Otros gastos (repártelo desde la pantalla Otros gastos para cargarlo a aviones)";
  }
  if (categoria === "GAS") return "Balance del avión · Combustible";
  if (categoria === "PERMISO") return "Balance del avión · Permisos";
  // REFACCION manual incluida: la hoja Refacciones es solo bodega.
  return "Balance del avión · Gastos Indirectos";
}
