"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
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
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  cambiarClienteVueloAction,
  clientesParaCambioAction,
} from "@/app/admin/flights/actions";
import { toastAvisos } from "@/lib/admin/avisos";
import {
  ETIQUETA_CAMBIAR_CLIENTE,
  ETIQUETA_SELECTOR_CLIENTE,
  EXPLICACION_CAMBIAR_CLIENTE,
  PLACEHOLDER_SELECTOR_CLIENTE,
  TEXTO_CARGANDO_CLIENTES,
  TEXTO_CLIENTES_NO_CARGARON,
  TEXTO_SIN_OTROS_CLIENTES,
  TITULO_BOTON_CAMBIAR_CLIENTE,
  bloqueoCambiarClientePorGrupo,
  errorCambioClientePideRecargar,
  opcionesClienteParaCambio,
  puedeCambiarCliente,
  resumenCambioCliente,
  tituloCambiarCliente,
  toastCambioCliente,
  type ClienteParaCambio,
} from "@/lib/admin/cambio-cliente";

/** Estado de la carga del catálogo de clientes (se pide al abrir). */
export type CargaClientes =
  | { estado: "cargando" }
  | { estado: "error" }
  | { estado: "lista"; clientes: ClienteParaCambio[] };

/** Lo que el diálogo necesita saber del vuelo (todo serializable). */
export interface VueloParaCambiarCliente {
  vueloId: string;
  folio: number | string;
  clienteId: string | null;
  clienteNombre: string | null;
  /** true = se abrió desde la cotización (solo cambia el título). */
  esCotizacion?: boolean;
  /** Hijo de una cotización de GRUPO: el cliente es del grupo completo. */
  esDeGrupo?: boolean;
  grupoFolio?: number | string | null;
}

interface ContenidoProps extends VueloParaCambiarCliente {
  carga: CargaClientes;
  /** Cliente elegido en el selector ("" = ninguno todavía). */
  elegidoId: string;
  /** Texto del último rechazo del API (se queda a la vista, no solo en un toast). */
  error: string | null;
  guardando: boolean;
  onElegir: (id: string) => void;
  onReintentarCarga: () => void;
  onConfirmar: () => void;
  onCerrar: () => void;
}

/**
 * CONTENIDO del diálogo «Cambiar cliente» (27-nov-2026) — presentación PURA
 * (todo entra por props) para poder probar cada estado sin DOM. Dice de quién
 * a quién cambia, que el precio NO se mueve y, si el API rechazó, por qué.
 */
export function CambiarClienteContenido({
  folio,
  clienteId,
  clienteNombre,
  esCotizacion,
  esDeGrupo,
  grupoFolio,
  carga,
  elegidoId,
  error,
  guardando,
  onElegir,
  onReintentarCarga,
  onConfirmar,
  onCerrar,
}: ContenidoProps) {
  const opciones =
    carga.estado === "lista" ? opcionesClienteParaCambio(carga.clientes, clienteId) : [];
  const elegido =
    carga.estado === "lista" ? (carga.clientes.find((c) => c.id === elegidoId) ?? null) : null;
  const resumen = resumenCambioCliente({ anterior: clienteNombre, nuevo: elegido?.nombre });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{tituloCambiarCliente({ folio, esCotizacion })}</DialogTitle>
        <DialogDescription>{EXPLICACION_CAMBIAR_CLIENTE}</DialogDescription>
      </DialogHeader>

      {esDeGrupo ? (
        // Hijo de grupo: se explica y NO se ofrece el cambio (el API lo rechaza).
        <p
          data-cambio-cliente="bloqueo-grupo"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
        >
          {bloqueoCambiarClientePorGrupo(grupoFolio)}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cambiar-cliente-selector" className="text-sm font-medium">
              {ETIQUETA_SELECTOR_CLIENTE}
            </Label>
            {carga.estado === "cargando" && (
              <p data-cambio-cliente="cargando" className="text-sm text-muted-foreground">
                {TEXTO_CARGANDO_CLIENTES}
              </p>
            )}
            {carga.estado === "error" && (
              <div
                data-cambio-cliente="carga-fallo"
                className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
              >
                <span>{TEXTO_CLIENTES_NO_CARGARON}</span>
                <Button type="button" size="sm" variant="outline" onClick={onReintentarCarga}>
                  Reintentar
                </Button>
              </div>
            )}
            {carga.estado === "lista" &&
              (opciones.length === 0 ? (
                <p data-cambio-cliente="sin-opciones" className="text-sm text-muted-foreground">
                  {TEXTO_SIN_OTROS_CLIENTES}
                </p>
              ) : (
                <SearchableSelect
                  id="cambiar-cliente-selector"
                  options={opciones}
                  value={elegidoId}
                  onChange={onElegir}
                  placeholder={PLACEHOLDER_SELECTOR_CLIENTE}
                  searchPlaceholder="Buscar cliente…"
                  emptyText="Ningún cliente coincide"
                  disabled={guardando}
                />
              ))}
          </div>

          {/* De quién a quién: se lee ANTES de confirmar. */}
          <div
            data-cambio-cliente="resumen"
            className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">De</span>
            <span className="font-medium">{resumen.de}</span>
            <ArrowRightIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">a</span>
            <span className={elegido ? "font-medium" : "text-muted-foreground"}>
              {elegido ? resumen.a : "elige el cliente nuevo"}
            </span>
          </div>

          {error && (
            <p
              role="alert"
              data-cambio-cliente="error"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
          {esDeGrupo ? "Entendido" : "Volver"}
        </Button>
        {!esDeGrupo && (
          <Button
            type="button"
            onClick={onConfirmar}
            disabled={guardando || !elegido}
            className="bg-brand-600 hover:bg-brand-600/90"
          >
            {guardando ? "Cambiando…" : ETIQUETA_CAMBIAR_CLIENTE}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

interface CambiarClienteDialogProps extends VueloParaCambiarCliente {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Diálogo «Cambiar cliente» de un vuelo / cotización que ya existe
 * (27-nov-2026, pedido de la oficina). El catálogo de clientes se pide al
 * ABRIR (no en cada carga de la página). El propio diálogo es la
 * confirmación: enseña «De A a B» y que el precio no cambia; el botón solo se
 * habilita con un cliente elegido. Tras guardar: toast, avisos del API en
 * ámbar (`toastAvisos`) y `router.refresh()`.
 *
 * Quien lo monta lo hace SOLO mientras está abierto (`{open && …}`): cada
 * apertura arranca con su propio estado.
 */
export function CambiarClienteDialog({
  open,
  onOpenChange,
  ...vuelo
}: CambiarClienteDialogProps) {
  const router = useRouter();
  const [guardando, startTransition] = useTransition();
  const [carga, setCarga] = useState<CargaClientes>({ estado: "cargando" });
  const [intento, setIntento] = useState(0);
  const [elegidoId, setElegidoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { vueloId, esDeGrupo } = vuelo;

  // Al abrir (y en cada «Reintentar») se pide el catálogo; guarda `alive`
  // para no escribir estado de un diálogo ya cerrado.
  useEffect(() => {
    if (!open || esDeGrupo) return;
    let alive = true;
    (async () => {
      const res = await clientesParaCambioAction();
      if (!alive) return;
      setCarga(res.ok && res.data ? { estado: "lista", clientes: res.data } : { estado: "error" });
    })();
    return () => {
      alive = false;
    };
  }, [open, esDeGrupo, intento]);

  const reintentarCarga = () => {
    setCarga({ estado: "cargando" });
    setIntento((n) => n + 1);
  };

  const confirmar = () => {
    if (!elegidoId) return;
    startTransition(async () => {
      const res = await cambiarClienteVueloAction(vueloId, elegidoId);
      if (res.ok && res.data) {
        toast.success(toastCambioCliente(res.data));
        // Avisos del API (tarifa preferencial, cliente interno, recibos…):
        // en ámbar y con tiempo para leerlos; el cambio YA quedó guardado.
        toastAvisos(res.data.avisos, { duration: 14000 });
        onOpenChange(false);
        router.refresh();
        return;
      }
      // El rechazo se queda A LA VISTA dentro del diálogo (dice qué hacer).
      setError(res.error ?? "No se pudo cambiar el cliente. Intenta de nuevo.");
      if (errorCambioClientePideRecargar(res.code)) router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !guardando && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <CambiarClienteContenido
          {...vuelo}
          carga={carga}
          elegidoId={elegidoId}
          error={error}
          guardando={guardando}
          onElegir={(id) => {
            setElegidoId(id);
            setError(null);
          }}
          onReintentarCarga={reintentarCarga}
          onConfirmar={confirmar}
          onCerrar={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface CambiarClienteBotonProps extends VueloParaCambiarCliente {
  /** Rol de `/v1/me`: solo quien guarda cotizaciones ve el botón. */
  rol: string | null | undefined;
  /**
   * Motivo por el que AHORA no se puede abrir (p. ej. la cotización tiene
   * cambios sin guardar): el botón se ve deshabilitado y lo dice al pasar el
   * cursor. null/ausente = habilitado.
   */
  deshabilitadoPor?: string | null;
  className?: string;
}

/**
 * Enlace «Cambiar cliente» que va JUNTO al nombre del cliente en la cabecera
 * (detalle del vuelo y página de la cotización) y abre el diálogo. Sin rol
 * que pueda guardar cotizaciones no se pinta nada.
 */
export function CambiarClienteBoton({
  rol,
  deshabilitadoPor = null,
  className,
  ...vuelo
}: CambiarClienteBotonProps) {
  const [open, setOpen] = useState(false);
  if (!puedeCambiarCliente(rol)) return null;
  return (
    <>
      <button
        type="button"
        data-cambio-cliente="boton"
        onClick={() => setOpen(true)}
        disabled={!!deshabilitadoPor}
        title={deshabilitadoPor ?? TITULO_BOTON_CAMBIAR_CLIENTE}
        className={
          className ??
          "inline-flex cursor-pointer items-center gap-1 align-baseline text-xs font-medium text-brand-600 underline underline-offset-2 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline dark:text-brand-400"
        }
      >
        <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden />
        {ETIQUETA_CAMBIAR_CLIENTE}
      </button>
      {open && <CambiarClienteDialog open={open} onOpenChange={setOpen} {...vuelo} />}
    </>
  );
}
