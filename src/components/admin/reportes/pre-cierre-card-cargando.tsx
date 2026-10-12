import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto del pre-cierre mientras el API lo arma (Suspense, 12-oct-2026). */
export function PreCierreCardCargando() {
  return (
    <Card aria-busy="true" data-pre-cierre="cargando">
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
