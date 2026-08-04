"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

type LeadStatus = "NEW" | "SPAM" | "ARCHIVED";

interface LeadRow {
  id: string;
  data: Record<string, string>;
  consentGiven: boolean;
  status: LeadStatus;
  createdAt: string;
  leadForm: { name: string };
}

const STATUS_LABEL: Record<LeadStatus, string> = { NEW: "Novo", SPAM: "Spam", ARCHIVED: "Arquivado" };

export function LeadsPanel({ bioPageId }: { bioPageId: string }) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/content/bio-pages/${bioPageId}/leads`)
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        setLeads(body.leads ?? []);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bioPageId]);

  async function updateStatus(leadId: string, status: LeadStatus) {
    const response = await fetch(`/api/content/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      toast.error("Falha ao atualizar status.");
      return;
    }
    setLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, status } : lead)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Leads</span>
          <Button variant="outline" size="sm" render={<a href={`/api/content/bio-pages/${bioPageId}/leads/export`} />}>
            <Download className="size-3.5" /> Exportar CSV
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando leads...</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lead capturado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Dados</TableHead>
                  <TableHead>Consentimento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(lead.createdAt).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {Object.entries(lead.data)
                        .map(([, value]) => value)
                        .join(" · ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={lead.consentGiven ? "default" : "destructive"} className="text-[10px]">
                        {lead.consentGiven ? "Sim" : "Não"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select value={lead.status} onValueChange={(value) => updateStatus(lead.id, value as LeadStatus)}>
                        <SelectTrigger size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_LABEL[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
