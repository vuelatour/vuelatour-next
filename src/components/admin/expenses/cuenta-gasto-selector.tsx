"use client";

import { useEffect, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import { usePuedeAgregarCuenta } from "@/components/admin/catalogos-gasto-provider";
import { crearCuentaGastoAction, listCuentasGastoAction } from "@/app/admin/expenses/actions";
import {
  BOTON_GUARDAR_CUENTA,
  DESCRIPCION_CUENTA_RAPIDA,
  FORM_CUENTA_VACIO,
  HINT_ALIAS_CUENTA,
  MONEDAS_CUENTA,
  PLACEHOLDER_CUENTA,
  RAZONES_SOCIALES_CUENTA,
  TEXTO_CUENTAS_CARGANDO,
  TEXTO_CUENTAS_NO_CARGARON,
  TIPOS_CUENTA,
  TITULO_CUENTA_RAPIDA,
  VALOR_AGREGAR_CUENTA,
  cuentaSugeridaParaMedio,
  erroresCuentaRapida,
  mensajeErrorCuentaRapida,
  opcionesSelectorCuenta,
  textoCuentaAgregada,
  type FormCuentaRapida,
  type OpcionCuentaGasto,
} from "@/lib/admin/cuentas-gasto";

/**
 * «Cuenta de donde salió» del gasto (20-oct-2026, API 0.0.100, invariante 98
 * del API). Se monta SOLO con un medio que lleva cuenta (transferencia, pago
 * domiciliado, Paywise). Lee las cuentas al montarse (con turno: una
 * respuesta vieja no pisa a la nueva) y, si la lectura falla, lo dice con
 * «Reintentar» — jamás «no hay cuentas». Con Paywise y el campo vacío elige
 * sola la única cuenta tipo pasarela. Quien puede (toda la oficina) agrega
 * una cuenta en un diálogo ENCIMA del formulario (Base UI los anida: Esc
 * cierra solo el de arriba) y queda elegida sin perder lo capturado.
 */
export function CuentaGastoSelector({
  id,
  medio,
  value,
  onChange,
  actualId = null,
}: {
  /** Lo pone `Field` (clona a su único hijo) para ligar la etiqueta. */
  id?: string;
  medio: string;
  value: string;
  onChange: (valor: string) => void;
  /** La cuenta que el gasto YA tiene (se ofrece aunque esté dada de baja). */
  actualId?: string | null;
}) {
  const puedeAgregar = usePuedeAgregarCuenta();
  const [intento, setIntento] = useState(0);
  const [carga, setCarga] = useState<{
    intento: number;
    cuentas: OpcionCuentaGasto[] | null;
    fallo: boolean;
  }>({ intento: -1, cuentas: null, fallo: false });
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    let vivo = true;
    listCuentasGastoAction()
      .then((r) => {
        if (!vivo) return;
        if (r.ok && r.data) {
          setCarga({ intento, cuentas: r.data, fallo: false });
          if (!value) {
            const sugerida = cuentaSugeridaParaMedio(medio, r.data);
            if (sugerida) onChange(sugerida);
          }
        } else {
          setCarga({ intento, cuentas: null, fallo: true });
        }
      })
      .catch(() => {
        if (vivo) setCarga({ intento, cuentas: null, fallo: true });
      });
    return () => {
      vivo = false;
    };
    // Una lectura por montaje y por «Reintentar»; `value`/`medio`/`onChange`
    // se leen en el momento de la respuesta a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);

  const cargando = carga.intento !== intento;
  const cuentas = carga.cuentas ?? [];

  if (!cargando && carga.fallo) {
    return (
      <div id={id} className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
        <span>{TEXTO_CUENTAS_NO_CARGARON}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={() => setIntento((n) => n + 1)}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <>
      <SearchableSelect
        id={id}
        options={opcionesSelectorCuenta(cuentas, {
          actualId,
          conAgregar: puedeAgregar,
        })}
        value={value}
        onChange={(v) => {
          if (v === VALOR_AGREGAR_CUENTA) {
            setAgregando(true);
            return;
          }
          onChange(v);
        }}
        placeholder={cargando ? TEXTO_CUENTAS_CARGANDO : PLACEHOLDER_CUENTA}
        disabled={cargando}
      />
      {puedeAgregar && (
        <CuentaRapidaDialog
          abierto={agregando}
          onAbiertoChange={setAgregando}
          existentes={cuentas}
          onCreada={(c) => {
            setCarga((prev) => ({
              ...prev,
              cuentas: [...(prev.cuentas ?? []), c],
            }));
            onChange(c.id);
          }}
        />
      )}
    </>
  );
}

/** Diálogo «Agregar cuenta bancaria» (anidado sobre el formulario del gasto). */
export function CuentaRapidaDialog({
  abierto,
  onAbiertoChange,
  existentes,
  onCreada,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  existentes: readonly OpcionCuentaGasto[];
  onCreada: (c: OpcionCuentaGasto) => void;
}) {
  const [form, setForm] = useState<FormCuentaRapida>(FORM_CUENTA_VACIO);
  const [tocado, setTocado] = useState(false);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errores = erroresCuentaRapida(form, existentes);

  const cerrar = (v: boolean) => {
    if (pending) return;
    onAbiertoChange(v);
    if (!v) {
      setForm(FORM_CUENTA_VACIO);
      setTocado(false);
      setErrorApi(null);
    }
  };

  const set = <K extends keyof FormCuentaRapida>(k: K, v: FormCuentaRapida[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrorApi(null);
  };

  const guardar = () => {
    setTocado(true);
    if (Object.keys(errores).length > 0) return;
    startTransition(async () => {
      try {
        const r = await crearCuentaGastoAction(form);
        if (r.ok && r.data) {
          toast.success(textoCuentaAgregada(r.data.alias));
          onCreada(r.data);
          onAbiertoChange(false);
          setForm(FORM_CUENTA_VACIO);
          setTocado(false);
          setErrorApi(null);
          return;
        }
        setErrorApi(mensajeErrorCuentaRapida(r));
      } catch {
        setErrorApi("El servidor no respondió: la cuenta no se agregó. Vuelve a intentarlo.");
      }
    });
  };

  const err = (k: keyof FormCuentaRapida) => (tocado ? errores[k] : undefined);

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITULO_CUENTA_RAPIDA}</DialogTitle>
          <DialogDescription>{DESCRIPCION_CUENTA_RAPIDA}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Nombre de la cuenta" required hint={HINT_ALIAS_CUENTA} error={err("alias")}>
            <Input
              value={form.alias}
              maxLength={50}
              onChange={(e) => set("alias", e.target.value)}
              placeholder="Ej. HSBC Pesos"
            />
          </Field>
          <Field label="Banco" required error={err("banco")}>
            <Input
              value={form.banco}
              maxLength={50}
              onChange={(e) => set("banco", e.target.value)}
              placeholder="Ej. HSBC, Scotiabank, Paywise"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field label="Moneda" required error={err("moneda")}>
              <SearchableSelect
                options={MONEDAS_CUENTA.map((m) => ({ value: m.value, label: m.label }))}
                value={form.moneda}
                onChange={(v) => set("moneda", v)}
              />
            </Field>
            <Field label="Tipo" required error={err("tipo")}>
              <SearchableSelect
                options={TIPOS_CUENTA.map((t) => ({ value: t.value, label: t.label }))}
                value={form.tipo}
                onChange={(v) => set("tipo", v)}
              />
            </Field>
          </div>
          <Field label="¿De quién es?" required error={err("razon_social")}>
            <SearchableSelect
              options={RAZONES_SOCIALES_CUENTA.map((r) => ({ value: r.value, label: r.label }))}
              value={form.razon_social}
              onChange={(v) => set("razon_social", v)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field label="Número de cuenta (opcional)" error={err("numero_cuenta")}>
              <Input
                value={form.numero_cuenta}
                maxLength={30}
                inputMode="numeric"
                onChange={(e) => set("numero_cuenta", e.target.value)}
              />
            </Field>
            <Field label="CLABE (opcional)" error={err("clabe")}>
              <Input
                value={form.clabe}
                maxLength={22}
                inputMode="numeric"
                onChange={(e) => set("clabe", e.target.value)}
              />
            </Field>
          </div>
          {errorApi && (
            <p role="alert" className="text-sm text-destructive dark:text-red-400">
              {errorApi}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={pending}
            onClick={() => cerrar(false)}
          >
            Cancelar
          </Button>
          <Button type="button" className="cursor-pointer" disabled={pending} onClick={guardar}>
            {pending ? "Agregando…" : BOTON_GUARDAR_CUENTA}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
