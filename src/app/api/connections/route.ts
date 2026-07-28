import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { redactConnection } from "@/lib/ads/credentials";

export async function GET() {
  try {
    const user = await requireUser();
    const connections = await prisma.providerConnection.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { assignments: true } } },
    });

    return NextResponse.json({
      connections: connections.map((connection) => ({
        ...redactConnection(connection),
        assignmentsCount: connection._count.assignments,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
