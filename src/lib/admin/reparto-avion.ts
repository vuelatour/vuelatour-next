/**
 * PANTALLA POR AVIÓN del reparto (20-oct-2026, API 0.0.101, invariante 99
 * «LA CASCADA DEL BALANCE / PESOS PRIMERO / CUENTA EN PESOS») — FUENTE ÚNICA
 * PURA (sin React ni red) de `/admin/profit-sharing/aviones/[id]`, de su
 * histórico y de la card resumida del reparto.
 *
 * Pedido del cliente (comparó el Excel del balance de N621TX y N4142R con la
 * card): «una pantalla por avión y no un card para ver más detalles para
 * saber cuáles son esos permisos, gastos indirectos y directos de lo que
 * hablan en el excel… y vengan los números de todo el histórico del avión y
 * poder filtrar por mes»; «el reserva de overhaul también debe venir…
 * recuerda que eso no se resta, y debe venir cuánto es lo que debe guardar
 * cada socio… una opción para poder seleccionar en cada avión en cada socio
 * si se les restamos en las utilidades o solo darles el dato»; «que las
 * cuentas de dispersión se lleve en un balance en el detalle o pantalla del
 * avión… y todo ponlo en Pesos».
 *
 * Reglas:
 *  - Los NÚMEROS los manda el API (`GET /v1/profit-sharing/aviones/:id` y
 *    `…/historico`): aquí solo se ETIQUETAN, se agrupan y se formatean. Las
 *    únicas sumas son en centavos sobre lo que ya viene (subtotal por grupo
 *    de gastos), y se comparan contra la fila de la cascada que el API ya
 *    mandó: si no cuadran se DICE, no se corrige.
 *  - Con `reparto_como_balance` la provisión AFAC RESTA y la reserva de
 *    overhaul SOLO se informa (va DESPUÉS del saldo, marcada «no se resta»).
 *    Sin la bandera (API previo) la cascada es la de siempre: la reserva
 *    resta y no hay fila de AFAC.
 *  - Pesos (MXN) como cifra principal; los dólares, informativos (reglas de
 *    `reparto-pesos.ts`).
 *  - El cambio «¿se le descuenta la reserva?» es dinero: se confirma con el
 *    texto que explica la consecuencia (regla permanente del cliente).
 */

import { fmtDecimal, fmtMonto, fmtMxn, fmtTc, fmtUsd } from "@/lib/format";
import { esDiaValido, esUuid, rangoFiltro, valorDeCatalogo } from "@/lib/admin/url-params";
import { pestanaInicial, type PestanaDef } from "@/lib/admin/pestanas";
import { ajustarRangoAlInicio, type InicioOficial } from "@/lib/admin/inicio-oficial";
import {
  ETIQUETA_FILA_OTROS_INGRESOS_AVION,
  SUBLABEL_OTROS_INGRESOS_AVION,
} from "@/lib/admin/otros-ingresos-avion";
import { SUBLABEL_COMISIONES_REPARTO } from "@/lib/admin/categorias-gasto";
import { combustibleSeparado, montoPrincipal, textoUsd, type MontoDoble } from "@/lib/admin/reparto-pesos";
import {
  MES_CUENTA_DEFAULT,
  contextoEntrega,
  esMesValido,
  etiquetaMes,
  filtroMesesCuenta,
  mesesDeRango,
  normalizarPago,
  sumarMeses,
  type ContextoEntrega,
  type ExtrasContextoEntrega,
} from "@/lib/admin/reparto-pagos";
import type { AircraftOwner } from "@/types/aircraft";
import type {
  AvionDetalleRespuesta,
  AvionHistoricoRespuesta,
  AvionReparto,
  DetalleGastoGrupo,
  FilaGastoDetalle,
  MesHistoricoAvion,
  RepartoMesSocio,
  RepartoSocio,
  SocioAvionDetalle,
  SocioHistoricoAvion,
  TotalesHistoricoAvion,
} from "@/types/profit-sharing";
import type { PagoSocio, ResumenCuentaSocio } from "@/types/reparto-pagos";

const numero = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// =============================================================================
// Rutas y roles
// =============================================================================

export const RUTA_REPARTO_AVIONES = "/admin/profit-sharing/aviones";

/** `/admin/profit-sharing/aviones/<id>?desde&hasta` (solo días válidos). */
export function hrefRepartoAvion(
  aeronaveId: string,
  periodo?: { desde?: string | null; hasta?: string | null },
): string {
  const qs = new URLSearchParams();
  if (periodo?.desde && esDiaValido(periodo.desde)) qs.set("desde", periodo.desde);
  if (periodo?.hasta && esDiaValido(periodo.hasta)) qs.set("hasta", periodo.hasta);
  const q = qs.toString();
  return `${RUTA_REPARTO_AVIONES}/${aeronaveId}${q ? `?${q}` : ""}`;
}

/** `/admin/profit-sharing/aviones/<id>/historico?desde=AAAA-MM&hasta=AAAA-MM`. */
export function hrefHistoricoAvion(
  aeronaveId: string,
  meses?: { desde?: string | null; hasta?: string | null },
): string {
  const qs = new URLSearchParams();
  if (meses?.desde && esMesValido(meses.desde)) qs.set("desde", meses.desde);
  if (meses?.hasta && esMesValido(meses.hasta)) qs.set("hasta", meses.hasta);
  const q = qs.toString();
  return `${RUTA_REPARTO_AVIONES}/${aeronaveId}/historico${q ? `?${q}` : ""}`;
}

/** «← Reparto de utilidades» conservando el periodo que se estaba viendo. */
export function hrefRepartoConPeriodo(periodo: { desde?: string | null; hasta?: string | null }): string {
  const qs = new URLSearchParams();
  if (periodo.desde && esDiaValido(periodo.desde)) qs.set("desde", periodo.desde);
  if (periodo.hasta && esDiaValido(periodo.hasta)) qs.set("hasta", periodo.hasta);
  const q = qs.toString();
  return `/admin/profit-sharing${q ? `?${q}` : ""}`;
}

/** Espejo del `@Roles` de `GET /v1/profit-sharing/aviones/:id` (SOCIO: solo lo suyo). */
export const ROLES_VEN_REPARTO_AVION = ["ADMIN", "ANALISTA", "FACTURACION", "SOCIO"] as const;

export function puedeVerRepartoAvion(rol: string | null | undefined): boolean {
  return (ROLES_VEN_REPARTO_AVION as readonly string[]).includes(rol ?? "");
}

/** Espejo del `@Roles(ADMIN)` de `PATCH /v1/aircraft/owners/:id`. */
export const ROLES_CAMBIAN_RESERVA = ["ADMIN"] as const;

export function puedeCambiarDescuentoReserva(rol: string | null | undefined): boolean {
  return (ROLES_CAMBIAN_RESERVA as readonly string[]).includes(rol ?? "");
}

/** El balance en Excel del avión es ADMIN/ANALISTA (como en la card). */
export function puedeDescargarBalanceAvion(rol: string | null | undefined): boolean {
  return rol === "ADMIN" || rol === "ANALISTA";
}

// =============================================================================
// Periodo de la URL (la MISMA regla que `/admin/profit-sharing`)
// =============================================================================

/**
 * `?desde&hasta` de la pantalla por avión: fechas validadas (una imposible
 * se ignora ⇒ mes corriente en Cancún del día 1 a HOY), rango invertido
 * enderezado y el piso del inicio oficial con aviso (`ajustado`).
 */
export function periodoRepartoDeUrl(
  sp: { desde?: string; hasta?: string },
  inicio: InicioOficial,
  hoy: string,
): { desde: string; hasta: string; ajustado: boolean } {
  const fallback = { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  const rango = rangoFiltro(sp.desde, sp.hasta);
  let desde = rango.desde ?? fallback.desde;
  let hasta = rango.hasta ?? fallback.hasta;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const ajuste = ajustarRangoAlInicio({ desde, hasta }, inicio, fallback.hasta);
  return { desde: ajuste.desde ?? desde, hasta: ajuste.hasta ?? hasta, ajustado: ajuste.ajustado };
}

// =============================================================================
// Textos de la pantalla
// =============================================================================

export const ETIQUETA_VER_DETALLE_AVION = "Ver detalle del avión";
export const ETIQUETA_VOLVER_REPARTO = "Reparto de utilidades";
export const ETIQUETA_HISTORICO = "Histórico por mes";
export const ETIQUETA_FICHA_AVION = "Ficha del avión";
/** Enlace desde el expediente del avión (`/admin/aircraft/[id]`). */
export const ETIQUETA_REPARTO_POR_MES = "Reparto y balance por mes";
export const ETIQUETA_VER_REPARTO_AVION = "Ver el reparto del periodo";

export const TITULO_CASCADA = "Cómo se llega al saldo";
export const AYUDA_CASCADA =
  "Las filas suman exacto el saldo disponible: lo cobrado de la venta del avión (más otros ingresos del avión) menos comisiones, gastos y la provisión AFAC. La reserva de overhaul va aparte: no se resta.";
/** Con el combustible separado (API 0.0.103): las líneas del Excel, en su orden. */
export const AYUDA_CASCADA_EXCEL =
  "Las mismas líneas del Excel del balance y en el mismo orden: venta cobrada, menos comisiones, gastos directos y provisión AFAC, da la utilidad antes de gastos; menos combustible, gastos indirectos, permisos y fijos prorrateados, más otros ingresos del avión, da el saldo a repartir. La reserva de overhaul va aparte: no se resta.";
export const TITULO_GASTOS_AVION = "Gastos del periodo";
export const AYUDA_GASTOS_AVION =
  "Cada gasto tal cual se sumó en la cascada, agrupado como en el balance (directos, indirectos, permisos, fijos). Los que no restan al avión se listan al final con su motivo.";
export const AYUDA_GASTOS_AVION_EXCEL =
  "Cada gasto tal cual se sumó en la cascada, agrupado como en el balance (directos, combustible, indirectos, permisos, fijos); el combustible va aparte de los gastos directos, como en el Excel. Los que no restan al avión se listan al final con su motivo.";

/** Ayuda de «Cómo se llega al saldo»: la del Excel solo con el combustible separado. */
export function ayudaCascada(conCombustible: boolean): string {
  return conCombustible ? AYUDA_CASCADA_EXCEL : AYUDA_CASCADA;
}

/** Ayuda de «Gastos del periodo»: ídem. */
export function ayudaGastosAvion(conCombustible: boolean): string {
  return conCombustible ? AYUDA_GASTOS_AVION_EXCEL : AYUDA_GASTOS_AVION;
}
export const TITULO_VUELOS_AVION = "Vuelos y otros ingresos del periodo";
export const AYUDA_VUELOS_AVION =
  "Cada vuelo con su venta, lo cobrado y lo pendiente de la parte de este avión, y los gastos por categoría.";
export const TITULO_SOCIOS_AVION = "Socios de este avión";
export const AYUDA_SOCIOS_AVION =
  "Lo que le toca a cada socio de ESTE avión en el periodo, en pesos: su parte del saldo, la reserva de overhaul que debe guardar (se le descuenta solo si así se configuró), lo que se le ha entregado por este avión y lo que falta.";
export const TITULO_ENTREGAS_AVION = "Entregas de este avión";
export const AYUDA_ENTREGAS_AVION =
  "Entregas a los socios registradas con «corresponde a» este avión en los meses del periodo. El saldo completo de cada socio (todos sus aviones) está en «Pagos a socios».";
export const TEXTO_SIN_GASTOS_AVION = "Sin gastos de este avión en el periodo.";
export const TEXTO_SIN_SOCIOS_AVION = "Sin socios configurados para este avión en el periodo.";
export const TEXTO_SIN_ENTREGAS_AVION =
  "Sin entregas que correspondan a este avión en el periodo.";
export const TEXTO_ERROR_CARGA_AVION =
  "No se pudo cargar el reparto de este avión. Pulsa Reintentar; si sigue igual, avisa a sistemas.";
export const TEXTO_AVION_NO_DISPONIBLE =
  "La pantalla por avión necesita la actualización del servidor (API 0.0.101). Mientras tanto, el reparto sigue en la lista.";
export const TEXTO_SOCIO_SOLO_LO_SUYO =
  "Como socio ves tu renglón y tus entregas de este avión.";

// ===== Secciones en pestañas (23-oct-2026) =====
// Pedido del cliente: «las tablas acomódalas por pestañas, para que no esté
// una tabla encima de otra y nos confundamos con el scroll». El saldo y la
// cascada quedan SIEMPRE arriba; debajo, UNA tira de pestañas con las cuatro
// secciones y solo la activa pintada. `?seccion=` enlaza una pestaña.

export const SECCIONES_PANTALLA_AVION = ["gastos", "vuelos", "socios", "entregas"] as const;
export type SeccionPantallaAvion = (typeof SECCIONES_PANTALLA_AVION)[number];

export const PARAMETRO_SECCION_AVION = "seccion";
export const ETIQUETA_LISTA_SECCIONES_AVION = "Secciones del reparto del avión";

export const ETIQUETA_SECCION_PANTALLA_AVION: Readonly<Record<SeccionPantallaAvion, string>> = {
  gastos: TITULO_GASTOS_AVION,
  vuelos: "Vuelos",
  socios: "Socios",
  entregas: "Entregas",
};

export interface ConteosPantallaAvion {
  /** Gastos listados en «Gastos del periodo» (todos los grupos, los que no restan incluidos). */
  gastos: number;
  /** Vuelos del desglose; null = el API no mandó `detalle` (no hay pestaña). */
  vuelos: number | null;
  entregas: number;
}

/** Los conteos reales de las pestañas, de la respuesta de la pantalla. */
export function conteosPantallaAvion(
  datos: Pick<AvionDetalleRespuesta, "avion" | "entregas">,
): ConteosPantallaAvion {
  const detalle = datos.avion.detalle ?? null;
  return {
    gastos: detalle?.gastos?.length ?? 0,
    vuelos: detalle ? detalle.vuelos.length : null,
    entregas: datos.entregas.length,
  };
}

/**
 * Las pestañas de la pantalla, en orden: «Gastos del periodo (n)», «Vuelos
 * (n)» (solo si el API mandó el desglose), «Socios», «Entregas (n)».
 */
export function pestanasPantallaAvion(c: ConteosPantallaAvion): PestanaDef[] {
  return [
    { clave: "gastos", etiqueta: ETIQUETA_SECCION_PANTALLA_AVION.gastos, conteo: c.gastos },
    ...(c.vuelos === null
      ? []
      : [{ clave: "vuelos", etiqueta: ETIQUETA_SECCION_PANTALLA_AVION.vuelos, conteo: c.vuelos }]),
    { clave: "socios", etiqueta: ETIQUETA_SECCION_PANTALLA_AVION.socios },
    { clave: "entregas", etiqueta: ETIQUETA_SECCION_PANTALLA_AVION.entregas, conteo: c.entregas },
  ];
}

/**
 * `?seccion=` validado: una sección del catálogo que SÍ tiene pestaña; basura
 * o una sección sin pestaña ⇒ la primera («Gastos del periodo»). Jamás un 400.
 */
export function seccionPantallaAvionDeUrl(
  valor: string | null | undefined,
  pestanas: ReadonlyArray<Pick<PestanaDef, "clave">>,
): SeccionPantallaAvion {
  const pedida = valorDeCatalogo(valor ?? undefined, SECCIONES_PANTALLA_AVION);
  return (pestanaInicial(pestanas, pedida) ?? SECCIONES_PANTALLA_AVION[0]) as SeccionPantallaAvion;
}

// ===== Cascada =====

export const ETIQUETAS_CASCADA = {
  cobrado: "Venta del avión cobrada",
  otrosIngresos: ETIQUETA_FILA_OTROS_INGRESOS_AVION,
  comisiones: "Comisiones (banco + vendedor)",
  directos: "Gastos directos",
  indirectos: "Gastos indirectos",
  permisos: "Permisos",
  fijos: "Fijos (prorrateo + reparto manual)",
  afac: "Provisión AFAC",
  saldo: "Saldo disponible",
  reserva: "Reserva de overhaul",
} as const;

/**
 * COMBUSTIBLE SEPARADO (23-oct-2026, API 0.0.103, invariante 104). Pedido del
 * cliente: «debemos separar gastos directos del combustible, porque los está
 * uniendo, porque no nos está coincidiendo con el excel». Cuando el API manda
 * `gastos.combustible_*` (`combustibleSeparado`), la cascada se pinta con las
 * MISMAS líneas, etiquetas y orden del Excel «Balance» por avión:
 *
 *   Venta cobrada − Comisiones de venta − Gastos directos − Provisión AFAC
 *   = Utilidad antes de gastos
 *   − Combustible − Gastos indirectos − Permisos − Fijos prorrateados
 *   + Otros ingresos del avión = Saldo a repartir
 *
 * Sin esas llaves (API previo) se pintan `ETIQUETAS_CASCADA` y la cascada de
 * siempre, byte a byte.
 */
export const ETIQUETAS_CASCADA_EXCEL = {
  cobrado: "Venta cobrada",
  comisiones: "Comisiones de venta",
  directos: "Gastos directos",
  afac: "Provisión AFAC",
  utilidadAntesGastos: "Utilidad antes de gastos",
  combustible: "Combustible",
  indirectos: "Gastos indirectos",
  permisos: "Permisos",
  fijos: "Fijos prorrateados",
  otrosIngresos: ETIQUETA_FILA_OTROS_INGRESOS_AVION,
  saldo: "Saldo a repartir",
  reserva: ETIQUETAS_CASCADA.reserva,
} as const;

export const TITULO_FILA_DIRECTOS_SIN_COMBUSTIBLE =
  "Gastos directos de los vuelos del periodo (aterrizajes, hotel, comida, taxi, piloto externo, comisariato…). El combustible va aparte, en su propia fila, como en el Excel del balance.";
export const TITULO_FILA_COMBUSTIBLE =
  "Gasavión / turbosina de los vuelos del periodo. Va aparte de los gastos directos, como en el Excel del balance.";
export const TITULO_FILA_UTILIDAD_ANTES_GASTOS =
  "Venta cobrada menos comisiones, gastos directos y provisión AFAC: la línea «Utilidad antes de gastos» del Excel del balance.";

/** La etiqueta de la última fila: «Saldo a repartir» (Excel) o «Saldo disponible». */
export function etiquetaSaldoCascada(avion: Pick<AvionReparto, "gastos">): string {
  return combustibleSeparado(avion) ? ETIQUETAS_CASCADA_EXCEL.saldo : ETIQUETAS_CASCADA.saldo;
}

export const SUBLABEL_DIRECTOS = "combustible, aterrizajes, hotel, comida, piloto externo…";
export const SUBLABEL_INDIRECTOS = "talleres, refacciones, servicios y gastos indirectos sellados al avión";
export const SUBLABEL_PERMISOS = "permisos del avión (sin los pagos de AFAC que paga VuelaTour)";
export const SUBLABEL_FIJOS = "sueldos y seguros de la empresa, prorrateados entre los aviones activos";

export const TITULO_FILA_AFAC =
  "Aportación AFAC de la ficha del avión × horas cobradas del periodo: la misma columna «PERMISO AFAC (PROVISIÓN)» del balance. Resta del saldo; lo que AFAC cobre de verdad se captura en el Balance general y lo paga VuelaTour.";

/** Marca junto a la reserva: no entra a la cascada. */
export const ETIQUETA_RESERVA_INFORMATIVA = "no se resta";
export const TEXTO_RESERVA_NO_RESTA =
  "No se resta del saldo: es lo que el avión debe guardar para su overhaul (horas voladas × tarifa de la ficha). A cada socio se le informa su parte y solo se le descuenta de lo que recibe si así se configuró.";
export const ETIQUETA_RESERVA_RETENIDA = "VuelaTour retiene";
export const TITULO_RESERVA_RETENIDA =
  "Parte de la reserva que se descuenta a los socios que así lo pidieron: no se les entrega, la guarda VuelaTour para el overhaul.";

/** «$40 USD/hr × 12.5 hr cobradas»; sin detalle, undefined. */
export function sublabelAfac(
  afac: { tarifa_usd_hr: number; horas_cobradas_hr: number } | null | undefined,
): string | undefined {
  if (!afac) return undefined;
  return `${fmtUsd(afac.tarifa_usd_hr)} USD/hr × ${fmtDecimal(afac.horas_cobradas_hr, 2)} hr cobradas`;
}

/** «12.5 hr × $40/hr» (el detalle) o «12.5 hr voladas»; sin horas, undefined. */
export function sublabelReservaOverhaul(
  reserva: { horas_hr: number; tarifa_hora_usd: number } | null | undefined,
  horasVoladas: number,
): string | undefined {
  if (reserva) return `${fmtDecimal(reserva.horas_hr, 1)} hr × ${fmtUsd(reserva.tarifa_hora_usd)}/hr`;
  return horasVoladas > 0 ? `${fmtDecimal(horasVoladas, 1)} hr voladas` : undefined;
}

export interface FilaCascada {
  clave: string;
  etiqueta: string;
  sublabel?: string;
  title?: string;
  /** `subtotal` = la línea «Utilidad antes de gastos» del Excel (API 0.0.103). */
  tipo: "ingreso" | "deduccion" | "subtotal";
  monto: MontoDoble;
}

export interface OpcionesCascada {
  /** Bandera raíz `reparto_en_pesos`. */
  enPesos: boolean;
  /** Bandera raíz `reparto_como_balance` (AFAC resta; la reserva no). */
  comoBalance: boolean;
}

/**
 * «Utilidad antes de gastos» del Excel (API 0.0.103): el número del API
 * (`utilidad_antes_gastos_*`) si viene; si no, la suma EN CENTAVOS de los
 * componentes ya redondeados: cobrado − comisiones − directos − provisión
 * AFAC (la AFAC solo con la cascada del balance). En pesos, si a algún
 * componente le falta el peso, queda null (se dice; no se inventa).
 */
export function utilidadAntesGastos(
  avion: AvionReparto,
  comoBalance: boolean,
): { usd: number; mxn: number | null } {
  const neg = (v: number | null | undefined): number | null => {
    const n = numero(v);
    return n === null ? null : -n;
  };
  const afacUsd = comoBalance ? (numero(avion.afac_reservado_usd) ?? 0) : 0;
  const afacMxn = comoBalance ? avion.afac_reservado_mxn : 0;
  const usd =
    numero(avion.utilidad_antes_gastos_usd) ??
    sumaCentavosONull([
      avion.ingresos.cobrado_usd,
      neg(avion.ingresos.comisiones_venta_usd ?? 0),
      neg(avion.gastos.directos_usd),
      -afacUsd,
    ]) ??
    0;
  const mxn =
    numero(avion.utilidad_antes_gastos_mxn) ??
    sumaCentavosONull([
      avion.ingresos.cobrado_mxn,
      neg(avion.ingresos.comisiones_venta_mxn),
      neg(avion.gastos.directos_mxn),
      neg(afacMxn),
    ]);
  return { usd, mxn };
}

/**
 * Las filas que SUMAN el saldo, en orden: cobrado, + otros ingresos del
 * avión (si hay), − comisiones (si hay), − directos, − indirectos, −
 * permisos, − fijos y, con la cascada del balance, − provisión AFAC. Sin la
 * bandera (API previo) la última fila es la reserva de overhaul, como
 * siempre. Los números son del API; aquí solo se visten.
 *
 * Con el COMBUSTIBLE SEPARADO (API 0.0.103, `combustibleSeparado`) las filas
 * son las del Excel y en su orden: cobrado − comisiones − directos − AFAC =
 * «Utilidad antes de gastos» (subtotal) − combustible − indirectos −
 * permisos − fijos + otros ingresos. Todas las líneas se pintan aunque
 * valgan 0 (se cuadra renglón por renglón contra el Excel).
 */
export function filasCascadaAvion(avion: AvionReparto, o: OpcionesCascada): FilaCascada[] {
  const d = avion.detalle ?? null;
  const fila = (
    clave: string,
    etiqueta: string,
    tipo: FilaCascada["tipo"],
    montos: { mxn?: number | null; usd: number },
    extra: { sublabel?: string; title?: string; tc?: number | null } = {},
  ): FilaCascada => ({
    clave,
    etiqueta,
    tipo,
    sublabel: extra.sublabel,
    title: extra.title,
    monto: montoPrincipal(montos, o.enPesos, { deduccion: tipo === "deduccion", tc: extra.tc }),
  });
  if (combustibleSeparado(avion)) {
    const E = ETIQUETAS_CASCADA_EXCEL;
    const excel: FilaCascada[] = [
      fila("cobrado", E.cobrado, "ingreso", {
        mxn: avion.ingresos.cobrado_mxn,
        usd: avion.ingresos.cobrado_usd,
      }),
      fila(
        "comisiones",
        E.comisiones,
        "deduccion",
        { mxn: avion.ingresos.comisiones_venta_mxn, usd: avion.ingresos.comisiones_venta_usd ?? 0 },
        { sublabel: SUBLABEL_COMISIONES_REPARTO },
      ),
      fila(
        "directos",
        E.directos,
        "deduccion",
        { mxn: avion.gastos.directos_mxn, usd: avion.gastos.directos_usd },
        { title: TITULO_FILA_DIRECTOS_SIN_COMBUSTIBLE },
      ),
    ];
    if (o.comoBalance) {
      excel.push(
        fila(
          "afac",
          E.afac,
          "deduccion",
          { mxn: avion.afac_reservado_mxn, usd: avion.afac_reservado_usd ?? 0 },
          { sublabel: sublabelAfac(d?.afac), title: TITULO_FILA_AFAC },
        ),
      );
    }
    excel.push(
      fila("utilidad_antes_gastos", E.utilidadAntesGastos, "subtotal", utilidadAntesGastos(avion, o.comoBalance), {
        title: TITULO_FILA_UTILIDAD_ANTES_GASTOS,
      }),
      fila(
        "combustible",
        E.combustible,
        "deduccion",
        { mxn: avion.gastos.combustible_mxn, usd: avion.gastos.combustible_usd ?? 0 },
        { title: TITULO_FILA_COMBUSTIBLE },
      ),
      fila("indirectos", E.indirectos, "deduccion", {
        mxn: avion.gastos.indirectos_mxn,
        usd: avion.gastos.indirectos_usd,
      }),
      fila("permisos", E.permisos, "deduccion", {
        mxn: avion.gastos.permisos_mxn,
        usd: avion.gastos.permisos_usd,
      }),
      fila("fijos", E.fijos, "deduccion", {
        mxn: avion.gastos.otros_prorrateados_mxn,
        usd: avion.gastos.otros_prorrateados_usd,
      }),
    );
    if (!o.comoBalance) {
      // Sin la cascada del balance (combinación que el API 0.0.103 no
      // produce) la reserva sigue restando, como siempre.
      excel.push(
        fila(
          "reserva",
          E.reserva,
          "deduccion",
          { mxn: avion.reserva_overhaul_mxn, usd: avion.reserva_overhaul_usd },
          { sublabel: sublabelReservaOverhaul(d?.reserva, avion.horas_voladas_hr), tc: d?.reserva.tc },
        ),
      );
    }
    excel.push(
      fila(
        "otros_ingresos",
        E.otrosIngresos,
        "ingreso",
        { mxn: avion.ingresos.otros_ingresos_avion_mxn, usd: avion.ingresos.otros_ingresos_avion_usd ?? 0 },
        { sublabel: SUBLABEL_OTROS_INGRESOS_AVION },
      ),
    );
    return excel;
  }
  const out: FilaCascada[] = [
    fila("cobrado", ETIQUETAS_CASCADA.cobrado, "ingreso", {
      mxn: avion.ingresos.cobrado_mxn,
      usd: avion.ingresos.cobrado_usd,
    }),
  ];
  if ((avion.ingresos.otros_ingresos_avion_usd ?? 0) > 0) {
    out.push(
      fila(
        "otros_ingresos",
        ETIQUETAS_CASCADA.otrosIngresos,
        "ingreso",
        { mxn: avion.ingresos.otros_ingresos_avion_mxn, usd: avion.ingresos.otros_ingresos_avion_usd ?? 0 },
        { sublabel: SUBLABEL_OTROS_INGRESOS_AVION },
      ),
    );
  }
  if ((avion.ingresos.comisiones_venta_usd ?? 0) > 0) {
    out.push(
      fila(
        "comisiones",
        ETIQUETAS_CASCADA.comisiones,
        "deduccion",
        { mxn: avion.ingresos.comisiones_venta_mxn, usd: avion.ingresos.comisiones_venta_usd },
        { sublabel: SUBLABEL_COMISIONES_REPARTO },
      ),
    );
  }
  out.push(
    fila("directos", ETIQUETAS_CASCADA.directos, "deduccion", {
      mxn: avion.gastos.directos_mxn,
      usd: avion.gastos.directos_usd,
    }),
    fila("indirectos", ETIQUETAS_CASCADA.indirectos, "deduccion", {
      mxn: avion.gastos.indirectos_mxn,
      usd: avion.gastos.indirectos_usd,
    }),
    fila("permisos", ETIQUETAS_CASCADA.permisos, "deduccion", {
      mxn: avion.gastos.permisos_mxn,
      usd: avion.gastos.permisos_usd,
    }),
    fila("fijos", ETIQUETAS_CASCADA.fijos, "deduccion", {
      mxn: avion.gastos.otros_prorrateados_mxn,
      usd: avion.gastos.otros_prorrateados_usd,
    }),
  );
  if (o.comoBalance) {
    out.push(
      fila(
        "afac",
        ETIQUETAS_CASCADA.afac,
        "deduccion",
        { mxn: avion.afac_reservado_mxn, usd: avion.afac_reservado_usd ?? 0 },
        { sublabel: sublabelAfac(d?.afac), title: TITULO_FILA_AFAC },
      ),
    );
  } else {
    out.push(
      fila(
        "reserva",
        ETIQUETAS_CASCADA.reserva,
        "deduccion",
        { mxn: avion.reserva_overhaul_mxn, usd: avion.reserva_overhaul_usd },
        { sublabel: sublabelReservaOverhaul(d?.reserva, avion.horas_voladas_hr), tc: d?.reserva.tc },
      ),
    );
  }
  return out;
}

/** El saldo disponible como monto doble (pesos primero con la bandera). */
export function saldoCascada(avion: AvionReparto, enPesos: boolean): MontoDoble {
  return montoPrincipal({ mxn: avion.saldo_disponible_mxn, usd: avion.saldo_disponible_usd }, enPesos);
}

export interface ReservaInformativa {
  monto: MontoDoble;
  sublabel?: string;
  /** Lo que VuelaTour retiene a los socios que descuentan (null si nada). */
  retenida: MontoDoble | null;
  /** Hay horas voladas pero el avión no tiene tarifa de reserva. */
  incompleta: boolean;
}

/** La reserva de overhaul que se INFORMA debajo del saldo (cascada del balance). */
export function reservaInformativa(avion: AvionReparto, enPesos: boolean): ReservaInformativa {
  const d = avion.detalle ?? null;
  const retenidaUsd = avion.reserva_retenida_usd ?? 0;
  return {
    monto: montoPrincipal(
      { mxn: avion.reserva_overhaul_mxn, usd: avion.reserva_overhaul_usd },
      enPesos,
      { tc: d?.reserva.tc },
    ),
    sublabel: sublabelReservaOverhaul(d?.reserva, avion.horas_voladas_hr),
    retenida:
      retenidaUsd > 0
        ? montoPrincipal({ mxn: avion.reserva_retenida_mxn, usd: retenidaUsd }, enPesos)
        : null,
    incompleta: avion.reserva_overhaul_incompleta === true,
  };
}

// ===== Socios =====

export const ETIQUETA_COLUMNA_A_RECIBIR = "A recibir";
export const ETIQUETA_COLUMNA_UTILIDAD = "Utilidad";
export const ETIQUETA_COLUMNA_RESERVA_A_GUARDAR = "Reserva a guardar";
export const ETIQUETA_COLUMNA_ENTREGADO_AVION = "Entregado (este avión)";
export const ETIQUETA_COLUMNA_POR_ENTREGAR_AVION = "Por entregar (este avión)";
export const ETIQUETA_SE_DESCUENTA = "se le descuenta";
export const ETIQUETA_SOLO_INFORMATIVA = "solo informativa";
export const TITULO_SE_DESCUENTA =
  "VuelaTour le retiene su parte de la reserva de overhaul: no se le entrega, se guarda para el overhaul del avión.";
export const TITULO_SOLO_INFORMATIVA =
  "Recibe su utilidad completa; solo se le informa cuánto debería guardar para el overhaul.";
export const ETIQUETA_CAMBIAR_RESERVA = "Cambiar";
export const TITULO_CAMBIAR_RESERVA = "Elegir si a este socio se le descuenta la reserva o solo se le informa";
export const TEXTO_SIN_RENGLON_PROPIETARIO =
  "No se encontró el renglón de propietario de este socio en el periodo: cámbialo desde «Editar propietarios» en la ficha del avión.";

export interface FilaSocioReparto {
  socio_id: string;
  nombre: string;
  porcentaje: number;
  /** Su parte del saldo ANTES de la reserva (null con un API previo). */
  utilidad: MontoDoble | null;
  /** Su parte de la reserva (null con un API previo). */
  reserva: MontoDoble | null;
  /** null = el API previo no lo manda. */
  descuenta: boolean | null;
  /** Lo que se le entrega. */
  aRecibir: MontoDoble;
}

/** Las filas de socios de la card y de la pantalla (reparto del compute). */
export function filasSociosReparto(reparto: readonly RepartoSocio[], enPesos: boolean): FilaSocioReparto[] {
  return reparto.map((s) => {
    const utilidadUsd = numero(s.utilidad_usd);
    const reservaUsd = numero(s.reserva_usd);
    return {
      socio_id: s.socio_id,
      nombre: s.socio_nombre,
      porcentaje: s.porcentaje,
      utilidad:
        utilidadUsd === null ? null : montoPrincipal({ mxn: s.utilidad_mxn, usd: utilidadUsd }, enPesos),
      reserva:
        reservaUsd === null ? null : montoPrincipal({ mxn: s.reserva_mxn, usd: reservaUsd }, enPesos),
      descuenta: typeof s.descuenta_reserva === "boolean" ? s.descuenta_reserva : null,
      aRecibir: montoPrincipal({ mxn: s.monto_mxn, usd: s.monto_usd }, enPesos),
    };
  });
}

/**
 * Renglón bajo «A recibir» de la card: «reserva $8,625.00 MXN · se le
 * descuenta» / «guardar $8,625.00 MXN · solo informativa»; null sin reserva
 * (o con un API previo).
 */
export function textoReservaSocio(f: Pick<FilaSocioReparto, "reserva" | "descuenta">): string | null {
  if (!f.reserva || f.descuenta === null) return null;
  if ((f.reserva.valor ?? 0) === 0) return null;
  return f.descuenta
    ? `reserva ${f.reserva.principal} · ${ETIQUETA_SE_DESCUENTA}`
    : `guardar ${f.reserva.principal} · ${ETIQUETA_SOLO_INFORMATIVA}`;
}

/** Confirmación del cambio «¿se le descuenta la reserva?» (dinero: siempre confirma). */
export function confirmacionDescuentoReserva(p: {
  socio: string;
  matricula: string;
  descontar: boolean;
}): { titulo: string; descripcion: string; boton: string } {
  if (p.descontar) {
    return {
      titulo: `¿Descontar la reserva a ${p.socio}?`,
      descripcion: `En ${p.matricula}, la parte de ${p.socio} de la reserva de overhaul se RESTARÁ de lo que se le entrega: VuelaTour la retiene para el overhaul. Cambia los repartos que se calculan hoy (este periodo, el histórico y la cuenta del socio en los meses abiertos); las utilidades ya congeladas en un cierre de mes no cambian.`,
      boton: "Sí, descontársela",
    };
  }
  return {
    titulo: `¿Dejar la reserva solo como dato para ${p.socio}?`,
    descripcion: `En ${p.matricula}, la parte de ${p.socio} de la reserva de overhaul ya NO se le descontará: recibe su utilidad completa y solo se le informa cuánto debería guardar. Cambia los repartos que se calculan hoy (este periodo, el histórico y la cuenta del socio en los meses abiertos); las utilidades ya congeladas en un cierre de mes no cambian.`,
    boton: "Sí, solo informarle",
  };
}

export function toastDescuentoReserva(socio: string, descontar: boolean): string {
  return descontar
    ? `A ${socio} se le descuenta la reserva de overhaul desde ahora.`
    : `A ${socio} ya no se le descuenta la reserva: solo se le informa.`;
}

const TECNICO =
  /^(Internal server error|Request failed|Bad Request|Not Found|Unauthorized|Forbidden|Conflict|Service Unavailable)$/i;
const EN_INGLES = /\b(should|must|property|is not|not allowed|not found)\b/i;

/** Mensaje es-MX de un fallo de `PATCH /v1/aircraft/owners/:id`. */
export function mensajeErrorDescuentoReserva(
  code: string | null | undefined,
  message: string | null | undefined,
  status?: number | null,
): string {
  const msg = (message ?? "").trim();
  if (status === 403) return "Solo administración puede cambiar si se descuenta la reserva.";
  if (status === 404 && /^Cannot PATCH\b/.test(msg)) {
    return "El servidor todavía no tiene esta función (falta actualizarlo). Avisa a sistemas.";
  }
  if (code === "PROPIETARIO_NO_EXISTE" || status === 404) {
    return "Ese propietario ya no existe: recarga la página.";
  }
  if (code === "SIN_CONEXION" || !msg) {
    return "No se pudo confirmar el cambio con el servidor. Recarga la página para ver si se guardó.";
  }
  if (TECNICO.test(msg) || EN_INGLES.test(msg)) {
    return `El servidor respondió con error${status ? ` ${status}` : ""}. Vuelve a intentarlo; si sigue igual, avisa a sistemas.`;
  }
  return msg;
}

/**
 * Renglones de `aeronave_socio` de un socio que CUENTAN en el periodo: la
 * MISMA regla con la que el API elige los socios vigentes del reparto
 * (`vigente_desde ≤ hasta` y `vigente_hasta` nulo o `≥ desde`). Sobre ellos
 * se hace el PATCH del descuento de la reserva.
 */
export function filasPropietarioDeSocio(
  owners: readonly AircraftOwner[] | null | undefined,
  socioId: string,
  periodo: { desde: string; hasta: string },
): AircraftOwner[] {
  if (!owners) return [];
  return owners.filter(
    (o) =>
      o.socio_id === socioId &&
      o.vigente_desde <= periodo.hasta &&
      (o.vigente_hasta === null || o.vigente_hasta >= periodo.desde),
  );
}

/**
 * Contexto de «Registrar entrega» desde la pantalla del avión: el renglón de
 * la cuenta del socio (`GET /socios`, que trae lo por entregar de TODA su
 * cuenta) con el avión preseleccionado; sin ese renglón (no cargó o el
 * socio no tiene cuenta), lo mínimo para abrir el diálogo (el API decide al
 * guardar).
 */
export function contextoEntregaDesdeAvion(
  socio: Pick<SocioAvionDetalle, "socio_id" | "socio_nombre" | "porcentaje">,
  avion: { id: string; matricula: string },
  resumen: ResumenCuentaSocio | null | undefined,
  extras: ExtrasContextoEntrega = {},
): ContextoEntrega {
  if (resumen) return contextoEntrega(resumen, { ...extras, avionSugerido: avion.id });
  return {
    socio: { id: socio.socio_id, nombre: socio.socio_nombre },
    porEntregarMxn: null,
    mesEnCursoMxn: 0,
    mesEnCurso: esMesValido(extras.mesEnCurso) ? extras.mesEnCurso : null,
    aviones: [{ id: avion.id, matricula: avion.matricula, porcentaje: socio.porcentaje, vigente: true }],
    cuentaDesdeMes: MES_CUENTA_DEFAULT,
    mesSugerido: esMesValido(extras.mesSugerido) ? extras.mesSugerido : null,
    avionSugerido: avion.id,
  };
}

/** «Por entregar (este avión)»: el signo dice si se le entregó de más. */
export function textoPorEntregarAvion(mxn: number): { texto: string; tono: "ambar" | "azul" | "neutro" } {
  const c = Math.round((Number(mxn) || 0) * 100);
  if (c > 100) return { texto: fmtMxn(c / 100), tono: "ambar" };
  if (c < -100) return { texto: `${fmtMxn(-c / 100)} de más`, tono: "azul" };
  return { texto: fmtMxn(0), tono: "neutro" };
}

// =============================================================================
// Gastos del periodo (gasto por gasto)
// =============================================================================

/** Orden de la cascada (el grupo COMBUSTIBLE, API 0.0.103, va tras los directos como en el Excel). */
export const ORDEN_GRUPOS_GASTO: readonly DetalleGastoGrupo[] = [
  "DIRECTO",
  "COMBUSTIBLE",
  "INDIRECTO",
  "PERMISO",
  "FIJO",
  "EXCLUIDO",
];

export const ETIQUETA_GRUPO_GASTO: Readonly<Record<DetalleGastoGrupo, string>> = {
  DIRECTO: "Gastos directos",
  COMBUSTIBLE: "Combustible",
  INDIRECTO: "Gastos indirectos",
  PERMISO: "Permisos",
  FIJO: "Fijos repartidos a mano a este avión",
  EXCLUIDO: "No restan al avión",
};

export const DESCRIPCION_GRUPO_GASTO: Readonly<Record<DetalleGastoGrupo, string>> = {
  DIRECTO: "Costo de cada vuelo: combustible, aterrizajes y pistas, hotel, comida, taxi, piloto externo, comisariato…",
  COMBUSTIBLE: "Gasavión / turbosina de cada vuelo. Va aparte de los gastos directos, como en el Excel del balance.",
  INDIRECTO: "Del avión, no de un vuelo: talleres, refacciones, servicios y gastos indirectos sellados al avión (como en el balance).",
  PERMISO: "Permisos del avión. Los pagos de AFAC que paga VuelaTour no restan aquí: el avión paga la provisión AFAC de la cascada.",
  FIJO: "Gastos fijos de la empresa que se repartieron a mano a este avión. El prorrateo automático entre los aviones activos no se lista gasto por gasto: va en la fila «Fijos» de la cascada.",
  EXCLUIDO: "Gastos ligados al avión o a sus vuelos que NO le restan: TUA (traslado al pasajero), pagos al vendedor, pagos de AFAC, categorías de la empresa… El motivo va en cada renglón.",
};

/** Etiqueta CORTA del grupo para su pastilla en «Gastos del periodo» (23-oct-2026). */
export const ETIQUETA_CORTA_GRUPO_GASTO: Readonly<Record<DetalleGastoGrupo, string>> = {
  DIRECTO: "Directos",
  COMBUSTIBLE: "Combustible",
  INDIRECTO: "Indirectos",
  PERMISO: "Permisos",
  FIJO: "Fijos",
  EXCLUIDO: "No restan",
};

export const ETIQUETA_LISTA_GRUPOS_GASTO = "Grupos de gastos";

/** Los directos cuando el combustible ya viene aparte (API 0.0.103). */
export const DESCRIPCION_GRUPO_DIRECTO_SIN_COMBUSTIBLE =
  "Costo de cada vuelo sin el combustible (que va aparte, como en el Excel): aterrizajes y pistas, hotel, comida, taxi, piloto externo, comisariato…";

/** Descripción del grupo; la de DIRECTO cambia solo con el combustible separado. */
export function descripcionGrupoGasto(grupo: DetalleGastoGrupo, conCombustible: boolean): string {
  return grupo === "DIRECTO" && conCombustible
    ? DESCRIPCION_GRUPO_DIRECTO_SIN_COMBUSTIBLE
    : DESCRIPCION_GRUPO_GASTO[grupo];
}

export interface GrupoGastosDetalle {
  grupo: DetalleGastoGrupo;
  etiqueta: string;
  descripcion: string;
  filas: FilaGastoDetalle[];
  /** Σ en centavos de `mxn`; null si a alguna fila le falta (sin T.C.). */
  subtotalMxn: number | null;
  /** Σ en centavos de `usd`; null si a alguna fila le falta. */
  subtotalUsd: number | null;
  /** Filas sin pesos (sin ningún T.C.). */
  sinPesos: number;
}

function sumaCentavosONull(valores: ReadonlyArray<number | null | undefined>): number | null {
  let c = 0;
  for (const v of valores) {
    const n = numero(v);
    if (n === null) return null;
    c += Math.round(n * 100);
  }
  return c / 100;
}

/**
 * Las filas de `detalle.gastos[]` por grupo, en el orden del balance y solo
 * los grupos con filas. El subtotal suma en centavos lo que ya mandó el API
 * (null si a alguna fila le falta el peso). Dentro del grupo, por fecha.
 * `conCombustible` (API 0.0.103) solo cambia la descripción de los directos;
 * el grupo «Combustible» aparece cuando el API manda filas `COMBUSTIBLE`.
 */
export function agruparGastosDetalle(
  filas: readonly FilaGastoDetalle[] | null | undefined,
  opts: { conCombustible?: boolean } = {},
): GrupoGastosDetalle[] {
  const lista = Array.isArray(filas) ? filas : [];
  return ORDEN_GRUPOS_GASTO.map((grupo) => {
    const propias = lista
      .filter((f) => f.grupo === grupo)
      .sort((a, b) => (a.fecha ?? "9999-99-99").localeCompare(b.fecha ?? "9999-99-99") || a.id.localeCompare(b.id));
    return {
      grupo,
      etiqueta: ETIQUETA_GRUPO_GASTO[grupo],
      descripcion: descripcionGrupoGasto(grupo, opts.conCombustible === true),
      filas: propias,
      subtotalMxn: grupo === "EXCLUIDO" ? null : sumaCentavosONull(propias.map((f) => f.mxn)),
      subtotalUsd: grupo === "EXCLUIDO" ? null : sumaCentavosONull(propias.map((f) => f.usd)),
      sinPesos: propias.filter((f) => f.mxn === null).length,
    };
  }).filter((g) => g.filas.length > 0);
}

/**
 * Las pastillas de «Gastos del periodo» (23-oct-2026): una por grupo CON
 * gastos, en el orden de la cascada, con su conteo («Directos (64)») y el
 * nombre largo como tooltip. Se muestra UNA tabla a la vez.
 */
export function pestanasGruposGasto(grupos: ReadonlyArray<GrupoGastosDetalle>): PestanaDef[] {
  return grupos.map((g) => ({
    clave: g.grupo,
    etiqueta: ETIQUETA_CORTA_GRUPO_GASTO[g.grupo],
    conteo: g.filas.length,
    title: g.etiqueta,
  }));
}

/** La fila de la cascada con la que debe cuadrar cada grupo (EXCLUIDO: ninguna). */
export function cascadaDelGrupo(
  avion: AvionReparto,
  grupo: DetalleGastoGrupo,
): { mxn: number | null; usd: number } | null {
  switch (grupo) {
    case "DIRECTO":
      return { mxn: numero(avion.gastos.directos_mxn), usd: avion.gastos.directos_usd };
    case "COMBUSTIBLE": {
      // Solo con el combustible separado (API 0.0.103); si no, no hay fila con qué cuadrar.
      const usd = numero(avion.gastos.combustible_usd);
      return usd === null ? null : { mxn: numero(avion.gastos.combustible_mxn), usd };
    }
    case "INDIRECTO":
      return { mxn: numero(avion.gastos.indirectos_mxn), usd: avion.gastos.indirectos_usd };
    case "PERMISO":
      return { mxn: numero(avion.gastos.permisos_mxn), usd: avion.gastos.permisos_usd };
    case "FIJO":
      return { mxn: numero(avion.gastos.otros_prorrateados_mxn), usd: avion.gastos.otros_prorrateados_usd };
    default:
      return null;
  }
}

/**
 * Diferencia entre el subtotal de las filas y la fila de la cascada, o null
 * si cuadra: el API redondea cada gasto a centavos y el agregado se redondea
 * al final, así que se tolera un centavo por fila (+ 1). FIJO nunca se
 * compara (la cascada trae además el prorrateo automático).
 */
export function diferenciaConCascada(
  grupo: DetalleGastoGrupo,
  subtotal: number | null,
  cascada: number | null,
  n: number,
): number | null {
  if (grupo === "FIJO" || grupo === "EXCLUIDO") return null;
  if (subtotal === null || cascada === null) return null;
  const dif = Math.round((subtotal - cascada) * 100);
  return Math.abs(dif) <= n + 1 ? null : dif / 100;
}

/** «Cuadra con la fila «Gastos directos» de la cascada» / la diferencia dicha. */
export function textoCuadreGrupo(
  grupo: DetalleGastoGrupo,
  dif: number | null,
  cascada: string | null,
): string | null {
  if (grupo === "FIJO" || grupo === "EXCLUIDO" || cascada === null) return null;
  const fila = ETIQUETA_GRUPO_GASTO[grupo];
  if (dif === null) return `Cuadra con la fila «${fila}» de la cascada (${cascada}).`;
  return `No cuadra con la fila «${fila}» de la cascada (${cascada}): diferencia de ${fmtMxn(dif)}. Avisa a sistemas.`;
}

export const ETIQUETA_TC_OFICIAL = "T.C. oficial";
export const TITULO_TC_OFICIAL_GASTO =
  "Sin tipo de cambio capturado: se convirtió con el T.C. oficial de referencia del día del gasto (open.er-api / BCE). Capturar el T.C. en el gasto lo sustituye.";
export const ETIQUETA_REPARTO_PARCIAL = "parte repartida";
export const TITULO_REPARTO_PARCIAL = "Parte de un gasto repartido a mano entre varios aviones.";
export const ETIQUETA_SIN_TC_GASTO = "sin T.C.";
export const TITULO_SIN_TC_GASTO =
  "Sin tipo de cambio capturado ni T.C. oficial para su fecha: no se pudo convertir y quedó fuera del dato.";

/** «$4,427.80 MXN» (monto original en su moneda). */
export function textoMontoOriginalGasto(f: Pick<FilaGastoDetalle, "monto" | "moneda">): string {
  return fmtMonto(f.monto, f.moneda);
}

/** «−$1,200.00 MXN de TUA/extensión trasladados» o null. */
export function textoDescontadoGasto(f: Pick<FilaGastoDetalle, "descontado_mxn">): string | null {
  const n = numero(f.descontado_mxn) ?? 0;
  return n > 0 ? `−${fmtMxn(n)} de TUA/extensión trasladados al pasajero` : null;
}

/** El T.C. capturado («18.5») o «—». */
export function textoTcGasto(f: Pick<FilaGastoDetalle, "tc">): string {
  return fmtTc(f.tc) || "—";
}

/** «#375» · «s/folio» · null (sin vuelo). */
export function textoVueloGasto(f: Pick<FilaGastoDetalle, "vuelo">): string | null {
  if (!f.vuelo) return null;
  return f.vuelo.folio != null ? `#${f.vuelo.folio}` : "s/folio";
}

export function hrefVueloGasto(f: Pick<FilaGastoDetalle, "vuelo">): string | null {
  return f.vuelo && esUuid(f.vuelo.id) ? `/admin/flights/${f.vuelo.id}` : null;
}

/** Pesos y dólares de un gasto como monto doble (con la bandera). */
export function montoGastoDetalle(f: Pick<FilaGastoDetalle, "mxn" | "usd">, enPesos: boolean): MontoDoble {
  return montoPrincipal({ mxn: f.mxn, usd: f.usd }, enPesos);
}

/** El dólar de un gasto, con su sufijo («$120 USD») o «—». */
export function textoUsdGasto(f: Pick<FilaGastoDetalle, "usd">): string {
  return f.usd === null ? "—" : textoUsd(f.usd);
}

// =============================================================================
// Entregas del avión
// =============================================================================

/** Nombre del socio de una entrega: el API no lo manda en `PagoSocio`, se lee de los socios de la pantalla. */
export function nombreSocioDeEntrega(
  pago: Pick<PagoSocio, "socio_id">,
  socios: ReadonlyArray<{ socio_id: string; socio_nombre: string }>,
): string {
  const s = socios.find((x) => x.socio_id === pago.socio_id);
  return s?.socio_nombre?.trim() || "Socio";
}

/** «Septiembre 2026» o «Sin mes (a cuenta)». */
export function textoMesEntrega(pago: Pick<PagoSocio, "mes" | "periodo">): string {
  const mes = (pago.mes ?? pago.periodo ?? "").slice(0, 7);
  return esMesValido(mes) ? etiquetaMes(mes) : "Sin mes (a cuenta)";
}

// =============================================================================
// Histórico mes a mes
// =============================================================================

/** Espejo del tope del API (`avionHistorico`: máximo 36 meses). */
export const MESES_HISTORICO_MAX = 36;

/**
 * `?desde&hasta` (meses) del histórico: lo mismo que el filtro del estado de
 * cuenta (inválido se ignora, futuro se recorta a hoy, invertido se
 * endereza, piso del inicio oficial con aviso) y además el tope de 36 meses
 * del API: un `desde` más viejo sube al tope.
 */
export function filtroMesesHistorico(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  mesHoy?: string | null,
  inicioOficial: InicioOficial = null,
): { desde?: string; hasta?: string; ajustado?: true } {
  const f = filtroMesesCuenta(desde, hasta, mesHoy, inicioOficial);
  const fin = f.hasta ?? (esMesValido(mesHoy) ? mesHoy : null);
  if (f.desde && fin) {
    const tope = sumarMeses(fin, -(MESES_HISTORICO_MAX - 1));
    if (tope && f.desde < tope) return { ...f, desde: tope };
  }
  return f;
}

export type ClaveColumnaHistorico = keyof TotalesHistoricoAvion | "cierre";

export interface ColumnaHistorico {
  clave: ClaveColumnaHistorico;
  etiqueta: string;
  tipo: "horas" | "entero" | "mxn" | "texto";
  /** «−» resta en la cascada, «+» suma; sin signo, un dato. */
  signo?: "-" | "+";
  /** Visible en la vista compacta (celular). */
  principal: boolean;
  /** Dato que NO entra al saldo (la reserva). */
  informativa?: boolean;
  /** Solo se pinta cuando el API manda el dato (llave ADITIVA: el combustible). */
  soloSiViene?: boolean;
  title?: string;
}

/** Columnas del histórico, en el orden de la cascada. */
export const COLUMNAS_HISTORICO: readonly ColumnaHistorico[] = [
  { clave: "horas_voladas_hr", etiqueta: "Horas", tipo: "horas", principal: true },
  { clave: "vuelos", etiqueta: "Vuelos", tipo: "entero", principal: true },
  { clave: "cobrado_mxn", etiqueta: "Cobrado", tipo: "mxn", principal: true },
  { clave: "comisiones_mxn", etiqueta: "Comisiones", tipo: "mxn", signo: "-", principal: false },
  { clave: "directos_mxn", etiqueta: "Directos", tipo: "mxn", signo: "-", principal: false },
  {
    clave: "combustible_mxn",
    etiqueta: "Combustible",
    tipo: "mxn",
    signo: "-",
    principal: false,
    soloSiViene: true,
    title: TITULO_FILA_COMBUSTIBLE,
  },
  { clave: "indirectos_mxn", etiqueta: "Indirectos", tipo: "mxn", signo: "-", principal: false },
  { clave: "permisos_mxn", etiqueta: "Permisos", tipo: "mxn", signo: "-", principal: false },
  { clave: "otros_mxn", etiqueta: "Fijos", tipo: "mxn", signo: "-", principal: false, title: SUBLABEL_FIJOS },
  { clave: "afac_mxn", etiqueta: "Provisión AFAC", tipo: "mxn", signo: "-", principal: false, title: TITULO_FILA_AFAC },
  { clave: "otros_ingresos_mxn", etiqueta: "Otros ingresos", tipo: "mxn", signo: "+", principal: false },
  { clave: "saldo_mxn", etiqueta: "Saldo", tipo: "mxn", principal: true },
  {
    clave: "reserva_mxn",
    etiqueta: "Reserva a guardar",
    tipo: "mxn",
    principal: true,
    informativa: true,
    title: TEXTO_RESERVA_NO_RESTA,
  },
  { clave: "entregado_mxn", etiqueta: "Entregado", tipo: "mxn", principal: true },
  { clave: "cierre", etiqueta: "Cierre", tipo: "texto", principal: true },
];

/**
 * Las columnas de la vista compacta (o todas). La de «Combustible» (API
 * 0.0.103) solo con `conCombustible`: con un API previo no existe el dato y
 * la tabla queda como siempre.
 */
export function columnasHistorico(
  completas: boolean,
  opts: { conCombustible?: boolean } = {},
): ColumnaHistorico[] {
  return COLUMNAS_HISTORICO.filter(
    (c) => (completas || c.principal) && (!c.soloSiViene || opts.conCombustible === true),
  );
}

/** ¿El histórico trae el combustible aparte? Si algún mes o los totales mandan `combustible_mxn`. */
export function historicoConCombustible(
  meses: ReadonlyArray<Pick<MesHistoricoAvion, "combustible_mxn">>,
  totales?: Pick<TotalesHistoricoAvion, "combustible_mxn"> | null,
): boolean {
  return numero(totales?.combustible_mxn) !== null || meses.some((m) => numero(m.combustible_mxn) !== null);
}

export const ETIQUETA_VER_TODAS_COLUMNAS = "Ver todas las columnas";
export const ETIQUETA_MENOS_COLUMNAS = "Menos columnas";

/** Texto de una celda del histórico (número del API; «−» en las que restan). */
export function textoCeldaHistorico(col: ColumnaHistorico, valor: number | null | undefined): string {
  const n = numero(valor);
  if (col.tipo === "horas") return n === null ? "—" : `${fmtDecimal(n, 1)} hr`;
  if (col.tipo === "entero") return n === null ? "—" : String(n);
  if (col.tipo === "mxn") {
    if (n === null) return "—";
    if (col.signo === "-" && n !== 0) return `−${fmtMxn(n)}`;
    if (col.signo === "+" && n !== 0) return `+${fmtMxn(n)}`;
    return fmtMxn(n);
  }
  return "";
}

/** «Abierto» · «Cerrado» · «Reabierto» · null (sin cierre). */
export function textoEstadoCierreMes(estado: string | null | undefined): string | null {
  switch (estado) {
    case "ABIERTO":
      return "Abierto";
    case "CERRADO":
      return "Cerrado";
    case "REABIERTO":
      return "Reabierto";
    default:
      return null;
  }
}

/** «Octubre 2026 (en curso)». */
export function etiquetaMesHistorico(mes: string, enCurso: boolean): string {
  return enCurso ? `${etiquetaMes(mes)} (en curso)` : etiquetaMes(mes);
}

export const TITULO_HISTORICO = "Histórico mes a mes";
export const AYUDA_HISTORICO =
  "Un reparto por mes, en pesos: la cascada completa, el saldo, la reserva que se debe guardar (no se resta) y lo entregado a los socios por este avión. El mes en curso todavía cambia.";
export const TITULO_SOCIOS_HISTORICO = "Socios en el rango";
export const AYUDA_SOCIOS_HISTORICO =
  "Lo que generó cada socio con este avión en los meses del rango (lo que se le entrega, ya con su reserva descontada si aplica), lo que debe guardar, lo entregado por este avión y lo que falta.";
export const TITULO_ENTREGAS_HISTORICO = "Entregas del rango";
export const TEXTO_SIN_MESES_HISTORICO = "Sin meses que mostrar en este rango.";
export const TEXTO_ERROR_CARGA_HISTORICO =
  "No se pudo cargar el histórico de este avión. Pulsa Reintentar; si sigue igual, avisa a sistemas.";
export const TEXTO_FILTRO_HISTORICO_IGNORADO =
  "El rango de meses de la dirección no era válido: se muestra el histórico completo.";
export const ETIQUETA_TODO_EL_HISTORICO = "Todo el histórico";
export const TITULO_PESOS_SIN_TC_MES =
  "Este mes tiene dólares que no se pudieron pasar a pesos (sin tipo de cambio): el saldo en pesos está incompleto.";

/** Un mes del histórico con sus textos listos (números del API). */
export interface FilaHistorico {
  mes: string;
  etiqueta: string;
  enCurso: boolean;
  celdas: Record<ClaveColumnaHistorico, string>;
  cierre: string | null;
  saldoNegativo: boolean;
  pesosIncompletos: boolean;
  reparto: RepartoMesSocio[];
}

export function filasHistorico(meses: readonly MesHistoricoAvion[]): FilaHistorico[] {
  return meses.map((m) => {
    const celdas = {} as Record<ClaveColumnaHistorico, string>;
    for (const col of COLUMNAS_HISTORICO) {
      celdas[col.clave] =
        col.clave === "cierre"
          ? (textoEstadoCierreMes(m.cierre_estado) ?? "")
          : textoCeldaHistorico(col, m[col.clave]);
    }
    return {
      mes: m.mes,
      etiqueta: etiquetaMesHistorico(m.mes, m.en_curso),
      enCurso: m.en_curso,
      celdas,
      cierre: textoEstadoCierreMes(m.cierre_estado),
      saldoNegativo: (numero(m.saldo_mxn) ?? 0) < 0,
      pesosIncompletos: (numero(m.pesos_sin_tc_usd) ?? 0) > 0,
      reparto: m.reparto ?? [],
    };
  });
}

/** La fila de totales con los mismos textos. */
export function celdasTotalesHistorico(t: TotalesHistoricoAvion): Record<ClaveColumnaHistorico, string> {
  const celdas = {} as Record<ClaveColumnaHistorico, string>;
  for (const col of COLUMNAS_HISTORICO) {
    celdas[col.clave] = col.clave === "cierre" ? "" : textoCeldaHistorico(col, t[col.clave]);
  }
  return celdas;
}

/** Meses del rango pedido que el API no mandó (futuros): «noviembre 2026 aún no llega». */
export function mesesFuturosDelRango(desde: string, hasta: string, mesActual: string): string[] {
  return mesesDeRango(desde, hasta).filter((m) => m > mesActual);
}

// =============================================================================
// Normalización de las respuestas (forma sana; nunca «sin datos» por basura)
// =============================================================================

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function socioDetalle(raw: unknown): SocioAvionDetalle | null {
  const s = obj(raw);
  if (!s || typeof s.socio_id !== "string") return null;
  return {
    socio_id: s.socio_id,
    socio_nombre: typeof s.socio_nombre === "string" && s.socio_nombre.trim() ? s.socio_nombre : "Socio",
    porcentaje: num(s.porcentaje),
    utilidad_mxn: num(s.utilidad_mxn),
    reserva_mxn: num(s.reserva_mxn),
    descuenta_reserva: s.descuenta_reserva === true,
    monto_mxn: num(s.monto_mxn),
    entregado_mxn: num(s.entregado_mxn),
    por_entregar_mxn: num(s.por_entregar_mxn),
    monto_usd: num(s.monto_usd),
    reserva_usd: num(s.reserva_usd),
  };
}

function pagos(raw: unknown): PagoSocio[] {
  return Array.isArray(raw) ? raw.map(normalizarPago).filter((p): p is PagoSocio => p !== null) : [];
}

/** `GET /v1/profit-sharing/aviones/:id` con forma sana; null = respuesta inservible (fallo). */
export function normalizarAvionDetalle(raw: unknown): AvionDetalleRespuesta | null {
  const r = obj(raw);
  const avion = obj(r?.avion);
  const aeronave = obj(avion?.aeronave);
  const periodo = obj(r?.periodo);
  if (!r || !avion || !aeronave || typeof aeronave.id !== "string") return null;
  if (!periodo || typeof periodo.desde !== "string" || typeof periodo.hasta !== "string") return null;
  return {
    ...(r as unknown as AvionDetalleRespuesta),
    periodo: { desde: periodo.desde, hasta: periodo.hasta },
    avion: avion as unknown as AvionReparto,
    socios: Array.isArray(r.socios)
      ? r.socios.map(socioDetalle).filter((s): s is SocioAvionDetalle => s !== null)
      : [],
    entregas: pagos(r.entregas),
  };
}

function repartoMes(raw: unknown): RepartoMesSocio | null {
  const s = obj(raw);
  if (!s || typeof s.socio_id !== "string") return null;
  return {
    socio_id: s.socio_id,
    socio_nombre: typeof s.socio_nombre === "string" && s.socio_nombre.trim() ? s.socio_nombre : "Socio",
    porcentaje: num(s.porcentaje),
    utilidad_mxn: num(s.utilidad_mxn),
    reserva_mxn: num(s.reserva_mxn),
    descuenta_reserva: s.descuenta_reserva === true,
    monto_mxn: num(s.monto_mxn),
    entregado_mxn: num(s.entregado_mxn),
  };
}

const LLAVES_MES: ReadonlyArray<keyof TotalesHistoricoAvion> = [
  "horas_voladas_hr",
  "vuelos",
  "cobrado_mxn",
  "pendiente_cobro_mxn",
  "comisiones_mxn",
  "directos_mxn",
  "indirectos_mxn",
  "permisos_mxn",
  "otros_mxn",
  "afac_mxn",
  "otros_ingresos_mxn",
  "saldo_mxn",
  "reserva_mxn",
  "reserva_retenida_mxn",
  "entregado_mxn",
  "pesos_sin_tc_usd",
  "saldo_usd",
];

function totalesHistorico(raw: unknown): TotalesHistoricoAvion {
  const t = obj(raw) ?? {};
  const out = {} as TotalesHistoricoAvion;
  for (const k of LLAVES_MES) out[k] = num(t[k]);
  // Combustible separado (API 0.0.103): ADITIVA, solo si viene (con un API
  // previo la columna no existe y no se inventa un 0).
  if (t.combustible_mxn != null) out.combustible_mxn = num(t.combustible_mxn);
  return out;
}

function mesHistorico(raw: unknown): MesHistoricoAvion | null {
  const m = obj(raw);
  const mes = typeof m?.mes === "string" ? m.mes.slice(0, 7) : "";
  if (!m || !esMesValido(mes)) return null;
  return {
    ...totalesHistorico(m),
    mes,
    en_curso: m.en_curso === true,
    reparto: Array.isArray(m.reparto)
      ? m.reparto.map(repartoMes).filter((s): s is RepartoMesSocio => s !== null)
      : [],
    ...(typeof m.cierre_estado === "string" ? { cierre_estado: m.cierre_estado } : {}),
  };
}

function socioHistorico(raw: unknown): SocioHistoricoAvion | null {
  const s = obj(raw);
  if (!s || typeof s.socio_id !== "string") return null;
  return {
    socio_id: s.socio_id,
    socio_nombre: typeof s.socio_nombre === "string" && s.socio_nombre.trim() ? s.socio_nombre : "Socio",
    generado_mxn: num(s.generado_mxn),
    reserva_mxn: num(s.reserva_mxn),
    entregado_mxn: num(s.entregado_mxn),
    por_entregar_mxn: num(s.por_entregar_mxn),
  };
}

/** `GET …/historico` con forma sana; null = respuesta inservible (fallo). */
export function normalizarAvionHistorico(raw: unknown): AvionHistoricoRespuesta | null {
  const r = obj(raw);
  const aeronave = obj(r?.aeronave);
  if (!r || !aeronave || typeof aeronave.id !== "string") return null;
  const desde = typeof r.desde === "string" ? r.desde.slice(0, 7) : "";
  const hasta = typeof r.hasta === "string" ? r.hasta.slice(0, 7) : "";
  if (!esMesValido(desde) || !esMesValido(hasta)) return null;
  const mesActual = typeof r.mes_actual === "string" ? r.mes_actual.slice(0, 7) : "";
  return {
    aeronave: {
      id: aeronave.id,
      matricula: typeof aeronave.matricula === "string" ? aeronave.matricula : "",
      modelo: typeof aeronave.modelo === "string" ? aeronave.modelo : "",
    },
    desde,
    hasta,
    mes_actual: esMesValido(mesActual) ? mesActual : hasta,
    reparto_en_pesos: r.reparto_en_pesos === true,
    reparto_como_balance: r.reparto_como_balance === true,
    meses: Array.isArray(r.meses)
      ? r.meses.map(mesHistorico).filter((m): m is MesHistoricoAvion => m !== null)
      : [],
    totales: totalesHistorico(r.totales),
    socios: Array.isArray(r.socios)
      ? r.socios.map(socioHistorico).filter((s): s is SocioHistoricoAvion => s !== null)
      : [],
    entregas: pagos(r.entregas),
  };
}
