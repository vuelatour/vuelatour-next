/**
 * FUENTE ÚNICA de etiquetas es-MX para los medios de pago de gasto (mismo
 * patrón que categorias-gasto.ts). Antes vivían duplicadas en
 * expenses-table.tsx y flight-gastos-table.tsx (módulos "use client", que un
 * server component no puede importar): toda pantalla nueva consume de aquí.
 */
export const MEDIO_PAGO_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CORP: "Tarjeta corporativa",
  TRANSFERENCIA: "Transferencia",
  // Plataforma de pago de servicios aeroportuarios (recibos Paywise).
  PAYWISE: "Paywise",
  // Cargo automático a la cuenta (suscripción, seguro, servicio): bancario,
  // se concilia como transferencia (13-oct-2026, API 0.0.75).
  DOMICILIADO: "Pago domiciliado",
  PERSONAL_PABLO: "Personal Pablo",
  PERSONAL_ALE: "Personal Ale",
  // Cargo contable de inventario (salida de cardex): nunca toca el banco.
  BODEGA: "Bodega (inventario)",
  // Efectivo de la empresa que NO sale de ningún fondo de caja chica
  // (20-oct-2026, API 0.0.99, invariante 97): no bancario y solo oficina.
  EFECTIVO_EMPRESA: "Efectivo de la empresa (no de fondo)",
};

/** Etiqueta legible de un medio de pago, con fallback al código crudo. */
export function medioPagoLabel(medio: string): string {
  return MEDIO_PAGO_LABELS[medio] ?? medio;
}

/** Versión CORTA de las etiquetas largas (renglón bajo el monto en Gastos). */
const MEDIO_PAGO_CORTO: Record<string, string> = {
  TARJETA_CORP: "Tarjeta",
  DOMICILIADO: "Domiciliado",
  BODEGA: "Bodega",
  EFECTIVO_EMPRESA: "Efectivo empresa",
};

/**
 * Medio de pago CORTO para el renglón bajo el monto en la tabla de Gastos
 * (14-oct-2026, una sola tabla: la columna «Pago» desapareció). La
 * terminación va SOLO con tarjeta corporativa, con la convención de
 * Conciliación («Tarjeta ****2865»). `title` = la etiqueta larga con la misma
 * terminación («Tarjeta corporativa ****2865»). Sin medio ⇒ null; un medio
 * que el panel no conoce ⇒ su código en los dos.
 */
export function textoPagoCorto(
  medio: string | null | undefined,
  terminacion?: string | null,
): { texto: string; title: string } | null {
  if (!medio) return null;
  const largo = medioPagoLabel(medio);
  const corto = MEDIO_PAGO_CORTO[medio] ?? largo;
  const term = medio === "TARJETA_CORP" ? (terminacion ?? "").trim() : "";
  const cola = term ? ` ****${term}` : "";
  return { texto: `${corto}${cola}`, title: `${largo}${cola}` };
}

/**
 * Medios que la oficina puede ELEGIR al capturar un gasto nuevo, en el orden
 * del selector. BODEGA queda fuera: lo pone solo la salida de inventario.
 * Tupla `as const` para que el schema zod derive su enum de aquí (una sola
 * lista que gobierna UI y validación).
 *
 * REGLA DEL CLIENTE (3-sep-2026): el medio de pago NO tiene valor por
 * defecto — el selector abre en blanco hasta que alguien lo elige (el default
 * viajaba en silencio cuando nadie tocaba el campo). Ni la app ni el panel
 * preseleccionan; el API lo exige (NOT NULL sin default).
 *
 * «Pago domiciliado» (13-oct-2026, API 0.0.75 + migración 20261013000009):
 * justo después de «Transferencia» — es la otra forma en que el dinero sale
 * de la cuenta sin tarjeta. Solo lo registra la oficina (el API responde 400
 * `MEDIO_SOLO_OFICINA` a piloto/mecánico/visitante).
 *
 * «Efectivo de la empresa (no de fondo)» (20-oct-2026, API 0.0.99 +
 * migración 20261020000003): justo después de «Efectivo». Es el efectivo que
 * NO sale de ningún fondo de caja chica (no afecta la caja de quien lo
 * registra); también solo oficina.
 */
export const MEDIOS_CAPTURA_VALUES = [
  "TRANSFERENCIA",
  "DOMICILIADO",
  "PAYWISE",
  "EFECTIVO",
  "EFECTIVO_EMPRESA",
  "TARJETA_CORP",
  "PERSONAL_PABLO",
  "PERSONAL_ALE",
] as const;

export type MedioCaptura = (typeof MEDIOS_CAPTURA_VALUES)[number];

/** Opción de selector (SearchableSelect) para un medio de pago. */
export function opcionMedioPago(value: string): { value: string; label: string } {
  return { value, label: medioPagoLabel(value) };
}

/** Opciones del selector de ALTA de gasto (panel). */
export const MEDIOS_CAPTURA = MEDIOS_CAPTURA_VALUES.map(opcionMedioPago);

/** Opciones del selector de VERIFICACIÓN: los de captura + BODEGA (un gasto
 *  nacido de una salida de inventario se verifica sin perder su medio). */
export const MEDIOS_VERIFICACION = [...MEDIOS_CAPTURA_VALUES, "BODEGA"].map(
  opcionMedioPago,
);

/**
 * ¿El API acepta este medio en el alta y en el PATCH de un gasto? Son
 * EXACTAMENTE los de captura: el enum `MedioPago` de su DTO no trae BODEGA
 * (lo pone solo la salida de inventario). Verificación del lote 2
 * (14-oct-2026): «Verificar / editar» mandaba SIEMPRE el medio del
 * formulario y en los 20 gastos BODEGA de prod el PATCH rebotaba con el 400
 * en inglés «medio_pago must be one of the following values: …» — no se
 * podían verificar ni editar. El test espejo compara esta lista con el enum
 * del DTO del API (repo hermano).
 */
export function medioPagoAceptadoPorApi(medio: string | null | undefined): boolean {
  return (MEDIOS_CAPTURA_VALUES as readonly string[]).includes(medio ?? "");
}

/**
 * Opciones del selector de «Verificar / editar» para ESTE gasto: los de
 * captura y, SOLO si el gasto ya es de bodega, «Bodega (inventario)» para no
 * perder su medio. A un gasto que no es de bodega no se le ofrece: el API lo
 * rechazaría (y el PATCH lo omite, así que elegirlo no cambiaría nada).
 */
export function opcionesMedioVerificacion(
  actual: string | null | undefined,
): { value: string; label: string }[] {
  return actual === "BODEGA" ? MEDIOS_VERIFICACION : MEDIOS_CAPTURA;
}

/** Código del «Pago domiciliado» (espejo de `MedioPago.DOMICILIADO` del API). */
export const MEDIO_DOMICILIADO = "DOMICILIADO";

/** Hint bajo el selector cuando se elige «Pago domiciliado» (alta y verificación). */
export const AYUDA_MEDIO_DOMICILIADO =
  "Cargo automático a la cuenta (suscripción, seguro, servicio). Se concilia con el cargo del banco como una transferencia; no lleva tarjeta.";

/** Código del «Efectivo de la empresa (no de fondo)» (espejo de
 *  `MedioPago.EFECTIVO_EMPRESA` del API, 20-oct-2026). */
export const MEDIO_EFECTIVO_EMPRESA = "EFECTIVO_EMPRESA";

/** Hint bajo el selector cuando se elige «Efectivo de la empresa». */
export const AYUDA_MEDIO_EFECTIVO_EMPRESA =
  "Efectivo de la empresa que no sale de ningún fondo de caja chica: no afecta la caja de quien lo registra. Si se pagó con el efectivo de un fondo, elige «Efectivo».";

/** Ayuda del medio elegido («Pago domiciliado» o «Efectivo de la empresa»);
 *  null = sin hint. */
export function ayudaMedioPago(medio: string | null | undefined): string | null {
  if (medio === MEDIO_DOMICILIADO) return AYUDA_MEDIO_DOMICILIADO;
  if (medio === MEDIO_EFECTIVO_EMPRESA) return AYUDA_MEDIO_EFECTIVO_EMPRESA;
  return null;
}
