import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getOrCreateBrandForUser } from "@/lib/content/getOrCreateBrand";
import { createBioPageSchema } from "@/lib/content/schema";

export async function GET() {
  try {
    const user = await requireUser();
    const brand = await getOrCreateBrandForUser(user.id, user.email, user.name);

    const bioPages = await prisma.bioPage.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ brand: { id: brand.id, name: brand.name }, bioPages });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const brand = await getOrCreateBrandForUser(user.id, user.email, user.name);
    const body = createBioPageSchema.parse(await request.json());

    const bioPage = await prisma.bioPage.create({
      data: { brandId: brand.id, slug: body.slug, title: body.title },
    });

    return NextResponse.json({ bioPage });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Esse endereço (slug) já está em uso" }, { status: 409 });
    }
    return handleApiError(error);
  }
}
