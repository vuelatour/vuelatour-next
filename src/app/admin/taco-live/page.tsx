import type { Metadata } from "next";
import { tituloTacometros } from "@/lib/admin/titulos-pestana";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { todayCancun } from "@/lib/datetime";
import { apiServer } from "@/lib/api/server";
import { getMe } from "@/lib/api/me";
import { escalaLiveOmitida, esRolOmitirTaco } from "@/lib/admin/taco-omitido";
import { TacoLiveBoard, type TacoLiveVuelo } from "@/components/admin/taco-live/taco-live-board";
import { TacoLiveDatePicker } from "@/components/admin/taco-live/taco-live-date-picker";
import { FranjaPreCierre } from "@/components/admin/franja-pre-cierre";
import {
  NOTA_VISTA_TACO_LIVE,
  conjuntoResaltado,
  hrefQuitarResaltado,
  hrefVolverPreCierre,
  leerFocoPreCierre,
} from "@/lib/admin/pre-cierre-resolver";

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

interface TacoLivePageProps {
  searchParams: Promise<{
    fecha?: string;
    /** Foco del pre-cierre («Resolver →», 15-oct-2026): SOLO del panel; NO
        toca `?fecha=` ni viaja al API. */
    pc?: string;
    ids?: string;
    pcn?: string;
    pct?: string;
    pcd?: string;
    pcp?: string;
  }>;
}

/**
 * «Tacómetros en vivo», y el día SOLO cuando no es hoy («… · 13 oct 2026»;
 * un `?fecha=` inválido no se nombra). Sale de la URL, sin el API: el
 * tablero lo pide la página.
 */
export async function generateMetadata({ searchParams }: TacoLivePageProps): Promise<Metadata> {
  const sp = await searchParams;
  return { title: tituloTacometros(sp.fecha, todayCancun()) };
}

/**
 * Tacómetros en vivo: todas las escalas del día esperando su lectura. El
 * sistema ya NO escribe lecturas estimadas — lo vencido queda sin llegada
 * (rojo) con una SUGERENCIA calculada al vuelo por el API (llegada_estimada /
 * minutos_promedio, campos aditivos), y aquí la oficina la confirma con la
 * foto del piloto o la ajusta (confirmTaco, origen OFICINA).
 */
export default async function TacoLivePage({ searchParams }: TacoLivePageProps) {
  const sp = await searchParams;
  const [data, me] = await Promise.all([
    apiServer<TacoLiveResponse>("/v1/flights/taco-live", {
      searchParams: { fecha: sp.fecha },
      cache: "no-store",
    }),
    // Best-effort: sin /me el tablero se pinta igual, sin «Omitir tacómetro».
    getMe().catch(() => null),
  ]);
  const puedeOmitir = esRolOmitirTaco(me?.rol);

  const fecha = data.fecha;
  const focoPc = leerFocoPreCierre(sp);
  const idsPc = conjuntoResaltado(focoPc);
  // Los contadores describen EL DÍA: un viaje multi-día trae también sus
  // tramos de otros días (atenuados en el tablero) y no deben inflar el
  // encabezado.
  const delDia = (e: { es_del_dia?: boolean }) => e.es_del_dia !== false;
  const totalEscalas = data.vuelos.reduce(
    (acc, v) => acc + v.escalas.filter(delDia).length,
    0,
  );
  const otrosDias = data.vuelos.reduce(
    (acc, v) => acc + v.escalas.filter((e) => !delDia(e)).length,
    0,
  );
  const porRevisar = data.vuelos.reduce(
    (acc, v) =>
      acc +
      v.escalas.filter(
        // Un tramo con tacómetro OMITIDO nunca es «por revisar».
        (e) => delDia(e) && e.revision_requerida && !escalaLiveOmitida(e),
      ).length,
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
            {otrosDias > 0 && (
              <span className="text-muted-foreground"> (+{otrosDias} de otros días)</span>
            )}
            {porRevisar > 0 && (
              <span className="text-amber-600 font-medium"> · {porRevisar} por revisar</span>
            )}
            . El sistema ya no captura lecturas por ti: lo vencido queda
            pendiente con una sugerencia — confírmala con la foto del piloto o
            ajústala aquí.
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
          <TacoLiveDatePicker fecha={fecha} />
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

      {/* «Resolver →» del pre-cierre (15-oct-2026): los vuelos de ESTE día en
          ámbar y primero; los de otros días cuentan como «ya no están en
          esta vista» y la nota lo explica. */}
      {focoPc && (
        <FranjaPreCierre
          foco={focoPc}
          encontrados={data.vuelos.filter((v) => idsPc.has(v.vuelo_id.toLowerCase())).length}
          hrefQuitar={hrefQuitarResaltado("/admin/taco-live", sp)}
          hrefVolver={hrefVolverPreCierre(focoPc, todayCancun())}
          notaVista={NOTA_VISTA_TACO_LIVE}
        />
      )}

      <TacoLiveBoard
        vuelos={data.vuelos}
        fecha={fecha}
        puedeOmitir={puedeOmitir}
        resaltados={focoPc?.ids}
      />
    </div>
  );
}
