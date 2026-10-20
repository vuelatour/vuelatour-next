"use client";

import { useState, useTransition } from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
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
import { usePuedeEditarProveedor } from "@/components/admin/catalogos-gasto-provider";
import {
  guardarProveedorGastoAction,
  obtenerProveedorAction,
} from "@/app/admin/expenses/actions";
import {
  BOTON_GUARDAR_PROVEEDOR_EDITAR,
  BOTON_GUARDAR_PROVEEDOR_NUEVO,
  DESCRIPCION_PROVEEDOR_RAPIDO,
  ETIQUETA_EDITAR_PROVEEDOR,
  FORM_PROVEEDOR_VACIO,
  TIPOS_PROVEEDOR,
  TITULO_EDITAR_PROVEEDOR,
  TITULO_PROVEEDOR_EDITAR,
  TITULO_PROVEEDOR_NUEVO,
  VALOR_AGREGAR_PROVEEDOR,
  erroresProveedorRapido,
  formDeProveedor,
  mensajeErrorProveedorRapido,
  opcionesSelectorProveedor,
  textoProveedorActualizado,
  textoProveedorAgregado,
  type FormProveedorRapido,
  type ProveedorOpcion,
} from "@/lib/admin/proveedores-gasto";

/**
 * Copia LOCAL del catálogo de proveedores (patrón base/lista de
 * `useCatalogoUbicaciones`): lo agregado o renombrado se ve al instante y,
 * cuando el server manda otro catálogo (`router.refresh()`), manda el del
 * server.
 */
function useCatalogoProveedores(
  providers: readonly ProveedorOpcion[],
): [ProveedorOpcion[], (fn: (l: ProveedorOpcion[]) => ProveedorOpcion[]) => void] {
  const [lista, setLista] = useState<ProveedorOpcion[]>([...providers]);
  const [base, setBase] = useState(providers);
  if (base !== providers) {
    setBase(providers);
    setLista([...providers]);
  }
  return [lista, (fn) => setLista((l) => fn(l))];
}

/**
 * Selector de PROVEEDOR del gasto con alta y corrección en el MISMO lugar
 * (20-oct-2026, API 0.0.100, invariante 98 del API; pedido del cliente: «la
 * forma rápida y ágil desde el select de proveedores de poder crear y editar
 * alguno sin salir a otra página»).
 *
 *  - «＋ Agregar proveedor…» es la última opción: abre un diálogo ENCIMA del
 *    formulario (nombre, tipo, RFC, teléfono, correo); al guardar queda
 *    ELEGIDO. Un nombre que ya existe (sin acentos ni mayúsculas) se avisa
 *    antes de mandar, y el 409 `PROVEEDOR_DUPLICADO` del API elige el
 *    existente en vez de duplicarlo.
 *  - El lápiz junto al selector corrige el proveedor ELEGIDO (lee su ficha;
 *    el PATCH lleva solo lo que cambió).
 *  - Sin permiso (o fuera del Provider) es el selector de siempre: el MISMO
 *    `SearchableSelect`, sin envoltura (el alta conserva su marcado).
 */
export function ProveedorSelector({
  id,
  value,
  onChange,
  providers,
  placeholder = "Sin proveedor",
}: {
  id?: string;
  value: string;
  onChange: (valor: string) => void;
  providers: readonly ProveedorOpcion[];
  placeholder?: string;
}) {
  const puede = usePuedeEditarProveedor();
  const [lista, actualizar] = useCatalogoProveedores(providers);
  const [dialogo, setDialogo] = useState<
    | { modo: "nuevo" }
    | { modo: "editar"; id: string; base: FormProveedorRapido }
    | null
  >(null);
  const [leyendo, startLeer] = useTransition();

  if (!puede) {
    return (
      <SearchableSelect
        id={id}
        options={lista.map((p) => ({ value: p.id, label: p.nombre }))}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    );
  }

  const abrirEditar = () => {
    if (!value) return;
    startLeer(async () => {
      try {
        const r = await obtenerProveedorAction(value);
        if (r.ok && r.data) {
          setDialogo({ modo: "editar", id: value, base: formDeProveedor(r.data) });
          return;
        }
        toast.error(mensajeErrorProveedorRapido(r));
      } catch {
        toast.error("El servidor no respondió: no se pudo abrir el proveedor.");
      }
    });
  };

  return (
    <div className="flex items-start gap-1.5">
      <div className="min-w-0 flex-1">
        <SearchableSelect
          id={id}
          options={opcionesSelectorProveedor(lista, true)}
          value={value}
          onChange={(v) => {
            if (v === VALOR_AGREGAR_PROVEEDOR) {
              setDialogo({ modo: "nuevo" });
              return;
            }
            onChange(v);
          }}
          placeholder={placeholder}
        />
      </div>
      {value && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 cursor-pointer"
          aria-label={ETIQUETA_EDITAR_PROVEEDOR}
          title={TITULO_EDITAR_PROVEEDOR}
          disabled={leyendo}
          onClick={abrirEditar}
        >
          <PencilSquareIcon className="size-4" aria-hidden />
        </Button>
      )}
      <ProveedorRapidoDialog
        dialogo={dialogo}
        lista={lista}
        onCerrar={() => setDialogo(null)}
        onGuardado={(p, modo) => {
          actualizar((l) =>
            modo === "nuevo"
              ? l.some((x) => x.id === p.id)
                ? l
                : [...l, p].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
              : l.map((x) => (x.id === p.id ? p : x)),
          );
          if (modo === "nuevo") onChange(p.id);
        }}
      />
    </div>
  );
}

/** Diálogo de alta / corrección de un proveedor (anidado sobre el gasto). */
function ProveedorRapidoDialog({
  dialogo,
  lista,
  onCerrar,
  onGuardado,
}: {
  dialogo:
    | { modo: "nuevo" }
    | { modo: "editar"; id: string; base: FormProveedorRapido }
    | null;
  lista: readonly ProveedorOpcion[];
  onCerrar: () => void;
  onGuardado: (p: ProveedorOpcion, modo: "nuevo" | "editar") => void;
}) {
  const clave = dialogo ? (dialogo.modo === "editar" ? dialogo.id : "nuevo") : null;
  const [sesion, setSesion] = useState<string | null>(null);
  const [form, setForm] = useState<FormProveedorRapido>(FORM_PROVEEDOR_VACIO);
  const [tocado, setTocado] = useState(false);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Una sesión por apertura: el formulario se siembra al ABRIR (ajuste de
  // estado guardado en el render, sin efectos).
  if (clave !== sesion) {
    setSesion(clave);
    setForm(dialogo?.modo === "editar" ? dialogo.base : FORM_PROVEEDOR_VACIO);
    setTocado(false);
    setErrorApi(null);
  }
  const excepto = dialogo?.modo === "editar" ? dialogo.id : null;
  const errores = erroresProveedorRapido(form, lista, excepto);

  const set = <K extends keyof FormProveedorRapido>(k: K, v: FormProveedorRapido[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrorApi(null);
  };

  const guardar = () => {
    if (!dialogo) return;
    setTocado(true);
    if (Object.keys(errores).length > 0) return;
    startTransition(async () => {
      try {
        const r = await guardarProveedorGastoAction({
          id: dialogo.modo === "editar" ? dialogo.id : null,
          form,
          base: dialogo.modo === "editar" ? dialogo.base : null,
        });
        if (r.ok && r.data) {
          toast.success(
            dialogo.modo === "nuevo"
              ? textoProveedorAgregado(r.data.nombre)
              : textoProveedorActualizado(r.data.nombre),
          );
          onGuardado(r.data, dialogo.modo);
          onCerrar();
          return;
        }
        // Ya existía: se elige el existente en vez de duplicarlo.
        const det = r.details as { id?: string; nombre?: string } | undefined;
        if (r.code === "PROVEEDOR_DUPLICADO" && dialogo.modo === "nuevo" && det?.id && det.nombre) {
          toast.info(mensajeErrorProveedorRapido(r));
          onGuardado({ id: det.id, nombre: det.nombre }, "nuevo");
          onCerrar();
          return;
        }
        setErrorApi(mensajeErrorProveedorRapido(r));
      } catch {
        setErrorApi("El servidor no respondió: el proveedor no se guardó. Vuelve a intentarlo.");
      }
    });
  };

  const err = (k: keyof FormProveedorRapido) => (tocado ? errores[k] : undefined);
  const editar = dialogo?.modo === "editar";

  return (
    <Dialog
      open={dialogo !== null}
      onOpenChange={(v) => {
        if (!v && !pending) onCerrar();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editar ? TITULO_PROVEEDOR_EDITAR : TITULO_PROVEEDOR_NUEVO}</DialogTitle>
          <DialogDescription>{DESCRIPCION_PROVEEDOR_RAPIDO}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Nombre" required error={err("nombre")}>
            <Input
              value={form.nombre}
              maxLength={200}
              onChange={(e) => set("nombre", e.target.value)}
              placeholder="Ej. Estafeta Mexicana"
            />
          </Field>
          <Field label="Tipo" required error={err("tipo")}>
            <SearchableSelect
              options={TIPOS_PROVEEDOR.map((t) => ({ value: t.value, label: t.label }))}
              value={form.tipo}
              onChange={(v) => set("tipo", v)}
            />
          </Field>
          <Field label="RFC (opcional)" error={err("rfc")}>
            <Input
              value={form.rfc}
              maxLength={13}
              className="font-mono uppercase"
              onChange={(e) => set("rfc", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field label="Teléfono (opcional)">
              <Input
                value={form.telefono}
                inputMode="tel"
                onChange={(e) => set("telefono", e.target.value)}
              />
            </Field>
            <Field label="Correo (opcional)" error={err("email")}>
              <Input
                value={form.email}
                type="email"
                onChange={(e) => set("email", e.target.value)}
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
            onClick={onCerrar}
          >
            Cancelar
          </Button>
          <Button type="button" className="cursor-pointer" disabled={pending} onClick={guardar}>
            {pending
              ? "Guardando…"
              : editar
                ? BOTON_GUARDAR_PROVEEDOR_EDITAR
                : BOTON_GUARDAR_PROVEEDOR_NUEVO}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
