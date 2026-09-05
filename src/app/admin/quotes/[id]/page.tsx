import { notFound } from "next/navigation";
import { QuoteWorkspace } from "@/components/admin/quotes/quote-workspace";
import { getFlightSnapshot } from "@/lib/api/flights-server";
import { getQuote, getQuoteVersions } from "@/lib/api/quotes-server";
import { cargarCatalogosCotizador } from "@/lib/api/quote-catalogos-server";
import { getClient } from "@/lib/api/clients-server";
import { getMe } from "@/lib/api/me";
import { ApiError } from "@/lib/api/errors";
import type { FlightSnapshot } from "@/types/flights";

export const dynamic = "force-dynamic";

interface QuoteDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    /** `1` = abrir directo en edición (links viejos a /revise redirigen aquí). */
    revisar?: string;
  }>;
}

/**
 * PÁGINA ÚNICA de la cotización (5-sep-2026): lectura y revisión en el
 * mismo lugar — ver `QuoteWorkspace`. El server solo carga: la cotización
 * (+ versiones), el cliente, los cobros del vuelo y los catálogos del
 * cotizador (necesarios para revisar sin salir de la página).
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

  let quote, versions;
  try {
    [quote, versions] = await Promise.all([getQuote(id), getQuoteVersions(id)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Cliente (nombre + interno), cobros del vuelo y catálogos, en paralelo.
  // Cobros: best-effort — en SOLICITUD/COTIZADO aún no hay vuelo operativo.
  // Visibles desde la cotización porque un cobro bloquea la revisión y desde
  // aquí se elimina para desbloquear.
  const [client, cobrosVuelo, catalogos] = await Promise.all([
    getClient(quote.cliente_id).catch(() => null),
    quote.estado !== "SOLICITUD" && quote.estado !== "COTIZADO"
      ? getFlightSnapshot(id).catch(() => null)
      : Promise.resolve<FlightSnapshot | null>(null),
    cargarCatalogosCotizador(),
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
      revisarInicial={sp.revisar === "1"}
    />
  );
}
