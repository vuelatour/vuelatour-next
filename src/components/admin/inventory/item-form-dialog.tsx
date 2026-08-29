"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  createEmpaqueAction,
  createItemAction,
  createMovimientoAction,
  deleteEmpaqueAction,
  updateEmpaqueAction,
  updateItemAction,
} from "@/app/admin/inventory/actions";
import { normalizarCodigo } from "@/app/admin/inventory/schema";
import type { EmpaqueFormRow, ItemFormValues } from "@/app/admin/inventory/schema";
import type { InventarioFoto, InventarioItem } from "@/types/inventory";
import { Field } from "@/components/admin/form-field";
import { uploadInventarioFoto } from "@/lib/storage/inventario-fotos";

const MAX_FOTOS_ADICIONALES = 6;

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialItem?: InventarioItem;
  /** Categorías existentes: el campo las sugiere y teclear una nueva la crea. */
  categorias?: string[];
  /**
   * Código de barras prellenado al CREAR (viene del buscador: "Dar de alta
   * con este código" cuando el escáner leyó un código que no existe).
   */
  initialCodigo?: string;
}

export function ItemFormDialog({
  open,
  onOpenChange,
  initialItem,
  categorias,
  initialCodigo,
}: ItemFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialItem;
  // Foto del producto: archivo nuevo elegido, o quitar la existente.
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [quitarFoto, setQuitarFoto] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  // Fotos adicionales: las que ya tiene el ítem (se pueden quitar) + nuevas.
  const [fotosExistentes, setFotosExistentes] = useState<InventarioFoto[]>([]);
  const [fotosNuevas, setFotosNuevas] = useState<{ file: File; preview: string }[]>([]);
  const [fotosTocadas, setFotosTocadas] = useState(false);
  const fotosRef = useRef<HTMLInputElement>(null);
  // Fila de empaque EXISTENTE con confirmación de quitar abierta (índice).
  const [confirmarQuitar, setConfirmarQuitar] = useState<number | null>(null);
  // Foto YA GUARDADA con confirmación de quitar abierta: "principal" o el
  // path de una adicional. Al guardar, el API borra el archivo del bucket
  // (regla del cliente: toda acción destructiva confirma, como en la app).
  const [confirmarFoto, setConfirmarFoto] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<ItemFormValues>({ defaultValues: defaults(initialItem, initialCodigo) });
  const empaquesArr = useFieldArray({ control, name: "empaques" });

  useEffect(() => {
    if (open) {
      reset(defaults(initialItem, initialCodigo));
      setFotoFile(null);
      setFotoPreview(null);
      setQuitarFoto(false);
      setFotosExistentes(initialItem?.fotos_adicionales ?? []);
      setFotosNuevas((prev) => {
        prev.forEach((f) => URL.revokeObjectURL(f.preview));
        return [];
      });
      setFotosTocadas(false);
      setConfirmarQuitar(null);
      setConfirmarFoto(null);
    }
  }, [open, initialItem, initialCodigo, reset]);

  const quitarPrincipal = () => {
    setFotoFile(null);
    setFotoPreview(null);
    setQuitarFoto(true);
    if (fotoRef.current) fotoRef.current.value = "";
  };

  const agregarFotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const cupo = MAX_FOTOS_ADICIONALES - fotosExistentes.length - fotosNuevas.length;
    const elegidas = Array.from(files).slice(0, Math.max(0, cupo));
    if (elegidas.length < files.length) {
      toast.warning(`Máximo ${MAX_FOTOS_ADICIONALES} fotos adicionales por ítem.`);
    }
    if (elegidas.length === 0) return;
    setFotosNuevas((prev) => [
      ...prev,
      ...elegidas.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
    setFotosTocadas(true);
    if (fotosRef.current) fotosRef.current.value = "";
  };

  const onSubmit = handleSubmit((values) => {
    // La entrada inicial se valida ANTES de crear el ítem: si algo falta, no
    // se crea nada y el operador corrige sin perder lo capturado (antes el
    // ítem quedaba creado en stock 0 con solo un aviso).
    if (!isEdit) {
      const cantN = Number(values.cantidad_inicial?.trim() || "0");
      const costoTxt = values.costo_inicial_usd?.trim() ?? "";
      const tcN = Number(values.tc_inicial?.trim() || "0");
      const hayCosto = costoTxt !== "" && Number(costoTxt) > 0;
      if (cantN > 0 && !hayCosto) {
        toast.error(
          "Captura el costo unitario de compra de la entrada inicial (mayor a 0) o borra la cantidad.",
        );
        return;
      }
      if (cantN > 0 && values.moneda_inicial === "MXN" && !(tcN > 0)) {
        toast.error("Captura el tipo de cambio (MXN por USD) de la compra inicial.");
        return;
      }
      if (cantN <= 0 && hayCosto) {
        toast.error(
          "Captura cuántas piezas entran (cantidad inicial) o borra el costo.",
        );
        return;
      }
    }

    // Empaques: un código identifica UNA sola cosa. Se valida aquí para que
    // el error sea claro antes de que la BD lo rechace.
    const codigoUnidad = normalizarCodigo(values.codigo);
    const filas = values.empaques ?? [];
    const vistos = new Set<string>();
    for (const [i, e] of filas.entries()) {
      const n = i + 1;
      if (!e.nombre.trim()) {
        toast.error(`Empaque ${n}: escribe el nombre (ej. «Caja de 6»).`);
        return;
      }
      if (!(Number(e.factor) > 0)) {
        toast.error(`Empaque ${n}: captura cuántas unidades trae (mayor a 0).`);
        return;
      }
      const cod = normalizarCodigo(e.codigo);
      if (cod) {
        if (cod === codigoUnidad) {
          toast.error(
            `Empaque «${e.nombre}»: su código de barras no puede ser el mismo que el de la unidad.`,
          );
          return;
        }
        if (vistos.has(cod)) {
          toast.error(`El código ${cod} está repetido en dos empaques.`);
          return;
        }
        vistos.add(cod);
      }
    }

    startTransition(async () => {
      // La foto primero: si la subida falla, no se guarda el ítem a medias.
      let fotoPayload: { foto_url: string | null; foto_storage_path: string | null } | undefined;
      if (fotoFile) {
        try {
          const subida = await uploadInventarioFoto(fotoFile);
          fotoPayload = { foto_url: subida.url, foto_storage_path: subida.storage_path };
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo subir la foto");
          return;
        }
      } else if (quitarFoto && isEdit) {
        fotoPayload = { foto_url: null, foto_storage_path: null };
      }
      // Fotos adicionales: solo viajan si se tocaron (al editar, mandar la
      // lista completa = el API borra del bucket las que ya no estén).
      let fotosPayload: { fotos_adicionales: InventarioFoto[] } | undefined;
      if (fotosTocadas || (!isEdit && fotosNuevas.length > 0)) {
        const subidas: InventarioFoto[] = [...fotosExistentes];
        for (const f of fotosNuevas) {
          try {
            const s = await uploadInventarioFoto(f.file);
            subidas.push({ url: s.url, path: s.storage_path });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "No se pudo subir una foto");
            return;
          }
        }
        fotosPayload = { fotos_adicionales: subidas };
      }

      const { empaques: filasEmpaques, ...base } = values;
      const payload: Record<string, unknown> = {
        ...base,
        ...(fotoPayload ?? {}),
        ...(fotosPayload ?? {}),
      };
      if (!isEdit) {
        payload.empaques = filasEmpaques.map((e) => ({
          nombre: e.nombre.trim(),
          factor: e.factor,
          codigo: e.codigo,
        }));
      }

      const result = isEdit
        ? await updateItemAction(initialItem!.id, payload)
        : await createItemAction(payload);

      if (result.ok) {
        // Al EDITAR, los empaques se sincronizan uno por uno contra los
        // endpoints de empaques (alta / cambio / baja). Best-effort: el ítem
        // ya quedó guardado; cualquier tropiezo se avisa con su causa.
        if (isEdit) {
          const aviso = await sincronizarEmpaques(
            initialItem!.id,
            initialItem!.empaques ?? [],
            filasEmpaques,
          );
          if (aviso) {
            toast.warning(`Ítem actualizado, pero un empaque no se guardó: ${aviso}`);
            onOpenChange(false);
            return;
          }
        }
        // Entrada inicial opcional al crear: registra la compra (cantidad +
        // costo) como ENTRADA de cardex para que el ítem no quede en 0 sin
        // precio. Best-effort: si falla, el ítem ya existe y se avisa.
        const cant = values.cantidad_inicial?.trim();
        const costo = values.costo_inicial_usd?.trim();
        if (!isEdit && result.data && Number(cant || "0") > 0 && costo) {
          const esMxn = values.moneda_inicial === "MXN";
          const mov = await createMovimientoAction(result.data.id, {
            tipo: "ENTRADA",
            cantidad: cant,
            moneda: values.moneda_inicial,
            ...(esMxn
              ? { costo_unitario_mxn: costo, tc_usd_mxn: values.tc_inicial }
              : { costo_unitario_usd: costo }),
            // Día CANCÚN: sin esto el API usa current_date (UTC) y una alta de
            // las 19:00+ se fecha al día siguiente.
            fecha_movimiento: new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Cancun",
            }).format(new Date()),
            notas: "Stock inicial (alta del ítem)",
          });
          if (!mov.ok) {
            toast.warning(
              `Ítem creado, pero la entrada inicial falló: ${mov.error ?? "regístrala desde el detalle"}`,
            );
            onOpenChange(false);
            return;
          }
        }
        toast.success(isEdit ? "Ítem actualizado" : "Ítem creado");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const firstField = Object.keys(result.fieldErrors)[0];
        const firstError = result.fieldErrors[firstField]?.[0] ?? "Validación falló";
        toast.error(`${firstField}: ${firstError}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  const totalFotosExtra = fotosExistentes.length + fotosNuevas.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar ítem" : "Nuevo ítem de inventario"}</DialogTitle>
          <DialogDescription>
            Catálogo de bodega. El stock se calcula del cardex (entradas menos salidas, FIFO):
            al crear, captúralo abajo en «Entrada inicial»; después se mueve con entradas y
            salidas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Foto del producto: se ve en la app del mecánico y en el listado. */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-3">
              {fotoPreview || (initialItem?.foto_url && !quitarFoto) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fotoPreview ?? initialItem?.foto_url ?? ""}
                  alt="Foto del producto"
                  className="h-16 w-16 shrink-0 rounded-md object-cover ring-1 ring-border"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground text-[10px] text-center">
                  Sin foto
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium">Foto principal</p>
                <p className="text-xs text-muted-foreground">
                  JPG/PNG/WebP · se muestra en la app y el listado.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fotoRef.current?.click()}
                  >
                    {fotoPreview || initialItem?.foto_url ? "Cambiar" : "Subir foto"}
                  </Button>
                  {(fotoPreview || (initialItem?.foto_url && !quitarFoto)) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        // Quitar una foto ya guardada la borra del bucket al
                        // guardar: confirmar. Una recién elegida (no subida)
                        // solo se descarta.
                        if (isEdit && initialItem?.foto_url) {
                          setConfirmarFoto("principal");
                          return;
                        }
                        quitarPrincipal();
                      }}
                    >
                      Quitar
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={fotoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setFotoFile(file);
                  setQuitarFoto(false);
                  setFotoPreview((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return file ? URL.createObjectURL(file) : null;
                  });
                }}
              />
            </div>
            {confirmarFoto === "principal" && (
              <ConfirmarQuitarFoto
                texto="¿Quitar la foto principal? Se eliminará del producto al guardar los cambios."
                onConfirmar={() => {
                  setConfirmarFoto(null);
                  quitarPrincipal();
                }}
                onCancelar={() => setConfirmarFoto(null)}
              />
            )}
          </div>

          {/* Fotos adicionales: etiqueta, caja, ficha técnica… (la app las usa
              para que la IA llene la ficha; aquí solo se administran). */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Fotos adicionales</p>
                <p className="text-xs text-muted-foreground">
                  Etiqueta, caja, ficha técnica… hasta {MAX_FOTOS_ADICIONALES}.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={totalFotosExtra >= MAX_FOTOS_ADICIONALES}
                onClick={() => fotosRef.current?.click()}
              >
                Agregar fotos
              </Button>
              <input
                ref={fotosRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => agregarFotos(e.target.files)}
              />
            </div>
            {totalFotosExtra > 0 && (
              <div className="flex flex-wrap gap-2">
                {fotosExistentes.map((f) => (
                  <Miniatura
                    key={f.path}
                    src={f.url}
                    resaltar={confirmarFoto === f.path}
                    // Ya guardada: se borra del bucket al guardar → confirmar.
                    onQuitar={() => setConfirmarFoto(f.path)}
                  />
                ))}
                {fotosNuevas.map((f) => (
                  <Miniatura
                    key={f.preview}
                    src={f.preview}
                    nueva
                    onQuitar={() => {
                      URL.revokeObjectURL(f.preview);
                      setFotosNuevas((prev) => prev.filter((x) => x.preview !== f.preview));
                    }}
                  />
                ))}
              </div>
            )}
            {confirmarFoto !== null && confirmarFoto !== "principal" && (
              <ConfirmarQuitarFoto
                texto="¿Quitar esta foto? Se eliminará del producto al guardar los cambios."
                onConfirmar={() => {
                  const path = confirmarFoto;
                  setConfirmarFoto(null);
                  setFotosExistentes((prev) => prev.filter((x) => x.path !== path));
                  setFotosTocadas(true);
                }}
                onCancelar={() => setConfirmarFoto(null)}
              />
            )}
          </div>

          <Field label="Nombre" required error={errors.nombre?.message}>
            <Input
              placeholder="Aceite AeroShell W15W-50"
              {...register("nombre", { required: "Requerido" })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca" hint="Fabricante" error={errors.marca?.message}>
              <Input placeholder="AeroShell" {...register("marca")} />
            </Field>
            <Field
              label="Categoría"
              required
              hint="Elige una existente o escribe una nueva para crearla"
              error={errors.categoria?.message}
            >
              <>
                <Input
                  placeholder="aceites"
                  list="categorias-existentes"
                  {...register("categoria", { required: "Requerido" })}
                />
                <datalist id="categorias-existentes">
                  {(categorias ?? []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Número de parte" hint="P/N del fabricante" error={errors.numero_parte?.message}>
              <Input placeholder="550050835" {...register("numero_parte")} className="font-mono" />
            </Field>
            <Field
              label="Código de barras / SKU (unidad)"
              hint="El de la botella/pieza; el de la caja va en Empaques"
              error={errors.codigo?.message}
            >
              <Input
                placeholder="021400062153"
                inputMode="numeric"
                {...register("codigo")}
                className="font-mono"
              />
            </Field>
          </div>

          <Field
            label="Descripción"
            hint="Ficha para bodega: tipo, uso, contenido (ej. 1 qt / 946 mL), especificación"
            error={errors.descripcion?.message}
          >
            <Textarea rows={2} {...register("descripcion")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock mínimo" hint="Alerta por email al bajar" error={errors.stock_minimo?.message}>
              <Input type="number" step="any" min="0" placeholder="0" {...register("stock_minimo")} />
            </Field>
            <Field
              label="Ubicación"
              // NOT NULL en BD: al editar, vacío = se conserva la actual.
              hint={isEdit ? "Vacío = se conserva la actual" : undefined}
              error={errors.ubicacion?.message}
            >
              <Input placeholder="Bodega Cancún" {...register("ubicacion")} />
            </Field>
          </div>

          {/* Presentación del stock: en qué se cuenta (el cardex y las alertas
              hablan en esta unidad). Texto libre con sugerencias comunes. */}
          <Field
            label="Unidad de medida"
            hint="En qué se cuenta el stock — NO es la cantidad"
            error={errors.unidad?.message}
          >
            <>
              <Input
                placeholder="pieza, botella, bote, galón, litro, bolsa…"
                list="unidades-sugeridas"
                {...register("unidad", {
                  validate: (v) =>
                    !v || !/^[\d.,]+$/.test(v.trim())
                      ? true
                      : "Escribe en qué se cuenta (pieza, caja, litro). La cantidad va en «Entrada inicial».",
                })}
              />
              <datalist id="unidades-sugeridas">
                <option value="pieza" />
                <option value="botella" />
                <option value="caja" />
                <option value="bote" />
                <option value="galón" />
                <option value="litro" />
                <option value="bolsa" />
                <option value="juego" />
                <option value="metro" />
              </datalist>
            </>
          </Field>

          {/* Empaques (cajas): presentaciones con su propio código de barras.
              Un movimiento por caja rebaja factor × cajas en UNIDADES. */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Empaques (cajas)</p>
                <p className="text-xs text-muted-foreground">
                  Si el producto también se maneja por caja, captúrala con cuántas unidades trae
                  y su código de barras. Al escanear la caja, el movimiento se rebaja en unidades.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1 shrink-0"
                disabled={empaquesArr.fields.length >= 10}
                onClick={() =>
                  empaquesArr.append({ nombre: "", factor: "", codigo: "", activo: true })
                }
              >
                <PlusIcon className="h-4 w-4" />
                Agregar empaque
              </Button>
            </div>

            {empaquesArr.fields.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_110px_1fr_32px] gap-2 text-[11px] uppercase tracking-wider text-muted-foreground px-0.5">
                  <span>Nombre</span>
                  <span>Unidades</span>
                  <span>Código de barras</span>
                  <span />
                </div>
                {empaquesArr.fields.map((f, i) => {
                  const existente = !!watch(`empaques.${i}.empaque_id`);
                  return (
                    <div key={f.id} className="space-y-1">
                      <div className="grid grid-cols-[1fr_110px_1fr_32px] gap-2 items-center">
                        <Input
                          placeholder="Caja de 6"
                          aria-label={`Nombre del empaque ${i + 1}`}
                          {...register(`empaques.${i}.nombre` as const)}
                        />
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="6"
                          aria-label={`Unidades por empaque ${i + 1}`}
                          {...register(`empaques.${i}.factor` as const)}
                        />
                        <Input
                          placeholder="00021400062160"
                          inputMode="numeric"
                          className="font-mono"
                          aria-label={`Código de barras del empaque ${i + 1}`}
                          {...register(`empaques.${i}.codigo` as const)}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          aria-label="Quitar empaque"
                          onClick={() => {
                            // Un empaque ya guardado se borra al guardar el
                            // ítem: pedir confirmación antes de quitarlo.
                            if (existente) setConfirmarQuitar(i);
                            else empaquesArr.remove(i);
                          }}
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </Button>
                      </div>
                      {confirmarQuitar === i && (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs">
                          <span className="text-amber-700 dark:text-amber-400">
                            ¿Quitar «{watch(`empaques.${i}.nombre`) || "este empaque"}»? Si ya tiene
                            movimientos, se desactivará en vez de borrarse.
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="h-7"
                            onClick={() => {
                              setConfirmarQuitar(null);
                              empaquesArr.remove(i);
                            }}
                          >
                            Sí, quitar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => setConfirmarQuitar(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {isEdit && (initialItem?.empaques ?? []).some((e) => !e.activo) && (
              <p className="text-xs text-muted-foreground">
                <Badge variant="outline" className="mr-1 text-[10px]">Inactivos</Badge>
                Los empaques desactivados se reactivan desde la ficha del ítem.
              </p>
            )}
          </div>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} {...register("notas")} />
          </Field>

          {!isEdit && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Entrada inicial (opcional):</span>{" "}
                si ya tienes la pieza comprada, captura cuántas UNIDADES y su costo unitario para
                que el ítem no quede en stock 0. Queda registrada como compra en el cardex.
                {empaquesArr.fields.length > 0 && " Si son cajas, multiplica (1 caja de 6 = 6)."}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cantidad inicial (unidades)">
                  <Input type="number" step="any" min="0" placeholder="0" {...register("cantidad_inicial")} />
                </Field>
                <Field label="Costo unitario">
                  <div className="flex gap-2">
                    <select
                      value={watch("moneda_inicial")}
                      onChange={(e) =>
                        setValue("moneda_inicial", e.target.value as ItemFormValues["moneda_inicial"])
                      }
                      className="h-9 w-20 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                    >
                      <option value="MXN">MXN</option>
                      <option value="USD">USD</option>
                    </select>
                    <Input type="number" step="any" min="0" placeholder="0.00" {...register("costo_inicial_usd")} />
                  </div>
                </Field>
              </div>
              {watch("moneda_inicial") === "MXN" && (
                <Field
                  label="Tipo de cambio (MXN por USD)"
                  hint="El de la compra. El costo se convierte a USD para el balance."
                >
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder="Ej. 18.50"
                      className="w-32"
                      {...register("tc_inicial")}
                    />
                    {Number(watch("costo_inicial_usd")) > 0 && Number(watch("tc_inicial")) > 0 && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ≈ ${(Number(watch("costo_inicial_usd")) / Number(watch("tc_inicial"))).toFixed(2)} USD c/u
                      </span>
                    )}
                  </div>
                </Field>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear ítem"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmación inline (ámbar) antes de quitar una foto ya guardada. */
function ConfirmarQuitarFoto({
  texto,
  onConfirmar,
  onCancelar,
}: {
  texto: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs">
      <span className="text-amber-700 dark:text-amber-400">{texto}</span>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="h-7"
        onClick={onConfirmar}
      >
        Sí, quitar
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7" onClick={onCancelar}>
        Cancelar
      </Button>
    </div>
  );
}

function Miniatura({
  src,
  nueva,
  resaltar,
  onQuitar,
}: {
  src: string;
  nueva?: boolean;
  /** Foto con confirmación de quitar abierta: se marca para saber cuál es. */
  resaltar?: boolean;
  onQuitar: () => void;
}) {
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Foto adicional"
        className={
          resaltar
            ? "h-16 w-16 rounded-md object-cover ring-2 ring-amber-500"
            : "h-16 w-16 rounded-md object-cover ring-1 ring-border"
        }
      />
      {nueva && (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-brand-600 px-1 text-[9px] text-white">
          nueva
        </span>
      )}
      <button
        type="button"
        onClick={onQuitar}
        aria-label="Quitar foto"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border hover:text-destructive"
      >
        <XMarkIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * Sincroniza las filas del formulario contra los empaques guardados del ítem:
 * quitados → DELETE (409 = ya tiene movimientos → se desactiva), cambiados →
 * PATCH, nuevos → POST. Devuelve el primer error legible, o null.
 */
async function sincronizarEmpaques(
  itemId: string,
  guardados: NonNullable<InventarioItem["empaques"]>,
  filas: EmpaqueFormRow[],
): Promise<string | null> {
  const activos = guardados.filter((e) => e.activo);
  const idsEnForm = new Set(filas.map((f) => f.empaque_id).filter(Boolean));
  for (const e of activos) {
    if (idsEnForm.has(e.id)) continue;
    const del = await deleteEmpaqueAction(itemId, e.id);
    if (del.ok) continue;
    if (del.status === 409) {
      const off = await updateEmpaqueAction(itemId, e.id, { activo: false });
      if (!off.ok) return off.error ?? `no se pudo desactivar «${e.nombre}»`;
      toast.info(`«${e.nombre}» ya tenía movimientos: se desactivó en vez de borrarse.`);
      continue;
    }
    return del.error ?? `no se pudo quitar «${e.nombre}»`;
  }
  for (const f of filas) {
    const factor = Number(f.factor);
    const codigo = normalizarCodigo(f.codigo);
    if (f.empaque_id) {
      const prev = guardados.find((e) => e.id === f.empaque_id);
      if (!prev) continue;
      const cambio =
        prev.nombre !== f.nombre.trim() ||
        Number(prev.factor) !== factor ||
        (prev.codigo ?? "") !== codigo;
      if (!cambio) continue;
      const upd = await updateEmpaqueAction(itemId, f.empaque_id, {
        nombre: f.nombre.trim(),
        factor: f.factor,
        codigo: f.codigo,
      });
      if (!upd.ok) return upd.error ?? primerFieldError(upd.fieldErrors) ?? `no se pudo actualizar «${f.nombre}»`;
    } else {
      const cre = await createEmpaqueAction(itemId, {
        nombre: f.nombre.trim(),
        factor: f.factor,
        codigo: f.codigo,
      });
      if (!cre.ok) return cre.error ?? primerFieldError(cre.fieldErrors) ?? `no se pudo crear «${f.nombre}»`;
    }
  }
  return null;
}

function primerFieldError(fe?: Record<string, string[]>): string | null {
  if (!fe) return null;
  const k = Object.keys(fe)[0];
  return k ? `${k}: ${fe[k]?.[0] ?? "inválido"}` : null;
}

function defaults(item?: InventarioItem, initialCodigo?: string): ItemFormValues {
  if (!item) {
    return {
      nombre: "",
      marca: "",
      numero_parte: "",
      codigo: initialCodigo ? normalizarCodigo(initialCodigo) : "",
      categoria: "",
      stock_minimo: "",
      ubicacion: "",
      unidad: "",
      descripcion: "",
      notas: "",
      empaques: [],
      cantidad_inicial: "",
      costo_inicial_usd: "",
      moneda_inicial: "MXN",
      tc_inicial: "",
    };
  }
  return {
    nombre: item.nombre,
    marca: item.marca ?? "",
    numero_parte: item.numero_parte ?? "",
    codigo: item.codigo ?? "",
    categoria: item.categoria,
    stock_minimo: item.stock_minimo != null ? String(item.stock_minimo) : "",
    ubicacion: item.ubicacion ?? "",
    unidad: item.unidad ?? "",
    descripcion: item.descripcion ?? "",
    notas: item.notas ?? "",
    // Solo los activos se editan aquí; los inactivos viven en la ficha.
    empaques: (item.empaques ?? [])
      .filter((e) => e.activo)
      .map((e) => ({
        empaque_id: e.id,
        nombre: e.nombre,
        factor: String(e.factor),
        codigo: e.codigo ?? "",
        activo: e.activo,
      })),
    cantidad_inicial: "",
    costo_inicial_usd: "",
    moneda_inicial: "MXN",
    tc_inicial: "",
  };
}
