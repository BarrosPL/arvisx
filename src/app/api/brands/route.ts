import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createBrandSchema } from "@/lib/brands/schema";

export async function GET() {
  try {
    const user = await requireUser();
    const brands = await prisma.brand.findMany({
      where: { brandAccess: { some: { userId: user.id } } },
      orderBy: { priorityOrder: "asc" },
      include: {
        brandAccess: { where: { userId: user.id }, select: { role: true } },
      },
    });
    return NextResponse.json({ brands });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = createBrandSchema.parse(await request.json());

    const existing = await prisma.brand.findUnique({ where: { slug: body.slug } });
    if (existing) {
      return NextResponse.json({ error: "Ja existe uma marca com este slug" }, { status: 409 });
    }

    const brand = await prisma.brand.create({
      data: {
        slug: body.slug,
        name: body.name,
        status: "ONBOARDING",
        topicKeywords: body.topicKeywords,
        excludedKeywords: body.excludedKeywords,
        priorityOrder: body.priorityOrder,
        brandAccess: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
    });

    return NextResponse.json({ brand }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
