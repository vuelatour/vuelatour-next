"use client";

import { useEffect, useState } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { anticiposDeClienteAction } from "@/app/admin/ingresos/actions";
import {
  AplicarAnticipoDialog,
  type VueloFijoAnticipo,
} from "@/components/admin/ingresos/aplicar-anticipo-dialog";
import { etiquetaIngreso } from "@/lib/admin/categorias-ingreso";
import { puedeVerIngresos } from "@/lib/admin/ingresos-ui";
import { fmtMonto } from "@/lib/format";
import type { Ingreso } from "@/types/ingresos";

/**
 * Banner en la card de COBROS del vuelo (24-sep-2026): «Este cliente tiene un
 * anticipo con saldo de $X (ING-12). Aplícalo aquí en vez de registrar el
 * cobro otra vez.» Evita el doble registro del mismo dinero (anticipo en
 * Ingresos + cobro nuevo en el vuelo).
 *
 * Es una PISTA: cualquier falla (sin permiso, sin la migración, API previo)
 * degrada en SILENCIO — no se pinta nada. Se vuelve a leer cuando cambian los
 * cobros del vuelo (`refrescar`).
 */
export function BannerAnticiposCliente({
  clienteId,
  vuelo,
  rol,
  refrescar,
}: {
  clienteId: string | null | undefined;
  vuelo: VueloFijoAnticipo;
  rol?: string | null;
  /** Cambia cuando cambian los cobros del vuelo (ids). */
  refrescar?: string;
}) {
  const [anticipos, setAnticipos] = useState<Ingreso[]>([]);
  const [aplicar, setAplicar] = useState<Ingreso | null>(null);
  const conPermiso = rol == null || puedeVerIngresos(rol);

  useEffect(() => {
    if (!clienteId || !conPermiso) return;
    let vivo = true;
    void anticiposDeClienteAction(clienteId)
      .then((r) => {
        if (vivo) setAnticipos(r.ok ? (r.data ?? []) : []);
      })
      .catch(() => {
        if (vivo) setAnticipos([]);
      });
    return () => {
      vivo = false;
    };
  }, [clienteId, conPermiso, refrescar]);

  if (!clienteId || !conPermiso || anticipos.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-100">
      {anticipos.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex min-w-0 items-start gap-2">
            <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Este cliente tiene un anticipo con saldo de{" "}
              <span className="font-mono font-semibold">
                {fmtMonto(a.anticipo?.saldo ?? 0, a.moneda)}
              </span>{" "}
              ({a.etiqueta || etiquetaIngreso(a.folio)}). Aplícalo aquí en vez de registrar el cobro
              otra vez.
            </span>
          </p>
          <Button size="sm" variant="outline" className="bg-background" onClick={() => setAplicar(a)}>
            Aplicar anticipo
          </Button>
        </div>
      ))}
      {aplicar && (
        <AplicarAnticipoDialog
          anticipo={aplicar}
          open
          onOpenChange={(o) => !o && setAplicar(null)}
          vueloFijo={vuelo}
        />
      )}
    </div>
  );
}
