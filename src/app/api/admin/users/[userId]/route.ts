import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/db/withUserContext";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { updateUserSchema } from "@/lib/admin/schema";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  mustChangePassword: true,
  disabledAt: true,
  createdAt: true,
} as const;

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;
    const body = updateUserSchema.parse(await request.json());

    // Ninguem mexe no proprio papel/status por aqui - evita qualquer cenario de
    // autopromocao/autobloqueio acidental. Peça a outro admin.
    if (userId === admin.id && (body.role !== undefined || body.disabled !== undefined)) {
      return NextResponse.json(
        { error: "Voce nao pode alterar seu proprio papel ou status - peca a outro administrador" },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // Nao deixa a ultima conta admin ativa ser rebaixada/desativada - trancaria o
    // painel pra todo mundo (a janela de bootstrap so reabre via script direto no banco).
    const isDemotingOrDisablingAdmin =
      target.role === "ADMIN" &&
      !target.disabledAt &&
      ((body.role !== undefined && body.role !== "ADMIN") || body.disabled === true);

    if (isDemotingOrDisablingAdmin) {
      const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", disabledAt: null } });
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: "Esta e a unica conta admin ativa - promova outra pessoa antes de rebaixar/desativar esta" },
          { status: 400 }
        );
      }
    }

    const user = await withUserContext(admin.id, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.disabled !== undefined ? { disabledAt: body.disabled ? new Date() : null } : {}),
        },
        select: USER_SELECT,
      })
    );

    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
