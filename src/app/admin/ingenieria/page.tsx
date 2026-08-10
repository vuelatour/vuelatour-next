import Link from "next/link";
import { fmtDateOnly } from "@/lib/datetime";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { getFleetUpcoming } from "@/lib/api/engineering-server";
import { getMe } from "@/lib/api/me";
import { VerDocumentoButton } from "@/components/admin/expirations/ver-documento-button";

export const dynamic = "force-dynamic";

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function diasBadge(dias: number) {
  if (dias <= 0) return "bg-destructive/15 text-destructive border-destructive/30";
  if (dias <= 15) return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
  return "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30";
}

export default async function IngenieriaPage() {
  // SIN catch silencioso: si el API falla debe verse el error (error.tsx con
  // reintento), no un "Nada próximo en 90 días" que oculta vencimientos
  // críticos de aeronavegabilidad.
  const { vencimientos, mantenimientos } = await getFleetUpcoming(90);
  // Ver documento = solo oficina (el endpoint firma con service key y regresa
  // 403 a otros roles: no pintarles un botón que falla).
  const me = await getMe();
  const canVerDocs = me.rol === "ADMIN" || me.rol === "COORDINADOR";

  type Row = {
    id: string;
    matricula: string;
    concepto: string;
    fecha: string;
    dias: number;
    critico?: boolean;
    href: string;
    /** id del vencimiento con copia adjunta (pinta "Ver documento"). */
    docId?: string;
  };
  const rows: Row[] = [
    ...vencimientos.map((v) => {
      // Vencimientos de MOTOR heredan el avión del motor; los de PILOTO no
      // tienen avión: su etiqueta es el piloto y el link va a Vencimientos
      // (antes se armaba /admin/aircraft/null — link roto).
      const aeronaveId = v.aeronave_id ?? v.motor?.aeronave_id ?? null;
      const matricula =
        v.aeronave?.matricula ??
        v.motor?.aeronave?.matricula ??
        v.piloto?.nombre ??
        "—";
      return {
        id: `v-${v.id}`,
        matricula,
        concepto: v.tipo_documento?.nombre ?? "Vencimiento",
        fecha: v.fecha_vencimiento,
        dias: daysUntil(v.fecha_vencimiento),
        critico: v.tipo_documento?.es_critico,
        href: aeronaveId
          ? `/admin/aircraft/${aeronaveId}`
          : "/admin/expirations?ambito=PILOTO",
        docId: canVerDocs && v.tiene_archivo ? v.id : undefined,
      };
    }),
    ...mantenimientos.map((m) => ({
      id: `m-${m.id}`,
      matricula: m.aeronave?.matricula ?? "—",
      concepto: `Mantenimiento: ${m.descripcion}`,
      fecha: m.fecha_programada,
      dias: daysUntil(m.fecha_programada),
      href: `/admin/aircraft/${m.aeronave_id}`,
    })),
  ].sort((a, b) => a.dias - b.dias);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Flota</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Ingeniería</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todos los vencimientos y mantenimientos próximos de la flota (90 días).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <WrenchScrewdriverIcon className="h-4 w-4 text-muted-foreground" />
            Próximos vencimientos y servicios
          </CardTitle>
          <CardDescription className="text-xs">
            {rows.length} {rows.length === 1 ? "pendiente" : "pendientes"}. Los vencidos van primero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada próximo en 90 días.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <Link
                  key={r.id}
                  href={r.href}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      <span className="font-mono">{r.matricula}</span> · {r.concepto}
                      {r.critico ? " ⚠" : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDateOnly(r.fecha)}
                    </p>
                    {r.docId && <VerDocumentoButton expirationId={r.docId} />}
                  </div>
                  <Badge variant="outline" className={diasBadge(r.dias)}>
                    {r.dias <= 0 ? "Vencido" : `${r.dias} d`}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
