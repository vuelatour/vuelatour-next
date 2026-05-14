"use client";

import { useEffect } from "react";
import { ExclamationTriangleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log para devs; en prod podríamos mandar a Sentry/etc.
    // eslint-disable-next-line no-console
    console.error("[admin] runtime error", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
              <ExclamationTriangleIcon className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <CardTitle>Algo se rompió</CardTitle>
          <CardDescription className="text-xs font-mono break-words">
            {error.message}
            {error.digest && (
              <span className="block mt-2 text-muted-foreground">digest: {error.digest}</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Reintentar
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
