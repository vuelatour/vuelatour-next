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
    />
  );
}
