import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Skeleton de la página de configuración mientras carga el server component. */
export default function SectionLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Card className="p-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </Card>
    </div>
  );
}
