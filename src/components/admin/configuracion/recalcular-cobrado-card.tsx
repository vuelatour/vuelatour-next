"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { recalcularCobradoAction } from "@/app/admin/configuracion/actions";
import {
  DESCRIPCION_RECALCULAR_COBRADO,
  ETIQUETA_BOTON_RECALCULANDO,
  ETIQUETA_BOTON_RECALCULAR,
  MAX_CAMBIOS_LISTADOS,
  TEXTO_CONFIRMAR_RECALCULO,
  TITULO_CONFIRMAR_RECALCULO,
  TITULO_RECALCULAR_COBRADO,
  folioTexto,
  mensajeErrorRecalculo,
  resumenRecalculo,
  textoCambio,
  toastRecalculo,
  type ResultadoRecalcularCobrado,
} from "@/lib/admin/recalcular-cobrado";

/**
 * Tarjeta «Bandera «cobrado» de los vuelos» de Configuración (solo ADMIN: la
 * página ya lo exige). Confirma antes (regla del cliente: toda acción masiva
 * se confirma), llama a la action y pinta el resultado: resumen, los vuelos
 * que cambiaron (con enlace) y los errores. Los textos y el resumen viven en
 * `lib/admin/recalcular-cobrado.ts`.
 */
export function RecalcularCobradoCard() {
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRecalcularCobrado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const recalcular = () => {
    setAbierto(false);
    setError(null);
    iniciar(async () => {
      const r = await recalcularCobradoAction().catch(() => ({
        ok: false as const,
        error: undefined,
        code: "SIN_CONEXION",
        status: undefined,
        data: undefined,
      }));
      if (r.ok && r.data) {
        setResultado(r.data);
        toast.success(toastRecalculo(r.data));
        return;
      }
      const texto = mensajeErrorRecalculo({ ok: false, error: r.error, code: r.code, status: r.status });
      setError(texto);
      toast.error(texto);
    });
  };

  const cambios = resultado?.cambiados ?? [];
  const listados = cambios.slice(0, MAX_CAMBIOS_LISTADOS);
  const restantes = cambios.length - listados.length;

  return (
    <Card data-recalcular-cobrado>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowPathIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
          {TITULO_RECALCULAR_COBRADO}
        </CardTitle>
        <CardDescription>{DESCRIPCION_RECALCULAR_COBRADO}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" onClick={() => setAbierto(true)} disabled={pendiente} data-recalcular-boton>
          {pendiente ? ETIQUETA_BOTON_RECALCULANDO : ETIQUETA_BOTON_RECALCULAR}
        </Button>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {resultado && (
          <div className="space-y-2 text-sm" data-recalcular-resultado>
            <p className="font-medium">{resumenRecalculo(resultado)}</p>
            {listados.length > 0 && (
              <ul className="grid gap-1 sm:grid-cols-2">
                {listados.map((v) => (
                  <li key={v.id} className="font-mono text-xs">
                    <a href={`/admin/flights/${v.id}`} className="cursor-pointer underline underline-offset-2">
                      {textoCambio(v)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {restantes > 0 && (
              <p className="text-xs text-muted-foreground">
                y {restantes} vuelo{restantes === 1 ? "" : "s"} más.
              </p>
            )}
            {resultado.errores.length > 0 && (
              <ul className="space-y-1 text-xs text-destructive">
                {resultado.errores.map((e) => (
                  <li key={`${e.id}-${e.folio ?? ""}`}>
                    {folioTexto(e)}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{TITULO_CONFIRMAR_RECALCULO}</AlertDialogTitle>
            <AlertDialogDescription>{TEXTO_CONFIRMAR_RECALCULO}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button type="button" onClick={recalcular} data-recalcular-confirmar>
              {ETIQUETA_BOTON_RECALCULAR}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
