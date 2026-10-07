"use client";

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";

/** Last-resort error boundary: keeps the message generic and offers a retry. */
export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-page-sm text-fg">{t("common.feedback.errorTitle")}</h1>
      <p className="text-fg-muted mt-2 max-w-md text-sm">
        {t("common.feedback.errorText")}
        {error.digest ? (
          <span className="mt-1 block font-mono text-xs">
            {t("common.feedback.errorReference", { digest: error.digest })}
          </span>
        ) : null}
      </p>
      <Button className="mt-6" leftIcon={<RefreshCw aria-hidden />} onClick={reset}>
        {t("common.feedback.tryAgain")}
      </Button>
    </main>
  );
}
