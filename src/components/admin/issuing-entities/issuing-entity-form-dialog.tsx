"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { PhoneField, normalizePhone } from "@/components/admin/phone-field";
import { Textarea } from "@/components/ui/textarea";
import {
  createIssuingEntityAction,
  updateIssuingEntityAction,
  uploadCsdAction,
} from "@/app/admin/issuing-entities/actions";
import {
  IssuingEntityFormSchema,
  type IssuingEntityFormValues,
} from "@/app/admin/issuing-entities/schema";
import type { IssuingEntity } from "@/types/issuing-entities";
import { Field } from "@/components/admin/form-field";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEntity?: IssuingEntity;
}

export function IssuingEntityFormDialog({ open, onOpenChange, initialEntity }: Props) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialEntity;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<IssuingEntityFormValues>({
    resolver: zodResolver(IssuingEntityFormSchema),
    defaultValues: defaults(initialEntity),
  });

  // Resetear SOLO al abrir (flanco false→true): subir el CSD revalida la
  // página y entrega un initialEntity nuevo con el diálogo abierto — resetear
  // ahí pisaría en silencio lo que el operador lleva escrito sin guardar.
  const estabaAbierto = useRef(false);
  useEffect(() => {
    if (open && !estabaAbierto.current) reset(defaults(initialEntity));
    estabaAbierto.current = open;
  }, [open, initialEntity, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateIssuingEntityAction(initialEntity!.id, values)
        : await createIssuingEntityAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Entidad actualizada" : "Entidad creada");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const f = Object.keys(result.fieldErrors)[0];
        toast.error(`${f}: ${result.fieldErrors[f]?.[0] ?? "Inválido"}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Editar ${initialEntity!.codigo}` : "Nueva entidad fiscal emisora"}
          </DialogTitle>
          <DialogDescription>
            Razón social que emite CFDI 4.0. La empresa principal es Aero Charter Cancún.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Código interno" required hint="AEROCHARTER" error={errors.codigo?.message}>
              <Input {...register("codigo")} className="font-mono uppercase" maxLength={20} />
            </Field>
            <Field label="RFC" hint="12-13 chars" error={errors.rfc?.message}>
              <Input maxLength={13} {...register("rfc")} className="font-mono uppercase" />
            </Field>
            <Field
              label="Régimen SAT"
              hint="ej. 601 PM Régimen General"
              error={errors.regimen_fiscal_sat?.message}
            >
              <Input maxLength={10} {...register("regimen_fiscal_sat")} />
            </Field>
          </div>

          <Field label="Razón social" required error={errors.razon_social?.message}>
            <Input {...register("razon_social")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Código postal" hint="5 dígitos" error={errors.codigo_postal?.message}>
              <Input maxLength={5} {...register("codigo_postal")} className="font-mono" />
            </Field>
            <Field label="PAC contratado" hint="SIIGO_NUBE, FACTURAMA, etc." error={errors.pac_proveedor?.message}>
              <Input {...register("pac_proveedor")} />
            </Field>
          </div>

          <Field label="Dirección" error={errors.direccion?.message}>
            <Textarea rows={2} {...register("direccion")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email facturación" error={errors.email_facturacion?.message}>
              <Input type="email" {...register("email_facturacion")} />
            </Field>
            <Field label="Teléfono" error={errors.telefono?.message}>
              <PhoneField
                value={watch("telefono")}
                onChange={(v) => setValue("telefono", v, { shouldValidate: true, shouldDirty: true })}
              />
            </Field>
          </div>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} {...register("notas")} />
          </Field>

          {isEdit && <CsdSection entity={initialEntity!} />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear entidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


/**
 * Sello digital (CSD) del SAT: sube el .cer/.key al bucket privado y guarda
 * las rutas en la emisora. La contraseña de la llave NUNCA pasa por aquí:
 * vive como CSD_PASSWORD en el entorno del API. Facturama recibe el CSD
 * automáticamente en el primer timbrado.
 */
function CsdSection({ entity }: { entity: IssuingEntity }) {
  const [cerFile, setCerFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [subido, setSubido] = useState(false);
  // Remonta los <input type=file> tras subir: son no-controlados y seguirían
  // mostrando el nombre del archivo con el botón apagado.
  const [inputsKey, setInputsKey] = useState(0);
  const [subiendo, startUpload] = useTransition();
  const cargado = subido || !!(entity.csd_cer_url && entity.csd_key_url);

  const subir = () => {
    if (!cerFile || !keyFile) {
      toast.error("Selecciona ambos archivos del CSD: el .cer y el .key");
      return;
    }
    // Un CSD real pesa ~2 KB; algo mucho mayor es el archivo equivocado.
    if (cerFile.size > 30_000 || keyFile.size > 30_000) {
      toast.error(
        "Ese archivo no parece un CSD del SAT (pesa demasiado). Verifica que sean el .cer y el .key del certificado de sello digital.",
      );
      return;
    }
    startUpload(async () => {
      const [cer_b64, key_b64] = await Promise.all([toB64(cerFile), toB64(keyFile)]);
      const res = await uploadCsdAction(entity.id, { cer_b64, key_b64 });
      if (res.ok) {
        setSubido(true);
        setCerFile(null);
        setKeyFile(null);
        setInputsKey((k) => k + 1);
        toast.success(
          "CSD validado y cargado. Si el timbrado marca error de contraseña, falta configurar CSD_PASSWORD en el servidor (avisa al administrador).",
          { duration: 8000 },
        );
      } else {
        toast.error(res.error ?? "No se pudo subir el CSD", { duration: 10000 });
      }
    });
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">CSD (sello digital del SAT)</p>
        {cargado ? (
          <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
            CSD cargado
          </Badge>
        ) : (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20">
            Falta CSD
          </Badge>
        )}
      </div>
      <div key={inputsKey} className="grid grid-cols-2 gap-3">
        <Field label="Certificado (.cer)">
          <Input
            type="file"
            accept=".cer"
            onChange={(e) => setCerFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Llave privada (.key)">
          <Input
            type="file"
            accept=".key"
            onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
          />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          Son los archivos del SAT (formato DER). La contraseña de la llave no
          se guarda aquí: va en la variable CSD_PASSWORD del API. Subir de
          nuevo reemplaza el CSD anterior (renovación).
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={subir}
          disabled={subiendo || !cerFile || !keyFile}
          className="shrink-0"
        >
          {subiendo ? "Subiendo…" : "Subir CSD"}
        </Button>
      </div>
    </div>
  );
}

async function toB64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function defaults(entity?: IssuingEntity): IssuingEntityFormValues {
  if (!entity) {
    return {
      codigo: "",
      razon_social: "",
      rfc: "",
      regimen_fiscal_sat: "601",
      codigo_postal: "",
      direccion: "",
      email_facturacion: "",
      telefono: "",
      pac_proveedor: "SIIGO_NUBE",
      notas: "",
    };
  }
  return {
    codigo: entity.codigo,
    razon_social: entity.razon_social,
    rfc: entity.rfc ?? "",
    regimen_fiscal_sat: entity.regimen_fiscal_sat ?? "",
    codigo_postal: entity.codigo_postal ?? "",
    direccion: entity.direccion ?? "",
    email_facturacion: entity.email_facturacion ?? "",
    // Legado normalizado: el form debe validar LO QUE SE MUESTRA.
    telefono: normalizePhone(entity.telefono),
    pac_proveedor: entity.pac_proveedor ?? "",
    notas: entity.notas ?? "",
  };
}
