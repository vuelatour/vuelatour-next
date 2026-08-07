"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { todayCancun } from "@/lib/datetime";
import { ReportDownloads } from "./report-downloads";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Último día del mes (cuenta de calendario, sin zonas horarias). */
function finDeMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

interface Periodo {
  desde: string;
  hasta: string;
}

/**
 * Contenido de la card "Cierre y reparto del periodo": selector de MES +
 * botones de descarga COMPARTIENDO el periodo en estado local. Los botones
 * usan el periodo elegido AL INSTANTE (sin esperar el round-trip del
 * router.replace que refresca pre-cierre y balance): sin esto, elegir un mes
 * y descargar de inmediato generaba el reporte del periodo anterior.
 */
export function CierreRepartoSection({ desde, hasta }: Periodo) {
  // El override guarda contra QUÉ props se eligió: en cuanto la URL cambia
  // (la transición del select llegó, o el operador tecleó fechas arriba),
  // el snapshot deja de coincidir y vuelven a mandar las props — sin
  // efectos ni estados que sincronizar.
  const [override, setOverride] = useState<{
    base: Periodo;
    periodo: Periodo;
  } | null>(null);
  const vigente =
    override &&
    override.base.desde === desde &&
    override.base.hasta === hasta
      ? override.periodo
      : null;
  const ef = vigente ?? { desde, hasta };
  const onElegir = useCallback(
    (periodo: Periodo) => setOverride({ base: { desde, hasta }, periodo }),
    [desde, hasta],
  );

  return (
    <div className="space-y-4">
      <MesReporteSelect desde={ef.desde} hasta={ef.hasta} onElegir={onElegir} />
      <ReportDownloads desde={ef.desde} hasta={ef.hasta} />
    </div>
  );
}

/**
 * Selector de MES para los reportes del cierre: elegir un mes llena el
 * periodo completo (del 1 al último día, hora Cancún; el mes en curso corta
 * en HOY para no evaluar días que aún no ocurren) y lo empuja a la URL, así
 * el pre-cierre y el balance por avión quedan en el mismo periodo. El rango
 * manual del selector de fechas de arriba sigue disponible para periodos
 * personalizados.
 */
export function MesReporteSelect({
  desde,
  hasta,
  onElegir,
  className,
}: Periodo & {
  onElegir?: (p: Periodo) => void;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  // "Hoy" se fija UNA vez (lazy): llamarlo en cada render producía un
  // hydration mismatch si el HTML del servidor cruzaba medianoche Cancún
  // antes de hidratar en el cliente.
  const [hoy] = useState(() => todayCancun()); // YYYY-MM-DD

  // Meses ofrecidos: desde enero 2026 (inicio de la operación en el sistema)
  // hasta el mes corriente en hora Cancún.
  const opciones = useMemo(() => {
    const [anioHoy, mesHoy] = [
      Number(hoy.slice(0, 4)),
      Number(hoy.slice(5, 7)),
    ];
    const out: { value: string; label: string }[] = [];
    for (let a = anioHoy; a >= 2026; a--) {
      const mMax = a === anioHoy ? mesHoy : 12;
      for (let m = mMax; m >= 1; m--) {
        const value = `${a}-${String(m).padStart(2, "0")}`;
        const enCurso = a === anioHoy && m === mesHoy;
        out.push({
          value,
          label: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${a}${
            enCurso ? " (en curso)" : ""
          }`,
        });
      }
    }
    return out;
  }, [hoy]);

  // El select refleja el mes SOLO si el periodo actual es exactamente ese
  // mes (completo; el corriente también cuenta cortado en hoy) Y el mes está
  // en el catálogo: un value sin <option> haría que el navegador pinte la
  // primera opción como si estuviera elegida — mintiendo el periodo.
  const seleccionado = useMemo(() => {
    const ym = desde.slice(0, 7);
    if (desde !== `${ym}-01`) return "";
    if (!opciones.some((o) => o.value === ym)) return "";
    const [a, m] = [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))];
    const fin = `${ym}-${String(finDeMes(a, m)).padStart(2, "0")}`;
    if (ym === hoy.slice(0, 7)) {
      return hasta === hoy || hasta === fin ? ym : "";
    }
    return hasta === fin ? ym : "";
  }, [desde, hasta, hoy, opciones]);

  const elegirMes = useCallback(
    (ym: string) => {
      if (!ym) return;
      const [a, m] = [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))];
      // Mes corriente: corta en HOY (como el default de la página). Con el
      // fin de mes en el futuro, el pre-cierre marcaba como bloqueantes
      // vuelos programados que simplemente aún no vuelan.
      const fin =
        ym === hoy.slice(0, 7)
          ? hoy
          : `${ym}-${String(finDeMes(a, m)).padStart(2, "0")}`;
      const periodo = { desde: `${ym}-01`, hasta: fin };
      onElegir?.(periodo);
      const sp = new URLSearchParams(params.toString());
      sp.set("desde", periodo.desde);
      sp.set("hasta", periodo.hasta);
      startTransition(() => {
        router.replace(`${pathname}?${sp.toString()}`);
      });
    },
    [hoy, onElegir, params, pathname, router],
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium" htmlFor="mes-reporte">
        Mes del reporte
      </Label>
      <div className="flex items-center gap-3 flex-wrap">
        <select
          id="mes-reporte"
          value={seleccionado}
          onChange={(ev) => elegirMes(ev.target.value)}
          className="h-9 min-w-44 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="" disabled>
            Periodo personalizado (usa las fechas de arriba)
          </option>
          {opciones.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Periodo: {desde.split("-").reverse().join("/")} —{" "}
          {hasta.split("-").reverse().join("/")}
        </p>
      </div>
    </div>
  );
}
