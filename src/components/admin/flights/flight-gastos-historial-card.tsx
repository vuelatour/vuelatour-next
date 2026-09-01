import {
  PencilSquareIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtDateOnly, fmtDateTime } from "@/lib/datetime";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { MEDIO_PAGO_LABELS } from "@/lib/admin/medios-pago";
import { cn } from "@/lib/utils";
import type { GastoHistorialEvento } from "@/lib/api/flights-server";

/**
 * Historial de gastos del vuelo (gasto_bitacora, escrita por trigger de BD):
 * quién capturó, editó o eliminó cada gasto y QUÉ cambió, campo por campo.
 * Complementa a la tabla de gastos (que solo enseña el estado actual) — es
 * la evidencia de auditoría que pidió el equipo (31-ago): un monto corregido
 * o un gasto borrado ya no desaparecen en silencio.
 *
 * Server component: misma estructura que FlightBitacoraCard (sin eventos no
 * se pinta) con el riel vertical de QuoteVersionsTimeline.
 */

const ACCION_UI: Record<
  GastoHistorialEvento["accion"],
  { titulo: string; icon: typeof PlusCircleIcon; color: string }
> = {
  INSERT: {
    titulo: "Gasto capturado",
    icon: PlusCircleIcon,
    color: "text-green-600 dark:text-green-400",
  },
  UPDATE: {
    titulo: "Gasto editado",
    icon: PencilSquareIcon,
    color: "text-amber-600 dark:text-amber-400",
  },
  DELETE: {
    titulo: "Gasto eliminado",
    icon: TrashIcon,
    color: "text-red-600 dark:text-red-400",
  },
};

/** Etiquetas es-MX de las columnas de negocio que audita el trigger. */
const CAMPO_LABELS: Record<string, string> = {
  monto: "Monto",
  propina: "Propina",
  moneda: "Moneda",
  tc_gasto: "Tipo de cambio",
  categoria: "Categoría",
  fecha_gasto: "Fecha del gasto",
  vuelo_id: "Vuelo",
  aeronave_id: "Avión",
  escala_id: "Tramo",
  medio_pago: "Medio de pago",
  tarjeta_terminacion: "Tarjeta (terminación)",
  proveedor_id: "Proveedor",
  foto_url: "Comprobante (foto)",
  notas: "Notas",
  lugar: "Lugar",
  litros: "Litros",
  tipo_combustible: "Tipo de combustible",
  fecha_hora_carga: "Fecha y hora de la carga",
  estatus_comprobante: "Comprobante",
  estatus_facturacion: "Facturación",
  folio_ticket: "Folio del ticket",
  conciliado: "Conciliación",
};

/** Campos cuyo valor es un uuid: jamás se pinta el id crudo. */
const CAMPOS_ID = new Set(["vuelo_id", "aeronave_id", "escala_id", "proveedor_id"]);

const ESTATUS_COMPROBANTE_LABELS: Record<string, string> = {
  FACTURA: "Factura",
  VALE: "Vale",
  SIN_COMPROBANTE: "Sin comprobante",
};

// Semáforo de facturación de oficina (misma fuente conceptual que
// FACTURACION_ESTADOS de facturacion-badge, que es módulo cliente).
const ESTATUS_FACTURACION_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  SOLICITADA: "Solicitada",
  FACTURADA: "Facturada",
};

/** Monto con su moneda cuando se conoce (mismo formato que fmtMoney de las
 *  tablas de gastos); sin moneda en el diff, número es-MX a secas. */
function fmtMonto(v: unknown, moneda: string | null): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (moneda) {
    try {
      return n.toLocaleString("es-MX", { style: "currency", currency: moneda });
    } catch {
      // Código de moneda que Intl no conoce: cae al formato plano.
    }
  }
  return `$${n.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtValor(campo: string, v: unknown, moneda: string | null): string {
  if (v == null) return "—";
  switch (campo) {
    case "monto":
    case "propina":
      return fmtMonto(v, moneda);
    case "categoria":
      return categoriaGastoLabel(String(v));
    case "fecha_gasto":
      return fmtDateOnly(String(v));
    case "fecha_hora_carga":
      return fmtDateTime(String(v));
    case "medio_pago":
      return MEDIO_PAGO_LABELS[String(v)] ?? String(v);
    case "estatus_comprobante":
      return ESTATUS_COMPROBANTE_LABELS[String(v)] ?? String(v);
    case "estatus_facturacion":
      return ESTATUS_FACTURACION_LABELS[String(v)] ?? String(v);
    case "tarjeta_terminacion":
      return `**** ${String(v)}`;
    case "litros": {
      const n = Number(v);
      return Number.isFinite(n)
        ? `${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })} L`
        : String(v);
    }
    case "conciliado":
      return v === true ? "conciliado" : "sin conciliar";
    default:
      return String(v);
  }
}

function DiffLinea({
  campo,
  antes,
  despues,
  monedaAntes,
  monedaDespues,
}: {
  campo: string;
  antes: unknown;
  despues: unknown;
  monedaAntes: string | null;
  monedaDespues: string | null;
}) {
  const label =
    CAMPO_LABELS[campo] ??
    // Columna nueva que el panel aún no conozca: legible sin tocar la UI.
    campo.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

  // La foto nunca se pinta como URL: solo qué le pasó.
  if (campo === "foto_url") {
    return (
      <li className="text-xs">
        <span className="text-muted-foreground">{label}:</span>{" "}
        {antes != null && despues != null
          ? "foto (reemplazada)"
          : despues != null
            ? "se agregó la foto"
            : "se quitó la foto"}
      </li>
    );
  }

  // Referencias (uuid): decir qué pasó sin ensuciar con ids.
  if (CAMPOS_ID.has(campo)) {
    return (
      <li className="text-xs">
        <span className="text-muted-foreground">{label}:</span>{" "}
        {antes == null ? "se asignó" : despues == null ? "se quitó" : "se reasignó"}
      </li>
    );
  }

  return (
    <li className="text-xs">
      <span className="text-muted-foreground">{label}:</span>{" "}
      {antes == null ? (
        <>
          se agregó{" "}
          <span className="font-medium">{fmtValor(campo, despues, monedaDespues)}</span>
        </>
      ) : despues == null ? (
        <>
          se quitó{" "}
          <span className="line-through text-muted-foreground">
            {fmtValor(campo, antes, monedaAntes)}
          </span>
        </>
      ) : (
        <>
          <span className="line-through text-muted-foreground">
            {fmtValor(campo, antes, monedaAntes)}
          </span>{" "}
          → <span className="font-medium">{fmtValor(campo, despues, monedaDespues)}</span>
        </>
      )}
    </li>
  );
}

function EventoItem({ evento }: { evento: GastoHistorialEvento }) {
  const ui = ACCION_UI[evento.accion] ?? ACCION_UI.UPDATE;
  const Icon = ui.icon;
  // Moneda del gasto para pintar monto/propina: solo se conoce con certeza
  // si viaja en el propio diff (cambió o es la del alta). Por lado: si la
  // moneda cambió, el monto "antes" era en la moneda vieja.
  const monedaDiff = evento.diff?.moneda;
  const monedaDespues =
    monedaDiff?.despues != null
      ? String(monedaDiff.despues)
      : monedaDiff?.antes != null
        ? String(monedaDiff.antes)
        : null;
  const monedaAntes = monedaDiff?.antes != null ? String(monedaDiff.antes) : monedaDespues;
  // El INSERT trae en diff TODOS los valores iniciales (así lo escribe el
  // trigger): listarlos duplicaría la descripción — la sub-lista de cambios
  // es solo para ediciones.
  const diffs = evento.accion === "UPDATE" ? Object.entries(evento.diff ?? {}) : [];

  return (
    <li className="relative pl-7">
      <span className={cn("absolute left-0 top-0.5 rounded-full bg-card", ui.color)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium">
          {ui.titulo}
          {evento.sintetizado && (
            <span className="ml-2 text-[10px] font-normal italic text-muted-foreground">
              (captura registrada antes del historial)
            </span>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {evento.actor_nombre ?? "Sistema"} · {fmtDateTime(evento.created_at)}
        </p>
      </div>
      {evento.descripcion_gasto && (
        <p className="text-xs text-muted-foreground">{evento.descripcion_gasto}</p>
      )}
      {diffs.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {diffs.map(([campo, cambio]) => (
            <DiffLinea
              key={campo}
              campo={campo}
              antes={cambio?.antes}
              despues={cambio?.despues}
              monedaAntes={monedaAntes}
              monedaDespues={monedaDespues}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

const RIEL =
  "space-y-4 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border";

/** Con más de este número de eventos, los antiguos se colapsan en <details>. */
const EVENTOS_VISIBLES = 8;

export function FlightGastosHistorialCard({
  eventos,
}: {
  eventos: GastoHistorialEvento[];
}) {
  if (eventos.length === 0) return null;

  // De más reciente a más antiguo (ISO ordena lexicográficamente).
  const ordenados = [...eventos].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const visibles = ordenados.slice(0, EVENTOS_VISIBLES);
  const anteriores = ordenados.slice(EVENTOS_VISIBLES);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Historial de gastos</CardTitle>
        <CardDescription className="text-xs">
          Quién capturó, editó o eliminó cada gasto del vuelo y qué cambió.
          Lo escribe la base de datos: ningún camino lo esquiva.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className={RIEL}>
          {visibles.map((e, i) => (
            <EventoItem key={`${e.gasto_id}-${e.created_at}-${i}`} evento={e} />
          ))}
        </ol>
        {anteriores.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
              Ver {anteriores.length}{" "}
              {anteriores.length === 1 ? "evento anterior" : "eventos anteriores"}
            </summary>
            <ol className={cn(RIEL, "mt-3")}>
              {anteriores.map((e, i) => (
                <EventoItem key={`${e.gasto_id}-${e.created_at}-${i}`} evento={e} />
              ))}
            </ol>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
