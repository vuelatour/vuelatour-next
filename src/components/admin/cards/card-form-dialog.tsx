"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createCardAction,
  updateCardAction,
} from "@/app/admin/cards/actions";
import { CardFormSchema, type CardFormValues } from "@/app/admin/cards/schema";
import type { Card } from "@/types/cards";

export interface UserOption {
  id: string;
  nombre: string;
  email: string;
}

export interface BankAccountOption {
  id: string;
  alias: string;
  banco: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCard?: Card;
  users: UserOption[];
  bankAccounts: BankAccountOption[];
}

export function CardFormDialog({ open, onOpenChange, initialCard, users, bankAccounts }: Props) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialCard;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CardFormValues>({
    resolver: zodResolver(CardFormSchema),
    defaultValues: defaults(initialCard),
  });

  useEffect(() => {
    if (open) reset(defaults(initialCard));
  }, [open, initialCard, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateCardAction(initialCard!.id, values)
        : await createCardAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Tarjeta actualizada" : "Tarjeta creada");
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar **** ${initialCard!.terminacion}` : "Nueva tarjeta corporativa"}</DialogTitle>
          <DialogDescription>
            Tarjeta de la empresa. Vinculada opcionalmente a un usuario titular y a una cuenta
            bancaria.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Terminación" hint="Últimos 4 dígitos" required error={errors.terminacion?.message}>
              <Input
                maxLength={4}
                placeholder="6256"
                {...register("terminacion")}
                className="font-mono"
              />
            </Field>
            <Field label="Banco" error={errors.banco?.message}>
              <Input placeholder="Scotiabank" {...register("banco")} />
            </Field>
          </div>

          <Field label="Nombre del titular" required error={errors.nombre_titular?.message}>
            <Input {...register("nombre_titular")} />
          </Field>

          <Field
            label="Usuario titular"
            hint="Vincula la tarjeta a un usuario del sistema (opcional)"
            error={errors.usuario_id?.message}
          >
            <SearchableSelect
              options={[
                { value: "", label: "Sin vincular" },
                ...users.map((u) => ({
                  value: u.id,
                  label: u.nombre,
                  description: u.email,
                })),
              ]}
              value={(watch("usuario_id") as string | undefined) ?? ""}
              onChange={(v) => setValue("usuario_id", v)}
              placeholder="Sin vincular"
            />
          </Field>

          <Field
            label="Cuenta bancaria"
            hint="Cuenta a la que cargan los movimientos (opcional)"
            error={errors.cuenta_bancaria_id?.message}
          >
            <SearchableSelect
              options={[
                { value: "", label: "Sin vincular" },
                ...bankAccounts.map((b) => ({
                  value: b.id,
                  label: b.alias,
                  description: b.banco,
                })),
              ]}
              value={(watch("cuenta_bancaria_id") as string | undefined) ?? ""}
              onChange={(v) => setValue("cuenta_bancaria_id", v)}
              placeholder="Sin vincular"
            />
          </Field>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tarjeta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {(hint || error) && (
        <p className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

function defaults(card?: Card): CardFormValues {
  if (!card) {
    return {
      terminacion: "",
      nombre_titular: "",
      usuario_id: "",
      banco: "",
      cuenta_bancaria_id: "",
      notas: "",
    };
  }
  return {
    terminacion: card.terminacion,
    nombre_titular: card.nombre_titular,
    usuario_id: card.usuario_id ?? "",
    banco: card.banco ?? "",
    cuenta_bancaria_id: card.cuenta_bancaria_id ?? "",
    notas: card.notas ?? "",
  };
}
