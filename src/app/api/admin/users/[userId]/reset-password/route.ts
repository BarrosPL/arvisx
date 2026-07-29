import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { withUserContext } from "@/lib/db/withUserContext";
import { requireAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { generateTempPassword } from "@/lib/admin/password";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await withUserContext(admin.id, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: true },
        select: { id: true, email: true },
      })
    );

    return NextResponse.json({ user, tempPassword });
  } catch (error) {
    return handleApiError(error);
  }
}
