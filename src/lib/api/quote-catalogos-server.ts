import { listAircraft } from "@/lib/api/aircraft";
import { listRoutes } from "@/lib/api/routes-server";
import { listAirports } from "@/lib/api/airports-server";
import type {
  AircraftOption,
  AirportOption,
  RouteOption,
} from "@/components/admin/quotes/quote-calculator";

/**
 * Catálogos que alimentan al cotizador (aeronaves activas, rutas activas y
 * aeropuertos activos) ya mapeados a las opciones que espera
 * `QuoteCalculator`. FUENTE ÚNICA del mapeo (5-sep-2026): lo usan el alta
 * (`/admin/quotes/new`) y la página única de la cotización
 * (`/admin/quotes/[id]`, lectura + revisión en el mismo lugar).
 */
export async function cargarCatalogosCotizador(): Promise<{
  aircraft: AircraftOption[];
  routes: RouteOption[];
  airports: AirportOption[];
}> {
  const [aircraftRes, routesRes, airportsRes] = await Promise.all([
    listAircraft({ limit: 100, activa: true }),
    listRoutes({ limit: 200, activa: true }),
    listAirports({ limit: 200, activo: true }),
  ]);

  const aircraft: AircraftOption[] = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
    pais_registro: a.pais_registro,
    velocidad_crucero_kts: Number(a.velocidad_crucero_kts),
    asientos: Number(a.asientos) || 0,
    tarifa_hora_pub_usd: a.tarifa_hora_pub_usd ? Number(a.tarifa_hora_pub_usd) : null,
    tarifa_hora_broker_usd: a.tarifa_hora_broker_usd
      ? Number(a.tarifa_hora_broker_usd)
      : null,
  }));

  const routes: RouteOption[] = routesRes.data.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    origen_iata: r.origen_iata,
    destino_iata: r.destino_iata,
    millas_nauticas: Number(r.millas_nauticas),
    es_redondo_auto: r.es_redondo_auto,
    num_aterrizajes: r.num_aterrizajes,
    tramos: r.tramos.map((t) => ({
      origen_iata: t.origen_iata,
      destino_iata: t.destino_iata,
      millas_nauticas: Number(t.millas_nauticas),
      pasajeros: t.pasajeros,
      es_ferry: t.es_ferry,
      requiere_pernocta: t.requiere_pernocta,
      pernocta_costo_usd:
        t.pernocta_costo_usd != null ? Number(t.pernocta_costo_usd) : null,
      tipo_parada: t.tipo_parada,
      servicio_notas: t.servicio_notas,
    })),
  }));

  const airports: AirportOption[] = airportsRes.data.map((a) => ({
    iata: a.iata,
    nombre: a.nombre,
    latitud: a.latitud,
    longitud: a.longitud,
  }));

  return { aircraft, routes, airports };
}
