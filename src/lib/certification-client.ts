import type { CyclePayload } from "./certification";

let previousWrite: Promise<void> = Promise.resolve();

/** Serializa as edições e permite concluir a gravação ao sair da página. */
export function saveCertificationPreview(payload: CyclePayload, keepalive = false) {
  const write = previousWrite
    .catch(() => undefined)
    .then(async () => {
      const response = await fetch("/api/certificacao/previa", {
        method: "PUT",
        keepalive,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Não foi possível salvar a simulação.");
    });
  previousWrite = write;
  return write;
}

/** A tela e o relatório aguardam a última edição antes de consultar a operação. */
export async function loadCertificationPreview(signal?: AbortSignal) {
  await previousWrite.catch(() => undefined);
  const response = await fetch("/api/certificacao/previa", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Não foi possível carregar a simulação da operação.");
  return response.json() as Promise<{
    preview: { payload: unknown; updatedAt: string } | null;
  }>;
}
