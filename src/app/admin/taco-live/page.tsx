import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { apiServer } from "@/lib/api/server";
import { TacoLiveBoard, type TacoLiveVuelo } from "@/components/admin/taco-live/taco-live-board";

export const dynamic = "force-dynamic";

interface TacoLiveResponse {
  fecha: string;
  vuelos: TacoLiveVuelo[];
}

function shiftDay(fecha: string, delta: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Tacómetros en vivo: todas las escalas del día esperando su lectura. La
 * operación NUNCA se detiene — si el dato no llega a la hora esperada, el
 * sistema lo deduce (amarillo) y aquí la oficina confirma o ajusta viendo la
 * foto. Prioridad de origen: piloto > IA > deducción matemática.
 */
export default async function TacoLivePage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const sp = await searchParams;
  const data = await apiServer<TacoLiveResponse>("/v1/flights/taco-live", {
    searchParams: { fecha: sp.fecha },
    cache: "no-store",
  });

  const fecha = data.fecha;
  const totalEscalas = data.vuelos.reduce((acc, v) => acc + v.escalas.length, 0);
  const porRevisar = data.vuelos.reduce(
    (acc, v) => acc + v.escalas.filter((e) => e.revision_requerida).length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Tacómetros en vivo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.vuelos.length} {data.vuelos.length === 1 ? "vuelo" : "vuelos"} ·{" "}
            {totalEscalas} escalas
            {porRevisar > 0 && (
              <span className="text-amber-600 font-medium"> · {porRevisar} por revisar</span>
            )}
            . Si una lectura no llega a la hora esperada, se deduce sola — aquí
            solo confirmas o ajustas viendo la foto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/taco-live?fecha=${shiftDay(fecha, -1)}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
            aria-label="Día anterior"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
          <span className="text-sm font-medium font-mono">{fecha}</span>
          <Link
            href={`/admin/taco-live?fecha=${shiftDay(fecha, 1)}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
            aria-label="Día siguiente"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
          <Link
            href="/admin/taco-live"
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted transition-colors"
          >
            Hoy
          </Link>
        </div>
      </div>

      <TacoLiveBoard vuelos={data.vuelos} />
    </div>
  );
}
