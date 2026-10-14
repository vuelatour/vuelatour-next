"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { createClientAction } from "@/app/admin/clients/actions";
import type { Client } from "@/types/clients";
import { Field } from "@/components/admin/form-field";
import { avisoAliasCompartido, textoClienteRapidoCreado } from "@/lib/admin/clave-cliente";

/**
 * Alta RÁPIDA de cliente desde el flujo de apartar/cotizar: solo el nombre,
 * para no frenar la captura del vuelo. Teléfono, RFC, broker y tarifas
 * preferenciales se completan después en el módulo Clientes.
 */
export function QuickClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (client: Client) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [pending, startTransition] = useTransition();

  const cerrar = (next: boolean) => {
    if (!next) setNombre("");
    onOpenChange(next);
  };

  const submit = () => {
    const n = nombre.trim();
    if (n.length < 2) {
      toast.error("Escribe el nombre del cliente");
      return;
    }
    startTransition(async () => {
      const res = await createClientAction({ nombre: n, es_broker: false });
      if (res.ok && res.data) {
        // Con el alias que puso la BD (13-oct-2026); sin alias (API previo)
        // el texto es el de siempre. El alias se cambia después en Clientes.
        toast.success(textoClienteRapidoCreado(res.data.nombre, res.data.alias));
        if (res.data.alias && res.data.alias_compartido_con?.length) {
          const aviso = avisoAliasCompartido(res.data.alias, res.data.alias_compartido_con);
          if (aviso) toast.warning(aviso);
        }
        onCreated?.(res.data);
        cerrar(false);
      } else {
        toast.error(res.error ?? "No se pudo crear el cliente");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo cliente (rápido)</DialogTitle>
          <DialogDescription>
            Solo el nombre, para no frenar la captura del vuelo.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <Field label="Nombre" required>
            <Input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Persona o empresa"
              maxLength={200}
            />
          </Field>

          <p className="text-xs text-muted-foreground">
            ¿Tienes más datos (teléfono, RFC, broker, tarifas preferenciales)?
            Regístralos después en{" "}
            <Link
              href="/admin/clients"
              target="_blank"
              className="text-brand-600 hover:underline"
            >
              Clientes
            </Link>
            .
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => cerrar(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear y usar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
