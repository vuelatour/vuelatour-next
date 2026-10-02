/**
 * PAGOS A SOCIOS del reparto de utilidades — FUENTE ÚNICA PURA del panel
 * (1-oct-2026, API 0.0.49). Sin React ni red.
 *
 * Pedido del cliente: «cada socio debe recibir los pagos de lo que generó el
 * avión en el mes … Mauricio Roque, %, Monto de utilidad, estatus de si ya se
 * pagó o aún no, con cuánto se le pagó, cuándo y quién se lo entregó … para
 * que no se nos escape ninguno».
 *
 * Qué vive aquí: el mes del periodo (espejo de `mesDePeriodo`/`rangoDeMes`
 * del API), etiquetas y COLORES del estatus, textos (avisos, confirmaciones,
 * errores por `code`), roles, validación del formulario y los cuerpos que
 * viajan al API, la unión del reparto con los renglones de pagos y la
 * tolerancia al API previo.
 *
 * Qué NO vive aquí: el dinero. Utilidad, pagado, pendiente, exceso, estado y
 * el equivalente en USD de un pago en pesos los calcula el API.
 * `estadoPagoSocio` es un ESPEJO solo para pintar cuando el API manda un
 * estado que el panel no conoce.
 */

import { fmtDateTime, fmtDateOnly } from "@/lib/datetime";
import { fmtMonto, fmtTc, fmtUsd } from "@/lib/format";
import { esDiaValido, esUuid } from "@/lib/admin/url-params";
import type { RepartoSocio } from "@/types/profit-sharing";
import type {
  CrearPagoSocioPayload,
  DetalleExcesoPago,
  EstadoPagoSocio,
  FilaPagoSocio,
  MetodoPagoSocio,
  MonedaPagoSocio,
  PagoSocio,
  PatchPagoSocioPayload,
  PreCierreSocioPendiente,
  RepartoPagosRespuesta,
  ResumenPagoSocio,
} from "@/types/reparto-pagos";

// =============================================================================
// Mes del periodo (espejo del API: reparto-pago.util.ts)
// =============================================================================

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const MES_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DIA_ESTRICTO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ¿`YYYY-MM` válido? */
export function esMesValido(mes: string | null | undefined): mes is string {
  return typeof mes === "string" && MES_RE.test(mes);
}

/** Último día del mes (aritmética UTC: sin zonas horarias). */
function ultimoDia(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** `YYYY-MM` ⇒ del día 1 al último día. Mes inválido ⇒ null. */
export function rangoDeMes(mes: string): { desde: string; hasta: string } | null {
  const m = esMesValido(mes) ? MES_RE.exec(mes) : null;
  if (!m) return null;
  const dd = String(ultimoDia(Number(m[1]), Number(m[2]))).padStart(2, "0");
  return { desde: `${mes}-01`, hasta: `${mes}-${dd}` };
}

/**
 * `YYYY-MM` si el periodo es EXACTAMENTE un mes calendario (desde = día 1,
 * hasta = su último día); si no, null. El mes en curso cortado en HOY NO es
 * un mes completo: los pagos se registran sobre un mes cerrado.
 */
export function mesDePeriodo(
  desde: string | null | undefined,
  hasta: string | null | undefined,
): string | null {
  if (!desde || !hasta) return null;
  if (!DIA_ESTRICTO_RE.test(desde) || !DIA_ESTRICTO_RE.test(hasta)) return null;
  if (!esDiaValido(desde) || !esDiaValido(hasta)) return null;
  const mes = desde.slice(0, 7);
  const rango = rangoDeMes(mes);
  if (!rango) return null;
  return rango.desde === desde && rango.hasta === hasta ? mes : null;
}

/** Mes anterior a un día `YYYY-MM-DD` (hoy Cancún) ⇒ `YYYY-MM`. */
export function mesAnterior(hoy: string): string | null {
  if (!esDiaValido(hoy)) return null;
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const a = mes === 1 ? anio - 1 : anio;
  const m = mes === 1 ? 12 : mes - 1;
  return `${a}-${String(m).padStart(2, "0")}`;
}

/** Atajo «Mes pasado» (el cliente cierra septiembre en octubre). */
export function rangoMesPasado(hoy: string): { desde: string; hasta: string } | null {
  const mes = mesAnterior(hoy);
  return mes ? rangoDeMes(mes) : null;
}

/** `2026-09` ⇒ «Septiembre 2026». */
export function etiquetaMes(mes: string): string {
  const m = esMesValido(mes) ? MES_RE.exec(mes) : null;
  if (!m) return mes;
  const nombre = MESES[Number(m[2]) - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${m[1]}`;
}

/** Título de la sección consolidada. */
export function tituloSeccionPagos(mes: string): string {
  return `Pagos a socios · ${etiquetaMes(mes)}`;
}

// =============================================================================
// Estatus (el estado VIENE del API; esto solo pinta)
// =============================================================================

/** Tolerancia del API (como los cobros): $1.00 USD. */
export const TOLERANCIA_PAGO_USD = 1;

const centavos = (n: number) => Math.round((Number(n) || 0) * 100);

/**
 * ESPEJO de `estadoPagoSocio` del API, SOLO para pintar un renglón cuyo
 * `estado` no reconoce el panel. Jamás se usa para decidir dinero.
 *  - utilidad ≤ 0 ⇒ SIN_UTILIDAD;
 *  - pagado ≥ utilidad − $1.00 ⇒ PAGADO;
 *  - pagado > 0 ⇒ PARCIAL; si no, PENDIENTE.
 * `exceso_usd` = pagado − max(utilidad, 0) cuando pasa de $1.00 (si no, 0).
 */
export function estadoPagoSocio(
  utilidadUsd: number,
  pagadoUsd: number,
): { estado: EstadoPagoSocio; exceso_usd: number } {
  const u = centavos(utilidadUsd);
  const p = centavos(pagadoUsd);
  const tol = TOLERANCIA_PAGO_USD * 100;
  // Contra 0 cuando no hay utilidad (espejo EXACTO de `reparto-pago.util.ts`
  // del API): con utilidad −100 y pagado 50, el exceso es 50, no 150.
  const excesoC = p - Math.max(u, 0);
  const exceso = excesoC > tol ? excesoC / 100 : 0;
  let estado: EstadoPagoSocio;
  if (u <= 0) estado = "SIN_UTILIDAD";
  else if (p >= u - tol) estado = "PAGADO";
  else if (p > 0) estado = "PARCIAL";
  else estado = "PENDIENTE";
  return { estado, exceso_usd: exceso };
}

const CLASE_AMBAR =
  "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400";
const CLASE_VERDE =
  "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
const CLASE_GRIS = "border-border bg-muted text-muted-foreground";

export interface EstiloEstadoPago {
  etiqueta: string;
  /** Clases del badge (fondo, texto y borde). */
  clase: string;
  /** Tono para pruebas y para quien necesite el color sin el badge. */
  tono: "ambar" | "verde" | "gris";
  /** Texto del `title`. */
  titulo: string;
}

export const ESTADOS_PAGO_SOCIO: Record<EstadoPagoSocio, EstiloEstadoPago> = {
  PENDIENTE: {
    etiqueta: "Pendiente",
    clase: CLASE_AMBAR,
    tono: "ambar",
    titulo: "Aún no se le paga nada de su utilidad del mes.",
  },
  PARCIAL: {
    etiqueta: "Pago parcial",
    clase: CLASE_AMBAR,
    tono: "ambar",
    titulo: "Ya se le pagó una parte; falta el resto.",
  },
  PAGADO: {
    etiqueta: "Pagado",
    clase: CLASE_VERDE,
    tono: "verde",
    titulo: "Su utilidad del mes ya está pagada (tolerancia de $1 USD).",
  },
  SIN_UTILIDAD: {
    etiqueta: "Sin utilidad",
    clase: CLASE_GRIS,
    tono: "gris",
    titulo: "El avión no dejó utilidad este mes: no hay nada que pagar.",
  },
};

function esEstadoConocido(e: unknown): e is EstadoPagoSocio {
  return typeof e === "string" && e in ESTADOS_PAGO_SOCIO;
}

/**
 * Estilo del estatus de un renglón: el `estado` del API manda; uno que el
 * panel no conoce se pinta con el espejo (nunca un badge en blanco).
 */
export function estiloEstadoPago(
  estado: string | null | undefined,
  utilidadUsd: number,
  pagadoUsd: number,
): EstiloEstadoPago & { estado: EstadoPagoSocio } {
  const e = esEstadoConocido(estado) ? estado : estadoPagoSocio(utilidadUsd, pagadoUsd).estado;
  return { estado: e, ...ESTADOS_PAGO_SOCIO[e] };
}

/** ¿Cuenta como pendiente (pendiente o parcial)? */
export function estaPendiente(estado: string | null | undefined): boolean {
  return estado === "PENDIENTE" || estado === "PARCIAL";
}

// =============================================================================
// Textos
// =============================================================================

export const TEXTO_SOLO_MES_COMPLETO =
  "Los pagos a socios se registran por mes completo: elige un mes en el selector.";

export const TEXTO_PAGOS_NO_DISPONIBLES = "Disponible cuando se actualice el servidor.";

export const TEXTO_ERROR_CARGA_PAGOS =
  "No se pudieron cargar los pagos a socios. Recarga la página para reintentar.";

export const TEXTO_NO_VIGENTE =
  "Ya no es socio vigente de este avión en el mes, pero tiene pagos registrados (aquí no se le registran pagos nuevos).";

export const TEXTO_SIN_PAGOS = "Sin pagos registrados en el mes.";

export const ETIQUETA_REGISTRAR_PAGO = "Registrar pago";

export const TEXTO_NO_REGISTRA_NO_VIGENTE =
  "Ya no es socio vigente de este avión: aquí no se le registran pagos nuevos.";

export const TEXTO_NO_REGISTRA_SIN_UTILIDAD =
  "Sin utilidad en el mes: no hay pago que registrar.";

/**
 * Por qué NO se ofrece «Registrar pago» en un renglón (null = sí se ofrece).
 * Espejo de los candados del API: socio no vigente ⇒ 400
 * `SOCIO_NO_ES_DE_LA_AERONAVE`; sin utilidad ⇒ 409 `SIN_UTILIDAD_QUE_PAGAR`
 * (también con `aceptar_exceso`). Un renglón PAGADO sí se ofrece: un pago
 * de más se confirma, no se bloquea.
 */
export function motivoNoRegistrarPago(
  fila: Pick<FilaPagoSocio, "estado" | "utilidad_usd" | "pagado_usd">,
  vigente: boolean,
): string | null {
  if (!vigente) return TEXTO_NO_REGISTRA_NO_VIGENTE;
  const { estado } = estiloEstadoPago(fila.estado, fila.utilidad_usd, fila.pagado_usd);
  return estado === "SIN_UTILIDAD" ? TEXTO_NO_REGISTRA_SIN_UTILIDAD : null;
}

/** Botón de la sección cuando el periodo no es un mes completo. */
export function textoVerMes(mes: string): string {
  return `Ver ${etiquetaMes(mes)}`;
}

export const AYUDA_SECCION_PAGOS =
  "Utilidad de cada socio en el mes (todas sus aeronaves), lo que ya se le pagó y lo que falta. Los pagos se registran en la tarjeta de cada avión.";

/** «La utilidad cambió después del último pago…» (solo si el API lo marca). */
export function textoUtilidadCambio(fila: Pick<FilaPagoSocio, "utilidad_difiere" | "utilidad_al_pagar_usd" | "utilidad_usd">): string | null {
  if (!fila.utilidad_difiere || fila.utilidad_al_pagar_usd == null) return null;
  return `La utilidad del mes cambió después del último pago: era ${fmtUsd(
    fila.utilidad_al_pagar_usd,
  )} y hoy es ${fmtUsd(fila.utilidad_usd)}. Revisa si hay que ajustar el pago.`;
}

/** «Pagado de más: $X» (solo con exceso). */
export function textoExceso(excesoUsd: number | null | undefined): string | null {
  return excesoUsd != null && excesoUsd > 0 ? `Pagado de más: ${fmtUsd(excesoUsd)}` : null;
}

export const TEXTO_TODOS_PAGADOS = "Todos los socios con utilidad están pagados";
export const TEXTO_SIN_UTILIDAD_MES = "Sin utilidad que repartir en el mes";

/** «N socios con pago pendiente» (con 0, los que tenían utilidad están pagados). */
export function textoSociosPendientes(n: number): string {
  if (n <= 0) return TEXTO_TODOS_PAGADOS;
  return n === 1 ? "1 socio con pago pendiente" : `${n} socios con pago pendiente`;
}

/**
 * Badge del encabezado de «Pagos a socios · <Mes>». Pendientes (conteo del
 * API) ⇒ ámbar; sin pendientes y CON utilidad ⇒ verde «Todos los socios con
 * utilidad están pagados»; sin utilidad o sin renglones ⇒ gris «Sin utilidad
 * que repartir en el mes». En un mes con pérdida nada se pagó: afirmar en
 * verde «todos pagados» sería mentir.
 */
export function badgeSociosPendientes(
  totales: { utilidad_usd: number; socios_pendientes: number },
  renglones: number,
): { texto: string; tono: "ambar" | "verde" | "gris"; clase: string } {
  const n = Number(totales.socios_pendientes) || 0;
  if (n > 0) return { texto: textoSociosPendientes(n), tono: "ambar", clase: CLASE_AMBAR };
  if (renglones <= 0 || centavos(totales.utilidad_usd) <= 0) {
    return { texto: TEXTO_SIN_UTILIDAD_MES, tono: "gris", clase: CLASE_GRIS };
  }
  return { texto: TEXTO_TODOS_PAGADOS, tono: "verde", clase: CLASE_VERDE };
}

/** «1 avión» / «3 aviones». */
export function textoAviones(n: number): string {
  return n === 1 ? "1 avión" : `${n} aviones`;
}

export const METODOS_PAGO_SOCIO: readonly { value: MetodoPagoSocio; etiqueta: string }[] = [
  { value: "TRANSFERENCIA", etiqueta: "Transferencia" },
  { value: "EFECTIVO", etiqueta: "Efectivo" },
  { value: "CHEQUE", etiqueta: "Cheque" },
  { value: "OTRO", etiqueta: "Otro" },
];

export function etiquetaMetodoPagoSocio(m: string | null | undefined): string {
  return METODOS_PAGO_SOCIO.find((x) => x.value === m)?.etiqueta ?? (m || "—");
}

/**
 * Monto de un pago tal como se entregó: «$1,000 USD» o, en pesos,
 * «$20,000 MXN · T.C. 18.5 · ≈ $1,081.08 USD» (el equivalente lo calculó el
 * API: `monto_usd`).
 */
export function textoMontoPago(pago: Pick<PagoSocio, "monto" | "moneda" | "tc_usd_mxn" | "monto_usd">): string {
  const base = fmtMonto(pago.monto, pago.moneda);
  if (pago.moneda !== "MXN") return base;
  const tc = fmtTc(pago.tc_usd_mxn);
  return [base, tc ? `T.C. ${tc}` : null, `≈ ${fmtUsd(pago.monto_usd)} USD`]
    .filter(Boolean)
    .join(" · ");
}

/** Nombre o «—» (usuario borrado: jamás un uuid). */
function nombre(n: string | null | undefined): string {
  const t = (n ?? "").trim();
  return t || "—";
}

/** Detalle de un pago en piezas (fecha · monto · método · entregó · …). */
export function piezasPago(pago: PagoSocio): {
  fecha: string;
  monto: string;
  metodo: string;
  entrego: string;
  recibio: string | null;
  factura: string | null;
  referencia: string | null;
  registro: string;
} {
  const recibio = (pago.recibido_por ?? "").trim();
  const factura = (pago.factura_folio ?? "").trim();
  const referencia = (pago.referencia ?? "").trim();
  return {
    fecha: fmtDateOnly(pago.fecha_pago),
    monto: textoMontoPago(pago),
    metodo: etiquetaMetodoPagoSocio(pago.metodo),
    entrego: `Entregó: ${nombre(pago.entregado_por_nombre)}`,
    recibio: recibio ? `Recibió: ${recibio}` : null,
    factura: factura ? `Factura ${factura}` : null,
    referencia: referencia ? `Ref. ${referencia}` : null,
    registro: `Registró ${nombre(pago.created_by_nombre)} · ${fmtDateTime(pago.created_at)}`,
  };
}

/** Pagos en orden de la relación: el más antiguo primero. */
export function ordenarPagos(pagos: readonly PagoSocio[]): PagoSocio[] {
  return [...pagos].sort((a, b) => {
    if (a.fecha_pago !== b.fecha_pago) return a.fecha_pago < b.fecha_pago ? -1 : 1;
    return (a.created_at ?? "") < (b.created_at ?? "") ? -1 : (a.created_at ?? "") > (b.created_at ?? "") ? 1 : 0;
  });
}

// =============================================================================
// Confirmaciones
// =============================================================================

export function confirmacionEliminarPago(
  pago: Pick<PagoSocio, "monto" | "moneda" | "fecha_pago">,
  socioNombre: string,
): { titulo: string; descripcion: string; boton: string } {
  return {
    titulo: "¿Eliminar este pago?",
    descripcion: `${fmtMonto(pago.monto, pago.moneda)} del ${fmtDateOnly(
      pago.fecha_pago,
    )} a ${socioNombre}. Dejará de contar como pagado y su pendiente se recalcula. Queda registro de quién lo eliminó y por qué.`,
    boton: "Eliminar pago",
  };
}

/** Lee el `details` del 409 PAGO_EXCEDE_UTILIDAD (tolerante). */
export function detalleExceso(details: unknown): DetalleExcesoPago | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  const n = (k: string) => {
    const v = Number(d[k]);
    return Number.isFinite(v) ? v : null;
  };
  const utilidad = n("utilidad_usd");
  const pagado = n("pagado_usd");
  const monto = n("monto_usd");
  const exceso = n("exceso_usd");
  if (utilidad == null || pagado == null || monto == null || exceso == null) return null;
  return { utilidad_usd: utilidad, pagado_usd: pagado, monto_usd: monto, exceso_usd: exceso };
}

export const BOTON_REGISTRAR_CON_EXCESO = "Registrar de todas formas";
export const BOTON_GUARDAR_CON_EXCESO = "Guardar de todas formas";
export const BOTON_REVISAR_MONTO = "Revisar el monto";

/**
 * La LLAMADA al servidor falló (red, 413/502 de Vercel): no se sabe si el pago
 * entró. Reintentar desde el MISMO diálogo es seguro (mismo
 * `client_request_id`: el API no duplica).
 */
export const TEXTO_FALLO_RED_PAGO =
  "No se pudo confirmar el pago con el servidor (falló la conexión). Vuelve a intentarlo desde aquí: no se duplica.";

/** Igual para la baja: reintentar es seguro (si ya se eliminó, el API dice
    PAGO_NO_EXISTE y la lista se actualiza sola). */
export const TEXTO_FALLO_RED_BAJA =
  "No se pudo confirmar la baja con el servidor (falló la conexión). Vuelve a intentarlo; si ya se eliminó, la lista se actualizará.";

/**
 * Nombre accesible y `title` de «Registrar pago»: el mismo socio sale en las
 * 7 tarjetas (Aero Charter), así que la matrícula y el MES van en el nombre
 * («Registrar pago a Aero Charter… · N4142R · Septiembre 2026»).
 */
export function etiquetaRegistrarPago(p: { socio: string; matricula: string; mes: string }): string {
  return [`${ETIQUETA_REGISTRAR_PAGO} a ${p.socio}`, p.matricula.trim() || null, etiquetaMes(p.mes)]
    .filter(Boolean)
    .join(" · ");
}

/** Nombre accesible del botón del comprobante de UN pago (fecha y monto). */
export function etiquetaComprobantePago(pago: PagoSocio): string {
  const { fecha, monto } = piezasPago(pago);
  return pago.comprobante_path
    ? `Reemplazar el comprobante del pago del ${fecha} por ${monto}`
    : `Adjuntar comprobante del pago del ${fecha} por ${monto}`;
}

/** Texto de la confirmación «¿Registrar de todas formas?». */
export function confirmacionExceso(details: unknown): { titulo: string; descripcion: string } {
  const d = detalleExceso(details);
  const titulo = "Este pago supera la utilidad del socio en el mes";
  if (!d) {
    return {
      titulo,
      descripcion:
        "Con este pago el socio quedaría pagado de más. ¿Registrar de todas formas? (por ejemplo, un anticipo acordado).",
    };
  }
  return {
    titulo,
    descripcion: `Utilidad del mes: ${fmtUsd(d.utilidad_usd)} · ya pagado: ${fmtUsd(
      d.pagado_usd,
    )} · este pago: ${fmtUsd(d.monto_usd)}. Quedaría pagado de más por ${fmtUsd(
      d.exceso_usd,
    )}. ¿Registrar de todas formas?`,
  };
}

export const CONFIRMAR_REEMPLAZO_COMPROBANTE = {
  titulo: "¿Reemplazar el comprobante?",
  descripcion: "El nuevo es el que se verá; el anterior se guarda por seguridad.",
  boton: "Elegir el nuevo comprobante",
} as const;

// =============================================================================
// Errores del API en es-MX (por `code`)
// =============================================================================

export const CODIGO_PAGOS_NO_DISPONIBLE = "PAGOS_SOCIOS_NO_DISPONIBLE";
export const CODIGO_EXCEDE_UTILIDAD = "PAGO_EXCEDE_UTILIDAD";
export const CODIGO_SIN_UTILIDAD = "SIN_UTILIDAD_QUE_PAGAR";
export const CODIGO_SOCIO_AJENO = "SOCIO_NO_ES_DE_LA_AERONAVE";
export const CODIGO_PAGO_NO_EXISTE = "PAGO_NO_EXISTE";
/** Otra persona cambió el pago en ese instante: la pantalla está vieja. */
export const CODIGO_PAGO_CAMBIO_CONCURRENTE = "PAGO_CAMBIO_CONCURRENTE";
/** Alguien más cambió el comprobante del pago. */
export const CODIGO_COMPROBANTE_CAMBIO = "COMPROBANTE_CAMBIO";

/** ¿El error dice que lo que hay en pantalla ya está viejo (hay que refrescar)? */
export function errorPideRefrescar(code: string | null | undefined): boolean {
  return (
    code === CODIGO_PAGO_NO_EXISTE ||
    code === CODIGO_PAGO_CAMBIO_CONCURRENTE ||
    code === CODIGO_COMPROBANTE_CAMBIO
  );
}

/**
 * Textos del PANEL que GANAN al del API: el panel hace algo distinto a lo
 * que el API sugiere (p. ej. refresca la lista solo en vez de «recarga la
 * página») o el API no manda mensaje (red, espera).
 */
const MENSAJES_PANEL: Record<string, string> = {
  [CODIGO_EXCEDE_UTILIDAD]: "El pago supera la utilidad del socio en el mes.",
  [CODIGO_PAGO_NO_EXISTE]: "Ese pago ya no existe (alguien lo eliminó). Actualizamos la lista.",
  [CODIGO_PAGO_CAMBIO_CONCURRENTE]:
    "Otra persona cambió este pago en este momento. Actualizamos la lista: revísalo y vuelve a intentarlo.",
  [CODIGO_COMPROBANTE_CAMBIO]:
    "Alguien más cambió el comprobante de este pago. Actualizamos la lista.",
  SIN_CONEXION: "No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.",
  TIEMPO_AGOTADO: "El servidor tardó demasiado y se canceló la espera. Vuelve a intentarlo.",
  // El API manda «La llave client_request_id…»: jerga que el operador no
  // entiende. El panel dice qué hacer.
  CLIENT_REQUEST_ID_EN_USO:
    "Este registro ya se usó para otro pago. Cierra el diálogo y vuelve a abrirlo para registrar el pago.",
};

/**
 * RESPALDO por código cuando el API no manda un texto útil (vacío, técnico o
 * en inglés). Con texto en español, se pinta el del API: sabe más del caso
 * (p. ej. «el avión está dado de baja»).
 */
const MENSAJES_RESPALDO: Record<string, string> = {
  [CODIGO_PAGOS_NO_DISPONIBLE]:
    "Los pagos a socios todavía no están disponibles en el servidor. No se guardó nada.",
  [CODIGO_SOCIO_AJENO]:
    "Esa persona no es socia de este avión en ese mes. Revisa los socios en la ficha del avión.",
  [CODIGO_SIN_UTILIDAD]:
    "El avión no dejó utilidad para este socio en el mes: no hay nada que pagar.",
};

const TECNICO =
  /^(Internal server error|Request failed|Bad Request|Not Found|Unauthorized|Forbidden|Conflict)$/i;
/** Mensajes de validación de class-validator (en inglés). */
const VALIDACION_EN_INGLES = /\b(should|must|property|is not|not allowed)\b/i;

/**
 * Mensaje es-MX para un error de pagos a socios. Los códigos propios se
 * traducen aquí (fuente única); un mensaje del API ya en español se respeta;
 * lo técnico o en inglés se cambia por un texto que dice qué hacer.
 */
export function mensajeErrorPagoSocio(
  code: string | null | undefined,
  message: string | null | undefined,
  status?: number | null,
): string {
  if (code && MENSAJES_PANEL[code]) return MENSAJES_PANEL[code];
  const msg = (message ?? "").trim();
  const usable = msg !== "" && !TECNICO.test(msg) && !VALIDACION_EN_INGLES.test(msg);
  if (code && MENSAJES_RESPALDO[code]) return usable ? msg : MENSAJES_RESPALDO[code];
  if (status === 401) return "Tu sesión expiró. Recarga la página e inicia sesión.";
  if (status === 403) {
    return "Tu rol no tiene permiso para registrar pagos a socios. Pide a un administrador que lo haga.";
  }
  if (status === 404 && /^Cannot (GET|POST|PATCH|PUT|DELETE)\b/.test(msg)) {
    return "El servidor todavía no tiene esta función (falta actualizarlo). Avisa a sistemas.";
  }
  if (status === 400 && (!msg || VALIDACION_EN_INGLES.test(msg))) {
    return "El servidor rechazó un dato del pago. Revisa el formulario y vuelve a intentarlo.";
  }
  if (code === "PARSE_ERROR" || !msg || TECNICO.test(msg)) {
    return `El servidor respondió con error${status ? ` ${status}` : ""}. Vuelve a intentarlo; si sigue igual, avisa a sistemas.`;
  }
  return msg;
}

// =============================================================================
// Roles (espejo de los @Roles del API; el candado real es el API)
// =============================================================================

/** `POST/PATCH/DELETE /v1/profit-sharing/pagos` y el comprobante. */
export const ROLES_REGISTRAN_PAGO_SOCIO = ["ADMIN", "FACTURACION"] as const;

export function puedeRegistrarPagosSocio(rol: string | null | undefined): boolean {
  return (ROLES_REGISTRAN_PAGO_SOCIO as readonly string[]).includes(rol ?? "");
}

// =============================================================================
// Carga (tolerancia al API previo y a la falta de migración)
// =============================================================================

/** Lo que devuelve `getRepartoPagos` (nunca lanza). */
export type RepartoPagosCarga =
  | { estado: "ok"; datos: RepartoPagosRespuesta }
  /** API previo (404), sin migración (`disponible:false` o el 503 con su
      código) ⇒ nota «Disponible cuando se actualice el servidor». */
  | { estado: "no-disponible" }
  /** 401/403: el rol no lee pagos ⇒ no se pinta nada. */
  | { estado: "sin-permiso" }
  /** Red, 500, 502/503 de un deploy… ⇒ «No se pudieron cargar» (jamás vacío). */
  | { estado: "error" };

/**
 * Clasifica el fallo de la LECTURA. Un 503 a secas es Railway desplegando
 * (el fetcher ya reintentó): es un fallo, no «falta la migración». Sin la
 * migración el API responde 200 con `disponible:false`; el 503 con
 * `PAGOS_SOCIOS_NO_DISPONIBLE` se tolera igual por si acaso.
 */
export function clasificarFalloCargaPagos(
  status: number | null | undefined,
  code: string | null | undefined,
): "no-disponible" | "sin-permiso" | "error" {
  if (status === 401 || status === 403) return "sin-permiso";
  if (status === 404) return "no-disponible";
  if (code === CODIGO_PAGOS_NO_DISPONIBLE) return "no-disponible";
  return "error";
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function numONull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Tipos numéricos (PostgREST puede mandar `numeric` como texto). */
export function normalizarPago(raw: unknown): PagoSocio | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string") return null;
  return {
    ...(p as unknown as PagoSocio),
    monto: num(p.monto),
    monto_usd: num(p.monto_usd),
    tc_usd_mxn: numONull(p.tc_usd_mxn),
    utilidad_snapshot_usd: num(p.utilidad_snapshot_usd),
    referencia: texto(p.referencia),
    recibido_por: texto(p.recibido_por),
    factura_folio: texto(p.factura_folio),
    comprobante_path: texto(p.comprobante_path),
    comprobante_url: texto(p.comprobante_url),
    notas: texto(p.notas),
    entregado_por_nombre: texto(p.entregado_por_nombre),
    created_by_nombre: texto(p.created_by_nombre),
    fecha_pago: typeof p.fecha_pago === "string" ? p.fecha_pago.slice(0, 10) : "",
  };
}

export function normalizarFila(raw: unknown): FilaPagoSocio | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const aeronave = f.aeronave as FilaPagoSocio["aeronave"] | undefined;
  const socio = f.socio as FilaPagoSocio["socio"] | undefined;
  if (!aeronave?.id || !socio?.id) return null;
  return {
    ...(f as unknown as FilaPagoSocio),
    aeronave,
    socio,
    porcentaje: num(f.porcentaje),
    utilidad_usd: num(f.utilidad_usd),
    pagado_usd: num(f.pagado_usd),
    pendiente_usd: num(f.pendiente_usd),
    exceso_usd: num(f.exceso_usd),
    utilidad_al_pagar_usd: numONull(f.utilidad_al_pagar_usd),
    utilidad_difiere: f.utilidad_difiere === true,
    pagos: Array.isArray(f.pagos)
      ? f.pagos.map(normalizarPago).filter((p): p is PagoSocio => p !== null)
      : [],
  };
}

function normalizarResumen(raw: unknown): ResumenPagoSocio | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const socio = r.socio as ResumenPagoSocio["socio"] | undefined;
  if (!socio?.id) return null;
  return {
    ...(r as unknown as ResumenPagoSocio),
    socio,
    utilidad_usd: num(r.utilidad_usd),
    pagado_usd: num(r.pagado_usd),
    pendiente_usd: num(r.pendiente_usd),
    aviones: num(r.aviones),
  };
}

/**
 * Respuesta de `GET /v1/profit-sharing/pagos` con tipos sanos. Algo que no
 * es objeto ⇒ null (la página lo trata como fallo, nunca como «sin pagos»).
 */
export function normalizarRespuestaPagos(raw: unknown): RepartoPagosRespuesta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const t = (r.totales ?? {}) as Record<string, unknown>;
  return {
    disponible: r.disponible !== false,
    mes: typeof r.mes === "string" ? r.mes : "",
    desde: typeof r.desde === "string" ? r.desde : "",
    hasta: typeof r.hasta === "string" ? r.hasta : "",
    filas: Array.isArray(r.filas)
      ? r.filas.map(normalizarFila).filter((f): f is FilaPagoSocio => f !== null)
      : [],
    por_socio: Array.isArray(r.por_socio)
      ? r.por_socio.map(normalizarResumen).filter((s): s is ResumenPagoSocio => s !== null)
      : [],
    totales: {
      utilidad_usd: num(t.utilidad_usd),
      pagado_usd: num(t.pagado_usd),
      pendiente_usd: num(t.pendiente_usd),
      socios_pendientes: num(t.socios_pendientes),
    },
  };
}

// =============================================================================
// Qué pinta la página
// =============================================================================

/** Usuario elegible como «Entregó». */
export interface UsuarioEntrega {
  id: string;
  nombre: string;
}

/** Contexto de pagos que reciben la sección y cada tarjeta de avión. */
export type ModoPagosReparto =
  /** El periodo no es un mes completo ⇒ línea tenue `TEXTO_SOLO_MES_COMPLETO`. */
  | { modo: "sin-mes" }
  | { modo: "no-disponible"; mes: string }
  | { modo: "oculto" }
  | { modo: "error"; mes: string }
  | { modo: "ok"; mes: string; datos: RepartoPagosRespuesta };

export function modoPagosReparto(
  mes: string | null,
  carga: RepartoPagosCarga | null,
): ModoPagosReparto {
  if (!mes) return { modo: "sin-mes" };
  if (!carga) return { modo: "error", mes };
  switch (carga.estado) {
    case "ok":
      return carga.datos.disponible
        ? { modo: "ok", mes, datos: carga.datos }
        : { modo: "no-disponible", mes };
    case "no-disponible":
      return { modo: "no-disponible", mes };
    case "sin-permiso":
      return { modo: "oculto" };
    default:
      return { modo: "error", mes };
  }
}

/** Un renglón de la tabla de socios de UN avión. */
export interface RenglonSocioAvion {
  socio_id: string;
  socio_nombre: string;
  porcentaje: number;
  /** Utilidad que se pinta: la del renglón de pagos (misma fuente que
      pagado/pendiente) o, sin renglón, la del reparto en pantalla. */
  utilidad_usd: number;
  /** null = sin renglón de pagos (otro socio visto por un SOCIO, o sin mes). */
  fila: FilaPagoSocio | null;
  /** false = ya no es socio vigente del avión pero tiene pagos del mes. */
  vigente: boolean;
}

/**
 * El reparto de un avión con UN renglón por socio. El `compute()` del API
 * emite una entrada por cada vigencia de `aeronave_socio` que toca el mes:
 * un socio al que le cambiaron el % a medio mes llega DOS veces. Se suman %
 * y monto (en centavos) y se conserva el orden de la primera aparición —
 * ESPEJO de `armarFilasPagos` / `utilidadDeSocioEnAvion` del API, que ya las
 * agrupan en una sola fila de pagos.
 */
export function agruparRepartoPorSocio(reparto: readonly RepartoSocio[]): RepartoSocio[] {
  const grupos = new Map<string, { socio_nombre: string; pct: number; c: number }>();
  for (const s of reparto) {
    const g = grupos.get(s.socio_id);
    const pct = Number(s.porcentaje) || 0;
    if (g) {
      g.pct += pct;
      g.c += centavos(s.monto_usd);
    } else {
      grupos.set(s.socio_id, { socio_nombre: s.socio_nombre, pct, c: centavos(s.monto_usd) });
    }
  }
  return [...grupos].map(([socio_id, g]) => ({
    socio_id,
    socio_nombre: g.socio_nombre,
    porcentaje: Math.round(g.pct * 1000) / 1000,
    monto_usd: g.c / 100,
  }));
}

/**
 * Une el reparto del avión (orden y porcentajes de la tarjeta, UN renglón por
 * socio aunque tenga dos vigencias en el mes) con los renglones de pagos. Los
 * socios que ya no son vigentes pero tienen pagos del mes van AL FINAL (no se
 * esconden: es dinero entregado).
 */
export function renglonesSociosAvion(
  aeronaveId: string,
  reparto: readonly RepartoSocio[],
  filas: readonly FilaPagoSocio[] | null,
): RenglonSocioAvion[] {
  const delAvion = (filas ?? []).filter((f) => f.aeronave.id === aeronaveId);
  const porSocio = new Map(delAvion.map((f) => [f.socio.id, f]));
  const vistos = new Set<string>();
  const out: RenglonSocioAvion[] = agruparRepartoPorSocio(reparto).map((s) => {
    vistos.add(s.socio_id);
    const fila = porSocio.get(s.socio_id) ?? null;
    return {
      socio_id: s.socio_id,
      socio_nombre: s.socio_nombre,
      porcentaje: s.porcentaje,
      utilidad_usd: fila ? fila.utilidad_usd : s.monto_usd,
      fila,
      vigente: fila?.vigente !== false,
    };
  });
  const extras = delAvion
    .filter((f) => !vistos.has(f.socio.id))
    .sort((a, b) => a.socio.nombre.localeCompare(b.socio.nombre, "es"))
    .map<RenglonSocioAvion>((f) => ({
      socio_id: f.socio.id,
      socio_nombre: f.socio.nombre,
      porcentaje: f.porcentaje,
      utilidad_usd: f.utilidad_usd,
      fila: f,
      vigente: false,
    }));
  return [...out, ...extras];
}

/**
 * Renglones de pagos cuyo avión NO tiene tarjeta en la página: el cálculo
 * del mes solo trae aviones activos, pero el API manda igual las filas de un
 * avión dado de baja (o sin matrícula) que tiene pagos del mes. Sin este
 * bloque esos pagos solo sumaban en «Pagado» y no se podían revisar, corregir
 * ni eliminar. Orden: matrícula y socio (el del API).
 */
export function filasFueraDelReparto(
  filas: readonly FilaPagoSocio[],
  aeronavesConTarjeta: Iterable<string>,
): FilaPagoSocio[] {
  const visibles = new Set(aeronavesConTarjeta);
  return filas
    .filter((f) => !visibles.has(f.aeronave.id))
    .sort(
      (a, b) =>
        a.aeronave.matricula.localeCompare(b.aeronave.matricula, "es") ||
        a.socio.nombre.localeCompare(b.socio.nombre, "es"),
    );
}

export const TITULO_PAGOS_FUERA_DEL_REPARTO = "Pagos de aviones fuera del reparto del mes";
export const AYUDA_PAGOS_FUERA_DEL_REPARTO =
  "Pagos registrados a socios de aviones que este mes no salen en el reparto (por ejemplo, un avión dado de baja). Cuentan en «Pagado»; aquí se revisan, corrigen o eliminan.";

/**
 * Opciones de «Entregó»: usuarios activos + quien registra + (en edición) el
 * que ya tiene el pago aunque ya no esté activo — así abrir y guardar sin
 * tocar el campo no lo cambia. Orden alfabético; «Tú» marca a quien registra.
 */
export function opcionesEntrego(
  usuarios: readonly UsuarioEntrega[],
  me: UsuarioEntrega | null | undefined,
  actual?: { id: string | null | undefined; nombre: string | null | undefined } | null,
): { value: string; label: string; description?: string }[] {
  const mapa = new Map<string, string>();
  for (const u of usuarios) if (u.id) mapa.set(u.id, u.nombre || "Usuario");
  if (me?.id && !mapa.has(me.id)) mapa.set(me.id, me.nombre || "Yo");
  if (actual?.id && !mapa.has(actual.id)) mapa.set(actual.id, actual.nombre || "Usuario");
  return [...mapa]
    .map(([value, label]) => ({
      value,
      label,
      ...(value === me?.id ? { description: "Tú" } : {}),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/** Consolidado visible: un SOCIO solo ve su renglón. */
export function porSocioVisible(
  porSocio: readonly ResumenPagoSocio[],
  rol: string | null | undefined,
  meId: string | null | undefined,
): ResumenPagoSocio[] {
  if (rol === "SOCIO") return porSocio.filter((s) => s.socio.id === meId);
  return [...porSocio];
}

// =============================================================================
// Formulario «Registrar pago» / «Editar pago»
// =============================================================================

export const REFERENCIA_MAX = 120;
export const RECIBIDO_POR_MAX = 120;
export const FACTURA_FOLIO_MAX = 60;
export const NOTAS_PAGO_MAX = 500;
export const MOTIVO_BAJA_MIN = 5;
export const MOTIVO_BAJA_MAX = 300;
/** Tope de un pago: ESPEJO de `MONTO_PAGO_MAX` del API (cabe en numeric(12,2)). */
const MONTO_MAX = 99_999_999.99;

export interface FormPagoSocio {
  monto: string;
  moneda: MonedaPagoSocio;
  tc: string;
  fecha_pago: string;
  metodo: MetodoPagoSocio | "";
  entregado_por_id: string;
  recibido_por: string;
  referencia: string;
  factura_folio: string;
  notas: string;
}

export type ErroresFormPago = Partial<Record<keyof FormPagoSocio, string>>;

/** «1,234.5» ⇒ 1234.5; vacío o basura ⇒ NaN. */
export function leerNumero(v: string): number {
  const limpio = (v ?? "").replace(/[\s,$]/g, "");
  if (!limpio) return NaN;
  return Number(limpio);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Prellenado del alta: monto = PENDIENTE del renglón (del API), USD, fecha
 * de hoy (Cancún) y «Entregó» = quien registra. El MÉTODO NO se prellena: un
 * medio de pago por defecto es justo lo que se cuela sin que nadie lo revise
 * (regla del 3-sep-2026 en gastos).
 */
export function formInicialAlta(p: {
  pendienteUsd: number | null | undefined;
  hoy: string;
  meId: string | null | undefined;
}): FormPagoSocio {
  const pendiente = Number(p.pendienteUsd);
  return {
    monto: Number.isFinite(pendiente) && pendiente > 0 ? round2(pendiente).toFixed(2) : "",
    moneda: "USD",
    tc: "",
    fecha_pago: p.hoy,
    metodo: "",
    entregado_por_id: p.meId ?? "",
    recibido_por: "",
    referencia: "",
    factura_folio: "",
    notas: "",
  };
}

/**
 * Cambio de MONEDA en el formulario. En el ALTA el monto llega prellenado
 * con el pendiente en DÓLARES: si el operador pasa a MXN sin haber tocado el
 * monto, ese número ya no significa nada (1,395.94 «pesos» ≈ $75 USD) y se
 * VACÍA para que capture los pesos; al volver a USD con el campo vacío se
 * restaura el pendiente. Un monto tecleado nunca se toca. En la EDICIÓN no
 * se aplica (`montoPrellenado` null): corregir la moneda de un pago mal
 * capturado conserva su número a propósito.
 */
export function formAlCambiarMoneda(
  form: FormPagoSocio,
  moneda: MonedaPagoSocio,
  montoPrellenado: string | null,
): FormPagoSocio {
  if (form.moneda === moneda) return form;
  const prellenado = (montoPrellenado ?? "").trim();
  const monto = form.monto.trim();
  if (prellenado && moneda === "MXN" && monto === prellenado) {
    return { ...form, moneda, monto: "" };
  }
  if (prellenado && moneda === "USD" && monto === "") {
    return { ...form, moneda, monto: prellenado };
  }
  return { ...form, moneda };
}

/** «Monto entregado (USD)» / «Monto entregado (MXN)»: la moneda a la vista. */
export function etiquetaMontoPago(moneda: MonedaPagoSocio): string {
  return `Monto entregado (${moneda})`;
}

/**
 * Ayuda bajo el monto del ALTA: en pesos dice que se capturen pesos y deja
 * el pendiente en USD como referencia; en dólares, de dónde salió el número.
 */
export function hintMontoPago(p: {
  moneda: MonedaPagoSocio;
  pendienteUsd: number | null | undefined;
  alta: boolean;
}): string | null {
  if (!p.alta) return null;
  const pendiente = Number(p.pendienteUsd);
  const conPendiente = Number.isFinite(pendiente) && pendiente > 0;
  if (p.moneda === "MXN") {
    return conPendiente
      ? `Captura el monto en pesos; pendiente ${fmtUsd(pendiente)} USD.`
      : "Captura el monto en pesos.";
  }
  return conPendiente ? `Prellenado con el pendiente del mes: ${fmtUsd(pendiente)} USD.` : null;
}

/** Descripción del diálogo: avión · mes · utilidad/pagado/pendiente EN USD. */
export function descripcionDialogoPago(
  fila: Pick<FilaPagoSocio, "aeronave" | "utilidad_usd" | "pagado_usd" | "pendiente_usd">,
  mes: string,
): string {
  return [
    fila.aeronave.matricula,
    etiquetaMes(mes),
    `utilidad del mes ${fmtUsd(fila.utilidad_usd)} USD`,
    `pagado ${fmtUsd(fila.pagado_usd)} USD`,
    `pendiente ${fmtUsd(fila.pendiente_usd)} USD`,
  ].join(" · ");
}

/** Formulario de edición con lo que ya tiene el pago. */
export function formDePago(pago: PagoSocio): FormPagoSocio {
  return {
    monto: String(pago.monto),
    moneda: pago.moneda === "MXN" ? "MXN" : "USD",
    tc: pago.tc_usd_mxn != null ? String(pago.tc_usd_mxn) : "",
    fecha_pago: pago.fecha_pago,
    metodo: METODOS_PAGO_SOCIO.some((m) => m.value === pago.metodo)
      ? (pago.metodo as MetodoPagoSocio)
      : "",
    entregado_por_id: pago.entregado_por ?? "",
    recibido_por: pago.recibido_por ?? "",
    referencia: pago.referencia ?? "",
    factura_folio: pago.factura_folio ?? "",
    notas: pago.notas ?? "",
  };
}

/** Errores del formulario (vacío = válido). `hoy` = día Cancún. */
export function validarFormPago(form: FormPagoSocio, hoy: string): ErroresFormPago {
  const e: ErroresFormPago = {};
  const monto = leerNumero(form.monto);
  if (!Number.isFinite(monto) || round2(monto) <= 0) {
    e.monto = "Captura el monto que se entregó (mayor a 0).";
  } else if (monto > MONTO_MAX) {
    e.monto = "El monto es demasiado grande.";
  }
  if (form.moneda === "MXN") {
    const tc = leerNumero(form.tc);
    if (!Number.isFinite(tc) || tc <= 0) {
      e.tc = "Captura el tipo de cambio del pago en pesos.";
    }
  }
  if (!esDiaValido(form.fecha_pago)) {
    e.fecha_pago = "Elige la fecha en que se entregó el pago.";
  } else if (esDiaValido(hoy) && form.fecha_pago > hoy) {
    e.fecha_pago = "La fecha del pago no puede ser futura.";
  }
  if (!METODOS_PAGO_SOCIO.some((m) => m.value === form.metodo)) {
    e.metodo = "Elige cómo se pagó.";
  }
  if (form.entregado_por_id && !esUuid(form.entregado_por_id)) {
    e.entregado_por_id = "Elige quién entregó el dinero.";
  }
  if (form.recibido_por.trim().length > RECIBIDO_POR_MAX) {
    e.recibido_por = `Máximo ${RECIBIDO_POR_MAX} caracteres.`;
  }
  if (form.referencia.trim().length > REFERENCIA_MAX) {
    e.referencia = `Máximo ${REFERENCIA_MAX} caracteres.`;
  }
  if (form.factura_folio.trim().length > FACTURA_FOLIO_MAX) {
    e.factura_folio = `Máximo ${FACTURA_FOLIO_MAX} caracteres.`;
  }
  if (form.notas.trim().length > NOTAS_PAGO_MAX) {
    e.notas = `Máximo ${NOTAS_PAGO_MAX} caracteres.`;
  }
  return e;
}

export function hayErrores(e: ErroresFormPago): boolean {
  return Object.keys(e).length > 0;
}

/** Cuerpo del `POST` (el formulario ya validado). Vacíos NO viajan. */
export function payloadAltaPago(
  form: FormPagoSocio,
  ctx: {
    aeronave_id: string;
    socio_id: string;
    mes: string;
    client_request_id?: string;
    meId?: string | null;
    aceptar_exceso?: boolean;
  },
): CrearPagoSocioPayload {
  const out: CrearPagoSocioPayload = {
    aeronave_id: ctx.aeronave_id,
    socio_id: ctx.socio_id,
    mes: ctx.mes,
    monto: round2(leerNumero(form.monto)),
    moneda: form.moneda,
    fecha_pago: form.fecha_pago,
    metodo: form.metodo as MetodoPagoSocio,
  };
  if (form.moneda === "MXN") out.tc_usd_mxn = round6(leerNumero(form.tc));
  // «Entregó» = quien registra es el default del API: solo viaja otro.
  if (form.entregado_por_id && form.entregado_por_id !== ctx.meId) {
    out.entregado_por_id = form.entregado_por_id;
  }
  const opc = (v: string) => v.trim();
  if (opc(form.recibido_por)) out.recibido_por = opc(form.recibido_por);
  if (opc(form.referencia)) out.referencia = opc(form.referencia);
  if (opc(form.factura_folio)) out.factura_folio = opc(form.factura_folio);
  if (opc(form.notas)) out.notas = opc(form.notas);
  if (ctx.aceptar_exceso) out.aceptar_exceso = true;
  if (ctx.client_request_id) out.client_request_id = ctx.client_request_id;
  return out;
}

/**
 * Cuerpo del `PATCH`: SOLO lo que cambió. Pasar a USD manda
 * `tc_usd_mxn: null`; vaciar un texto opcional manda `null` (quitarlo).
 */
export function cambiosPago(pago: PagoSocio, form: FormPagoSocio): PatchPagoSocioPayload {
  const out: PatchPagoSocioPayload = {};
  const monto = round2(leerNumero(form.monto));
  if (Number.isFinite(monto) && monto !== round2(Number(pago.monto))) out.monto = monto;
  const monedaAntes = pago.moneda === "MXN" ? "MXN" : "USD";
  if (form.moneda !== monedaAntes) out.moneda = form.moneda;
  if (form.moneda === "MXN") {
    const tc = round6(leerNumero(form.tc));
    const tcAntes = pago.tc_usd_mxn != null ? round6(Number(pago.tc_usd_mxn)) : null;
    if (Number.isFinite(tc) && (tc !== tcAntes || form.moneda !== monedaAntes)) out.tc_usd_mxn = tc;
  } else if (pago.tc_usd_mxn != null) {
    out.tc_usd_mxn = null;
  }
  if (form.fecha_pago !== pago.fecha_pago) out.fecha_pago = form.fecha_pago;
  if (form.metodo && form.metodo !== pago.metodo) out.metodo = form.metodo;
  if (form.entregado_por_id && form.entregado_por_id !== pago.entregado_por) {
    out.entregado_por_id = form.entregado_por_id;
  }
  const textoCambio = (
    llave: "recibido_por" | "referencia" | "factura_folio" | "notas",
  ) => {
    const nuevo = form[llave].trim();
    const antes = (pago[llave] ?? "").trim();
    if (nuevo !== antes) out[llave] = nuevo ? nuevo : null;
  };
  textoCambio("recibido_por");
  textoCambio("referencia");
  textoCambio("factura_folio");
  textoCambio("notas");
  return out;
}

/**
 * Contador bajo «¿Por qué se elimina?»: «3/300 · mínimo 5» mientras no llega
 * al mínimo. El botón apagado no tiene puntero ni enseña su `title`: el
 * mínimo se DICE junto al contador.
 */
export function textoContadorMotivo(motivo: string): { texto: string; falta: boolean } {
  const n = (motivo ?? "").trim().length;
  const falta = n < MOTIVO_BAJA_MIN;
  return {
    texto: `${n}/${MOTIVO_BAJA_MAX}${falta ? ` · mínimo ${MOTIVO_BAJA_MIN}` : ""}`,
    falta,
  };
}

/** Motivo de la baja: 5–300 caracteres. */
export function validarMotivoBaja(motivo: string): string | null {
  const t = (motivo ?? "").trim();
  if (t.length < MOTIVO_BAJA_MIN) {
    return `Escribe el motivo (al menos ${MOTIVO_BAJA_MIN} caracteres).`;
  }
  if (t.length > MOTIVO_BAJA_MAX) return `Máximo ${MOTIVO_BAJA_MAX} caracteres.`;
  return null;
}

// =============================================================================
// Pre-cierre: «Socios con utilidad del mes sin pagar o con pago parcial»
// =============================================================================

export const CLAVE_PRECIERRE_PAGOS_SOCIOS = "pagos_socios_pendientes";

/** «Resolver →» del pre-cierre: el reparto del MISMO periodo. */
export function hrefPagosSocios(p: { desde: string; hasta: string }): string {
  const qs = new URLSearchParams({ desde: p.desde, hasta: p.hasta });
  return `/admin/profit-sharing?${qs.toString()}`;
}

export const MAX_SOCIOS_PRECIERRE = 8;

/**
 * Conteo del renglón del pre-cierre. El `count` del API son PAGOS pendientes
 * (renglones avión × socio: Aero Charter en 7 aviones suma 7), no socios; el
 * reparto dice «N socios con pago pendiente». Se rotula «8 pagos pendientes
 * (2 socios)» para que las dos pantallas no den dos cifras de «socios». Los
 * socios distintos solo se cuentan con la lista COMPLETA (viene topada en 50).
 */
export function conteoPreCierrePagosSocios(
  count: number | null | undefined,
  socios: readonly PreCierreSocioPendiente[] | null | undefined,
): string {
  const n = Math.max(0, Math.round(Number(count) || 0));
  const pagos = n === 1 ? "1 pago pendiente" : `${n} pagos pendientes`;
  const lista: readonly PreCierreSocioPendiente[] = Array.isArray(socios) ? socios : [];
  if (lista.length === 0 || lista.length < n) return pagos;
  const distintos = new Set(
    lista.map((s) =>
      typeof s.socio === "string" ? `n:${s.socio}` : s.socio?.id ? `i:${s.socio.id}` : "n:",
    ),
  ).size;
  return `${pagos} (${distintos === 1 ? "1 socio" : `${distintos} socios`})`;
}

/**
 * Renglones del aviso del pre-cierre («Mauricio Roque · N4142R · pendiente
 * $1,395.94 · Pendiente»). El «y N más» sale del `count` del API cuando lo
 * hay (la lista viene topada en 50).
 */
export function lineasPreCierrePagosSocios(
  socios: readonly PreCierreSocioPendiente[] | null | undefined,
  max: number = MAX_SOCIOS_PRECIERRE,
  count?: number | null,
): { lineas: { key: string; texto: string }[]; restantes: number } {
  // `Array.isArray` sobre un arreglo readonly estrecha a `any[]`: se tipa a mano.
  const lista: readonly PreCierreSocioPendiente[] = Array.isArray(socios) ? socios : [];
  const lineas = lista.slice(0, max).map((s, i) => {
    const socio =
      typeof s.socio === "string" ? s.socio : (s.socio?.nombre ?? "").trim() || "Socio";
    const matricula =
      typeof s.aeronave === "string" ? s.aeronave : (s.aeronave?.matricula ?? "").trim();
    const estado = esEstadoConocido(s.estado)
      ? ESTADOS_PAGO_SOCIO[s.estado].etiqueta
      : null;
    const texto = [
      socio,
      matricula || null,
      `pendiente ${fmtUsd(s.pendiente_usd)}`,
      estado,
    ]
      .filter(Boolean)
      .join(" · ");
    const idSocio = typeof s.socio === "object" && s.socio ? s.socio.id : socio;
    const idAvion = typeof s.aeronave === "object" && s.aeronave ? s.aeronave.id ?? matricula : matricula;
    return { key: `${idSocio}-${idAvion}-${i}`, texto };
  });
  const total = Math.max(lista.length, count ?? 0);
  return { lineas, restantes: Math.max(0, total - lineas.length) };
}
