"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowPathIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Tarjeta de error de la llamada PRINCIPAL de una pantalla (21-sep-2026).
 *
 * Se usa cuando la página quiere conservar su cabecera y sus accesos en vez
 * de irse entera al error boundary. Lo que NUNCA hace: pintar «sin datos».
 * Que una lista de dinero aparezca vacía porque el API no contestó lleva a
 * capturar dos veces y a decisiones equivocadas — aquí se dice que FALLÓ.
 *
 * «Reintentar» hace `router.refresh()`: vuelve a correr el Server Component
 * (y con él el reintento de `apiFetch`) sin recargar toda la aplicación.
 */
export function TarjetaErrorCarga({
  titulo = "No se pudo cargar la información",
  descripcion,
}: {
  titulo?: string;
  descripcion?: React.ReactNode;
}) {
  const router = useRouter();
  const [refrescando, empezar] = useTransition();

  return (
    <Card className="border-destructive/40">
      <CardHeader className="text-center py-10">
        <div className="flex justify-center mb-4">
          <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <ExclamationTriangleIcon className="h-7 w-7 text-destructive" />
          </div>
        </div>
        <CardTitle className="text-lg">{titulo}</CardTitle>
        <CardDescription>
          {descripcion ?? (
            <>
              El sistema no respondió. Suele ser momentáneo (por ejemplo, mientras se
              actualiza); pulsa Reintentar.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center pb-8">
        <button
          type="button"
          onClick={() => empezar(() => router.refresh())}
          disabled={refrescando}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          <ArrowPathIcon className={`h-4 w-4 ${refrescando ? "animate-spin" : ""}`} />
          {refrescando ? "Reintentando…" : "Reintentar"}
        </button>
      </CardContent>
    </Card>
  );
}
