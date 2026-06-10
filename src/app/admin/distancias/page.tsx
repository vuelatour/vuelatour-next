import { DistanciasManager } from "@/components/admin/distancias/distancias-manager";
import { getDistanciasAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DistanciasPage() {
  const res = await getDistanciasAction();
  const distancias = res.ok && res.data ? res.data : [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Catálogos</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Distancias por aerovía
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Millas náuticas punto a punto calculadas <strong>sobre aerovías</strong>{" "}
          (no en línea recta): si el día del vuelo no está visual hay que ir por
          aerovía, y cotizar la distancia directa te deja corto. El cotizador y
          las rutas autocompletan las millas usando este catálogo primero.
        </p>
      </div>
      <DistanciasManager initial={distancias} />
    </div>
  );
}
