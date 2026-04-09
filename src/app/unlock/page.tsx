import { Suspense } from "react";
import { UnlockForm } from "./UnlockForm";

export default function UnlockPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-slate-100 p-8 text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <UnlockForm />
    </Suspense>
  );
}
