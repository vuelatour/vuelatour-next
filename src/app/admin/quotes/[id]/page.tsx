import { notFound } from "next/navigation";
import { QuoteWorkspace } from "@/components/admin/quotes/quote-workspace";
import { getFlightSnapshot } from "@/lib/api/flights-server";
import { getQuote, getQuoteVersions } from "@/lib/api/quotes-server";
import { cargarCatalogosCotizador } from "@/lib/api/quote-catalogos-server";
import { getClient } from "@/lib/api/clients-server";
import { getMe } from "@/lib/api/me";
import { getTipoCambioOficial } from "@/lib/api/tipo-cambio-server";
import { getPaywiseComisionPct } from "@/lib/api/paywise-config-server";
import { ApiError } from "@/lib/api/errors";
import { CANCUN_TZ } from "@/lib/datetime";

export const dynamic = "force-dynamic";

interface QuoteDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * PÁGINA ÚNICA de la cotización (5-sep-2026) con EDICIÓN DIRECTA (F0–F3,
 * 8-sep-2026): el documento se abre editable si el candado lo permite — ver
 * `QuoteWorkspace`. El server solo carga: la cotización (+ versiones), el
 * cliente, los cobros del vuelo y los catálogos del cotizador (los mismos
 * que usa el alta: `cargarCatalogosCotizador`). `?revisar=1` (links viejos
 * a /revise) ya no significa nada: el workspace lo limpia de la URL.
 */
export default async function QuoteDetailPage({ params }: QuoteDetailPageProps) {
  const [{ id }, me] = await Promise.all([params, getMe().catch(() => null)]);

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
  const [client, cobrosVuelo, catalogos, tcOficial, paywiseComisionPct] =
    await Promise.all([
      getClient(quote.cliente_id).catch(() => null),
      getFlightSnapshot(id).catch(() => null),
      cargarCatalogosCotizador(),
      diaCotizacion ? getTipoCambioOficial(diaCotizacion) : Promise.resolve(null),
      getPaywiseComisionPct(),
    ]);

  return (
    <QuoteWorkspace
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
    />
  );
}
