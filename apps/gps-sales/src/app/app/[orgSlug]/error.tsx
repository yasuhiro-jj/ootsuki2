"use client";

import { Button } from "@/components/ui/button";

export default function OrgError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p>表示できませんでした。</p>
      <Button type="button" variant="outline" onClick={reset}>
        再試行
      </Button>
    </div>
  );
}
