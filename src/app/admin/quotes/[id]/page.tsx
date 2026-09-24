import { notFound } from "next/navigation";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { QuoteWorkspace } from "@/components/admin/quotes/quote-workspace";
import { getCobroVoucherUrls, getFlightSnapshot } from "@/lib/api/flights-server";
import {
  getQuote,
  getQuoteInterno,
  getQuoteVecinos,
  getQuoteVersions,
} from "@/lib/api/quotes-server";
import { cargarCatalogosCotizador } from "@/lib/api/quote-catalogos-server";
import { getClient } from "@/lib/api/clients-server";
import { getMe } from "@/lib/api/me";
import { getTipoCambioOficial } from "@/lib/api/tipo-cambio-server";
import { getPaywiseComisionPct } from "@/lib/api/paywise-config-server";
import { ApiError } from "@/lib/api/errors";
import { Degradaciones } from "@/lib/api/degradar";
import { puedeVerHojaInterna } from "@/lib/admin/quote-sheet-interna";
import { esUuid } from "@/lib/admin/url-params";
import { filtrosListaDeParams, qsFiltrosLista } from "@/lib/admin/quote-navegacion";
import { CANCUN_TZ } from "@/lib/datetime";

export const dynamic = "force-dynamic";

interface QuoteDetailPageProps {
  params: Promise<{ id: string }>;
  /**
   * Filtros de la lista de donde vino (`estado`, `cliente_id`, `q`,
   * `grupo_id`): las flechas «‹ Anterior» / «Siguiente ›» los respetan.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * PÁGINA ÚNICA de la cotización (5-sep-2026) con EDICIÓN DIRECTA (F0–F3,
 * 8-sep-2026): el documento se abre editable si el candado lo permite — ver
 * `QuoteWorkspace`. El server solo carga: la cotización (+ versiones), el
 * cliente, los cobros del vuelo y los catálogos del cotizador (los mismos
 * que usa el alta: `cargarCatalogosCotizador`). `?revisar=1` (links viejos
 * a /revise) ya no significa nada: el workspace lo limpia de la URL.
 */
export default async function QuoteDetailPage({
  params,
  searchParams,
}: QuoteDetailPageProps) {
  const [{ id }, sp, me] = await Promise.all([
    params,
    searchParams,
    getMe().catch(() => null),
  ]);
  // Id que no es uuid (enlace viejo, marcador): 404 SIN llamar al API — su
  // 400 de «uuid inválido» tumbaba la pantalla al error boundary (21-sep-2026).
  if (!esUuid(id)) notFound();

  // FLECHAS entre cotizaciones (24-sep-2026): los filtros de la lista se
  // validan con la MISMA función que usa la lista y los vecinos se piden EN
  // PARALELO con la cotización. Es ACCESORIO: si falla, la pantalla carga
  // igual, sin flechas, y lo AVISA (`degradado`); un API sin la ruta (404)
  // o un rol sin acceso (403) no pintan flechas y no avisan.
  const degradado = new Degradaciones();
  const filtrosLista = filtrosListaDeParams(sp);
  const qsLista = qsFiltrosLista(filtrosLista);
  const vecinosPromesa = degradado.opcional(
    "la navegación entre cotizaciones",
    getQuoteVecinos(id, filtrosLista),
    null,
  );

  let quote, versions;
  try {
    [quote, versions] = await Promise.all([getQuote(id), getQuoteVersions(id)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Día de la cotización en pared Cancún (fecha_solicitud ?? fecha_vuelo):
  // el TC oficial de ESE día respalda el cobro en MXN cuando la cotización
  // no fijó TC (misma regla que el detalle del vuelo y los Excel).
  const diaCotizacion = (() => {
    const iso = quote.fecha_solicitud ?? quote.fecha_vuelo;
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? null
      : new Intl.DateTimeFormat("en-CA", { timeZone: CANCUN_TZ }).format(d);
  })();

  // Cliente (nombre + interno), cobros del vuelo, catálogos, TC oficial y
  // comisión Paywise, en paralelo. Cobros: best-effort y en TODO estado
  // (9-sep-2026: la card de cobros se pinta siempre y desde la cotización
  // se registran anticipos; antes se omitía en SOLICITUD/COTIZADO).
  // La HOJA INTERNA es ACCESORIA (Fase 2.2, 22-sep-2026): si no carga, la
  // pantalla sigue editándose con el breakdown y se AVISA — jamás tumba la
  // cotización entera. Un 404 (API previo) o un 403 (rol sin permiso) ya
  // vuelven null desde `getQuoteInterno`, en silencio y sin aviso.
  const [client, cobrosVuelo, catalogos, tcOficial, paywiseComisionPct, interno, vecinos] =
    await Promise.all([
      getClient(quote.cliente_id).catch(() => null),
      getFlightSnapshot(id).catch(() => null),
      cargarCatalogosCotizador(),
      diaCotizacion ? getTipoCambioOficial(diaCotizacion) : Promise.resolve(null),
      getPaywiseComisionPct(),
      // Solo se PIDE a quien puede verla (`ROLES_HOJA_INTERNA`, espejo del
      // `@Roles` del API): a SOCIO/PILOTO el API responde 403 en cada carga
      // de la pantalla y ese dato nunca se iba a pintar. El gate real sigue
      // siendo el API; esto solo evita la llamada que ya se sabe negada.
      puedeVerHojaInterna(me?.rol)
        ? degradado.opcional("la hoja interna", getQuoteInterno(id), null)
        : Promise.resolve(null),
      vecinosPromesa,
    ]);

  // Comprobantes de los cobros (24-sep-2026): URLs firmadas best-effort —
  // SOCIO recibe 403 y la card solo dice «Con comprobante» (sin botón: la
  // firma al momento también le daría 403); si el lote falla para oficina,
  // la card pinta «Comprobante» y lo pide al abrir. Nunca rompe la pantalla.
  const voucherUrls = await getCobroVoucherUrls(
    (cobrosVuelo?.cobros ?? [])
      .map((c) => c.foto_voucher_url)
      .filter((p): p is string => !!p),
  ).catch(() => ({}) as Record<string, string>);

  return (
    <>
      <AvisoDegradado faltantes={degradado.faltantes} />
    <QuoteWorkspace
      // Una instancia POR cotización: al brincar con las flechas (misma ruta,
      // otro id) el cotizador NUNCA conserva el formulario de la anterior.
      key={quote.id}
      quote={quote}
      versions={versions}
      clientName={client?.nombre ?? null}
      clientEsInterno={client?.es_interno ?? false}
      aircraft={catalogos.aircraft}
      routes={catalogos.routes}
      airports={catalogos.airports}
      cobros={cobrosVuelo?.cobros ?? []}
      totalCobrado={cobrosVuelo?.total_cobrado ?? 0}
      rol={me?.rol ?? null}
      tcOficial={tcOficial}
      tcOficialFecha={diaCotizacion}
      paywiseComisionPct={paywiseComisionPct}
      interno={interno}
      // FACTURA DEL SERVICIO (24-sep-2026, ADITIVO del snapshot): la burbuja
      // de la card de cobros. Ausente/null ⇒ no se pinta.
      facturaServicio={cobrosVuelo?.factura_servicio}
      voucherUrls={voucherUrls}
      grupoTotalAviones={cobrosVuelo?.grupo_total_aviones ?? null}
      navegacion={{ vecinos, qs: qsLista }}
    />
    </>
  );
}
