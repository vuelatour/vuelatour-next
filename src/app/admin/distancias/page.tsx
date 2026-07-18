import { DistanciasManager } from "@/components/admin/distancias/distancias-manager";
import { ErrorState } from "@/components/admin/error-state";
import { getDistanciasAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DistanciasPage() {
  const res = await getDistanciasAction();

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
      {/* Si el API falla NO se muestra el catálogo vacío: el cotizador
          depende de estas millas y un "vacío" falso invita a recapturarlas. */}
      {res.ok && res.data ? (
        <DistanciasManager initial={res.data} />
      ) : (
        <ErrorState
          title="No se pudo cargar el catálogo de distancias"
          description={
            res.error ??
            "Falló la consulta al servidor. Recarga la página para reintentar."
          }
        />
      )}
    </div>
  );
}
