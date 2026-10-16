"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowTopRightOnSquareIcon, EyeIcon } from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { BotonAbrirFirmado, VisorPdf, esPdfPath } from "@/components/admin/visor-archivo";
import {
  archivosDelComprobante,
  etiquetaHoja,
  hojasDe,
  nombreCorto,
  textoHojas,
  tituloHojas,
} from "@/lib/admin/comprobante-hojas";
import { BOTON_ABRIR_PESTANA, BOTON_VER_AQUI } from "@/lib/admin/facturas-gasto";
import { pedirUrlFirmada } from "@/lib/storage/url-firmada";

const esImagen = (p: string) => /\.(jpe?g|png|webp)$/i.test(p);

/**
 * «+N hojas» de las tablas de gastos (16-oct-2026): antes era texto muerto
 * («ábrelas en Verificar / editar»). Ahora abre el comprobante COMPLETO (la
 * hoja principal y las demás) con el visor incrustado del PDF y «Abrir en
 * pestaña nueva»; las fotos, con su miniatura de siempre (zoom).
 */
export function HojasComprobanteBoton({
  gasto,
  fotoUrl,
}: {
  gasto: { foto_url?: string | null; valor_ia_extraido?: Record<string, unknown> | null };
  /** URL firmada de la hoja principal que ya trae la página. */
  fotoUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const archivos = useMemo(() => archivosDelComprobante(gasto), [gasto]);
  const n = hojasDe(gasto).length;
  if (!textoHojas(n)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer whitespace-nowrap text-[11px] text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
        title={tituloHojas(n)}
      >
        {textoHojas(n)}
      </button>
      {open && (
        <HojasComprobanteDialog
          archivos={archivos}
          principal={gasto.foto_url ?? null}
          fotoUrl={fotoUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function HojasComprobanteDialog({
  archivos,
  principal,
  fotoUrl,
  onClose,
}: {
  archivos: string[];
  principal: string | null;
  fotoUrl?: string;
  onClose: () => void;
}) {
  // Firmas de las hojas (la página solo firma la principal), pedidas al abrir.
  const [urls, setUrls] = useState<Record<string, string>>(() =>
    principal && fotoUrl ? { [principal]: fotoUrl } : {},
  );
  const [visor, setVisor] = useState<string | null>(() => archivos.find(esPdfPath) ?? null);
  useEffect(() => {
    let cancel = false;
    const faltan = archivos.filter((p) => p !== principal || !fotoUrl);
    void Promise.all(faltan.map((p) => pedirUrlFirmada("gasto-fotos", p).then((u) => [p, u] as const))).then(
      (pares) => {
        if (cancel) return;
        const nuevas: Record<string, string> = {};
        for (const [p, u] of pares) if (u) nuevas[p] = u;
        if (Object.keys(nuevas).length > 0) setUrls((prev) => ({ ...prev, ...nuevas }));
      },
    );
    return () => {
      cancel = true;
    };
  }, [archivos, principal, fotoUrl]);

  const total = archivos.length;
  const claseLink =
    "inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-brand-600 hover:bg-muted dark:text-brand-400";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-hojas-comprobante-dialogo>
        <DialogHeader>
          <DialogTitle>Comprobante del gasto ({total} archivos)</DialogTitle>
          <DialogDescription>
            La hoja 1 es la que lee la IA; las demás son hojas del mismo comprobante. Para
            agregar o quitar hojas, usa «Verificar / editar».
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {archivos.map((p, i) => {
            const url = urls[p];
            const pdf = esPdfPath(p);
            return (
              <li key={p} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-xs">
                <span className="w-20 shrink-0 text-muted-foreground">{etiquetaHoja(i + 1, total)}</span>
                {esImagen(p) && url ? (
                  <ComprobantePreview
                    bucket="gasto-fotos"
                    path={p}
                    url={url}
                    alt={`Hoja ${i + 1} del comprobante`}
                    thumbClassName="h-10 w-10 rounded object-cover"
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate" title={p}>
                  {nombreCorto(p.split("/").pop() ?? p)}
                </span>
                {pdf && (
                  <button
                    type="button"
                    onClick={() => setVisor((v) => (v === p ? null : p))}
                    className={claseLink}
                    aria-pressed={visor === p}
                  >
                    <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {visor === p ? "Ocultar" : BOTON_VER_AQUI}
                  </button>
                )}
                <BotonAbrirFirmado bucket="gasto-fotos" path={p} url={url} className={claseLink}>
                  {BOTON_ABRIR_PESTANA}
                  <ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden="true" />
                </BotonAbrirFirmado>
              </li>
            );
          })}
        </ul>
        {visor && (
          <VisorPdf
            key={visor}
            bucket="gasto-fotos"
            path={visor}
            url={urls[visor]}
            titulo={`${etiquetaHoja(archivos.indexOf(visor) + 1, total)} · ${nombreCorto(visor.split("/").pop() ?? visor)}`}
            onCerrar={() => setVisor(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
