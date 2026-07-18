import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Aviso rojo estándar cuando una consulta al API FALLA. Fuente única: nunca
 * disfrazar una caída del servidor de "sin datos" — un catálogo o registro de
 * dinero que aparece vacío por error silencioso lleva a capturas duplicadas y
 * decisiones equivocadas.
 */
export function ErrorState({
  title = "No se pudo cargar la información",
  description,
}: {
  title?: string;
  description: React.ReactNode;
}) {
  return (
    <Card className="border-destructive/40">
      <CardHeader className="text-center py-10">
        <div className="flex justify-center mb-4">
          <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <ExclamationTriangleIcon className="h-7 w-7 text-destructive" />
          </div>
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
