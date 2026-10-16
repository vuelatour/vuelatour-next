"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUturnLeftIcon, MinusCircleIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  completeFlightAction,
  deshacerOmisionTacoAction,
  iniciarYCompletarVueloAction,
  omitirTacoAction,
  type RespuestaOmisionTaco,
} from "@/app/admin/flights/actions";
import { esErrorTecnico, MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";
import {
  ACCION_COMPLETAR_VUELO,
  ACCION_INICIAR_Y_COMPLETAR,
  AYUDA_CHIPS_MOTIVO,
  AYUDA_OMITIR_TACO,
  BOTON_CONFIRMAR_DESHACER,
  BOTON_CONFIRMAR_OMITIR,
  BOTON_DESHACER_OMISION,
  BOTON_DESHACIENDO,
  BOTON_OMITIENDO,
  BOTON_OMITIR_TACO,
  CONSECUENCIAS_OMITIR,
  DESCRIPCION_DESHACER_OMISION,
  ERROR_MOTIVO_CORTO,
  ETIQUETA_MOTIVO_OMISION,
  MOTIVO_OMISION_MAX,
  MOTIVOS_OMISION_FRECUENTES,
  PLACEHOLDER_MOTIVO_OMISION,
  TOAST_OMISION_DESHECHA,
  TOAST_VUELO_COMPLETADO,
  contadorMotivo,
  errorDeOmision,
  largoMotivoOmision,
  mensajeOmision,
  motivoOmisionValido,
  tituloDeshacer,
  tituloOmitir,
} from "@/lib/admin/taco-omitido";
import { cn } from "@/lib/utils";

/**
 * «Omitir tacómetro» de UN tramo (15-oct-2026, API 0.0.81). Pedido del
 * cliente con el #300: falló el tacómetro y no había forma de registrar la
 * llegada. Solo oficina (ADMIN/COORDINADOR/FACTURACION — el que llama decide
 * con `puedeOmitirTaco`). Motivo obligatorio (10–500) con chips rápidos;
 * queda quién y cuándo. El vuelo NO se completa solo: el toast ofrece
 * «Completar vuelo» o «Iniciar y completar» cuando ya se puede — solo con
 * `puedeCompletar` (`esRolCompletarVuelo`): FACTURACION omite pero el API le
 * niega start/complete (403), así que su toast pide avisar a coordinación.
 */
export function TacoOmitirDialog({
  flightId,
  escalaId,
  ruta,
  folio,
  faltanOtras,
  onOmitido,
  compacto = false,
  puedeCompletar = false,
}: {
  flightId: string;
  escalaId: string;
  /** «CET → CUN». */
  ruta: string;
  folio: number;
  /** ¿Otros tramos vivos del vuelo siguen sin su llegada (y no omitidos)? */
  faltanOtras: boolean;
  onOmitido?: (r: RespuestaOmisionTaco) => void;
  /** Fila de Tacómetros en vivo: botón de la altura de «Ajustar». */
  compacto?: boolean;
  /** `esRolCompletarVuelo(rol)`: sin él, el toast no trae acción. */
  puedeCompletar?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  /** Lo que sigue tras omitir (acción del toast): completar o iniciar y completar. */
  const siguiente = async (accion: "completar" | "iniciar_y_completar") => {
    try {
      const res =
        accion === "completar"
          ? await completeFlightAction(flightId)
          : await iniciarYCompletarVueloAction(flightId);
      if (res.ok) {
        toast.success(TOAST_VUELO_COMPLETADO(folio));
      } else {
        toast.error(esErrorTecnico(res) ? MSG_SERVIDOR_NO_RESPONDIO : (res.error as string));
      }
    } catch {
      toast.error(MSG_SERVIDOR_NO_RESPONDIO);
    }
    router.refresh();
  };

  const omitir = () =>
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof omitirTacoAction>>;
      try {
        res = await omitirTacoAction(flightId, escalaId, motivo);
      } catch {
        toast.error(MSG_SERVIDOR_NO_RESPONDIO);
        return;
      }
      if (!res.ok || !res.data) {
        toast.error(errorDeOmision(res));
        return;
      }
      const data = res.data;
      const { texto, accion } = mensajeOmision(data, faltanOtras, puedeCompletar);
      if (accion) {
        toast.success(texto, {
          // Tiempo para leerlo y pulsar la acción (la barra del vuelo la
          // ofrece igual de forma permanente).
          duration: 15000,
          action: {
            label: accion === "completar" ? ACCION_COMPLETAR_VUELO : ACCION_INICIAR_Y_COMPLETAR,
            onClick: () => {
              void siguiente(accion);
            },
          },
        });
      } else {
        toast.success(texto);
      }
      onOmitido?.(data);
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("cursor-pointer gap-1.5 text-muted-foreground", compacto && "h-8")}
        title={AYUDA_OMITIR_TACO}
        onClick={() => {
          // Se re-siembra al abrir (nunca useState(prop) + efecto).
          setMotivo("");
          setOpen(true);
        }}
      >
        <MinusCircleIcon className="h-3.5 w-3.5" />
        {BOTON_OMITIR_TACO}
      </Button>

      <AlertDialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{tituloOmitir(ruta)}</AlertDialogTitle>
            <AlertDialogDescription render={<div />}>
              <ul className="list-disc space-y-1 pl-4 text-left">
                {CONSECUENCIAS_OMITIR.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormularioOmitirTaco
            motivo={motivo}
            onMotivo={setMotivo}
            pending={pending}
            onConfirmar={omitir}
          />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Cuerpo del diálogo (chips, motivo, contador y botones). Separado para
 * probarlo sin DOM: con < 10 caracteres el botón queda deshabilitado.
 */
export function FormularioOmitirTaco({
  motivo,
  onMotivo,
  pending,
  onConfirmar,
}: {
  motivo: string;
  onMotivo: (m: string) => void;
  pending: boolean;
  onConfirmar: () => void;
}) {
  const id = useId();
  const idMotivo = `${id}-motivo`;
  const idContador = `${id}-contador`;
  const n = largoMotivoOmision(motivo);
  const valido = motivoOmisionValido(motivo);
  return (
    <>
      <div className="space-y-2 text-sm">
        <p className="text-xs text-muted-foreground">{AYUDA_CHIPS_MOTIVO}</p>
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS_OMISION_FRECUENTES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={pending}
              onClick={() => onMotivo(m)}
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted",
                motivo.trim() === m
                  ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                  : "border-border",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <label htmlFor={idMotivo} className="block text-xs font-medium">
          {ETIQUETA_MOTIVO_OMISION}
        </label>
        <Textarea
          id={idMotivo}
          value={motivo}
          onChange={(e) => onMotivo(e.target.value)}
          maxLength={MOTIVO_OMISION_MAX}
          placeholder={PLACEHOLDER_MOTIVO_OMISION}
          aria-describedby={idContador}
          aria-invalid={motivo.length > 0 && !valido ? true : undefined}
          disabled={pending}
          rows={3}
        />
        <p
          id={idContador}
          className={cn(
            "text-[11px]",
            valido ? "text-muted-foreground" : "text-red-600 dark:text-red-400",
          )}
        >
          {contadorMotivo(n)}
          {!valido && motivo.length > 0 ? ` · ${ERROR_MOTIVO_CORTO}` : ""}
        </p>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending} className="cursor-pointer">
          Cancelar
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={(e) => {
            e.preventDefault();
            if (valido) onConfirmar();
          }}
          disabled={pending || !valido}
          className="cursor-pointer"
        >
          {pending ? BOTON_OMITIENDO : BOTON_CONFIRMAR_OMITIR}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

/**
 * «Deshacer» la omisión (con confirmación: el tramo vuelve a pedir su
 * llegada, el piloto recibe un aviso y un vuelo COMPLETADO regresa a EN
 * VUELO). Solo oficina.
 */
export function TacoOmitidoDeshacer({
  flightId,
  escalaId,
  ruta,
}: {
  flightId: string;
  escalaId: string;
  ruta: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const deshacer = () =>
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof deshacerOmisionTacoAction>>;
      try {
        res = await deshacerOmisionTacoAction(flightId, escalaId);
      } catch {
        toast.error(MSG_SERVIDOR_NO_RESPONDIO);
        return;
      }
      if (!res.ok) {
        toast.error(errorDeOmision(res));
        return;
      }
      toast.success(TOAST_OMISION_DESHECHA);
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 cursor-pointer gap-1 px-2 text-xs text-muted-foreground"
        title={DESCRIPCION_DESHACER_OMISION}
        onClick={() => setOpen(true)}
      >
        <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
        {BOTON_DESHACER_OMISION}
      </Button>

      <AlertDialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{tituloDeshacer(ruta)}</AlertDialogTitle>
            <AlertDialogDescription>{DESCRIPCION_DESHACER_OMISION}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending} className="cursor-pointer">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deshacer();
              }}
              disabled={pending}
              className="cursor-pointer"
            >
              {pending ? BOTON_DESHACIENDO : BOTON_CONFIRMAR_DESHACER}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
