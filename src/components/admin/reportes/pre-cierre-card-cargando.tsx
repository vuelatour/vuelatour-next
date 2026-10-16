import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ANCLA_PRE_CIERRE } from "@/lib/admin/pre-cierre-resolver";

/**
 * Esqueleto del pre-cierre mientras el API lo arma (Suspense, 12-oct-2026).
 * Lleva el ancla `#pre-cierre` (15-oct-2026): «Volver al pre-cierre →» de la
 * franja aterriza aquí aunque la card siga cargando.
 */
export function PreCierreCardCargando() {
  return (
    <Card id={ANCLA_PRE_CIERRE} aria-busy="true" data-pre-cierre="cargando" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-base">Pre-cierre del periodo</CardTitle>
        <CardDescription>Revisando pendientes del periodo…</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}
