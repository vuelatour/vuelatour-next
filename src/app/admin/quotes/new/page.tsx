import { BackLink } from "@/components/admin/back-link";
import { QuoteCalculator } from "@/components/admin/quotes/quote-calculator";
import { listClients } from "@/lib/api/clients-server";
import { listQuotes } from "@/lib/api/quotes-server";
import { cargarCatalogosCotizador } from "@/lib/api/quote-catalogos-server";
import { Degradaciones } from "@/lib/api/degradar";
import { AvisoDegradado } from "@/components/admin/aviso-degradado";
import { getMe } from "@/lib/api/me";

export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  // Los catálogos del cotizador (aeronaves/rutas/aeropuertos) SON la
  // pantalla: sin ellos no se puede cotizar y el error sube al boundary. La
  // lista de clientes sí degrada, con aviso.
  const degradado = new Degradaciones();
  const [me, catalogos, clientsRes, quotesRes] = await Promise.all([
    // El rol decide si el alta se captura en la HOJA INTERNA (Fase 2.2) o en
    // la del cliente, como hasta hoy. Accesorio: sin `/me` se cae a la del
    // cliente, que es el comportamiento de siempre.
    degradado.opcional("tu usuario", getMe(), null),
    // Aeronaves, rutas y aeropuertos ya mapeados (fuente única con el
    // detalle de la cotización).
    cargarCatalogosCotizador(),
    degradado.opcional("los clientes", listClients({ limit: 200, activo: true }), {
      data: [] as Awaited<ReturnType<typeof listClients>>["data"],
    }),
    // Para clientes frecuentes: la mayoría son recurrentes (pocos).
    listQuotes({ limit: 100 }).catch(() => ({ data: [] }) as { data: { cliente_id: string | null }[] }),
  ]);

  // Top de clientes por número de cotizaciones recientes (Itzel identifica el
  // tipo de vuelo por el nombre del cliente, ej. "Punta Pájaros").
  const conteo = new Map<string, number>();
  for (const q of quotesRes.data) {
    if (q.cliente_id) conteo.set(q.cliente_id, (conteo.get(q.cliente_id) ?? 0) + 1);
  }
  const frequentClientIds = [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);

  const clients = clientsRes.data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    es_broker: c.es_broker,
    es_interno: c.es_interno,
    rfc: c.rfc,
  }));

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/admin/quotes">Cotizaciones</BackLink>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2">
          Nueva cotización
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Captura el documento en su lugar y guarda como v1. La cotización
          entera se edita en la hoja; lo que no cabe en el papel (plantilla de
          ruta, operador externo, ruta operativa, detalle del cálculo) está en
          los bloques plegables de abajo.
        </p>
      </div>
      <AvisoDegradado faltantes={degradado.faltantes} />
      <QuoteCalculator
        aircraft={catalogos.aircraft}
        routes={catalogos.routes}
        clients={clients}
        airports={catalogos.airports}
        frequentClientIds={frequentClientIds}
        rol={me?.rol ?? null}
      />
    </div>
  );
}
