"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AnalyticsSummary {
  pageViews: number;
  blockClicks: number;
  formSubmits: number;
  conversionRate: number;
}

export function AnalyticsPanel({ bioPageId }: { bioPageId: string }) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/content/bio-pages/${bioPageId}/analytics`)
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled) setSummary(body);
      });
    return () => {
      cancelled = true;
    };
  }, [bioPageId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analytics</CardTitle>
      </CardHeader>
      <CardContent>
        {!summary ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Visitas" value={summary.pageViews} />
            <Metric label="Cliques" value={summary.blockClicks} />
            <Metric label="Envios de formulário" value={summary.formSubmits} />
            <Metric label="Taxa de conversão" value={`${(summary.conversionRate * 100).toFixed(1)}%`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
