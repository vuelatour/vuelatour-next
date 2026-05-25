"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { emitirFactura } from "@/lib/api/invoices";
import { ApiError } from "@/lib/api/errors";

interface EmisoraOption {
  id: string;
  label: string;
}

export function EmitirFacturaButton({
  vueloId,
  emisoras,
}: {
  vueloId: string;
  emisoras: EmisoraOption[];
}) {
  const router = useRouter();
  const [emisoraId, setEmisoraId] = useState(emisoras[0]?.id ?? "");
  const [loading, setLoading] = useState(false);

  const handleEmitir = async () => {
    if (!emisoraId) {
      toast.error("Selecciona la entidad emisora");
      return;
    }
    setLoading(true);
    try {
      await emitirFactura(vueloId, emisoraId);
      toast.success("Factura timbrada");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo emitir la factura");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 justify-end">
      <select
        value={emisoraId}
        onChange={(e) => setEmisoraId(e.target.value)}
        disabled={loading}
        className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring max-w-40"
      >
        {emisoras.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={handleEmitir} disabled={loading || emisoras.length === 0}>
        {loading ? "Emitiendo…" : "Emitir factura"}
      </Button>
    </div>
  );
}
