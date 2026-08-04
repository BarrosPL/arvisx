import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireBioPageAccess } from "@/lib/content/access";

interface RouteParams {
  params: Promise<{ bioPageId: string }>;
}

/** RFC 4180: aspas duplas em volta de tudo, aspas internas escapadas dobrando -
 * cobre virgula/quebra de linha/aspas em texto livre do lead sem lib nova. */
function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { bioPageId } = await params;
    await requireBioPageAccess(bioPageId);

    const leads = await prisma.lead.findMany({
      where: { leadForm: { bioPageId } },
      orderBy: { createdAt: "desc" },
      include: { leadForm: { select: { name: true } } },
    });

    const fieldKeys = Array.from(
      new Set(leads.flatMap((lead) => Object.keys(lead.data as Record<string, unknown>)))
    );

    const header = ["data", "formulário", "status", ...fieldKeys, "consentimento", "utm_source"];
    const rows = leads.map((lead) => {
      const data = lead.data as Record<string, unknown>;
      const utm = lead.utm as Record<string, string> | null;
      return [
        lead.createdAt.toISOString(),
        lead.leadForm.name,
        lead.status,
        ...fieldKeys.map((key) => data[key] ?? ""),
        lead.consentGiven ? "sim" : "não",
        utm?.utm_source ?? "",
      ]
        .map(csvCell)
        .join(",");
    });

    const csv = [header.map(csvCell).join(","), ...rows].join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${bioPageId}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
