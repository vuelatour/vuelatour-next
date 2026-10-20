import { fmtUsd } from "@/lib/format";

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
  // Snacks/bebidas de los PASAJEROS (13-oct-2026, API 0.0.75): gasto directo
  // del vuelo, columna OTROS del balance del avión; la comida de la
  // tripulación es COMIDA.
  COMISARIATO: "Comisariato",
  // Cualquier otro gasto directo del vuelo (20-oct-2026, invariante 97 del
  // API): columna OTROS de la fila del vuelo, como Comisariato.
  OTROS_DIRECTOS_VUELO: "Otros gastos directos del vuelo",
  HOTEL: "Hotel",
  TAXI: "Taxi / estacionamiento",
  REFACCION: "Refacción",
  PERMISO: "Permiso",
  // Honorario del freelance que voló el avión (doc 3.7): gasto directo del vuelo.
  PILOTO_EXTERNO: "Piloto externo (honorario)",
  // Pago al vendedor en DOS categorías (13-oct-2026, invariante 61 del API;
  // ver «Dos categorías» más abajo). Las dos exigen vuelo.
  // «(VuelaTour)» (28-sep-2026): la paga VuelaTour; se aparea con la
  // comisión cobrada en «otros movimientos» del Balance general y nunca es
  // costo del avión. Sin pago capturado esa fila no lleva egreso.
  COMISION_VENDEDOR: "Comisión del vendedor (VuelaTour)",
  // «(avión)» (13-oct-2026): la carga el avión del vuelo en la columna
  // COMISIONES de su balance y en el reparto a sus socios.
  COMISION_VENDEDOR_AVION: "Comisión del vendedor (avión)",
  // LEGADO: ya no se ofrece en captura/verificación (se retiró de los
  // dropdowns), pero la etiqueta se conserva para pintar gastos históricos.
  FIJO: "Gasto fijo",
  // Gasto de la operación SIN vuelo (avión opcional): hoja "Gastos
  // Indirectos" del balance del avión (o repartible desde la pantalla
  // Otros gastos; cada parcial cae en esa misma hoja del avión elegido).
  INDIRECTO: "Gastos indirectos de avión",
  // Nómina del personal: sin vuelo. Vive en su módulo (`/admin/nomina`) y
  // desde el 16-oct-2026 (API 0.0.90, invariante 91) SOLO repartida entre
  // aviones entra a un balance; sin reparto no va a ningún libro. El avión
  // que traiga es solo referencia (`AYUDA_ALTA_NOMINA`).
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
  // Envíos y mensajería de la empresa (20-oct-2026, invariante 97 del API):
  // gasto de EMPRESA, hoja «otros gastos» del Balance general.
  PAQUETERIA: "Paquetería",
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
  // Comisariato (13-oct-2026): el MISMO destino que COMIDA (gasto directo
  // del vuelo; en el balance cae en la columna OTROS, junto al FBO).
  COMISARIATO: DESTINO_DIRECTO_VUELO,
  // Otros directos del vuelo (20-oct-2026): el destino de COMISARIATO.
  OTROS_DIRECTOS_VUELO: DESTINO_DIRECTO_VUELO,
  HOTEL: DESTINO_DIRECTO_VUELO,
  TAXI: DESTINO_DIRECTO_VUELO,
  PILOTO_EXTERNO: DESTINO_DIRECTO_VUELO,
  // Las dos del pago al vendedor NO empiezan con «Gastos directos del vuelo»
  // ni son el destino de empresa: ninguna va a «otros gastos» y
  // CATEGORIAS_EMPRESA no cambia. Textos simétricos a propósito («no es / sí
  // es costo del avión»), idénticos al API y la app.
  COMISION_VENDEDOR:
    "Pago al vendedor (otros movimientos VuelaTour; no es costo del avión)",
  COMISION_VENDEDOR_AVION:
    "Pago al vendedor (columna COMISIONES del balance del avión; sí es costo del avión)",
  REFACCION:
    "Inventario en el Balance general VuelaTour; al salir del inventario se vende al avión y cae en sus Gastos Indirectos",
  PERMISO: "Hoja de permisos (en el balance del avión)",
  INDIRECTO: DESTINO_INDIRECTO_AVION,
  SERVICIOS: DESTINO_INDIRECTO_AVION,
  NOMINA: DESTINO_OTROS_EMPRESA,
  GASOLINA: DESTINO_OTROS_EMPRESA,
  OTRO: DESTINO_OTROS_EMPRESA,
  // Paquetería (20-oct-2026): destino de EMPRESA ⇒ entra a CATEGORIAS_EMPRESA.
  PAQUETERIA: DESTINO_OTROS_EMPRESA,
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
 * para pintar gastos históricos). «Comisariato» (13-oct-2026) va justo
 * después de «Comida», como en la app: la de los pasajeros junto a la de la
 * tripulación.
 */
export const CATEGORIAS_CAPTURA: readonly string[] = [
  "GAS",
  "OPERACIONES",
  "TUAS",
  "FBO",
  "COMIDA",
  // Snacks/bebidas de los PASAJEROS (13-oct-2026, API 0.0.75).
  "COMISARIATO",
  // Cualquier otro gasto directo del vuelo (20-oct-2026): columna OTROS.
  "OTROS_DIRECTOS_VUELO",
  "HOTEL",
  "TAXI",
  "REFACCION",
  "PERMISO",
  // Honorario del freelance que voló el avión (doc 3.7): resta en el reparto
  // como gasto directo del vuelo.
  "PILOTO_EXTERNO",
  // Pago al vendedor en DOS categorías (13-oct-2026); las dos exigen vuelo.
  // Primero «(VuelaTour)» (la de siempre: «otros movimientos») y justo
  // después «(avión)» (columna COMISIONES del avión y reparto a socios).
  "COMISION_VENDEDOR",
  "COMISION_VENDEDOR_AVION",
  // Sin vuelo (avión opcional): INDIRECTO/NOMINA; SERVICIOS es del avión.
  "INDIRECTO",
  "NOMINA",
  "SERVICIOS",
  // Sin vuelo NI avión: gasolina de coches y gasto personal del dueño
  // (fuera de balances/reparto/pre-cierre).
  "GASOLINA",
  // Envíos y mensajería de la empresa (20-oct-2026).
  "PAQUETERIA",
  "PERSONAL_DUENO",
  "OTRO",
];

/**
 * Opciones del filtro «Categoría» de Gastos (14-oct-2026, una sola tabla):
 * las de captura en su orden y al final las tres que solo se verifican o
 * son legado (ATERRIZAJE, FIJO, VISITA). Son las 24 del enum sin repetir
 * (= llaves de CATEGORIA_GASTO_LABELS); `?categoria=` se valida contra esta
 * lista con `valorDeCatalogo` (desconocida o en minúsculas ⇒ se ignora y
 * jamás viaja al API). Las opciones son `CATEGORIAS_FILTRO_GASTO.map(
 * opcionCategoriaGasto)`: etiqueta + destino en verde, como en la captura.
 */
export const CATEGORIAS_FILTRO_GASTO: readonly string[] = [
  ...CATEGORIAS_CAPTURA,
  "ATERRIZAJE",
  "FIJO",
  "VISITA",
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

// ===== Comisariato (13-oct-2026, API 0.0.75) =====
//
// Pedido del cliente (Jimmy, 12-oct): «agregar en la categoría de gastos: Comisariato;
// entraría en [la columna OTROS de costos directos] en el balance del
// avión». Snacks, bebidas y comisariato para los PASAJEROS: hasta hoy se
// capturaba como «Otros gastos VuelaTour» y nunca llegaba al avión. Es gasto
// DIRECTO del vuelo con el MISMO destino que COMIDA (tabla canónica idéntica
// en API, panel y app): en el balance del avión cae en la columna OTROS de
// costos directos (junto al FBO) y en el reparto resta como DIRECTO. Exige
// vuelo SOLO al piloto (la oficina la captura suelta y la liga después: sin
// vuelo queda como pendiente de avión, como una COMIDA suelta); no es de
// empresa ni repartible, y la IA SÍ la propone (snacks/bebidas de pasajeros)
// y la aplica al crear como cualquier directa. Nada de esto vive aquí: el
// panel solo etiqueta, ofrece y explica.

/** Código de «Comisariato» (espejo del enum del API, 13-oct-2026). */
export const CATEGORIA_COMISARIATO = "COMISARIATO";

/** Código de «Otros gastos directos del vuelo» (espejo del enum del API,
 *  20-oct-2026, invariante 97): columna OTROS de la fila del vuelo, como
 *  Comisariato. */
export const CATEGORIA_OTROS_DIRECTOS_VUELO = "OTROS_DIRECTOS_VUELO";

/** Columna OTROS de costos directos del vuelo: Comisariato y los otros
 *  directos (20-oct-2026). */
const CATEGORIAS_COLUMNA_OTROS: ReadonlySet<string> = new Set([
  CATEGORIA_COMISARIATO,
  CATEGORIA_OTROS_DIRECTOS_VUELO,
]);

/** Cuadro de ayuda de «Comisariato» (alta y Verificar / editar). */
export const AYUDA_COMISARIATO =
  "Snacks, bebidas y comisariato para los PASAJEROS. Es gasto directo del vuelo: en el balance del avión cae en la columna OTROS de costos directos (junto al FBO) y resta en el reparto a socios. La comida de la tripulación va en «Comida». Sin vuelo queda como pendiente de avión hasta ligarlo.";

// ===== Comisión del vendedor como gasto (28-sep-2026) =====
//
// Pedido del cliente: «¿cómo registro el pago de la comisión a Saab para que
// aparezca en otros movimientos? Si lo capturo como "Otros gastos VuelaTour"
// me lo manda a la hoja otros gastos y queda duplicado». El pago real al
// vendedor se captura LIGADO AL VUELO y en «otros movimientos» del Balance
// general se aparea con la comisión cobrada al cliente; sin pago capturado
// esa fila no lleva egreso (ningún libro provisiona el pago al vendedor desde
// el API 0.0.74). No va a «otros gastos» ni se reparte. Espejo del API
// (`common/categoria-gasto.util.ts`, invariantes 31 y 61) y de la app.
//
// ===== Dos categorías (13-oct-2026, API 0.0.74, invariante 61) =====
//
// Pedido del cliente (13-oct-2026, 17:10): «aqui en las categorias
// necesitamos una opcion que sea Comision del vendedor pero que esa opcion
// si se cargue al balance del avión, y dejamos el otro que se va a balance
// de vuelatour para tener esas 2 opciones».
//  - `COMISION_VENDEDOR` = «Comisión del vendedor (VuelaTour)»: la paga
//    SIEMPRE VuelaTour (egreso en «otros movimientos»); nunca es costo del
//    avión.
//  - `COMISION_VENDEDOR_AVION` = «Comisión del vendedor (avión)»: la carga el
//    avión del vuelo en la columna COMISIONES de su balance y en el reparto a
//    sus socios, en el mes del vuelo (con el vuelo completado o cancelado con
//    cobros retenidos; antes de eso, o en un vuelo sin avión de la flota, la
//    paga VuelaTour y el balance lo avisa). En «otros movimientos» sale con
//    egreso $0.00 «a cargo del avión».
// Reglas comunes: vuelo obligatorio a TODOS los roles, no repartibles, la IA
// no las sugiere ni las pisa, y reclasificar entre las dos en «Verificar /
// editar» se puede aunque el gasto esté conciliado. TODA comparación es
// EXACTA (`Set.has` / `===`): 'COMISION_VENDEDOR' es PREFIJO de
// 'COMISION_VENDEDOR_AVION' ⇒ prohibido `startsWith`/`includes`/regex sin
// ancla (el test lo vigila). El panel no calcula dinero: solo etiqueta,
// candado y ayuda.

/** «Comisión del vendedor (VuelaTour)» (espejo de `CATEGORIA_PAGO_VENDEDOR` del API). */
export const CATEGORIA_PAGO_VENDEDOR = "COMISION_VENDEDOR";

/** «Comisión del vendedor (avión)» (espejo de `CATEGORIA_PAGO_VENDEDOR_AVION` del API). */
export const CATEGORIA_PAGO_VENDEDOR_AVION = "COMISION_VENDEDOR_AVION";

/** Las DOS categorías del pago al vendedor (espejo de
 *  `CATEGORIAS_GASTO_PAGO_VENDEDOR` del API). */
export const CATEGORIAS_PAGO_VENDEDOR: ReadonlySet<string> = new Set([
  CATEGORIA_PAGO_VENDEDOR,
  CATEGORIA_PAGO_VENDEDOR_AVION,
]);

/** ¿Es un pago al vendedor de CUALQUIERA de las dos categorías? Igualdad
 *  EXACTA: 'COMISION_VENDEDOR_AVIONX' o 'comision_vendedor' ⇒ false. */
export function esCategoriaPagoVendedor(cat: string | null | undefined): boolean {
  return !!cat && CATEGORIAS_PAGO_VENDEDOR.has(cat);
}

/**
 * Vuelo obligatorio para TODOS los roles, la oficina incluida (espejo de
 * `categoriaExigeVueloSiempre` del API: 400 `GASTO_REQUIERE_VUELO` en alta y
 * edición; respaldo en BD con los CHECK `gasto_comision_vendedor_exige_vuelo`
 * y `gasto_comision_vendedor_avion_exige_vuelo`). Las DOS del pago al
 * vendedor.
 */
export function categoriaExigeVueloSiempre(cat: string | null | undefined): boolean {
  return esCategoriaPagoVendedor(cat);
}

/** Mismo texto que el 400 `GASTO_REQUIERE_VUELO` del API, con la etiqueta de
 *  SU categoría («(VuelaTour)» o «(avión)»). */
export function mensajeGastoRequiereVuelo(categoria: string): string {
  return `Esta categoría es del vuelo: elige el vuelo. «${categoriaGastoLabel(categoria)}» siempre se registra con el vuelo al que pertenece.`;
}

/** El 400 de «Comisión del vendedor (VuelaTour)» (nombre de siempre). */
export const MSG_GASTO_REQUIERE_VUELO_COMISION = mensajeGastoRequiereVuelo(CATEGORIA_PAGO_VENDEDOR);

/** Ayuda de «Comisión del vendedor (VuelaTour)» (alta y verificación). */
export const AYUDA_COMISION_VENDEDOR =
  "La paga VuelaTour. Se aparea con la comisión cobrada al cliente en la hoja «otros movimientos» del balance general: mientras no se capture, esa fila no lleva egreso (ahí no se provisiona nada); si pagas de menos o de más, la hoja lo marca con «faltan» o «excede». Registra un gasto por vuelo: si una sola transferencia paga varios vuelos (o los aviones de un grupo), captura un gasto por vuelo con su parte. No es costo del avión. Si el pago le toca al avión, usa «Comisión del vendedor (avión)». No la captures como «Otros gastos VuelaTour»: quedaría duplicada.";

/** Ayuda de «Comisión del vendedor (avión)» (alta y verificación). */
export const AYUDA_COMISION_VENDEDOR_AVION =
  "La carga el avión del vuelo: resta en la columna COMISIONES de su balance y en el reparto a sus socios, en el mes del vuelo (en un vuelo de varios aviones, cada uno su parte, como la venta). En la hoja «otros movimientos» del balance general sale junto a la comisión cobrada al cliente —que sigue siendo de VuelaTour— con egreso $0.00 «a cargo del avión». Solo la carga el avión con el vuelo completado (o cancelado con cobros retenidos); antes, o en un vuelo sin avión de la flota, la paga VuelaTour y el balance lo avisa. Registra un gasto por vuelo. Si el pago le toca a VuelaTour, usa «Comisión del vendedor (VuelaTour)». No la captures como «Otros gastos VuelaTour»: quedaría duplicada.";

/** SOLO en «Verificar / editar»: cómo cambiar quién paga. */
export const AYUDA_RECLASIFICAR_COMISION =
  "¿Cambió quién la paga? Cambia aquí la categoría entre «Comisión del vendedor (VuelaTour)» y «Comisión del vendedor (avión)»: se puede aunque el gasto ya esté conciliado (el banco no se toca). El balance y el reparto del mes del vuelo cambian al regenerarlos.";

/**
 * Cuadro de ayuda de la categoría elegida (alta y verificación): el título es
 * SU etiqueta y el texto dice quién la paga y cuándo usar la otra. null =
 * no es pago al vendedor (no se pinta el cuadro).
 */
export function ayudaComisionVendedor(
  categoria: string | null | undefined,
): { titulo: string; texto: string } | null {
  if (categoria === CATEGORIA_PAGO_VENDEDOR) {
    return { titulo: categoriaGastoLabel(categoria), texto: AYUDA_COMISION_VENDEDOR };
  }
  if (categoria === CATEGORIA_PAGO_VENDEDOR_AVION) {
    return { titulo: categoriaGastoLabel(categoria), texto: AYUDA_COMISION_VENDEDOR_AVION };
  }
  return null;
}

/** Hint del campo «Vuelo» cuando la categoría lo exige (vale para las dos). */
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

/** La comisión (cualquiera de las dos) se paga días o semanas DESPUÉS del
 *  vuelo: 90 días hacia atrás (el API admite `limit ≤ 500` en /v1/flights). */
export const VENTANA_VUELOS_COMISION: VentanaVuelosCercanos = {
  diasAtras: 90,
  diasAdelante: 15,
  limit: 500,
};

/** null = ok; texto = bloquear el guardado (antes de subir nada), con el
 *  mismo texto que el 400 del API para SU categoría. */
export function errorVueloObligatorio(
  categoria: string,
  vueloId: string | null | undefined,
): string | null {
  if (!categoriaExigeVueloSiempre(categoria)) return null;
  return vueloId ? null : mensajeGastoRequiereVuelo(categoria);
}

/**
 * La IA jamás pisa una categoría que no sabe sugerir: si el humano eligió
 * cualquiera de las dos «Comisión del vendedor», la lectura del ticket (que
 * llega segundos después) no la cambia. Tampoco PROPONE ninguna de las dos
 * (pyservices no las sugiere; si algún día llegara, un pago al vendedor —y
 * quién lo paga— lo decide la oficina, no la IA).
 */
export function iaPuedeCambiarCategoria(
  actual: string,
  sugerida: string | null | undefined,
): boolean {
  if (!sugerida) return false;
  if (esCategoriaPagoVendedor(actual)) return false;
  return !esCategoriaPagoVendedor(sugerida);
}

/**
 * Renglón del tablero de Gastos con los pagos «Comisión del vendedor
 * (avión)» del periodo (API 0.0.74: `resumen.gastos_comision_vendedor_avion_usd`,
 * por fecha del gasto; van dentro de «Gastos totales» y fuera de «Gastos por
 * avión» y del costo por hora). null = no se pinta (0, o un API previo que
 * todavía no manda la llave). El panel solo FORMATEA la cifra del API.
 */
export function textoTableroComisionVendedorAvion(
  usd: number | null | undefined,
): string | null {
  if (usd == null || !(usd > 0)) return null;
  return `${fmtUsd(usd)} en comisiones del vendedor a cargo de los aviones (restan en la columna COMISIONES de su balance y en el reparto; no entran al costo por hora).`;
}

/** Sublabel de «Comisiones (banco + vendedor)» en la cascada del reparto por
 *  avión (`ingresos.comisiones_venta_usd`). */
export const SUBLABEL_COMISIONES_REPARTO = `parte del avión de la comisión bancaria (regla sep-2026) + pagos «${categoriaGastoLabel(CATEGORIA_PAGO_VENDEDOR_AVION)}»`;

/**
 * Quién paga al vendedor (13-oct-2026, invariantes 50 y 61 del API) — para
 * los tooltips de «Otros ingresos VuelaTour» del reparto (KPI de la flota y
 * card por avión). Lo COBRADO al cliente por la comisión es ingreso de
 * VuelaTour; el PAGO es solo el gasto real capturado, en una de las dos
 * categorías: la «(VuelaTour)» egresa en «otros movimientos» y la «(avión)»
 * resta en las Comisiones del avión. Antes decía «su pago al vendedor,
 * egreso de VuelaTour»: desfasado desde las dos categorías.
 */
export const NOTA_PAGO_VENDEDOR_REPARTO = `Lo cobrado al cliente por la comisión del vendedor es ingreso de VuelaTour; el pago al vendedor es el gasto real capturado: «${categoriaGastoLabel(CATEGORIA_PAGO_VENDEDOR)}» egresa en «otros movimientos» del Balance general y «${categoriaGastoLabel(CATEGORIA_PAGO_VENDEDOR_AVION)}» resta en «Comisiones» del avión (sin pago capturado no se resta nada).`;

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
  "PAQUETERIA",
]);

/**
 * Categorías que NUNCA son «pendiente de asignarle avión» — ESPEJO EXACTO de
 * `CATEGORIAS_GASTO_SIN_AVION` del API (`common/categoria-gasto.util.ts`),
 * la fuente única de la bandeja `?pendientes=true`, de «Sugerir
 * asignaciones», de la alerta diaria y del pre-cierre: las de EMPRESA,
 * INDIRECTO (sin avión por diseño), PERSONAL_DUENO (jamás lleva avión) y la
 * «Comisión del vendedor (VuelaTour)». `COMISION_VENDEDOR_AVION` NO está, a
 * propósito, igual que en el API (una «(avión)» sin avión SÍ sale en la
 * bandeja). La columna «Avión · vuelo» de Gastos pinta «Falta avión» con
 * esta regla, así su conteo es el de la pestaña «Pendientes» (14-oct-2026).
 * Comparaciones SOLO con `Set.has` (el prefijo COMISION_VENDEDOR lo vigila
 * el guardián de las pruebas). La paridad con el API la congela la prueba.
 */
export const CATEGORIAS_SIN_AVION: ReadonlySet<string> = new Set([
  ...CATEGORIAS_EMPRESA,
  "INDIRECTO",
  "PERSONAL_DUENO",
  CATEGORIA_PAGO_VENDEDOR,
]);

/** ¿La categoría necesita avión? (lo contrario de `CATEGORIAS_SIN_AVION`, igualdad exacta). */
export function categoriaLlevaAvion(categoria: string): boolean {
  return !CATEGORIAS_SIN_AVION.has(categoria);
}

/** «A», «A y B», «A, B y C» (textos del tablero). */
function unirTextos(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * Renglón del tablero de Gastos con `resumen.gastos_empresa_usd` (13-oct-2026).
 * Decía solo «(remanentes de repartos…)» y se quedaba corto: el API suma ahí
 * TODA categoría de empresa (OTRO, NOMINA, GASOLINA, FIJO, VISITA, PAQUETERIA, aunque
 * traigan avión sellado), la «Comisión del vendedor (VuelaTour)» (la paga
 * VuelaTour) y los remanentes de los repartos manuales. La «(avión)» va en su
 * propio renglón (`textoTableroComisionVendedorAvion`). null = no se pinta
 * (0 o un API previo sin la llave). El panel solo FORMATEA la cifra del API.
 */
export function textoTableroGastosEmpresa(usd: number | null | undefined): string | null {
  if (usd == null || !(usd > 0)) return null;
  const empresa = unirTextos([...CATEGORIAS_EMPRESA].map(categoriaGastoLabel));
  return `${fmtUsd(usd)} en gastos de la empresa VuelaTour: categorías de empresa (${empresa}), «${categoriaGastoLabel(CATEGORIA_PAGO_VENDEDOR)}» y remanentes de repartos. No se imputan a aeronaves.`;
}

const HOJA_OTROS_GASTOS_SIN_NADA =
  "Balance general VuelaTour · Otros gastos (repártelo desde la pantalla Otros gastos para cargarlo a aviones)";

/**
 * Destino de un gasto «Nómina» (16-oct-2026, API 0.0.90, invariante 91): la
 * nómina vive en su módulo y SOLO repartida entre aviones entra a un balance
 * (el del avión y, por él, el general). Sin reparto ya no va a la hoja «otros
 * gastos» del Balance general.
 */
export const HOJA_NOMINA_SIN_REPARTIR =
  "Nómina (módulo Nómina): no entra a ningún balance hasta repartirla entre aviones desde Nómina";

/**
 * "¿A qué hoja del balance cae este gasto CON LO ELEGIDO?" — precisión
 * dinámica (categoría + vuelo + avión) para la segunda línea del hint bajo el
 * select de categoría (alta y verificación); la primera línea es el destino
 * por default (destinoPorDefecto). Refleja las reglas del API (balance por
 * avión + Balance general). Orden de evaluación:
 * - PERSONAL_DUENO → fuera de todos los balances;
 * - COMISION_VENDEDOR («(VuelaTour)») → «otros movimientos» (es el pago al
 *   vendedor; sin él esa fila no lleva egreso: desde el 12-oct-2026 ahí no se
 *   provisiona);
 * - COMISION_VENDEDOR_AVION («(avión)», 13-oct-2026) → columna COMISIONES
 *   del balance del avión y reparto a socios, en el mes del vuelo (en «otros
 *   movimientos» sale con egreso $0.00 «a cargo del avión»);
 * - NOMINA (16-oct-2026, API 0.0.90) → el módulo Nómina: sin reparto no
 *   entra a ningún balance (`HOJA_NOMINA_SIN_REPARTIR`);
 * - EMPRESA (OTRO/GASOLINA/FIJO/VISITA/PAQUETERIA) → SIEMPRE «otros gastos» del
 *   general (desde el 11-sep-2026); el vuelo/avión quedan de referencia —
 *   antes decía «hoja del vuelo» y justo esa pista confundió al cliente
 *   (28-sep-2026: capturó la comisión como «Otros gastos VuelaTour»);
 * - con vuelo: TUAS → «otros movimientos» (apareado con las TUAS cobradas;
 *   en la hoja del vuelo solo es nota); GAS → Combustible (por avión y mes);
 *   PERMISO → Permisos; COMISARIATO (13-oct-2026) y OTROS_DIRECTOS_VUELO
 *   (20-oct-2026) → la hoja del vuelo, columna OTROS de costos directos; lo
 *   demás → la hoja de ese vuelo;
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
    return "Balance general VuelaTour · Otros movimientos (el pago al vendedor, apareado con la comisión cobrada; sin él esa fila no lleva egreso)";
  }
  if (categoria === CATEGORIA_PAGO_VENDEDOR_AVION) {
    return "Balance del avión · columna COMISIONES y reparto a socios, en el mes del vuelo (con el vuelo completado; en «otros movimientos» sale con egreso $0.00 «a cargo del avión»)";
  }
  // Nómina (16-oct-2026, API 0.0.90, invariante 91): vive en su módulo y no
  // entra a ningún balance hasta repartirla; ya no va a «otros gastos».
  if (categoria === "NOMINA") return HOJA_NOMINA_SIN_REPARTIR;
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
    // Comisariato (13-oct-2026) y otros directos (20-oct-2026): directas del
    // vuelo, pero el balance las pinta en la columna OTROS de costos directos
    // (no en OPERACIONES).
    if (CATEGORIAS_COLUMNA_OTROS.has(categoria)) {
      return "Balance del avión · hoja del vuelo (columna OTROS de costos directos, junto al FBO)";
    }
    return "Balance del avión · hoja del vuelo";
  }
  if (!tieneAvion) return HOJA_OTROS_GASTOS_SIN_NADA;
  if (categoria === "GAS") return "Balance del avión · Combustible";
  if (categoria === "PERMISO") return "Balance del avión · Permisos";
  // REFACCION manual incluida: la hoja Refacciones es solo bodega.
  return "Balance del avión · Gastos Indirectos";
}
