import { Card, CardContent } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-4 w-24 bg-muted rounded mb-2" />
        <div className="h-8 w-40 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="py-4">
              <div className="h-3 w-16 bg-muted rounded mb-2" />
              <div className="h-7 w-12 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="py-6 space-y-3">
              <div className="h-12 w-12 bg-muted rounded-full" />
              <div className="h-4 w-3/4 bg-muted rounded" />
              <div className="h-3 w-1/2 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
