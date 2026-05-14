import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader } from "@/components/ui/card";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-56" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-32" />
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
