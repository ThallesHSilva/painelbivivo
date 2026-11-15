import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  Clock3,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { TableScroll } from "@/components/TableScroll";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type ManagedUser = {
  id: number;
  name: string;
  email: string;
  partnerName: string;
  status: "pending" | "approved" | "rejected";
  lastLoginAt: string | null;
};
const statusInfo = {
  pending: { label: "Pendente", className: "border-amber-500/20 bg-amber-500/10 text-amber-700" },
  approved: {
    label: "Ativo",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
  },
  rejected: { label: "Cancelado", className: "border-rose-500/20 bg-rose-500/10 text-rose-700" },
};

async function mutateUsers(method: "POST" | "PUT" | "PATCH" | "DELETE", body: object) {
  const response = await fetch("/api/admin/users", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "Não foi possível concluir a alteração.");
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export const Route = createFileRoute("/usuarios")({
  head: () => ({ meta: [{ title: "Acessos — Mapa Parque" }] }),
  component: UsersPage,
});

function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<number | "new" | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ user?: ManagedUser } | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [dialogError, setDialogError] = useState("");
  const newUserButton = useRef<HTMLButtonElement>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = (await response.json()) as { users?: ManagedUser[]; message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível carregar os acessos.");
      setUsers(payload.users ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar os acessos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totals = useMemo(
    () => ({
      total: users.length,
      pending: users.filter((user) => user.status === "pending").length,
      approved: users.filter((user) => user.status === "approved").length,
    }),
    [users],
  );

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleUsers = useMemo(
    () =>
      [...users]
        .filter((user) =>
          normalizedSearch
            ? `${user.name} ${user.email} ${user.partnerName}`
                .toLocaleLowerCase()
                .includes(normalizedSearch)
            : true,
        )
        .sort((left, right) => {
          return (
            Number(right.status === "pending") - Number(left.status === "pending") ||
            left.name.localeCompare(right.name, "pt-BR")
          );
        }),
    [normalizedSearch, users],
  );

  const review = async (user: ManagedUser, status: "approved" | "rejected") => {
    setPending(user.id);
    setMessage("");
    try {
      await mutateUsers("PATCH", { id: user.id, status });
      toast.success(
        status === "approved"
          ? "Cadastro aprovado."
          : user.status === "approved"
            ? "Acesso revogado."
            : "Cadastro recusado.",
      );
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o cadastro.");
    } finally {
      setPending(null);
    }
  };

  const prepareDialog = (user?: ManagedUser) => {
    setDialogError("");
    dialogOpener.current = user
      ? document.getElementById(`user-actions-${user.id}`)
      : newUserButton.current;
  };

  const restoreDialogFocus = (event: Event) => {
    event.preventDefault();
    const opener = dialogOpener.current;
    (opener?.isConnected && !opener.matches(":disabled") ? opener : newUserButton.current)?.focus();
  };

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || pending !== null) return;
    const values = new FormData(event.currentTarget);
    const details = {
      name: values.get("name"),
      email: values.get("email"),
      partnerName: values.get("partnerName"),
    };
    const user = editor.user;
    setPending(user?.id ?? "new");
    setDialogError("");
    try {
      if (user) {
        await mutateUsers("PUT", { id: user.id, ...details });
      } else {
        await mutateUsers("POST", { ...details, password: values.get("password") });
      }
      setEditor(null);
      toast.success(user ? "Cadastro atualizado." : "Usuário cadastrado. Aguardando aprovação.");
      await loadData();
    } catch (error) {
      setDialogError(
        error instanceof Error ? error.message : "Não foi possível salvar o cadastro.",
      );
    } finally {
      setPending(null);
    }
  };

  const removeUser = async () => {
    if (!deleting || pending !== null) return;
    setPending(deleting.id);
    setDialogError("");
    try {
      await mutateUsers("DELETE", { id: deleting.id });
      setDeleting(null);
      toast.success("Cadastro excluído.");
      await loadData();
    } catch (error) {
      setDialogError(
        error instanceof Error ? error.message : "Não foi possível excluir o cadastro.",
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <DashboardLayout title="Acessos">
      <div className="space-y-6">
        <section className="border-b border-border pb-5">
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                <ShieldCheck className="size-4" /> Administração
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">Gerenciar usuários</h1>
              <p className="page-subtitle mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Aprove cadastros para liberar o acesso ao painel do cliente.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={loading || pending !== null}
                onClick={() => void loadData()}
              >
                Atualizar lista
              </Button>
              <Button
                ref={newUserButton}
                onClick={() => {
                  prepareDialog();
                  setEditor({});
                }}
              >
                <UserPlus className="size-4" /> Novo usuário
              </Button>
            </div>
          </div>
        </section>

        <div className="relative max-w-xl">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar usuário, e-mail ou empresa"
            aria-label="Buscar usuário, e-mail ou empresa"
            className="h-10 pl-9"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { label: "Cadastros", value: totals.total, icon: UsersRound },
            {
              label: "Pendentes",
              value: totals.pending,
              icon: Clock3,
            },
            {
              label: "Ativos",
              value: totals.approved,
              icon: UserCheck,
            },
          ].map((item) => (
            <Card
              key={item.label}
              className="rounded-xl border-primary/10 bg-card/85 p-3 shadow-sm sm:p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
                    {item.value}
                  </p>
                </div>
                <span className="hidden size-10 place-items-center rounded-lg bg-primary/[0.07] text-primary sm:grid">
                  <item.icon className="size-5" />
                </span>
              </div>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden rounded-[2rem] border-primary/15 bg-card/90 shadow-elevated">
          <div className="border-b border-primary/10 px-5 py-5 sm:px-7">
            <h2 className="text-lg font-semibold tracking-tight">Usuários cadastrados</h2>
            <p className="page-subtitle mt-1 text-xs text-muted-foreground">
              O cancelamento encerra o acesso imediatamente.
            </p>
          </div>
          {message && (
            <p
              role="alert"
              className="mx-5 mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-700"
            >
              {message}
            </p>
          )}
          {loading ? (
            <div
              className="grid min-h-56 place-items-center"
              role="status"
              aria-label="Carregando acessos"
            >
              <LoaderCircle className="size-6 animate-spin text-primary" />
            </div>
          ) : visibleUsers.length === 0 ? (
            <div className="grid min-h-56 place-items-center text-sm text-muted-foreground">
              {search.trim() ? "Nenhum usuário encontrado." : "Nenhum usuário disponível."}
            </div>
          ) : (
            <TableScroll hint="Role na horizontal para ver as ações do usuário.">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead className="hidden md:table-cell">Empresa informada</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="hidden md:table-cell">Último acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.map((user) => {
                    const canApprove = user.status !== "approved";
                    const lastAccess = formatDate(user.lastLoginAt);
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="max-w-[14rem] whitespace-normal [overflow-wrap:anywhere]">
                          <p className="font-semibold">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                          {(user.partnerName || user.lastLoginAt) && (
                            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground md:hidden">
                              {user.partnerName && <p>{user.partnerName}</p>}
                              {user.lastLoginAt && <p>Último acesso em {lastAccess}</p>}
                            </div>
                          )}
                          <Badge
                            variant="outline"
                            className={`mt-1 sm:hidden ${statusInfo[user.status].className}`}
                          >
                            {statusInfo[user.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden max-w-[14rem] whitespace-normal [overflow-wrap:anywhere] md:table-cell">
                          {user.partnerName || "—"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className={statusInfo[user.status].className}>
                            {statusInfo[user.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                          {lastAccess}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1 sm:gap-2">
                            {canApprove && (
                              <Button
                                size="sm"
                                disabled={pending !== null}
                                onClick={() => void review(user, "approved")}
                                className="rounded-xl"
                              >
                                {pending === user.id && !editor && !deleting ? (
                                  <LoaderCircle className="size-4 animate-spin" />
                                ) : (
                                  <Check className="size-4" />
                                )}{" "}
                                Aprovar
                              </Button>
                            )}
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  id={`user-actions-${user.id}`}
                                  size="icon"
                                  variant="outline"
                                  aria-label={`Ações de ${user.name}`}
                                  disabled={pending !== null}
                                  className="size-9"
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-40">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    prepareDialog(user);
                                    setEditor({ user });
                                  }}
                                >
                                  <Pencil /> Editar cadastro
                                </DropdownMenuItem>
                                {user.status !== "rejected" && (
                                  <DropdownMenuItem onSelect={() => void review(user, "rejected")}>
                                    <X />{" "}
                                    {user.status === "approved"
                                      ? "Revogar acesso"
                                      : "Recusar cadastro"}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => {
                                    prepareDialog(user);
                                    setDeleting(user);
                                  }}
                                >
                                  <Trash2 /> Excluir cadastro
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableScroll>
          )}
        </Card>
      </div>
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && pending === null) setEditor(null);
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-xl"
          onCloseAutoFocus={restoreDialogFocus}
        >
          <DialogHeader className="text-left">
            <DialogTitle>{editor?.user ? "Editar cadastro" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {editor?.user
                ? "Atualize os dados do cadastro."
                : "O usuário poderá entrar após a aprovação do cadastro."}
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form onSubmit={saveUser} autoComplete="off" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-name">Nome</Label>
                <Input
                  id="user-name"
                  name="name"
                  defaultValue={editor.user?.name}
                  minLength={3}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">E-mail</Label>
                <Input
                  id="user-email"
                  name="email"
                  type="email"
                  defaultValue={editor.user?.email}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-company">Empresa (opcional)</Label>
                <Input
                  id="user-company"
                  name="partnerName"
                  defaultValue={editor.user?.partnerName}
                />
              </div>
              {!editor.user && (
                <div className="space-y-2">
                  <Label htmlFor="user-password">Senha inicial</Label>
                  <Input
                    id="user-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    aria-describedby="user-password-hint"
                    required
                  />
                  <p id="user-password-hint" className="text-xs text-muted-foreground">
                    Pelo menos 8 caracteres, com maiúscula, minúscula e número.
                  </p>
                </div>
              )}
              {dialogError && (
                <p role="alert" className="text-sm text-destructive">
                  {dialogError}
                </p>
              )}
              <DialogFooter className="gap-2 sm:space-x-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditor(null)}
                  disabled={pending !== null}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending !== null}>
                  {pending !== null && <LoaderCircle className="size-4 animate-spin" />}
                  {editor.user ? "Salvar alterações" : "Cadastrar usuário"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && pending === null) setDeleting(null);
        }}
      >
        <AlertDialogContent
          className="w-[calc(100%-2rem)] rounded-xl"
          onCloseAutoFocus={restoreDialogFocus}
        >
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Excluir cadastro?</AlertDialogTitle>
            <AlertDialogDescription className="[overflow-wrap:anywhere]">
              A exclusão de <strong>{deleting?.name}</strong> ({deleting?.email}) é permanente e
              encerra o acesso ao painel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialogError && (
            <p role="alert" className="text-sm text-destructive">
              {dialogError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending !== null}
              onClick={() => void removeUser()}
            >
              {pending !== null && <LoaderCircle className="size-4 animate-spin" />}
              Excluir cadastro
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
