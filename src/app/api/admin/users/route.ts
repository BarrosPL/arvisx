import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { withUserContext } from "@/lib/db/withUserContext";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createUserSchema } from "@/lib/admin/schema";
import { generateTempPassword } from "@/lib/admin/password";

const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  mustChangePassword: true,
  disabledAt: true,
  createdAt: true,
} as const;

export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      select: USER_LIST_SELECT,
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = createUserSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return NextResponse.json({ error: "Ja existe uma conta com este e-mail" }, { status: 409 });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await withUserContext(admin.id, (tx) =>
      tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          role: body.role,
          passwordHash,
          mustChangePassword: true,
        },
        select: USER_LIST_SELECT,
      })
    );

    return NextResponse.json({ user, tempPassword }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
