import { notFound } from "next/navigation";
import { GrupoWorkspace } from "@/components/admin/grupos/detalle/grupo-workspace";
import { listAircraft } from "@/lib/api/aircraft";
import { listAirports } from "@/lib/api/airports-server";
import { getGrupo } from "@/lib/api/grupos-server";
import { getMe } from "@/lib/api/me";
import { listRoutes } from "@/lib/api/routes-server";
import { getTipoCambioOficial } from "@/lib/api/tipo-cambio-server";
import { listUsers } from "@/lib/api/users-server";
import { isoToCancunInput } from "@/lib/datetime";

export const dynamic = "force-dynamic";

interface GrupoDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revisar?: string }>;
}

type AircraftData = Awaited<ReturnType<typeof listAircraft>>["data"];
type RoutesData = Awaited<ReturnType<typeof listRoutes>>["data"];
type AirportsData = Awaited<ReturnType<typeof listAirports>>["data"];
type PilotsData = { id: string; nombre: string; es_piloto_externo: boolean }[];

/**
 * Página ÚNICA de la cotización de GRUPO (5-sep-2026): el formato del
 * wizard en lectura + «Revisar» edita en el lugar. Carga lo del detalle
 * (grupo, TC oficial para cobrar en pesos) y lo de la edición (flota
 * completa, rutas, aeropuertos, pilotos, TC sugerido) de una vez; los
 * catálogos solo para quien puede editar. `?revisar=1` abre en edición
 * (links viejos a /editar). Todo total viene del API; aquí SOLO se pinta.
 * Es la ruta a la que enlazan las alertas del API (/admin/quotes/grupo/:id).
 */
export default async function GrupoDetailPage({ params, searchParams }: GrupoDetailPageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [me, grupo] = await Promise.all([getMe().catch(() => null), getGrupo(id)]);
  if (!grupo) notFound();

  const puedeEditar = me?.rol === "ADMIN" || me?.rol === "COORDINADOR";
  // Sobre de cobro (Fase 2): mismos roles que el API (COBRA_GRUPO /
  // DELETE sobre = paridad con el cobro por vuelo).
  const puedeCobrar = puedeEditar || me?.rol === "FACTURACION";
  const puedeEliminarCobro = me?.rol === "ADMIN" || me?.rol === "FACTURACION";
  // Día Cancún en que se cotizó el grupo: TC oficial de ese día como
  // sugerencia al revisar y de respaldo al cobrar en pesos cuando el grupo
  // no fijó TC (misma regla que el cobro por vuelo) — no el de hoy.
  const diaCotizacion = grupo.created_at
    ? isoToCancunInput(grupo.created_at).slice(0, 10) || null
    : null;
  const necesitaTcOficial = puedeEditar || (puedeCobrar && grupo.tc_usd_mxn == null);

  const [aircraftRes, routesRes, airportsRes, pilotsRes, tcDia] = await Promise.all([
    // TODA la flota: un hijo puede volar en un avión que hoy esté dado de baja
    // (el form lo muestra; solo los activos se ofrecen para agregar/reemplazar).
    puedeEditar
      ? listAircraft({ limit: 100 }).catch(() => ({ data: [] as AircraftData }))
      : Promise.resolve({ data: [] as AircraftData }),
    puedeEditar
      ? listRoutes({ limit: 200, activa: true }).catch(() => ({ data: [] as RoutesData }))
      : Promise.resolve({ data: [] as RoutesData }),
    puedeEditar
      ? listAirports({ limit: 200, activo: true }).catch(() => ({ data: [] as AirportsData }))
      : Promise.resolve({ data: [] as AirportsData }),
    puedeEditar
      ? listUsers({ rol: "PILOTO", limit: 100 }).catch(() => ({ data: [] as PilotsData }))
      : Promise.resolve({ data: [] as PilotsData }),
    necesitaTcOficial && diaCotizacion
      ? getTipoCambioOficial(diaCotizacion).catch(() => null)
      : Promise.resolve<number | null>(null),
  ]);

  const aircraft = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
    asientos: Number(a.asientos) || 0,
    velocidad_crucero_kts: Number(a.velocidad_crucero_kts) || 0,
    tarifa_hora_pub_usd: a.tarifa_hora_pub_usd ? Number(a.tarifa_hora_pub_usd) : null,
    tarifa_hora_broker_usd: a.tarifa_hora_broker_usd ? Number(a.tarifa_hora_broker_usd) : null,
    activa: a.activa,
  }));

  const routes = routesRes.data.map((r) => ({
    id: r.id,
    origen_iata: r.origen_iata,
    destino_iata: r.destino_iata,
    millas_nauticas: Number(r.millas_nauticas),
    tramos: r.tramos.map((t) => ({
      origen_iata: t.origen_iata,
      destino_iata: t.destino_iata,
      millas_nauticas: Number(t.millas_nauticas),
    })),
  }));

  const airports = airportsRes.data.map((a) => ({
    iata: a.iata,
    nombre: a.nombre,
    latitud: a.latitud,
    longitud: a.longitud,
  }));

  const pilots = pilotsRes.data.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    es_piloto_externo: p.es_piloto_externo,
  }));

  return (
    <GrupoWorkspace
      grupo={grupo}
      puedeEditar={puedeEditar}
      puedeCobrar={puedeCobrar}
      puedeEliminarCobro={puedeEliminarCobro}
      tcOficial={puedeCobrar && grupo.tc_usd_mxn == null ? tcDia : null}
      tcOficialFecha={diaCotizacion}
      aircraft={aircraft}
      routes={routes}
      airports={airports}
      pilots={pilots}
      tcSugerido={puedeEditar ? tcDia : null}
      revisarInicial={sp.revisar === "1"}
    />
  );
}
