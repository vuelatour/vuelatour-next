"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneField, normalizePhone } from "@/components/admin/phone-field";
import { updateAccountAction } from "@/app/admin/account/actions";
import { Field } from "@/components/admin/form-field";

const AccountFormSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "Mínimo 2 caracteres")
    .max(100, "Máximo 100 caracteres"),
  telefono: z
    .string()
    .regex(/^\+\d{1,3} \d{10}$/, "Lada + 10 dígitos")
    .optional()
    .or(z.literal("")),
});

type AccountFormValues = z.infer<typeof AccountFormSchema>;

export function AccountForm({
  initial,
}: {
  initial: { nombre: string; telefono: string };
}) {
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(AccountFormSchema),
    // Teléfono legado normalizado (ver normalizePhone): validar lo mostrado.
    defaultValues: { ...initial, telefono: normalizePhone(initial.telefono) },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const payload = {
        nombre: values.nombre.trim(),
        telefono: values.telefono?.trim() || undefined,
      };
      const result = await updateAccountAction(payload);
      if (result.ok) {
        toast.success("Cuenta actualizada");
        reset({
          nombre: payload.nombre,
          telefono: payload.telefono ?? "",
        });
      } else {
        toast.error(result.error ?? "Error al actualizar");
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nombre" required error={errors.nombre?.message}>
        <Input {...register("nombre")} placeholder="Tu nombre completo" />
      </Field>
      <Field
        label="Teléfono"
        hint="Opcional · lada + 10 dígitos. Útil para WhatsApp y avisos urgentes."
        error={errors.telefono?.message}
      >
        <PhoneField
          value={watch("telefono")}
          onChange={(v) =>
            setValue("telefono", v, { shouldValidate: true, shouldDirty: true })
          }
        />
      </Field>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            reset({ ...initial, telefono: normalizePhone(initial.telefono) })
          }
          disabled={pending || !isDirty}
        >
          Descartar
        </Button>
        <Button type="submit" disabled={pending || !isDirty}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

