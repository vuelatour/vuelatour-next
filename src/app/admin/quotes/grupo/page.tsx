import Link from "next/link";
import {
  ExclamationTriangleIcon,
  PlusIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { BackLink } from "@/components/admin/back-link";
import { EmptyState } from "@/components/admin/empty-state";
import { GruposFilterBar } from "@/components/admin/grupos/grupos-filter-bar";
import { GruposTable, type GrupoListRow } from "@/components/admin/grupos/grupos-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listClients } from "@/lib/api/clients-server";
import { listGruposTodos } from "@/lib/api/grupos-server";
import { getMe } from "@/lib/api/me";
import { ESTADOS_GRUPO } from "@/lib/admin/grupos-ui";
import type { EstadoGrupo } from "@/types/grupos";

export const dynamic = "force-dynamic";

interface GruposPageProps {
  searchParams: Promise<{
    estado?: string;
    cliente_id?: string;
    desde?: string;
    hasta?: string;
    q?: string;
  }>;
}

/**
 * Lista de cotizaciones de GRUPO (4-sep-2026): una fila por grupo con su
 * estado DERIVADO de los hijos, Σ totales, pax asignados y cobro. Los
 * números vienen del API; aquí solo se pintan.
 */
export default async function GruposPage({ searchParams }: GruposPageProps) {
  const sp = await searchParams;
  const estado = (ESTADOS_GRUPO as readonly string[]).includes(sp.estado ?? "")
    ? (sp.estado as EstadoGrupo)
    : undefined;

  const [me, gruposRes, clientsRes] = await Promise.all([
    getMe().catch(() => null),
    listGruposTodos({
      estado,
      cliente_id: sp.cliente_id || undefined,
      desde: sp.desde || undefined,
      hasta: sp.hasta || undefined,
      q: sp.q || undefined,
    }),
    // Best-effort: /v1/clients está restringido por rol (PII fiscal).
    listClients({ limit: 200, activo: true }).catch(() => ({
      data: [] as Awaited<ReturnType<typeof listClients>>["data"],
    })),
  ]);

  const clientsById = new Map(clientsRes.data.map((c) => [c.id, c]));
  const { data: grupos, count } = gruposRes;
  const puedeCrear = me?.rol === "ADMIN" || me?.rol === "COORDINADOR";

  const rows: GrupoListRow[] = grupos.map((g) => ({
    id: g.id,
    folioTexto: g.folio_texto,
    clienteNombre: g.cliente_nombre ?? clientsById.get(g.cliente_id)?.nombre ?? null,
    esInterno: clientsById.get(g.cliente_id)?.es_interno === true,
    nombre: g.nombre,
    fechaVuelo: g.fecha_vuelo,
    ruta: (g.ruta_iatas ?? []).join(" → "),
    pasajerosTotal: Number(g.pasajeros_total) || 0,
    paxAsignados: Number(g.pax_asignados) || 0,
    aviones: Number(g.aviones) || 0,
    avionesCancelados: Number(g.aviones_cancelados) || 0,
    totalUsd: Number(g.total_usd) || 0,
    estado: g.estado,
    cobrados: Number(g.cobrados) || 0,
    facturados: Number(g.facturados) || 0,
  }));
  // Fecha de salida reciente primero; sin fecha al inicio (igual que las
  // otras listas: nada recién creado se pierde al fondo).
  rows.sort((a, b) => {
    if (!a.fechaVuelo || !b.fechaVuelo) {
      if (!a.fechaVuelo && !b.fechaVuelo) return 0;
      return a.fechaVuelo ? 1 : -1;
    }
    return b.fechaVuelo.localeCompare(a.fechaVuelo);
  });
  const conProblemaPax = rows.filter(
    (r) => r.estado !== "CANCELADO" && r.paxAsignados !== r.pasajerosTotal,
  ).length;
  const huboCorte = grupos.length < count;

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/admin/quotes">Cotizaciones</BackLink>
        <div className="mt-2 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">Operación</p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Cotizaciones de grupo
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {count} {count === 1 ? "grupo" : "grupos"} en el rango. Un grupo =
              varios aviones para un mismo cliente con UN total; cada avión es
              un vuelo normal ligado al grupo.
            </p>
          </div>
          {puedeCrear && (
            <Link
              href="/admin/quotes/grupo/nueva"
              className={`${buttonVariants({})} gap-2 bg-brand-600 hover:bg-brand-600/90`}
            >
              <PlusIcon className="h-4 w-4" />
              Nuevo grupo
            </Link>
          )}
        </div>
      </div>

      {huboCorte && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>
            Mostrando {grupos.length} de {count} grupos — usa los filtros para
            acotar la lista.
          </span>
        </div>
      )}

      {conProblemaPax > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>
            {conProblemaPax === 1
              ? "Hay 1 grupo cuyos aviones no suman los pasajeros del grupo"
              : `Hay ${conProblemaPax} grupos cuyos aviones no suman los pasajeros del grupo`}{" "}
            (columna Pax en ámbar). Ábrelos y revisa el reparto de pasajeros
            por avión.
          </span>
        </div>
      )}

      <GruposFilterBar
        clients={clientsRes.data.map((c) => ({ id: c.id, nombre: c.nombre }))}
        initial={{
          estado: estado ?? "",
          cliente_id: sp.cliente_id ?? "",
          desde: sp.desde ?? "",
          hasta: sp.hasta ?? "",
          q: sp.q ?? "",
        }}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={UserGroupIcon}
          title="Sin cotizaciones de grupo"
          description={
            puedeCrear ? (
              <>
                Cuando cotices un grupo (varios aviones para un mismo cliente)
                aparecerá aquí con su folio G-n. Empieza con{" "}
                <Link href="/admin/quotes/grupo/nueva" className="underline font-medium">
                  Nuevo grupo
                </Link>
                .
              </>
            ) : (
              "Cuando la oficina cotice un grupo (varios aviones para un mismo cliente) aparecerá aquí con su folio G-n."
            )
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <GruposTable rows={rows} huboCorte={huboCorte} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
