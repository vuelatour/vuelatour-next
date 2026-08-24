"use client";

import { useMemo, useState } from "react";
import { BoltIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Ruta rápida: la operadora teclea los códigos en una línea — "CUN, HOL, CUN"
 * (también sirven espacios, guiones o flechas) — y con Enter se arman los
 * tramos consecutivos (CUN→HOL, HOL→CUN). Atajo pedido por el cliente
 * (ago 2026): capturar tramo por tramo con selects era tedioso. NO cambia
 * ningún dato ni el modelo de tramos: solo llena el editor de golpe.
 */

// Separadores aceptados: coma, punto y coma, espacio, guion (incluye – y — de
// la puntuación "inteligente" de macOS/WhatsApp), flecha, "/", "·", ".".
const SEPARADORES = /[\s,;>→\-–—/·.]+/;

/** Separa la línea en códigos IATA (en MAYÚSCULAS). */
export function parseCodigosRuta(raw: string): string[] {
  return raw
    .toUpperCase()
    .split(SEPARADORES)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Códigos que se repiten de forma consecutiva (X,X → tramo de sobrevuelo). */
const repetidosConsecutivos = (codigos: string[]): string[] => [
  ...new Set(codigos.filter((c, i) => c === codigos[i + 1])),
];

export function RutaRapidaInput({
  airports,
  hayDatos,
  onAplicar,
  className,
}: {
  /** Catálogo de aeropuertos: los códigos se validan contra él. */
  airports: { iata: string }[];
  /**
   * true si los tramos actuales tienen CAPTURA que se perdería (pasajeros,
   * fechas, notas…): antes de reemplazarlos se pide confirmación (regla
   * permanente del cliente). Puro esqueleto de ruta no cuenta: reponerlo
   * cuesta un Enter y el diálogo en cada uso estorbaría.
   */
  hayDatos: boolean;
  /** Recibe los códigos validados (con la grafía exacta del catálogo). */
  onAplicar: (codigos: string[]) => void;
  className?: string;
}) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string[] | null>(null);

  // MAYÚSCULAS → grafía exacta del catálogo (los selects comparan el valor tal cual).
  const canonico = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of airports) m.set(a.iata.toUpperCase(), a.iata);
    return m;
  }, [airports]);

  const codigos = parseCodigosRuta(raw);
  const desconocidos = [...new Set(codigos.filter((c) => !canonico.has(c)))];
  // Aviso EN VIVO solo sobre códigos "terminados" (les sigue un separador o no
  // son el último): regañar a media tecleada ("CUN, HO…") es puro ruido ámbar.
  const ultimoTerminado = raw.length > 0 && SEPARADORES.test(raw[raw.length - 1]);
  const terminados = ultimoTerminado ? codigos : codigos.slice(0, -1);
  const desconocidosAviso = [
    ...new Set(terminados.filter((c) => !canonico.has(c))),
  ];
  const repetidosPreview = repetidosConsecutivos(codigos);

  const aplicar = () => {
    setError(null);
    if (codigos.length < 2) {
      setError("Escribe al menos dos aeropuertos, ej. CUN, HOL, CUN");
      return;
    }
    if (desconocidos.length > 0) {
      setError(
        `No está${desconocidos.length > 1 ? "n" : ""} en el catálogo de Aeropuertos: ${desconocidos.join(", ")}`,
      );
      return;
    }
    const canonicos = codigos.map((c) => canonico.get(c)!);
    // Confirmación cuando se pierde captura O cuando hay un código repetido
    // (CUN,CUN = sobrevuelo): teclear "CUN-HOL, HOL-CUN" pensando en pares
    // produciría un HOL→HOL fantasma — mejor preguntarlo en claro.
    if (hayDatos || repetidosConsecutivos(canonicos).length > 0) {
      setConfirmar(canonicos);
      return;
    }
    onAplicar(canonicos);
    setRaw("");
  };

  const nTramos = codigos.length - 1;
  const repsConfirmar = confirmar ? repetidosConsecutivos(confirmar) : [];

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <BoltIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              // preventDefault: dentro de un form, Enter dispararía el submit.
              if (e.key === "Enter") {
                e.preventDefault();
                aplicar();
              }
            }}
            placeholder="Ruta rápida: CUN, HOL, CUN + Enter"
            aria-label="Ruta rápida"
            className="h-9 pl-8"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={aplicar}
          disabled={!raw.trim()}
        >
          Armar tramos
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : raw.trim() && desconocidosAviso.length > 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Sin catálogo: {desconocidosAviso.join(", ")}
        </p>
      ) : raw.trim() && codigos.length >= 2 ? (
        <p className="text-xs text-muted-foreground">
          {codigos.join(" → ")} · {nTramos} {nTramos === 1 ? "tramo" : "tramos"}
          {repetidosPreview.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {" "}
              · {repetidosPreview.map((c) => `${c} → ${c}`).join(", ")} se
              capturará como sobrevuelo
            </span>
          )}
        </p>
      ) : null}

      <Dialog open={confirmar !== null} onOpenChange={(o) => !o && setConfirmar(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {hayDatos ? "¿Reemplazar los tramos actuales?" : "Ruta con sobrevuelo"}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              {hayDatos && (
                <span className="block">
                  Los tramos ya capturados (con sus pasajeros, fechas y notas)
                  se sustituirán por {confirmar?.join(" → ")}. Esta acción no
                  se puede deshacer.
                </span>
              )}
              {repsConfirmar.length > 0 && (
                <span className="block">
                  {repsConfirmar.map((c) => `${c} → ${c}`).join(", ")} se
                  capturará como <strong>sobrevuelo</strong> (sale y regresa
                  al mismo punto). Si tecleaste los tramos por pares (ej.
                  &ldquo;CUN-HOL, HOL-CUN&rdquo;), cancela y escribe cada
                  punto una sola vez: CUN, HOL, CUN.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
            <Button
              variant={hayDatos ? "destructive" : "default"}
              onClick={() => {
                if (confirmar) onAplicar(confirmar);
                setConfirmar(null);
                setRaw("");
              }}
            >
              {hayDatos ? "Reemplazar tramos" : "Armar tramos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
