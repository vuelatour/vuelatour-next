import { BackLink } from "@/components/admin/back-link";
import { GrupoForm } from "@/components/admin/grupos/grupo-form";
import { listAircraft } from "@/lib/api/aircraft";
import { listRoutes } from "@/lib/api/routes-server";
import { listClients } from "@/lib/api/clients-server";
import { listAirports } from "@/lib/api/airports-server";
import { listUsers } from "@/lib/api/users-server";
import { listQuotes } from "@/lib/api/quotes-server";
import { getTipoCambioOficial } from "@/lib/api/tipo-cambio-server";

export const dynamic = "force-dynamic";

/**
 * Alta de una cotización de GRUPO (varios aviones, un cliente, un total).
 * Mismos catálogos que el cotizador de un avión + pilotos (para asignar
 * tripulación por avión desde aquí) + TC oficial del día como sugerencia.
 */
export default async function NuevoGrupoPage() {
  const [aircraftRes, routesRes, clientsRes, airportsRes, pilotsRes, quotesRes, tcSugerido] =
    await Promise.all([
      listAircraft({ limit: 100, activa: true }),
      listRoutes({ limit: 200, activa: true }),
      listClients({ limit: 200, activo: true }),
      listAirports({ limit: 200, activo: true }),
      // Best-effort: sin acceso a usuarios, el selector de piloto queda vacío
      // (la tripulación se asigna después desde cada vuelo).
      listUsers({ rol: "PILOTO", limit: 100 }).catch(
        () => ({ data: [] }) as { data: { id: string; nombre: string; es_piloto_externo: boolean }[] },
      ),
      listQuotes({ limit: 100 }).catch(
        () => ({ data: [] }) as { data: { cliente_id: string | null }[] },
      ),
      getTipoCambioOficial(),
    ]);

  // Clientes frecuentes (mismo criterio del cotizador): top por cotizaciones recientes.
  const conteo = new Map<string, number>();
  for (const q of quotesRes.data) {
    if (q.cliente_id) conteo.set(q.cliente_id, (conteo.get(q.cliente_id) ?? 0) + 1);
  }
  const frequentClientIds = [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);

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

  const clients = clientsRes.data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    es_broker: c.es_broker,
    es_interno: c.es_interno,
    rfc: c.rfc,
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
    <div className="space-y-6">
      <div>
        <BackLink href="/admin/quotes/grupo">Grupos</BackLink>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2">
          Nueva cotización de grupo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Un cliente, varios aviones, un solo total. El sistema propone la flota y
          reparte los pasajeros; al crear nacen los vuelos de cada avión ligados al grupo.
        </p>
      </div>
      <GrupoForm
        mode="create"
        aircraft={aircraft}
        routes={routes}
        clients={clients}
        airports={airports}
        pilots={pilots}
        frequentClientIds={frequentClientIds}
        tcSugerido={tcSugerido}
      />
    </div>
  );
}
