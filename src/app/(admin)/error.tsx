"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured server logs pick this up; the digest links to the server trace.
    console.error("[hashmimart-admin]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="hm-card">
      <ErrorState
        title="This page could not load"
        message="The request failed. Retry, and if it keeps happening check the server logs for the matching error digest."
        action={
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
