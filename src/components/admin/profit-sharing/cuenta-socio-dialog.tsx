"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Cog6ToothIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { cn } from "@/lib/utils";
import { todayCancun } from "@/lib/datetime";
import {
  AYUDA_SALDO_INICIAL,
  ETIQUETA_CONFIGURAR_CUENTA,
  NOTAS_CUENTA_MAX,
  TEXTO_CUENTA_NO_CONFIGURADA,
  TEXTO_FALLO_RED_CUENTA,
  confirmacionCambiarCuenta,
  cuentaCambia,
  formDeCuenta,
  hayErrores,
  mesDeFecha,
  opcionesMesArranque,
  payloadCuenta,
  validarFormCuenta,
  type ErroresFormCuenta,
  type FormCuentaSocio,
} from "@/lib/admin/reparto-pagos";
import { configurarCuentaSocioAction } from "@/app/admin/profit-sharing/actions";
import type { CuentaSocio } from "@/types/reparto-pagos";

/**
 * «Configurar cuenta» de un socio: mes de arranque + saldo inicial + notas
 * (`PUT /v1/profit-sharing/socios/:id/cuenta`, ADMIN/FACTURACION). Sin
 * configurar, el API arranca la cuenta en septiembre 2026 con saldo 0.
 * Cambiar una cuenta YA configurada pide confirmación (el saldo del socio se
 * recalcula). Mientras guarda no se cierra.
 */
export function BotonConfigurarCuenta({
  socio,
  cuenta,
  hoy,
  size = "sm",
  variant = "ghost",
  className,
}: {
  socio: { id: string; nombre: string };
  cuenta: CuentaSocio;
  hoy: string;
  size?: "sm" | "default";
  variant?: "ghost" | "outline";
  className?: string;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const etiqueta = `${ETIQUETA_CONFIGURAR_CUENTA} de ${socio.nombre}`;
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn("cursor-pointer gap-1", className)}
        data-accion="configurar-cuenta-socio"
        title={etiqueta}
        aria-label={etiqueta}
        onClick={() => setAbierto((n) => (n ?? 0) + 1)}
      >
        <Cog6ToothIcon className="h-3.5 w-3.5" aria-hidden />
        {ETIQUETA_CONFIGURAR_CUENTA}
      </Button>
      <Dialog open={abierto !== null} onOpenChange={(o) => !o && !ocupado && setAbierto(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton={!ocupado}>
          {abierto !== null && (
            <FormularioCuenta
              key={abierto}
              socio={socio}
              cuenta={cuenta}
              hoy={hoy}
              onCerrar={() => setAbierto(null)}
              onOcupado={setOcupado}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** El formulario (exportado para las pruebas de marcado). */
export function FormularioCuenta({
  socio,
  cuenta,
  hoy,
  onCerrar,
  onOcupado,
}: {
  socio: { id: string; nombre: string };
  cuenta: CuentaSocio;
  hoy: string;
  onCerrar: () => void;
  onOcupado?: (ocupado: boolean) => void;
}) {
  const router = useRouter();
  const [hoyLocal] = useState(() => todayCancun() || hoy);
  const [form, setForm] = useState<FormCuentaSocio>(() => formDeCuenta(cuenta));
  const [errores, setErrores] = useState<ErroresFormCuenta>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardandoLocal] = useState(false);
  const opcionesMes = useMemo(
    () => opcionesMesArranque(hoyLocal, mesDeFecha(cuenta.cuenta_desde)),
    [hoyLocal, cuenta.cuenta_desde],
  );

  const setGuardando = (g: boolean) => {
    setGuardandoLocal(g);
    onOcupado?.(g);
  };

  const cambiar = <K extends keyof FormCuentaSocio>(llave: K, valor: FormCuentaSocio[K]) => {
    setForm((f) => ({ ...f, [llave]: valor }));
    setErrores((e) => {
      if (!e[llave]) return e;
      const resto = { ...e };
      delete resto[llave];
      return resto;
    });
    setConfirmando(false);
    setErrorGeneral(null);
  };

  const guardar = async (confirmado: boolean) => {
    const e = validarFormCuenta(form, hoyLocal);
    setErrores(e);
    if (hayErrores(e)) return;
    if (!cuentaCambia(cuenta, form)) {
      toast.info("No hay cambios que guardar.");
      onCerrar();
      return;
    }
    // Una cuenta YA configurada cambia el saldo del socio: se confirma.
    if (cuenta.configurada && !confirmado) {
      setConfirmando(true);
      return;
    }
    setErrorGeneral(null);
    setGuardando(true);
    let res: Awaited<ReturnType<typeof configurarCuentaSocioAction>>;
    try {
      res = await configurarCuentaSocioAction(socio.id, payloadCuenta(form));
    } catch {
      setGuardando(false);
      setErrorGeneral(TEXTO_FALLO_RED_CUENTA);
      return;
    }
    setGuardando(false);
    if (!res.ok) {
      setConfirmando(false);
      setErrorGeneral(res.error ?? "No se pudo guardar la cuenta.");
      return;
    }
    toast.success(`Cuenta de ${socio.nombre} configurada.`);
    onCerrar();
    router.refresh();
  };

  const confirmacion = confirmando ? confirmacionCambiarCuenta(socio.nombre, form) : null;

  return (
    <form
      className="contents"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!guardando && !confirmando) void guardar(false);
      }}
    >
      <DialogHeader>
        <DialogTitle>{`${ETIQUETA_CONFIGURAR_CUENTA} de ${socio.nombre}`}</DialogTitle>
        <DialogDescription>
          {cuenta.configurada
            ? "Desde qué mes se cuentan sus utilidades y con qué saldo arrancó la cuenta."
            : TEXTO_CUENTA_NO_CONFIGURADA}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <Field
          label="Mes de arranque"
          required
          error={errores.cuenta_desde}
          hint="Desde este mes se suman las utilidades de sus aviones."
        >
          <SearchableSelect
            options={opcionesMes}
            value={form.cuenta_desde}
            onChange={(v) => cambiar("cuenta_desde", v)}
            placeholder="Elige el mes"
            searchPlaceholder="Buscar mes…"
          />
        </Field>
        <Field label="Saldo inicial (USD)" required error={errores.saldo_inicial} hint={AYUDA_SALDO_INICIAL}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="0.00"
            value={form.saldo_inicial}
            onChange={(e) => cambiar("saldo_inicial", e.target.value)}
          />
        </Field>
        <Field label="Notas (opcional)" error={errores.notas} hint="Por ejemplo, de dónde sale el saldo inicial.">
          <Textarea
            rows={2}
            maxLength={NOTAS_CUENTA_MAX}
            value={form.notas}
            onChange={(e) => cambiar("notas", e.target.value)}
          />
        </Field>
      </div>

      {errorGeneral && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {errorGeneral}
        </p>
      )}

      {confirmacion && (
        <div
          role="alert"
          data-confirmar-cuenta
          className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden />
            {confirmacion.titulo}
          </p>
          <p className="text-xs text-amber-900/80 dark:text-amber-200/80">{confirmacion.descripcion}</p>
        </div>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          disabled={guardando}
          onClick={() => (confirmando ? setConfirmando(false) : onCerrar())}
        >
          {confirmando ? "Revisar" : "Cancelar"}
        </Button>
        {confirmacion ? (
          <Button
            type="button"
            className="cursor-pointer"
            disabled={guardando}
            data-accion="confirmar-cuenta-socio"
            onClick={() => void guardar(true)}
          >
            {guardando ? "Guardando…" : confirmacion.boton}
          </Button>
        ) : (
          <Button type="submit" className="cursor-pointer" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cuenta"}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
