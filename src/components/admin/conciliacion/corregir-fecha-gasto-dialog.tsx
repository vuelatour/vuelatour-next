"use client";

/**
 * «Corregir la fecha del gasto» (14-oct-2026, API 0.0.76): el diálogo ANIDADO
 * que abre el botón «Fecha» de un renglón de «Vincular gasto». La fecha del
 * gasto es la del PAGO (la del cargo): el campo nace con la fecha del cargo
 * (salvo una tarjeta con 1 a 3 días de desfase, que nace con la del ticket y
 * ofrece el atajo: `fechaInicialCorregirFecha`) y «Guardar fecha» llama
 * `PATCH /v1/expenses/:id/fecha` SIN auto-cruce (el gasto no se liga solo:
 * liga la persona con «Vincular»). Una fecha que el API rechazaría por el mes
 * del vuelo (`candado_mes_vuelo`) se dice ANTES de guardar.
 *
 * Reglas y textos en `lib/admin/conciliacion-fecha-gasto.ts` (PURO, con
 * prueba): aquí no hay ningún texto literal. El API vuelve a validar todo y,
 * cuando la fecha mueve dinero de mes o cambia un mes que ya terminó, pide
 * confirmación con SU texto (caja ámbar + «Sí, …»). Se carga con
 * `next/dynamic` (sin SSR) y se monta SOLO al abrirse, con `key` = id del
 * gasto. Esc o la X cierran SOLO este diálogo: «Vincular gasto» conserva lo
 * marcado. Mientras guarda, ni Esc ni la X lo cierran.
 */

import { useId, useState, useTransition } from "react";
import { corregirFechaGastoAction } from "@/app/admin/conciliacion/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BOTON_CANCELAR, MSG_SIN_CONEXION } from "@/lib/admin/conciliacion-lote";
import {
  BOTON_GUARDAR_FECHA,
  ETIQUETA_FECHA_PAGO,
  MSG_FECHA_IGUAL,
  NOTA_FECHA_SOLO_FECHA,
  TEXTO_GUARDANDO_FECHA,
  TITULO_CORREGIR_FECHA,
  avisosFechaPago,
  bloqueoNuevaFechaGasto,
  botonUsarFechaCargo,
  descripcionCorregirFecha,
  fechaDeCandidato,
  fechaInicialCorregirFecha,
  limitesFechaPago,
  resultadoCorregirFecha,
  textoFechaActual,
} from "@/lib/admin/conciliacion-fecha-gasto";
import { textoResumenCargo } from "@/lib/admin/gasto-desde-cargo";
import { todayCancun } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { CambioFechaGasto, GastoCandidato, MovimientoBancario } from "@/types/conciliacion";
import { AvisoCapturaAntesDelInicio } from "@/components/admin/aviso-captura-inicio";

export type EstadoCorregirFecha =
  | { tipo: "editando" }
  | { tipo: "confirmar"; titulo: string; texto: string; boton: string }
  | { tipo: "bloqueo"; texto: string }
  | { tipo: "error"; texto: string };

type MovimientoDelCargo = Pick<MovimientoBancario, "id" | "fecha" | "monto" | "descripcion">;

export interface CorregirFechaGastoDialogProps {
  candidato: GastoCandidato;
  movimiento: MovimientoDelCargo;
  monedaCuenta: string | null;
  /** Ventana de la lista (±días del cargo): avisa si la fecha nueva la deja fuera. */
  dias: number;
  onCerrar: () => void;
  /** El API guardó (o el gasto ya tenía esa fecha): el padre cierra, corrige la lista y avisa. */
  onCorregida: (r: CambioFechaGasto) => void;
  /** Otra persona cambió la fecha mientras tanto: el renglón pinta la vigente (`vista` ya no lo es). */
  onFechaVigente: (gastoId: string, fecha: string, vista: string) => void;
  /** El gasto salió de la lista (404, o se concilió mientras tanto): el padre lo desmarca y la vuelve a pedir. */
  onGastoNoExiste: (gastoId: string, texto: string) => void;
  /** No se sabe si se guardó (red, 5xx): el padre vuelve a pedir la lista para pintar la fecha vigente. */
  onResultadoIncierto?: (gastoId: string) => void;
}

/** La server action ni siquiera salió (sin red, Vercel cortó): nunca lanza. */
const sinConexion = (err: unknown) => ({
  ok: false as const,
  error: err instanceof Error && err.message ? err.message : MSG_SIN_CONEXION,
});

export function CorregirFechaGastoDialog(p: CorregirFechaGastoDialogProps) {
  const idCampo = useId();
  const [hoy] = useState(() => todayCancun());
  const fechaCargo = (p.movimiento.fecha ?? "").slice(0, 10);
  const [fechaActual, setFechaActual] = useState(() => fechaDeCandidato(p.candidato) ?? "");
  const [fecha, setFecha] = useState(() => fechaInicialCorregirFecha(p.candidato, fechaCargo));
  const [estado, setEstado] = useState<EstadoCorregirFecha>({ tipo: "editando" });
  const [pending, start] = useTransition();

  // Cambiar la fecha borra la confirmación o el bloqueo del API.
  const onFecha = (v: string) => {
    setFecha(v);
    setEstado({ tipo: "editando" });
  };

  const enviar = () => {
    if (pending || bloqueoNuevaFechaGasto(p.candidato, fecha, fechaActual, hoy) || estado.tipo === "bloqueo") return;
    const confirmar = estado.tipo === "confirmar";
    start(async () => {
      const r = await corregirFechaGastoAction(p.candidato.id, {
        fecha,
        fechaAnterior: fechaActual,
        confirmar,
      }).catch(sinConexion);
      const d = resultadoCorregirFecha(r);
      if (d.tipo === "ok") {
        p.onCorregida(d.data);
        return;
      }
      if (d.tipo === "no_existe") {
        p.onGastoNoExiste(p.candidato.id, d.texto);
        return;
      }
      if (d.tipo === "fecha_vigente") {
        p.onFechaVigente(p.candidato.id, d.fecha, fechaActual);
        setFechaActual(d.fecha);
        setEstado({ tipo: "error", texto: d.texto });
        return;
      }
      if (d.tipo === "incierto") {
        // No se sabe si se guardó: caja roja con el texto honesto y la lista
        // del padre se vuelve a pedir (el renglón dirá la fecha vigente).
        setEstado({ tipo: "error", texto: d.texto });
        p.onResultadoIncierto?.(p.candidato.id);
        return;
      }
      // confirmar | bloqueo | error
      setEstado(d);
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !pending) p.onCerrar();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <CuerpoCorregirFecha
          idCampo={idCampo}
          candidato={p.candidato}
          movimiento={p.movimiento}
          monedaCuenta={p.monedaCuenta}
          dias={p.dias}
          hoy={hoy}
          fecha={fecha}
          fechaActual={fechaActual}
          estado={estado}
          pending={pending}
          onFecha={onFecha}
          onEnviar={enviar}
          onCancelar={p.onCerrar}
        />
      </DialogContent>
    </Dialog>
  );
}

export interface CuerpoCorregirFechaProps {
  idCampo: string;
  candidato: GastoCandidato;
  movimiento: MovimientoDelCargo;
  monedaCuenta: string | null;
  dias: number;
  /** Hoy en Cancún (`YYYY-MM-DD`): tope del campo y regla de «futura». */
  hoy: string;
  fecha: string;
  fechaActual: string;
  estado: EstadoCorregirFecha;
  pending: boolean;
  onFecha: (v: string) => void;
  onEnviar: () => void;
  onCancelar: () => void;
}

/**
 * El cuerpo del diálogo, PRESENTACIONAL (lo prueban los renders estáticos).
 * Es un formulario `noValidate`: Enter guarda y mandan nuestros textos, no
 * las burbujas del navegador. Cancelar y el atajo llevan `type="button"`
 * (dentro de un formulario, un botón sin tipo envía).
 */
export function CuerpoCorregirFecha({
  idCampo,
  candidato,
  movimiento,
  monedaCuenta,
  dias,
  hoy,
  fecha,
  fechaActual,
  estado,
  pending,
  onFecha,
  onEnviar,
  onCancelar,
}: CuerpoCorregirFechaProps) {
  const fechaCargo = (movimiento.fecha ?? "").slice(0, 10);
  const limites = limitesFechaPago(hoy);
  const bloqueoLocal = bloqueoNuevaFechaGasto(candidato, fecha, fechaActual, hoy);
  // La MISMA fecha que ya tiene no es un error: no hay nada que guardar
  // (gris, sin role=alert; «Guardar fecha» sigue apagado). Pasa al abrir con
  // la fecha del ticket de una tarjeta o si el gasto ya tiene la del cargo.
  const sinCambio = bloqueoLocal === MSG_FECHA_IGUAL;
  const avisos = avisosFechaPago({
    candidato,
    nueva: fecha,
    fechaActual,
    fechaCargo,
    montoCargo: movimiento.monto,
    monedaCuenta,
    hoy,
    dias,
  });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar();
      }}
    >
      <DialogHeader>
        <DialogTitle>{TITULO_CORREGIR_FECHA}</DialogTitle>
        <DialogDescription>{descripcionCorregirFecha(candidato, fechaCargo)}</DialogDescription>
      </DialogHeader>

      <div className="space-y-0.5 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <p>{textoFechaActual(fechaActual)}</p>
        <p>{textoResumenCargo(movimiento, monedaCuenta)}</p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={idCampo}>{ETIQUETA_FECHA_PAGO}</Label>
        <Input
          id={idCampo}
          type="date"
          value={fecha}
          min={limites.min}
          max={limites.max}
          onChange={(e) => onFecha(e.target.value)}
          disabled={pending}
          required
          aria-invalid={bloqueoLocal != null && !sinCambio}
          aria-describedby={`${idCampo}-nota`}
          className="cursor-pointer"
        />
        {fecha !== fechaCargo && (
          <button
            type="button"
            className="cursor-pointer justify-self-start text-left text-xs text-brand-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onFecha(fechaCargo)}
            disabled={pending}
          >
            {botonUsarFechaCargo(fechaCargo)}
          </button>
        )}
        <AvisoCapturaAntesDelInicio fecha={fecha} className="mt-0" />
        {bloqueoLocal &&
          (sinCambio ? (
            <p data-sin-cambio-fecha="" className="text-xs text-muted-foreground">
              {bloqueoLocal}
            </p>
          ) : (
            <p role="alert" className="text-xs text-destructive">
              {bloqueoLocal}
            </p>
          ))}
      </div>

      {estado.tipo === "confirmar" && (
        <div
          role="alert"
          data-confirmar-fecha=""
          className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200"
        >
          <p className="font-medium">{estado.titulo}</p>
          <p>{estado.texto}</p>
        </div>
      )}
      {(estado.tipo === "bloqueo" || estado.tipo === "error") && (
        <p
          role="alert"
          data-error-fecha=""
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive"
        >
          {estado.texto}
        </p>
      )}

      {avisos.length > 0 && (
        <ul className="space-y-1 text-xs">
          {avisos.map((a) => (
            <li
              key={a.clave}
              data-aviso-fecha={a.clave}
              className={cn(a.tono === "ambar" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}
            >
              {a.texto}
            </li>
          ))}
        </ul>
      )}

      <p id={`${idCampo}-nota`} className="text-[11px] text-muted-foreground">
        {NOTA_FECHA_SOLO_FECHA}
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" onClick={onCancelar} disabled={pending}>
          {BOTON_CANCELAR}
        </Button>
        <Button
          type="submit"
          className="cursor-pointer"
          disabled={pending || bloqueoLocal != null || estado.tipo === "bloqueo"}
        >
          {pending ? TEXTO_GUARDANDO_FECHA : estado.tipo === "confirmar" ? estado.boton : BOTON_GUARDAR_FECHA}
        </Button>
      </DialogFooter>
    </form>
  );
}
