"use client";

import { useState } from "react";
import { PrinterIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Día de HOY en hora Cancún (UTC−5 fijo) como YYYY-MM-DD. */
function hoyCancun(): string {
  return new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** Tiras que sabe generar el API (`tiras=` de GET /aircraft/:id/bitacora.pdf). */
type Tira = "PLANEADOR" | "MOTOR" | "HELICE";

/** Orden canónico de las tiras: así se mandan al API y así salen en el PDF. */
const TIRAS: ReadonlyArray<{ key: Tira; label: string; hint: string }> = [
  {
    key: "PLANEADOR",
    label: "Planeador",
    hint: "Tiempo total del planeador (base de la ficha del avión).",
  },
  {
    key: "MOTOR",
    label: "Motor",
    hint: "Horas del motor según su ficha en Componentes.",
  },
  {
    key: "HELICE",
    label: "Hélice",
    hint: "Horas de la hélice según su ficha en Componentes.",
  },
];

/**
 * Imprime las bitácoras de vuelo del avión (PDF, réplica de la plantilla del
 * equipo): una página por bitácora (planeador, motor, hélice) y una fila por
 * vuelo con fecha, tacómetro inicial, tiempo del componente, horas, tacómetro
 * final y ruta — para recortar y pegar en cada libro físico. Los tiempos de
 * cada componente los deriva el API desde su base capturada; el de hélice
 * puede teclearse a mano solo cuando la ficha no tiene horas.
 */
export function BitacoraPdfButton({
  aircraftId,
  matricula,
}: {
  aircraftId: string;
  matricula: string;
}) {
  const [open, setOpen] = useState(false);
  const [desde, setDesde] = useState(() => `${hoyCancun().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoyCancun);
  // Todas marcadas por default: el mecánico imprime las tres de un jalón.
  const [marcadas, setMarcadas] = useState<Record<Tira, boolean>>({
    PLANEADOR: true,
    MOTOR: true,
    HELICE: true,
  });
  const [heliceBase, setHeliceBase] = useState("");
  const [loading, setLoading] = useState(false);

  const seleccionadas = TIRAS.filter((t) => marcadas[t.key]).map((t) => t.key);
  const ninguna = seleccionadas.length === 0;
  const conHelice = marcadas.HELICE;

  const descargar = async () => {
    if (ninguna) {
      toast.error("Marca al menos una bitácora");
      return;
    }
    if (conHelice && heliceBase.trim() !== "" && !Number.isFinite(Number(heliceBase))) {
      toast.error("El tiempo de hélice inicial no es un número válido");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const params = new URLSearchParams();
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      params.set("tiras", seleccionadas.join(","));
      if (conHelice && heliceBase.trim() !== "") {
        params.set("helice_base", heliceBase.trim());
      }
      const res = await fetch(
        `${env.API_URL}/v1/aircraft/${aircraftId}/bitacora.pdf?${params.toString()}`,
        {
          headers: session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        },
      );
      if (!res.ok) {
        toast.error("No se pudieron generar las bitácoras");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `bitacoras-${matricula}${desde ? `-${desde}` : ""}${hasta ? `-a-${hasta}` : ""}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setOpen(false);
    } catch {
      toast.error("No se pudieron generar las bitácoras");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-2 shrink-0"
        onClick={() => setOpen(true)}
        title="PDF con una página por bitácora (planeador, motor, hélice) y una fila por vuelo, para recortar y pegar en cada libro físico."
      >
        <PrinterIcon className="h-4 w-4" />
        Imprimir bitácoras (PDF)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bitácoras de vuelo · {matricula}</DialogTitle>
            <DialogDescription>
              Una página por bitácora (planeador, motor, hélice), una fila por
              vuelo, lista para recortar y pegar en cada libro. Los tiempos de
              cada componente salen de su base capturada: planeador → Tiempo
              total del planeador; motor/hélice → ficha del componente. Deja
              las fechas vacías para todo el histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="bitacora-desde" className="text-sm font-medium">
                  Desde
                </label>
                <input
                  id="bitacora-desde"
                  type="date"
                  className={inputCls}
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="bitacora-hasta" className="text-sm font-medium">
                  Hasta
                </label>
                <input
                  id="bitacora-hasta"
                  type="date"
                  className={inputCls}
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </div>
            </div>

            {/* Qué bitácoras imprimir (mínimo una). Cada una sale en su
                propia página del PDF, en este mismo orden. */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Bitácoras a imprimir</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {TIRAS.map((t) => (
                  <label
                    key={t.key}
                    htmlFor={`bitacora-tira-${t.key}`}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5"
                  >
                    <input
                      id={`bitacora-tira-${t.key}`}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-primary"
                      checked={marcadas[t.key]}
                      onChange={(e) =>
                        setMarcadas((m) => ({ ...m, [t.key]: e.target.checked }))
                      }
                    />
                    <span className="text-sm">
                      <span className="font-medium">{t.label}</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">
                        {t.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {ninguna && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Marca al menos una bitácora para generar el PDF.
                </p>
              )}
            </fieldset>

            {conHelice && (
              <div className="space-y-1.5">
                <label htmlFor="bitacora-helice" className="text-sm font-medium">
                  Tiempo de hélice del primer renglón{" "}
                  <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="bitacora-helice"
                  inputMode="decimal"
                  className={inputCls}
                  value={heliceBase}
                  onChange={(e) => setHeliceBase(e.target.value)}
                  placeholder="Ej. 1395.2 (del libro)"
                />
                <p className="text-[11px] text-muted-foreground">
                  Solo si la ficha de la hélice no tiene horas capturadas
                  (Componentes → hélice). Si ya las tiene, déjalo vacío: se
                  calcula solo. Vacío y sin ficha = columnas con «—» para
                  llenar a mano.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={descargar}
              disabled={loading || ninguna}
              className="gap-2"
            >
              <PrinterIcon className="h-4 w-4" />
              {loading ? "Generando…" : "Generar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
