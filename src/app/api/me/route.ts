import "server-only";

import { NextResponse } from "next/server";
import { getCurrentBusinessUsers, getPermissionsForCompany, getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/response";
import { unauthenticatedError } from "@/lib/database/errors";

// Identidade da sessão atual — usa o cliente com cookies (respeita
// RLS), não o admin client. Diferente das 8 rotas de cadastro, esta
// rota não tem "dado de negócio" para bypassar: sem sessão real, não
// há o que responder além de 401.
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) throw unauthenticatedError();

    const businessUsers = await getCurrentBusinessUsers();
    const companies = await Promise.all(
      businessUsers.map(async (user) => ({
        ...user,
        permissions: await getPermissionsForCompany(user.companyId),
      }))
    );

    return NextResponse.json({
      success: true,
      data: { authUserId: sessionUser.authUserId, email: sessionUser.email, companies },
    });
  } catch (error) {
    return jsonError(error);
  }
}
