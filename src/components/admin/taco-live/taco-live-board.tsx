"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, ClockIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImagePreview } from "@/components/admin/image-preview";
import { EmptyState } from "@/components/admin/empty-state";
import { confirmTacoAction } from "@/app/admin/flights/actions";
import { fmtDateTime } from "@/lib/datetime";
import { fotoDudosa, leyendaOrigen, partirMotivo } from "@/lib/taco-procedencia";

export interface TacoLiveEscala {
  escala_id: string;
  orden: number;
  origen_iata: string;
  destino_iata: string;
  es_ferry: boolean;
  fecha_salida_plan: string | null;
  esperado_fin: string | null;
  estado: "ESPERANDO" | "EN_CURSO" | "VENCIDA" | "REVISAR" | "OK";
  taco_salida: number | null;
  taco_salida_origen: string | null;
  taco_llegada: number | null;
  taco_llegada_origen: string | null;
  valor_ia_propuesto: number | null;
  revision_requerida: boolean;
  revision_motivo: string | null;
  capturado_por_nombre: string | null;
  corregido_por_nombre: string | null;
  corregido_at: string | null;
  nota_correccion: string | null;
  foto_salida_url: string | null;
  foto_llegada_url: string | null;
  /**
   * RECOMENDACIÓN calculada al vuelo por el API (promedio del tramo). NO es
   * una lectura: el sistema ya no escribe estimados — la oficina la confirma
   * o ajusta. Opcionales para tolerar API viejo/nuevo.
   */
  llegada_estimada?: number | null;
  minutos_promedio?: number | null;
}

export interface TacoLiveVuelo {
  vuelo_id: string;
  folio: number;
  estado: string;
  fecha_vuelo: string | null;
  matricula: string | null;
  piloto_nombre: string | null;
  escalas: TacoLiveEscala[];
}

const ESTADO_STYLE: Record<TacoLiveEscala["estado"], { label: string; cls: string }> = {
  ESPERANDO: { label: "Esperando", cls: "bg-slate-500/15 text-slate-500 border-slate-500/30" },
  EN_CURSO: { label: "En curso", cls: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  VENCIDA: { label: "Vencida · sin dato", cls: "bg-red-500/15 text-red-600 border-red-500/30" },
  REVISAR: { label: "Revisar", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  OK: { label: "OK", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
};

function fmtTaco(n: number): string {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Sugerencia de llegada (solo referencia, NO un dato): aplica a escalas
 * EN_CURSO/VENCIDA que siguen sin lectura de llegada y el API mandó la
 * recomendación calculada al vuelo.
 */
function sugerenciaLlegada(e: TacoLiveEscala): number | null {
  if (e.taco_llegada != null) return null;
  if (e.estado !== "EN_CURSO" && e.estado !== "VENCIDA") return null;
  return e.llegada_estimada ?? null;
}

// La leyenda de procedencia vive en @/lib/taco-procedencia (fuente única): el
// detalle del vuelo muestra exactamente lo mismo.

export function TacoLiveBoard({ vuelos }: { vuelos: TacoLiveVuelo[] }) {
  if (vuelos.length === 0) {
    return (
      <EmptyState
        icon={ClockIcon}
        title="Sin vuelos este día"
        description="No hay vuelos programados (no cancelados) para la fecha seleccionada."
      />
    );
  }
  return (
    <div className="space-y-4">
      {vuelos.map((v) => (
        <Card key={v.vuelo_id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/flights/${v.vuelo_id}`}
                className="hover:underline font-mono"
              >
                #{v.folio}
              </Link>
              <span className="text-muted-foreground font-normal">
                {v.matricula ?? "sin avión"} · {v.piloto_nombre ?? "sin piloto"} ·{" "}
                {v.fecha_vuelo ? fmtDateTime(v.fecha_vuelo) : "—"}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {v.estado}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {v.escalas.map((e) => (
              <EscalaRow key={e.escala_id} vueloId={v.vuelo_id} escala={e} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Lectura({
  escala,
  lado,
}: {
  escala: TacoLiveEscala;
  lado: "salida" | "llegada";
}) {
  const valor = lado === "salida" ? escala.taco_salida : escala.taco_llegada;
  const foto = lado === "salida" ? escala.foto_salida_url : escala.foto_llegada_url;
  const leyenda = leyendaOrigen(escala, lado);
  return (
    <div className="flex items-center gap-2 min-w-0">
      {foto && (
        <ImagePreview
          src={foto}
          alt={`Tacómetro ${lado} · escala ${escala.orden}`}
          thumbClassName="h-10 w-10 rounded object-cover shrink-0"
        />
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground">
          {lado.toUpperCase()}
        </p>
        <p className="font-mono text-sm font-bold">{valor ?? "—"}</p>
        {leyenda && (
          <p className="text-[10px] text-muted-foreground truncate" title={leyenda}>
            {leyenda}
          </p>
        )}
      </div>
    </div>
  );
}

function EscalaRow({ vueloId, escala }: { vueloId: string; escala: TacoLiveEscala }) {
  const st = ESTADO_STYLE[escala.estado];
  const sugerencia = sugerenciaLlegada(escala);
  return (
    <div
      className={`rounded-lg border p-3 ${
        escala.estado === "REVISAR"
          ? "border-amber-500/50 bg-amber-500/5"
          : escala.estado === "VENCIDA"
            ? "border-red-500/50 bg-red-500/5"
            : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/admin/flights/${vueloId}`}
            className="font-mono text-sm font-semibold hover:text-brand-600 hover:underline"
            title="Abrir el vuelo de esta escala"
          >
            {escala.orden}. {escala.origen_iata} → {escala.destino_iata}
          </Link>
          {escala.es_ferry && (
            <Badge variant="outline" className="text-[10px]">
              Ferry
            </Badge>
          )}
          <Badge variant="outline" className={`text-[10px] ${st.cls}`}>
            {st.label}
          </Badge>
          {escala.esperado_fin && escala.taco_llegada == null && (
            <span className="text-[11px] text-muted-foreground">
              fin esperado {fmtDateTime(escala.esperado_fin)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-6">
          <Lectura escala={escala} lado="salida" />
          <Lectura escala={escala} lado="llegada" />
          <RevisionActions vueloId={vueloId} escala={escala} />
        </div>
      </div>
      {sugerencia != null && (
        <p
          className="mt-2 text-[11px] text-amber-600/90 dark:text-amber-400/90"
          title="Calculada con el promedio histórico del tramo. NO es una lectura: confírmala con la foto del piloto o ajústala aquí."
        >
          Sugerencia: ~{fmtTaco(sugerencia)}
          {escala.minutos_promedio != null &&
            ` (promedio del tramo ~${Math.round(escala.minutos_promedio)} min)`}{" "}
          — solo referencia, aún sin lectura.
        </p>
      )}
      {escala.revision_requerida && (
        <p className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          {partirMotivo(escala.revision_motivo).pendientes ??
            "Lectura por revisar"}
        </p>
      )}
      {/* Bitácora: cómo entró el número (IA, calidad de la foto, quién lo
          aceptó y quién lo confirmó). Se ve aunque la lectura esté en verde. */}
      {partirMotivo(escala.revision_motivo).bitacora && (
        <p
          className={
            fotoDudosa(escala.revision_motivo)
              ? "mt-2 text-[11px] text-amber-600 dark:text-amber-400"
              : "mt-2 text-[11px] text-muted-foreground"
          }
        >
          {fotoDudosa(escala.revision_motivo) && "\u26a0 "}
          {partirMotivo(escala.revision_motivo).bitacora}
        </p>
      )}
      {!escala.revision_requerida && escala.nota_correccion && (
        <p className="mt-2 text-[11px] text-muted-foreground italic">
          {escala.nota_correccion}
        </p>
      )}
    </div>
  );
}

/** Comprobar (tal cual) o Ajustar (corrigiendo valores) viendo la foto. */
function RevisionActions({
  vueloId,
  escala,
}: {
  vueloId: string;
  escala: TacoLiveEscala;
}) {
  const router = useRouter();
  const [openAjuste, setOpenAjuste] = useState(false);
  const [pending, startTransition] = useTransition();
  // Sin llegada real: precargamos la sugerencia del API (editable). Guardar
  // sigue siendo confirmTaco — acción humana deliberada, origen OFICINA.
  const sugerencia = sugerenciaLlegada(escala);
  const [salida, setSalida] = useState(escala.taco_salida?.toString() ?? "");
  const [llegada, setLlegada] = useState(
    escala.taco_llegada?.toString() ?? sugerencia?.toString() ?? "",
  );
  const [nota, setNota] = useState("");

  const comprobar = () => {
    startTransition(async () => {
      const res = await confirmTacoAction(vueloId, escala.escala_id, {});
      if (res.ok) {
        toast.success("Lectura comprobada");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al comprobar");
      }
    });
  };

  const ajustar = () => {
    const payload: { taco_salida?: number; taco_llegada?: number; nota?: string } = {};
    if (salida.trim() && Number(salida) !== escala.taco_salida) {
      payload.taco_salida = Number(salida);
    }
    if (llegada.trim() && Number(llegada) !== escala.taco_llegada) {
      payload.taco_llegada = Number(llegada);
    }
    if (nota.trim()) payload.nota = nota.trim();
    startTransition(async () => {
      const res = await confirmTacoAction(vueloId, escala.escala_id, payload);
      if (res.ok) {
        toast.success("Lectura ajustada");
        setOpenAjuste(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al ajustar");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {/* Comprobar solo aplica a lecturas en amarillo; Ajustar SIEMPRE está
          disponible — la oficina puede corregir aunque la escala esté OK. */}
      {escala.revision_requerida && (
      <Button
        size="sm"
        variant="outline"
        onClick={comprobar}
        disabled={pending}
        className="h-8 gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
        title="La lectura es correcta tal cual está (viste la foto)."
      >
        <CheckCircleIcon className="h-3.5 w-3.5" />
        Comprobar
      </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpenAjuste(true)}
        disabled={pending}
        className="h-8 gap-1.5"
        title="Corregir el valor viendo la foto."
      >
        <PencilSquareIcon className="h-3.5 w-3.5" />
        Ajustar
      </Button>

      <Dialog open={openAjuste} onOpenChange={setOpenAjuste}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Ajustar tacómetro · {escala.origen_iata} → {escala.destino_iata}
            </DialogTitle>
            <DialogDescription>
              {partirMotivo(escala.revision_motivo).pendientes ??
                "Corrige contra la foto."}{" "}
              Al guardar
              queda como &ldquo;Ajustado por ti&rdquo; y la escala pasa a verde.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            {escala.foto_salida_url && (
              <ImagePreview
                src={escala.foto_salida_url}
                alt="Foto salida"
                thumbClassName="h-24 w-24 rounded object-cover"
              />
            )}
            {escala.foto_llegada_url && (
              <ImagePreview
                src={escala.foto_llegada_url}
                alt="Foto llegada"
                thumbClassName="h-24 w-24 rounded object-cover"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Salida</Label>
              <Input
                inputMode="decimal"
                value={salida}
                onChange={(e) => setSalida(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Llegada</Label>
              <Input
                inputMode="decimal"
                value={llegada}
                onChange={(e) => setLlegada(e.target.value)}
              />
              {sugerencia != null && (
                <p className="text-[11px] text-amber-600/90 dark:text-amber-400/90">
                  Sugerencia por promedio — confirma con la foto o el piloto
                  antes de guardar.
                </p>
              )}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Nota (opcional)</Label>
              <Input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej. la foto marca 1554.1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAjuste(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={ajustar} disabled={pending}>
              {pending ? "Guardando…" : "Guardar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
