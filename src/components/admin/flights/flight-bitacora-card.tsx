import { BellAlertIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtDateTime } from "@/lib/datetime";
import type { BitacoraEvento } from "@/lib/api/flights-server";

/**
 * Bitácora del vuelo: muestra los recordatorios de tacómetro enviados al
 * piloto (15/10/5 min antes) y las capturas de tacómetro registradas, en
 * orden cronológico. Da evidencia de "sí se le avisó" y de cuándo subió el dato.
 */
export function FlightBitacoraCard({ eventos }: { eventos: BitacoraEvento[] }) {
  if (eventos.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Bitácora de tacómetro</CardTitle>
        <CardDescription className="text-xs">
          Recordatorios enviados al piloto y capturas registradas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {eventos.map((e) => {
            const esCaptura = e.tipo === "taco_capturado";
            return (
              <li key={e.id} className="flex gap-3 text-sm">
                {esCaptura ? (
                  <CheckCircleIcon className="h-4 w-4 shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
                ) : (
                  <BellAlertIcon className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {esCaptura
                      ? "Tacómetro capturado"
                      : `Recordatorio enviado${e.umbral != null ? ` · ${e.umbral} min antes` : ""}`}
                  </p>
                  {e.cuerpo && (
                    <p className="text-xs text-muted-foreground">{e.cuerpo}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {fmtDateTime(e.created_at)}
                    {e.destinatario && !esCaptura ? ` · a ${e.destinatario}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
