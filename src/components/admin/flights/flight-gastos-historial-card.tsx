import Link from "next/link";
import {
  ArrowsRightLeftIcon,
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
import {
  destinoDeGastosMovidos,
  hrefVuelo,
  notaGastoEnOtroVuelo,
  textoVueloOtro,
  tituloGastoMovido,
  type MovimientoGastoHistorial,
} from "@/lib/admin/gasto-historial";
import type { GastoHistorialEvento } from "@/lib/api/flights-server";
import type { Gasto } from "@/types/expenses";
import { HistorialGastoEditar } from "@/components/admin/flights/historial-gasto-editar";

/**
 * Datos para poder EDITAR desde el historial (10-sep-2026): el gasto vivo
 * (el historial solo trae el diff), catálogos del modal y fotos firmadas.
 * Opcionales: sin ellos la card sigue siendo solo lectura.
 */
export interface HistorialEdicion {
  gastos: Gasto[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** foto_url (path) → URL firmada, como en la tabla de gastos. */
  fotoUrls: Record<string, string>;
}

/**
 * Historial de gastos del vuelo (gasto_bitacora, escrita por trigger de BD):
 * quién capturó, editó o eliminó cada gasto y QUÉ cambió, campo por campo.
 * Complementa a la tabla de gastos (que solo enseña el estado actual) — es
 * la evidencia de auditoría que pidió el equipo (31-ago): un monto corregido
 * o un gasto borrado ya no desaparecen en silencio.
 *
 * Server component: misma estructura que FlightBitacoraCard (sin eventos no
 * se pinta) con el riel vertical de QuoteVersionsTimeline.
 *
 * 14-sep-2026 — gastos que CAMBIAN de vuelo: el API marca esos eventos con
 * `movimiento` («salió» hacia otro vuelo / «llegó» de otro vuelo) y la línea
 * lo dice con enlace al otro vuelo. Las líneas anteriores de un gasto que ya
 * no vive aquí (su captura, sus ediciones) pierden «Editar» y ganan la nota
 * «Ahora vive en el vuelo #N»: antes quedaban MUDAS y parecían un gasto
 * fantasma (caso del vuelo #260).
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

function EventoItem({
  evento,
  edicion,
  destinoMovido,
}: {
  evento: GastoHistorialEvento;
  edicion?: HistorialEdicion;
  /** A dónde se fue este gasto (si salió de este vuelo): lo dicen las líneas
   *  ANTERIORES al movimiento, que ya no pueden editarse desde aquí. */
  destinoMovido?: MovimientoGastoHistorial;
}) {
  // El evento que cambió el vuelo del gasto manda sobre el ícono/título:
  // «movido al vuelo #268» / «traído del vuelo #260» explican la línea mejor
  // que «Gasto editado».
  const mov = evento.movimiento ?? null;
  const ui = ACCION_UI[evento.accion] ?? ACCION_UI.UPDATE;
  const Icon = mov ? ArrowsRightLeftIcon : ui.icon;
  const color = mov ? "text-sky-600 dark:text-sky-400" : ui.color;
  const titulo = mov ? tituloGastoMovido(mov) : ui.titulo;
  // El gasto TAL COMO ESTÁ HOY (si sigue en este vuelo): habilita «Editar»
  // con el mismo modal de Gastos. Un gasto eliminado o movido a otro vuelo
  // ya no está en la lista: la línea queda como evidencia, sin botón.
  const gastoVivo =
    edicion && evento.accion !== "DELETE"
      ? edicion.gastos.find((g) => g.id === evento.gasto_id)
      : undefined;
  // Se fue a otro vuelo: en lugar de «Editar», a dónde vive ahora (con liga).
  // Solo con vuelo DESTINO real: un gasto al que le quitaron el vuelo no
  // «vive» en ningún otro (destinoDeGastosMovidos ya los descarta).
  const viveEnOtro =
    !gastoVivo && destinoMovido?.vuelo_id && !mov && evento.accion !== "DELETE"
      ? { ...destinoMovido, vuelo_id: destinoMovido.vuelo_id }
      : null;
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
  // es solo para ediciones. En un movimiento entre vuelos, `vuelo_id` ya está
  // dicho en el título: repetir «Vuelo: se reasignó» sobra.
  const diffs =
    evento.accion === "UPDATE"
      ? Object.entries(evento.diff ?? {}).filter(([campo]) => !(mov && campo === "vuelo_id"))
      : [];

  return (
    <li className="relative pl-7">
      <span className={cn("absolute left-0 top-0.5 rounded-full bg-card", color)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium">
          {titulo}
          {evento.sintetizado && (
            <span className="ml-2 text-[10px] font-normal italic text-muted-foreground">
              (captura registrada antes del historial)
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-muted-foreground">
            {evento.actor_nombre ?? "Sistema"} · {fmtDateTime(evento.created_at)}
          </p>
          {gastoVivo && edicion ? (
            <HistorialGastoEditar
              gasto={gastoVivo}
              aircraft={edicion.aircraft}
              providers={edicion.providers}
              fotoUrl={
                gastoVivo.foto_url ? edicion.fotoUrls[gastoVivo.foto_url] : undefined
              }
            />
          ) : viveEnOtro ? (
            // Sin «Editar»: el gasto ya no vive en este vuelo. Se dice dónde
            // está y se llega de un clic.
            <Link
              href={hrefVuelo(viveEnOtro.vuelo_id)}
              className="text-[11px] text-sky-600 hover:underline dark:text-sky-400"
              title="Abrir el vuelo donde vive ahora este gasto"
            >
              {notaGastoEnOtroVuelo(viveEnOtro.folio)}
            </Link>
          ) : null}
        </div>
      </div>
      {evento.descripcion_gasto && (
        <p className="text-xs text-muted-foreground">{evento.descripcion_gasto}</p>
      )}
      {mov?.vuelo_id && (
        <p className="text-xs">
          <Link
            href={hrefVuelo(mov.vuelo_id)}
            className="text-sky-600 hover:underline dark:text-sky-400"
            title={
              mov.tipo === "salio"
                ? "Abrir el vuelo al que se movió el gasto"
                : "Abrir el vuelo del que vino el gasto"
            }
          >
            {mov.tipo === "salio"
              ? `Ver el ${textoVueloOtro(mov.folio)} (ahí vive ahora)`
              : `Ver el ${textoVueloOtro(mov.folio)} (de ahí vino)`}
          </Link>
        </p>
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
  edicion,
}: {
  eventos: GastoHistorialEvento[];
  /** Con esto cada línea de un gasto vivo trae «Editar» (modal de Gastos). */
  edicion?: HistorialEdicion;
}) {
  if (eventos.length === 0) return null;

  // De más reciente a más antiguo (ISO ordena lexicográficamente).
  const ordenados = [...eventos].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const visibles = ordenados.slice(0, EVENTOS_VISIBLES);
  const anteriores = ordenados.slice(EVENTOS_VISIBLES);
  // Gastos que SALIERON de este vuelo: sus líneas viejas dicen dónde viven
  // ahora en lugar de quedarse mudas.
  const destinos = destinoDeGastosMovidos(eventos);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Historial de gastos</CardTitle>
        <CardDescription className="text-xs">
          Quién capturó, editó o eliminó cada gasto del vuelo y qué cambió —
          incluidos los gastos que se movieron a otro vuelo o llegaron de uno.
          Lo escribe la base de datos: ningún camino lo esquiva.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className={RIEL}>
          {visibles.map((e, i) => (
            <EventoItem
              key={`${e.gasto_id}-${e.created_at}-${i}`}
              evento={e}
              edicion={edicion}
              destinoMovido={destinos[e.gasto_id]}
            />
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
                <EventoItem
                  key={`${e.gasto_id}-${e.created_at}-${i}`}
                  evento={e}
                  edicion={edicion}
                  destinoMovido={destinos[e.gasto_id]}
                />
              ))}
            </ol>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
