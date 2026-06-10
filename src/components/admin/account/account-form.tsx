"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    .trim()
    .max(20, "Máximo 20 caracteres")
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
    formState: { errors, isDirty },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(AccountFormSchema),
    defaultValues: initial,
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
        hint="Opcional. Útil para WhatsApp y avisos urgentes."
        error={errors.telefono?.message}
      >
        <Input
          {...register("telefono")}
          placeholder="+52 998..."
          inputMode="tel"
        />
      </Field>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button
          type="button"
          variant="outline"
          onClick={() => reset(initial)}
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

