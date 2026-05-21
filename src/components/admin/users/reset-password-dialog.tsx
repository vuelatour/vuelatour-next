"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EyeIcon, EyeSlashIcon, KeyIcon } from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetUserPasswordAction } from "@/app/admin/users/actions";
import type { User } from "@/types/users";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

function generatePassword(): string {
  // Easy-to-share testing password: VueloT + 4 digits + ! (12 chars, mixed case + digit + symbol)
  const n = Math.floor(1000 + Math.random() * 9000);
  return `VueloT${n}!`;
}

export function ResetPasswordDialog({ open, onOpenChange, user }: Props) {
  const [password, setPassword] = useState<string>(() => generatePassword());
  const [reveal, setReveal] = useState(false);
  const [pending, startTransition] = useTransition();

  const noAuthYet = !user.supabase_auth_id;

  const submit = () => {
    startTransition(async () => {
      const res = await resetUserPasswordAction(user.id, password);
      if (res.ok) {
        if (res.data?.created_auth_user) {
          toast.success(
            `Cuenta creada para ${user.email}. Ya puede iniciar sesión con esa contraseña.`,
          );
        } else {
          toast.success(`Contraseña actualizada para ${user.email}.`);
        }
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "No se pudo cambiar la contraseña");
      }
    });
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(`${user.email} / ${password}`);
      toast.success("Credenciales copiadas");
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyIcon className="h-5 w-5" />
            {noAuthYet ? "Crear contraseña" : "Restablecer contraseña"}
          </DialogTitle>
          <DialogDescription>
            {noAuthYet ? (
              <>
                <span className="font-medium">{user.email}</span> aún no se ha logueado. Esto
                creará su cuenta en Supabase Auth con email + contraseña para que pueda iniciar
                sesión directamente.
              </>
            ) : (
              <>
                Define una contraseña nueva para{" "}
                <span className="font-medium">{user.email}</span>. La actual será reemplazada.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-sm font-medium">
              Nueva contraseña
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="new-password"
                  type={reveal ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {reveal ? (
                    <EyeSlashIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPassword(generatePassword());
                  setReveal(true);
                }}
              >
                Generar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Mínimo 6 caracteres. Solo para pruebas — comparte por canal seguro.
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={copyToClipboard}
            className="w-full"
          >
            Copiar &quot;{user.email} / {reveal ? password : "••••••••"}&quot; al portapapeles
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || password.length < 6}>
            {pending
              ? "Guardando…"
              : noAuthYet
                ? "Crear cuenta"
                : "Cambiar contraseña"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
