import { createFileRoute } from "@tanstack/react-router";
import {
  isAdministratorEmail,
  isSameOriginRequest,
  register,
  requireAdmin,
  usersForAdministration,
  validUserPassword,
} from "@/lib/auth.server";
import { deleteUser, updateUserDetails, updateUserStatus } from "@/lib/database.server";
import { EmailConfigurationError } from "@/lib/email.server";

const noStore = { "Cache-Control": "no-store" };

function errorResponse(message: string, status: number) {
  return Response.json({ message }, { status, headers: noStore });
}

async function readMutation(request: Request) {
  if (!(await requireAdmin())) {
    return errorResponse("Acesso restrito ao administrador.", 403);
  }
  if (!isSameOriginRequest(request)) {
    return errorResponse("Origem da solicitação não permitida.", 403);
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Solicitação inválida.", 400);
  }
  return body as Record<string, unknown>;
}

function accountDetails(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLocaleLowerCase("pt-BR") : "";
  const partnerName = typeof body.partnerName === "string" ? body.partnerName.trim() : "";
  if (name.length < 3 || !/^\S+@\S+\.\S+$/.test(email)) {
    return errorResponse("Preencha corretamente o nome e o e-mail.", 400);
  }
  if (isAdministratorEmail(email)) {
    return errorResponse("Este e-mail já está em uso.", 409);
  }
  return { name, email, partnerName };
}

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async () => {
        if (!(await requireAdmin())) {
          return errorResponse("Acesso restrito ao administrador.", 403);
        }
        return Response.json({ users: usersForAdministration() }, { headers: noStore });
      },
      POST: async ({ request }) => {
        const body = await readMutation(request);
        if (body instanceof Response) return body;
        const details = accountDetails(body);
        if (details instanceof Response) return details;
        const password = typeof body.password === "string" ? body.password : "";
        if (!validUserPassword(password)) {
          return errorResponse(
            "Use pelo menos 8 caracteres, com maiúscula, minúscula e número.",
            400,
          );
        }
        try {
          const result = await register({ ...details, password });
          if (!result.ok) return errorResponse("Este e-mail já está em uso.", 409);
          return Response.json(
            { id: result.id, emailSent: result.emailSent },
            { status: 201, headers: noStore },
          );
        } catch (error) {
          if (error instanceof EmailConfigurationError) return errorResponse(error.message, 503);
          throw error;
        }
      },
      PUT: async ({ request }) => {
        const body = await readMutation(request);
        if (body instanceof Response) return body;
        if (!validId(body.id)) return errorResponse("Solicitação inválida.", 400);
        const details = accountDetails(body);
        if (details instanceof Response) return details;
        const result = updateUserDetails(body.id, details);
        if (result === "exists") return errorResponse("Este e-mail já está em uso.", 409);
        if (result === "not-found") return errorResponse("Usuário não encontrado.", 404);
        return Response.json({ updated: true }, { headers: noStore });
      },
      PATCH: async ({ request }) => {
        const body = await readMutation(request);
        if (body instanceof Response) return body;
        const { id, status } = body;
        if (!validId(id) || (status !== "approved" && status !== "rejected")) {
          return errorResponse("Solicitação inválida.", 400);
        }
        if (!updateUserStatus(id, status)) {
          return errorResponse("Usuário não encontrado.", 404);
        }
        return Response.json({ updated: true }, { headers: noStore });
      },
      DELETE: async ({ request }) => {
        const body = await readMutation(request);
        if (body instanceof Response) return body;
        if (!validId(body.id)) return errorResponse("Solicitação inválida.", 400);
        if (!deleteUser(body.id)) return errorResponse("Usuário não encontrado.", 404);
        return Response.json({ deleted: true }, { headers: noStore });
      },
    },
  },
});
