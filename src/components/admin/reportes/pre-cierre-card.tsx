import Link from "next/link";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiServer } from "@/lib/api/server";
import { fmtDate } from "@/lib/datetime";
import { fmtMonto, fmtUsd } from "@/lib/format";
import { folioTexto } from "@/lib/admin/grupos-ui";
import {
  CLAVE_PRECIERRE_TACOS_OMITIDOS,
  lineasTramosOmitidos,
  lineasTramosTacos,
  MAX_TRAMOS_TACOS,
  type PreCierreTacoTramo,
} from "@/lib/admin/pre-cierre-tacos";
import {
  CLAVE_PRECIERRE_SEGUIMIENTO,
  hrefSeguimientoVuelo,
  textoAjustesPrecierre,
} from "@/lib/admin/seguimiento";
import {
  itemPreCierreVisible,
  textoConteoPreCierre,
} from "@/lib/admin/pre-cierre-items";
import {
  CLAVE_PRECIERRE_SOCIOS_ADELANTADOS,
  CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR,
  esClavePrecierreSocios,
  hrefPrecierreSocios,
  lineasPreCierreSocios,
  mesDePeriodo,
  notaPreCierreSocios,
} from "@/lib/admin/reparto-pagos";
import type { PreCierreSocioCuenta } from "@/types/reparto-pagos";
import {
  CLAVE_PRECIERRE_VUELOS_SIN_FACTURA,
  chipVueloSinFactura,
  hrefPrecierreVuelosSinFactura,
} from "@/lib/admin/pre-cierre-factura";
import {
  CLAVE_PRECIERRE_LIGAS_USD_TC,
  ETIQUETA_VER_CARGO,
  hrefLigasUsdTcPeriodo,
  lineasLigasUsdTc,
} from "@/lib/admin/pre-cierre-tc-usd";
import type { LigaUsdTcPreCierre } from "@/types/conciliacion";
import {
  AYUDA_DIFERENCIA_CAMBIARIA,
  CLAVE_PRECIERRE_PERMISOS_SIN_AVION,
  ETIQUETA_DIFERENCIA_CAMBIARIA,
  esDiferenciaCambiaria,
  hrefPrecierrePermisosSinAvion,
} from "@/lib/admin/pre-cierre-anticipo-afac";
import {
  CLAVE_PRECIERRE_MOVIMIENTOS_OMITIDOS,
  ETIQUETA_REVISAR_OMITIDOS,
  hrefPrecierreMovimientosOmitidos,
} from "@/lib/admin/pre-cierre-omitidos";
import {
  CLAVE_PRECIERRE_COBRADOS_DE_MAS,
  hrefPrecierreCobradosDeMas,
  lineaExplicadosPreCierre,
  sufijoCausaPreCierre,
  tituloCausaPreCierre,
} from "@/lib/admin/cobrado-de-mas";
import { chipParcialPreCierre } from "@/lib/admin/cobro-banco";
import {
  CLAVE_PRECIERRE_TUA_PAGADA_SIN_COBRAR,
  chipVueloTuaPagada,
  hrefPrecierreTuaPagada,
  type ChipPreCierre,
} from "@/lib/admin/pre-cierre-tua-pagada";
import {
  CLAVE_PRECIERRE_TRANSPORTE_PAGADO_SIN_COTIZAR,
  chipVueloTransporte,
  hrefPrecierreTransporte,
} from "@/lib/admin/pre-cierre-transporte";
import { hrefConciliacion } from "@/lib/admin/conciliacion-vista";
import {
  CLAVE_PRECIERRE_NOMINA_SIN_REPARTIR,
  hrefPrecierreNominaSinRepartir,
} from "@/lib/admin/nomina";
import {
  CLAVE_PRECIERRE_GASTOS_POR_PAGAR,
  hrefPrecierreGastosPorPagar,
} from "@/lib/admin/gasto-por-pagar";
import { ANCLA_PRE_CIERRE, hrefResolverItem } from "@/lib/admin/pre-cierre-resolver";
import { lineasLeyendaPreCierre, textoBadgeCierrePeriodo } from "@/lib/admin/cierre-mes";
import { ChipEstadoCierre, ChipMarcaCierre } from "@/components/admin/chip-cierre";
import type { CierrePeriodoAditivo } from "@/types/cierres";

/** Gasto que parece transporte de pasajeros (transporte_pagado_sin_cotizar). Del API. */
interface PreCierreGastoTransporte {
  id: string;
  texto: string;
  monto: number;
  moneda: string;
}

interface PreCierreVuelo {
  id: string;
  folio: number;
  estado?: string;
  saldo_usd?: number;
  /** ADITIVO (grupos, 4-sep-2026): folio del grupo si el vuelo es hijo de
      una cotización de grupo (cobros_pendientes). */
  grupo_folio?: number | null;
  /** ADITIVO (seguimiento_cotizacion_pendiente, 29-sep-2026): notas
      PENDIENTES que afectan la cotización en ese vuelo. */
  notas?: number;
  /** ADITIVOS (vuelos_cobrados_sin_factura, 13-oct-2026, invariante 60 del
      API): cuentas que exigen la factura, si ya está en «Por facturar» y la
      matrícula. `estado` viaja SOLO en un cancelado («CANCELADO»). */
  cuentas?: string[];
  solicitada?: boolean;
  matricula?: string | null;
  fecha_vuelo?: string | null;
  /** ADITIVOS (vuelos_cobrados_sin_factura, 16-oct-2026, API 0.0.82): el
      vuelo YA tiene factura («A-0420») pero N de sus cobros que exigen
      factura no están amparados por ninguna ⇒ chip
      «#332 (A-0420 · 3 cobros sin factura · Scotiabank Pesos)». */
  registrada?: string | null;
  cobros_sin_factura?: number | null;
  /** ADITIVOS (tua_pagada_sin_cobrar, 15-oct-2026, API 0.0.81, NO bloquea):
      TUA pagada por Operación (IVA incluido) en la moneda de cada gasto
      —nunca sumadas entre sí—, si el pasajero compró su pase de abordar y
      cuántos gastos la pagan. Chip «#70 ($2,355.39 MXN · 2 facturas)». */
  tua_pagada_mxn?: number;
  tua_pagada_usd?: number;
  pase_abordar?: boolean;
  gastos_n?: number;
  /** ADITIVO (transporte_pagado_sin_cotizar, 15-oct-2026, API 0.0.81, NO
      bloquea): los gastos que parecen transporte de pasajeros (texto ≤ 60).
      Los montos del vuelo viajan en `monto_mxn` / `monto_usd`. */
  gastos?: PreCierreGastoTransporte[];
  monto_mxn?: number;
  monto_usd?: number;
  /** ADITIVO (cobros_en_cancelados, 14-oct-2026, API 0.0.77; solo cuando
      aplica): el dinero ya se devolvió completo y lo que el reparto cuenta
      es la diferencia cambiaria ⇒ chip «#215 (diferencia cambiaria)». */
  diferencia_cambiaria?: boolean;
  /** ADITIVOS (vuelos_cobrados_de_mas, 14-oct-2026, API 0.0.78, NO bloquea):
      la causa probable del excedente (`saldo_usd` = el excedente) ⇒ chip
      «#217 ($495.99) · IVA». */
  causa?: string;
  causa_etiqueta?: string;
  excedente_usd?: number;
  /** ADITIVOS (cierre de mes, 16-oct-2026, API 0.0.88): en `cobros_pendientes`
      el mes al que pasará al cerrar y su leyenda («Pasará a noviembre 2026 al
      cerrar (cobrado $0.00 de $2,076.40 USD)»); en `vuelos_que_vienen` el mes
      de origen y «Viene de septiembre 2026». Textos del API, tal cual. */
  leyenda?: string | null;
  pasara_a?: string | null;
  origen?: string | null;
  cobrado_al_corte_usd?: number | null;
}

/** Cobro sin banco al corte (cobros_bancarios_sin_conciliar). Montos del API. */
interface PreCierreCobroBanco {
  tipo?: string;
  id: string;
  folio?: number | null;
  grupo_folio?: number | null;
  moneda?: string;
  /** ADITIVOS (API 0.0.78): con abonos que no lo completan y lo que falta. */
  parcial?: boolean;
  faltante?: number;
  monto_vinculado?: number;
}

/** Grupo con saldo por cobrar (clave grupo_con_saldo). Montos del API. */
interface PreCierreGrupo {
  grupo_id: string;
  grupo_folio: number;
  nombre: string | null;
  aviones: number;
  total_usd: number;
  cobrado_usd: number;
  saldo_usd: number;
}

/** Sobre de cobro de grupo descuadrado (clave sobres_descuadrados). */
interface PreCierreSobre {
  sobre_id: string;
  grupo_id: string;
  grupo_folio: number | null;
  /** timestamptz: formatear en hora Cancún. */
  fecha_cobro: string | null;
  monto: number;
  moneda: string;
  suma_partes: number;
  partes_en_cancelados: number;
}

interface PreCierreItem {
  clave: string;
  titulo: string;
  detalle: string;
  count: number;
  monto_usd?: number;
  monto_mxn?: number;
  monto?: number;
  vuelos?: PreCierreVuelo[];
  /** ADITIVOS (grupos): lista de grupos / sobres del aviso. */
  grupos?: PreCierreGrupo[];
  sobres?: PreCierreSobre[];
  /** ADITIVO (tacos_en_revision, 14-sep-2026): QUÉ tramos hay que revisar.
      Pedido del cliente: el item solo decía "· 3" y había que ir a buscarlos
      a taco-live. Ausente con un API sin desplegar = card como antes. */
  tramos?: PreCierreTacoTramo[];
  /** ADITIVO: aviso informativo (el dinero YA cuenta; nada que resolver
      salvo confirmar). Se pinta en azul, sin "Resolver" (salvo el enlace
      para REVISAR que algunos llevan: los omitidos de la conciliación). */
  informativo?: boolean;
  /** ADITIVO (29-sep-2026, hoy en seguimiento_cotizacion_pendiente): el API
      NO pudo leer el dato y manda count 0. El renglón se pinta igual con
      «sin verificar» — un 0 por lectura fallida no es «no hay». */
  lectura_fallida?: boolean;
  /** ADITIVO (socios_por_entregar / socios_adelantados, cuenta corriente de
      los socios, 1-oct-2026, API 0.0.50): socios con saldo por entregar o
      adelantados (máx. 50). */
  socios?: PreCierreSocioCuenta[];
  /** ADITIVO (mismos items, API 0.0.50): el MES del cierre (`YYYY-MM`) con
      el que el API contó las utilidades «hasta». */
  mes?: string;
  /** ADITIVOS (gastos_usd_tc_fuera_de_lugar, 13-oct-2026, API 0.0.75, NO
      bloquea): cada gasto en dólares conciliado con un cargo en pesos cuyo
      T.C. queda lejos del oficial del día del cargo, ya redactado; y cuántos
      no se pudieron revisar (sin T.C. oficial de su día). */
  ligas?: LigaUsdTcPreCierre[];
  sin_verificar?: number;
  /** ADITIVOS (vuelos_cobrados_de_mas, API 0.0.78): los vuelos cuya
      diferencia está EXPLICADA (comisión del link, redondeo del T.C.): no
      cuentan; van en una línea gris. */
  explicados?: PreCierreVuelo[];
  explicados_n?: number;
  /** ADITIVOS (cobros_bancarios_sin_conciliar): los cobros y, desde el API
      0.0.78, cuántos son PARCIALES. */
  cobros?: PreCierreCobroBanco[];
  parciales?: number;
  /** ADITIVOS («Resolver →» que marca en ámbar, 15-oct-2026, API 0.0.81):
      los registros CONTADOS (gasto o movimiento) de los 11 renglones que no
      traen su propio arreglo con id; tope 500 y `ids_truncado` al cortar.
      El panel los anexa al «Resolver →» (`hrefResolverItem`); ausentes con
      un API previo ⇒ la franja dice «N por resolver» sin resaltar. */
  ids?: string[];
  ids_truncado?: true;
}

interface PreCierre {
  periodo: { desde: string; hasta: string };
  listo: boolean;
  items: PreCierreItem[];
  /** ADITIVO (cierre de mes, 16-oct-2026, API 0.0.88): estado del mes. */
  cierre?: CierrePeriodoAditivo | null;
}

/** A dónde ir a resolver cada pendiente del checklist. */
// Links "Resolver" en función del PERIODO del checklist: sin el rango, la
// lista destino mezclaba pendientes de todos los tiempos y el conteo no
// cuadraba con el "· N" del item.
const LINK_POR_CLAVE: Record<
  string,
  (p: { desde: string; hasta: string }) => string
> = {
  // Nómina sin repartir (BLOQUEANTE, API 0.0.90): se reparte en Nómina, en el
  // mes del periodo; el foco ámbar (`pc`/`ids`) lo agrega `hrefResolverItem`.
  [CLAVE_PRECIERRE_NOMINA_SIN_REPARTIR]: hrefPrecierreNominaSinRepartir,
  // Gastos por pagar sin confirmar (BLOQUEANTE, 19-oct-2026, API 0.0.95):
  // Gastos con el filtro «Por pagar» del periodo, donde cada fila tiene
  // «Marcar pagado»; el foco ámbar (`pc`/`ids`) lo agrega `hrefResolverItem`.
  [CLAVE_PRECIERRE_GASTOS_POR_PAGAR]: hrefPrecierreGastosPorPagar,
  // Vuelos sin completar: la lista del periodo (externos incluidos — esos
  // se completan a mano en su detalle y NO aparecen en taco-live).
  vuelos_sin_completar: (p) =>
    `/admin/flights?desde=${p.desde}&hasta=${p.hasta}`,
  // Tacómetros en revisión: el item lista los vuelos y los TRAMOS (14-sep),
  // pero "Resolver" sigue yendo a taco-live — ahí es donde se anota,
  // corrige o confirma la lectura.
  tacos_en_revision: () => "/admin/taco-live",
  cobros_pendientes: (p) =>
    `/admin/flights?cobro=POR_COBRAR&desde=${p.desde}&hasta=${p.hasta}`,
  // Gastos sin avión (15-oct-2026): la pestaña «Pendientes» DEL PERIODO es
  // el universo exacto (antes «Todos» sin fechas: había que buscarlos).
  gastos_sin_avion: (p) =>
    `/admin/expenses?f=pendientes&desde=${p.desde}&hasta=${p.hasta}`,
  // Permisos sin avión (14-oct-2026, API 0.0.77, BLOQUEA: «el AFAC lo cargan
  // al Avión»): Gastos con los permisos del periodo, donde se asigna el avión.
  [CLAVE_PRECIERRE_PERMISOS_SIN_AVION]: hrefPrecierrePermisosSinAvion,
  gastos_sin_tc: (p) => `/admin/expenses?desde=${p.desde}&hasta=${p.hasta}`,
  // Cobros MXN sin TC que ni el TC oficial convierte: se captura el TC en
  // el vuelo (los folios del item llevan directo a cada uno).
  cobros_sin_tc: (p) => `/admin/flights?desde=${p.desde}&hasta=${p.hasta}`,
  // El comprobante trae otra matrícula: se corrige el avión en Gastos.
  matricula_recibo_distinta: (p) =>
    `/admin/expenses?desde=${p.desde}&hasta=${p.hasta}`,
  // Directo a Gastos filtrado a "sin facturar" (pendiente + solicitada) DEL
  // PERIODO: ahí está el semáforo para irlos resolviendo uno por uno.
  gastos_sin_comprobante: (p) =>
    `/admin/expenses?facturacion=NO_FACTURADA&desde=${p.desde}&hasta=${p.hasta}`,
  // El honorario del piloto externo se captura desde el VUELO (card «Gastos
  // del vuelo»): la lista de vuelos del periodo, donde se resaltan (15-oct-
  // 2026; antes Gastos, donde el gasto aún no existe y no hay fila que marcar).
  externos_sin_honorario: (p) => `/admin/flights?desde=${p.desde}&hasta=${p.hasta}`,
  // Movimientos sin conciliar: la pestaña «Pendientes» del periodo.
  sin_conciliar: (p) => hrefConciliacion({ f: "pendientes", desde: p.desde, hasta: p.hasta }),
  // Gastos / cobros bancarios que no aparecen en ningún estado de cuenta:
  // las pestañas espejo de Conciliación (Paywise incluido), DEL PERIODO
  // (antes «últimos 90 días»: el conteo no cuadraba con el «· N»).
  gastos_bancarios_sin_conciliar: (p) =>
    hrefConciliacion({ f: "sin_banco", desde: p.desde, hasta: p.hasta }),
  cobros_bancarios_sin_conciliar: (p) =>
    hrefConciliacion({ f: "cobros_sin_banco", desde: p.desde, hasta: p.hasta }),
  // Otros gastos es de un MES: el del periodo (o el mes de su «desde»).
  repartos_incoherentes: (p) =>
    `/admin/otros-gastos?mes=${mesDePeriodo(p.desde, p.hasta) ?? p.desde.slice(0, 7)}`,
  // ENLACES NUEVOS (15-oct-2026): renglones cuyo `detalle` ya nombraba la
  // pantalla pero no tenían «Resolver →».
  // Combustible sin avión (BLOQUEA): Combustibles del mes, donde se asigna.
  combustible_sin_avion: (p) =>
    `/admin/combustibles?mes=${mesDePeriodo(p.desde, p.hasta) ?? p.desde.slice(0, 7)}`,
  duplicados_sin_resolver: (p) =>
    `/admin/expenses?f=duplicados&desde=${p.desde}&hasta=${p.hasta}`,
  fijos_con_avion: (p) =>
    `/admin/expenses?categoria=FIJO&desde=${p.desde}&hasta=${p.hasta}`,
  // Sin precio / extras sin desglose: se cotiza o se revisa la cotización.
  vuelos_sin_precio: (p) => `/admin/quotes?desde=${p.desde}&hasta=${p.hasta}`,
  extras_sin_desglose: (p) => `/admin/quotes?desde=${p.desde}&hasta=${p.hasta}`,
  fechas_tramos_incoherentes: (p) => `/admin/flights?desde=${p.desde}&hasta=${p.hasta}`,
  vuelos_sin_gasto_operaciones: (p) => `/admin/flights?desde=${p.desde}&hasta=${p.hasta}`,
  [CLAVE_PRECIERRE_SEGUIMIENTO]: (p) => `/admin/flights?desde=${p.desde}&hasta=${p.hasta}`,
  // Cotizaciones de GRUPO: la lista de grupos del periodo (cada grupo del
  // item lleva además su link directo). El saldo se cobra desde "Cobros del
  // grupo" (sobre) o por avión.
  grupo_con_saldo: (p) => `/admin/quotes/grupo?desde=${p.desde}&hasta=${p.hasta}`,
  // Sobre descuadrado: se re-parte desde Cobros del grupo.
  sobres_descuadrados: (p) => `/admin/quotes/grupo?desde=${p.desde}&hasta=${p.hasta}`,
  // Cuenta corriente de los socios (1-oct-2026): «Pagos a socios», donde se
  // registra cada entrega (el saldo es de toda la cuenta, no del periodo).
  [CLAVE_PRECIERRE_SOCIOS_POR_ENTREGAR]: hrefPrecierreSocios,
  [CLAVE_PRECIERRE_SOCIOS_ADELANTADOS]: hrefPrecierreSocios,
  // Factura obligatoria por cuenta de cobro (13-oct-2026): se registra en
  // Facturas emitidas (los chips llevan a la card de cobros de cada vuelo).
  [CLAVE_PRECIERRE_VUELOS_SIN_FACTURA]: hrefPrecierreVuelosSinFactura,
  // Renglones inversos (15-oct-2026, API 0.0.81, NO bloquean): se resuelven
  // en la cotización —«Se cobran TUAS» / extra—; la lista del periodo, y
  // cada chip a la cotización del vuelo. Ese día se RETIRARON las pistas
  // por tramo y la «TUA cobrada sin TUA pagada» (sus claves no se reusan).
  [CLAVE_PRECIERRE_TUA_PAGADA_SIN_COBRAR]: hrefPrecierreTuaPagada,
  [CLAVE_PRECIERRE_TRANSPORTE_PAGADO_SIN_COTIZAR]: hrefPrecierreTransporte,
  // Gastos en dólares con un T.C. fuera de lugar (13-oct-2026, API 0.0.75,
  // NO bloquea): se revisan en Conciliación, pestaña conciliados, del
  // periodo (cada renglón lleva además su cargo y su vuelo).
  [CLAVE_PRECIERRE_LIGAS_USD_TC]: hrefLigasUsdTcPeriodo,
  // Movimientos del banco omitidos de la conciliación (14-oct-2026, API
  // 0.0.77, INFORMATIVO): la pestaña «Omitidos» DEL PERIODO (el API cuenta
  // por la fecha del movimiento; sin las fechas no cuadraría con el «· N»).
  [CLAVE_PRECIERRE_MOVIMIENTOS_OMITIDOS]: hrefPrecierreMovimientosOmitidos,
  // Vuelos cobrados de más (14-oct-2026, API 0.0.78, NO bloquea): la lista de
  // vuelos del periodo; cada chip lleva a la card de cobros de su vuelo, donde
  // el aviso dice la causa y qué hacer.
  [CLAVE_PRECIERRE_COBRADOS_DE_MAS]: hrefPrecierreCobradosDeMas,
  // Cierre de mes (16-oct-2026, API 0.0.88, INFORMATIVO): no hay link de
  // renglón; cada vuelo lleva a su detalle (sus fechas reales son de otro mes
  // y la lista de vuelos del periodo no los mostraría).
};

/** El texto del enlace cuando no es «Resolver →» (un renglón informativo se REVISA). */
const ETIQUETA_LINK_POR_CLAVE: Record<string, string> = {
  [CLAVE_PRECIERRE_MOVIMIENTOS_OMITIDOS]: ETIQUETA_REVISAR_OMITIDOS,
};

/**
 * Renglones cuyos chips dicen MÁS que «#folio» y llevan a otro lado (helper
 * PURO por clave: texto, destino y `title` con qué hacer). El resto usa el
 * renderer genérico (`#folio` + sufijo, al detalle del vuelo).
 * - Factura obligatoria (13-oct-2026): «#341 (HSBC Pesos · pedida)» a la
 *   card de cobros del vuelo.
 * - Renglones inversos (15-oct-2026): «#70 ($2,355.39 MXN · 2 facturas)» /
 *   «#190 ($400 MXN · Transporte Chetumal a Carl's…)» a la cotización.
 */
const CHIP_POR_CLAVE: Record<string, (v: PreCierreVuelo) => ChipPreCierre> = {
  [CLAVE_PRECIERRE_VUELOS_SIN_FACTURA]: chipVueloSinFactura,
  [CLAVE_PRECIERRE_TUA_PAGADA_SIN_COBRAR]: chipVueloTuaPagada,
  [CLAVE_PRECIERRE_TRANSPORTE_PAGADO_SIN_COTIZAR]: chipVueloTransporte,
};

/**
 * Monto del renglón con la regla de `lib/format` (revisión del lote 2,
 * 14-oct-2026): entero sin decimales o EXACTAMENTE 2 — nunca «$172.4 USD»
 * (`toLocaleString` daba 0 a 3 decimales; el renglón de TUA cobrada lo
 * estrenó con sumas que casi nunca son cerradas). Con dólares Y pesos (p. ej.
 * `permisos_sin_avion`, API 0.0.77: el API los manda por separado y jamás los
 * suma) se dicen LOS DOS — antes solo salían los dólares y los pesos se
 * perdían de la vista.
 */
function textoMontoItem(item: PreCierreItem): string | null {
  const usd = item.monto_usd != null && item.monto_usd > 0 ? fmtMonto(item.monto_usd, "USD") : null;
  const mxn = item.monto_mxn != null && item.monto_mxn > 0 ? fmtMonto(item.monto_mxn, "MXN") : null;
  if (usd || mxn) return [usd, mxn].filter(Boolean).join(" · ");
  if (item.monto != null && item.monto > 0) return fmtUsd(item.monto);
  return null;
}

/**
 * Checklist de pre-cierre: el sistema caza los huecos del periodo (vuelos sin
 * completar, tacos amarillos, gastos sin TC…) para que el empleado solo
 * supervise. Verde = se puede cerrar con números completos.
 */
export async function PreCierreCard({
  desde,
  hasta,
}: {
  desde: string;
  hasta: string;
}) {
  let data: PreCierre | null = null;
  try {
    data = await apiServer<PreCierre>("/v1/profit-sharing/pre-cierre", {
      searchParams: { desde, hasta },
      cache: "no-store",
    });
  } catch {
    // data queda null: abajo se muestra la card de error.
  }
  // Si la verificación FALLA, el checklist no puede desaparecer en silencio:
  // el operador generaría el cierre creyendo que no había pendientes.
  if (!data) {
    return (
      <Card id={ANCLA_PRE_CIERRE} className="scroll-mt-24 border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-destructive" />
            Pre-cierre del periodo
          </CardTitle>
          <CardDescription>
            No se pudo verificar el pre-cierre (falló la consulta al servidor).
            No generes el cierre hasta que este checklist cargue: sin él no hay
            garantía de que el periodo esté completo. Recarga la página para
            reintentar.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Con pendientes o con la lectura FALLIDA (`itemPreCierreVisible`): un
  // renglón que no se pudo verificar jamás desaparece en silencio.
  const pendientes = data.items.filter(itemPreCierreVisible);

  return (
    <Card
      id={ANCLA_PRE_CIERRE}
      className={
        data.listo
          ? "scroll-mt-24 border-emerald-500/40"
          : "scroll-mt-24 border-amber-500/40"
      }
    >
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {data.listo ? (
            <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
          ) : (
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
          )}
          Pre-cierre del periodo
          {/* Mes cerrado (API 0.0.88): el pre-cierre se sigue calculando en
              vivo, pero el estado del cierre manda. */}
          <ChipEstadoCierre badge={textoBadgeCierrePeriodo(data.cierre)} className="font-normal" />
        </CardTitle>
        <CardDescription>
          {data.listo
            ? "Todo en orden: los números del periodo están completos para generar el cierre."
            : "El sistema encontró pendientes que dejarían el cierre incompleto. Resuélvelos antes de generar los reportes."}
        </CardDescription>
      </CardHeader>
      {pendientes.length > 0 && (
        <CardContent className="space-y-3">
          {pendientes.map((item) => {
            const monto = textoMontoItem(item);
            // «Resolver →» con FOCO (15-oct-2026): la pantalla de siempre +
            // `pc`/`ids`/… para que pinte en ámbar lo que hay que resolver.
            // Los informativos llevan su enlace tal cual.
            const href = hrefResolverItem(
              item,
              { desde, hasta },
              LINK_POR_CLAVE[item.clave]?.({ desde, hasta }),
            );
            const info = item.informativo === true;
            // Chips con helper propio (factura obligatoria y los renglones
            // inversos); sin entrada ⇒ renderer genérico de abajo.
            const chipDeClave = CHIP_POR_CLAVE[item.clave];
            // Tramos con tacómetro en revisión: las líneas las arma el
            // helper PURO (no se recalcula ningún conteo del API). El «y N
            // más…» sale del `count` del item, no del largo del arreglo: el
            // API topa `tramos` en 200 y `count` siempre es el total real.
            // «Tacómetros omitidos» (INFORMATIVO, 15-oct-2026, API 0.0.81):
            // las mismas líneas, con «Omitido por {quién} ({cuándo}): {motivo}»
            // en lugar del motivo de revisión. Sin «Resolver →» (no tiene
            // entrada en LINK_POR_CLAVE): cada chip/línea lleva a su vuelo.
            const tacos =
              item.clave === CLAVE_PRECIERRE_TACOS_OMITIDOS
                ? lineasTramosOmitidos(item.tramos, MAX_TRAMOS_TACOS, item.count)
                : lineasTramosTacos(item.tramos, MAX_TRAMOS_TACOS, item.count);
            // Socios por entregar / adelantados: líneas del helper PURO
            // (saldos del API; el «y N más» sale del `count`).
            // Cada línea dice «por entregar hasta Septiembre 2026: $X USD»
            // (el mes del API o, si no lo manda, el del periodo) y la nota
            // explica que «Pagos a socios» enseña el saldo de HOY.
            const esSocios = esClavePrecierreSocios(item.clave);
            const mesSocios = esSocios ? (item.mes ?? mesDePeriodo(desde, hasta)) : null;
            const sociosLineas = esSocios
              ? lineasPreCierreSocios(item.socios, item.clave, undefined, item.count, mesSocios)
              : { lineas: [], restantes: 0 };
            const notaSocios =
              esSocios && sociosLineas.lineas.length > 0
                ? notaPreCierreSocios(item.clave, mesSocios)
                : null;
            // Con la lista del panel, el `detalle` del API la repetiría.
            const ocultarDetalle = esSocios && sociosLineas.lineas.length > 0;
            // Gastos en dólares con un T.C. fuera de lugar: un renglón por liga
            // (texto del API) con el cargo y el vuelo; «y N más…» contra `count`.
            const ligasUsd =
              item.clave === CLAVE_PRECIERRE_LIGAS_USD_TC
                ? lineasLigasUsdTc(item.ligas, item.count)
                : { lineas: [], restantes: 0 };
            // Vuelos cobrados de más (API 0.0.78): los EXPLICADOS no cuentan;
            // el `detalle` del API ya dice «Además hay N vuelo(s) con la
            // diferencia explicada…» y la línea gris dice CUÁLES («Con la
            // diferencia explicada: #81 y #84 (…).», revisión del 15-oct-2026).
            const esCobradosDeMas = item.clave === CLAVE_PRECIERRE_COBRADOS_DE_MAS;
            const explicados = esCobradosDeMas ? lineaExplicadosPreCierre(item.explicados) : null;
            // Cierre de mes (API 0.0.88): la leyenda de cada vuelo de
            // `cobros_pendientes` («Pasará a noviembre 2026 al cerrar…») y de
            // `vuelos_que_vienen` («Viene de septiembre 2026»). Con leyendas,
            // reemplazan a los chips genéricos (dirían el mismo folio dos veces).
            const leyendas = lineasLeyendaPreCierre(
              item.clave in CHIP_POR_CLAVE ? null : item.vuelos,
              item.count,
            );
            // Cobros sin banco: los PARCIALES (API 0.0.78) dicen lo que falta.
            const parciales =
              item.clave === "cobros_bancarios_sin_conciliar"
                ? (item.cobros ?? [])
                    .map((c) => ({ id: c.id, texto: chipParcialPreCierre(c) }))
                    .filter((c): c is { id: string; texto: string } => c.texto !== null)
                : [];
            return (
              <div
                key={item.clave}
                className={`flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 ${
                  info ? "border-sky-500/30 bg-sky-500/[0.04]" : "border-border"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {info && (
                      <InformationCircleIcon
                        aria-label="Informativo"
                        className="mr-1 inline h-4 w-4 align-text-bottom text-sky-600 dark:text-sky-400"
                      />
                    )}
                    {item.titulo}{" "}
                    <span
                      className={`font-semibold ${
                        info ? "text-sky-700 dark:text-sky-300" : "text-amber-600"
                      }`}
                    >
                      · {textoConteoPreCierre(item)}
                    </span>
                    {monto && (
                      <span className="text-muted-foreground"> · {monto}</span>
                    )}
                  </p>
                  {!ocultarDetalle && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.detalle}
                    </p>
                  )}
                  {/* Chips con helper propio (`CHIP_POR_CLAVE`): factura
                      obligatoria (cuenta / pedida / cancelado, a la card de
                      cobros) y los renglones inversos del 15-oct-2026 (TUA
                      pagada sin cobrar, transporte pagado sin cotizar: a la
                      cotización del vuelo). Mismo tope de 8 + «y N más…». */}
                  {chipDeClave &&
                    item.vuelos &&
                    item.vuelos.length > 0 && (
                      <p className="text-xs mt-1 flex flex-wrap gap-1.5" data-precierre-chips={item.clave}>
                        {item.vuelos.slice(0, 8).map((v) => {
                          const chip = chipDeClave(v);
                          return (
                            <Link
                              key={v.id}
                              href={chip.href}
                              title={chip.title}
                              className="cursor-pointer underline underline-offset-2 hover:text-foreground text-muted-foreground"
                            >
                              {chip.texto}
                            </Link>
                          );
                        })}
                        {item.vuelos.length > 8 && (
                          <span className="text-muted-foreground">
                            y {item.vuelos.length - 8} más…
                          </span>
                        )}
                      </p>
                    )}
                  {leyendas.lineas.length > 0 && (
                    <ul className="text-xs mt-1 space-y-0.5" data-precierre-leyendas={item.clave}>
                      {leyendas.lineas.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                          <Link
                            href={`/admin/flights/${l.id}`}
                            className="cursor-pointer underline underline-offset-2 hover:text-foreground"
                          >
                            {l.folio}
                          </Link>
                          {l.tono ? <ChipMarcaCierre marca={l.texto} /> : <span>{l.texto}</span>}
                        </li>
                      ))}
                      {leyendas.restantes > 0 && (
                        <li className="text-muted-foreground">y {leyendas.restantes} más…</li>
                      )}
                    </ul>
                  )}
                  {!chipDeClave &&
                    item.vuelos && item.vuelos.length > 0 &&
                    leyendas.lineas.length === 0 && (
                    <p className="text-xs mt-1 flex flex-wrap gap-1.5">
                      {item.vuelos.slice(0, 8).map((v) => (
                        <Link
                          key={v.id}
                          // Ajustes pendientes de cotizar (29-sep-2026): el
                          // chip lleva DIRECTO a la card del seguimiento.
                          href={
                            item.clave === CLAVE_PRECIERRE_SEGUIMIENTO
                              ? hrefSeguimientoVuelo(v.id)
                              : `/admin/flights/${v.id}`
                          }
                          // Cancelado cuyo dinero ya se devolvió (API 0.0.77):
                          // el chip dice por qué todavía cuenta. Cobrado de
                          // más (API 0.0.78): la causa probable completa.
                          title={
                            esDiferenciaCambiaria(v)
                              ? AYUDA_DIFERENCIA_CAMBIARIA
                              : esCobradosDeMas
                                ? tituloCausaPreCierre(v)
                                : undefined
                          }
                          className="underline underline-offset-2 hover:text-foreground text-muted-foreground"
                        >
                          {v.folio > 0 ? `#${v.folio}` : "vuelo"}
                          {v.saldo_usd != null
                            ? ` (${fmtUsd(v.saldo_usd)})`
                            : v.notas != null && v.notas > 0
                              ? ` (${textoAjustesPrecierre(v.notas)})`
                              : esDiferenciaCambiaria(v)
                                ? ` (${ETIQUETA_DIFERENCIA_CAMBIARIA})`
                                : v.estado
                                  ? ` (${v.estado})`
                                  : ""}
                          {/* «#217 ($495.99) · IVA»: la causa del API. */}
                          {esCobradosDeMas && sufijoCausaPreCierre(v.causa)
                            ? ` ${sufijoCausaPreCierre(v.causa)}`
                            : ""}
                          {/* Hijo de un grupo: "G-12" junto al folio. */}
                          {v.grupo_folio != null && (
                            <span
                              className="text-fuchsia-700 dark:text-fuchsia-300"
                              title="Vuelo de una cotización de grupo"
                            >
                              {" "}
                              · {folioTexto(v.grupo_folio)}
                            </span>
                          )}
                        </Link>
                      ))}
                      {item.vuelos.length > 8 && (
                        <span className="text-muted-foreground">
                          y {item.vuelos.length - 8} más…
                        </span>
                      )}
                    </p>
                  )}
                  {/* Vuelos cobrados de más: los explicados (no cuentan) en gris. */}
                  {explicados && (
                    <p className="text-[11px] text-muted-foreground mt-1" data-precierre-explicados>
                      {explicados}
                    </p>
                  )}
                  {/* Cobros sin banco PARCIALES (API 0.0.78): lo que falta de cada uno. */}
                  {parciales.length > 0 && (
                    <p className="text-xs mt-1 flex flex-wrap gap-1.5" data-precierre-parciales>
                      {parciales.slice(0, 8).map((c) => (
                        <span key={c.id} className="text-amber-700 dark:text-amber-300">
                          {c.texto}
                        </span>
                      ))}
                      {parciales.length > 8 && (
                        <span className="text-muted-foreground">y {parciales.length - 8} más…</span>
                      )}
                    </p>
                  )}
                  {/* Tacómetros en revisión: QUÉ tramo y por qué, agrupado
                      por vuelo. El chip de arriba lleva al vuelo; "Resolver"
                      sigue yendo a /admin/taco-live, que es donde se anota o
                      se confirma la lectura. «Tacómetros omitidos»: quién,
                      cuándo y por qué se omitió cada tramo (informativo). */}
                  {tacos.lineas.length > 0 && (
                    <ul className="text-xs mt-1 space-y-0.5" data-precierre-tramos={item.clave}>
                      {tacos.lineas.map((l) => (
                        <li key={l.key} className="text-muted-foreground">
                          <Link
                            href={l.href}
                            className="cursor-pointer underline underline-offset-2 hover:text-foreground"
                          >
                            {l.folio}
                          </Link>{" "}
                          · {l.texto}
                        </li>
                      ))}
                      {tacos.restantes > 0 && (
                        <li className="text-muted-foreground">
                          y {tacos.restantes} más…
                        </li>
                      )}
                    </ul>
                  )}
                  {sociosLineas.lineas.length > 0 && (
                    <ul className="text-xs mt-1 space-y-0.5" data-precierre-socios>
                      {sociosLineas.lineas.map((l) => (
                        <li key={l.key} className="text-muted-foreground">
                          {l.texto}
                        </li>
                      ))}
                      {sociosLineas.restantes > 0 && (
                        <li className="text-muted-foreground">
                          y {sociosLineas.restantes} más…
                        </li>
                      )}
                    </ul>
                  )}
                  {notaSocios && (
                    <p className="text-[11px] text-muted-foreground mt-1" data-nota-precierre-socios>
                      {notaSocios}
                    </p>
                  )}
                  {ligasUsd.lineas.length > 0 && (
                    <ul className="text-xs mt-1 space-y-1" data-precierre-ligas-usd>
                      {ligasUsd.lineas.map((l) => (
                        <li key={l.key} className="text-muted-foreground">
                          <span title={l.titulo}>{l.texto}</span>{" "}
                          <Link
                            href={l.hrefConciliacion}
                            className="cursor-pointer underline underline-offset-2 hover:text-foreground"
                          >
                            {ETIQUETA_VER_CARGO}
                          </Link>
                          {" · "}
                          <Link
                            href={l.hrefGasto}
                            className="cursor-pointer underline underline-offset-2 hover:text-foreground"
                          >
                            {l.etiquetaGasto}
                          </Link>
                        </li>
                      ))}
                      {ligasUsd.restantes > 0 && (
                        <li className="text-muted-foreground">y {ligasUsd.restantes} más…</li>
                      )}
                    </ul>
                  )}
                  {/* Grupos con saldo: total / cobrado / saldo por grupo
                      (montos del API) con link al detalle del grupo. */}
                  {item.grupos && item.grupos.length > 0 && (
                    <ul className="text-xs mt-1 space-y-0.5">
                      {item.grupos.slice(0, 8).map((g) => (
                        <li key={g.grupo_id}>
                          <Link
                            href={`/admin/quotes/grupo/${g.grupo_id}`}
                            className="underline underline-offset-2 hover:text-foreground text-muted-foreground"
                            title={g.nombre ?? undefined}
                          >
                            <span className="text-fuchsia-700 dark:text-fuchsia-300 font-medium">
                              {folioTexto(g.grupo_folio)}
                            </span>
                            {g.nombre ? ` ${g.nombre}` : ""} · {g.aviones}{" "}
                            {g.aviones === 1 ? "avión" : "aviones"} · total{" "}
                            <span className="font-mono">{fmtUsd(g.total_usd)}</span> ·
                            cobrado{" "}
                            <span className="font-mono">{fmtUsd(g.cobrado_usd)}</span> ·
                            saldo{" "}
                            <span className="font-mono text-amber-600 dark:text-amber-400">
                              {fmtUsd(g.saldo_usd)}
                            </span>
                          </Link>
                        </li>
                      ))}
                      {item.grupos.length > 8 && (
                        <li className="text-muted-foreground">
                          y {item.grupos.length - 8} más…
                        </li>
                      )}
                    </ul>
                  )}
                  {/* Sobres descuadrados: sobre vs Σ de sus partes (del API)
                      y partes en aviones cancelados, con link al grupo. */}
                  {item.sobres && item.sobres.length > 0 && (
                    <ul className="text-xs mt-1 space-y-0.5">
                      {item.sobres.slice(0, 8).map((sb) => (
                        <li key={sb.sobre_id}>
                          <Link
                            href={`/admin/quotes/grupo/${sb.grupo_id}`}
                            className="underline underline-offset-2 hover:text-foreground text-muted-foreground"
                            title="Re-partir el sobre desde Cobros del grupo"
                          >
                            <span className="text-fuchsia-700 dark:text-fuchsia-300 font-medium">
                              {folioTexto(sb.grupo_folio)}
                            </span>{" "}
                            · sobre{" "}
                            <span className="font-mono">
                              {fmtUsd(sb.monto)} {sb.moneda}
                            </span>
                            {sb.fecha_cobro ? ` del ${fmtDate(sb.fecha_cobro)}` : ""} ·
                            las partes suman{" "}
                            <span className="font-mono text-amber-600 dark:text-amber-400">
                              {fmtUsd(sb.suma_partes)} {sb.moneda}
                            </span>
                            {sb.partes_en_cancelados > 0 &&
                              ` · ${sb.partes_en_cancelados} parte${
                                sb.partes_en_cancelados === 1 ? "" : "s"
                              } en aviones cancelados`}
                          </Link>
                        </li>
                      ))}
                      {item.sobres.length > 8 && (
                        <li className="text-muted-foreground">
                          y {item.sobres.length - 8} más…
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                {href && (
                  <Link
                    href={href}
                    className="cursor-pointer text-xs font-medium underline underline-offset-2 shrink-0"
                  >
                    {ETIQUETA_LINK_POR_CLAVE[item.clave] ?? "Resolver →"}
                  </Link>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
