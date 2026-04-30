import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { PageHeader } from "../_app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Phone, Mail, MapPin, User } from "lucide-react";
import { brl as formatBRL } from "@/lib/format";

type Cliente = {
  id: string;
  nome: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
  limite_caderneta: number;
  saldo_devedor: number;
  ativo: boolean;
  created_at: string;
};

type FormState = {
  nome: string;
  documento: string;
  telefone: string;
  email: string;
  endereco: string;
  observacoes: string;
  limite_caderneta: string;
  ativo: boolean;
};

const emptyForm: FormState = {
  nome: "",
  documento: "",
  telefone: "",
  email: "",
  endereco: "",
  observacoes: "",
  limite_caderneta: "0",
  ativo: true,
};

export const Route = createFileRoute("/_app/clientes")({
  component: ClientesPage,
});

function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Cliente | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("nome", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar clientes");
    } else {
      setClientes((data ?? []) as Cliente[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        (c.documento ?? "").toLowerCase().includes(q) ||
        (c.telefone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [clientes, busca]);

  const abrirNovo = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpenForm(true);
  };

  const abrirEdicao = (c: Cliente) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      documento: c.documento ?? "",
      telefone: c.telefone ?? "",
      email: c.email ?? "",
      endereco: c.endereco ?? "",
      observacoes: c.observacoes ?? "",
      limite_caderneta: String(c.limite_caderneta ?? 0),
      ativo: c.ativo,
    });
    setOpenForm(true);
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      documento: form.documento.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      endereco: form.endereco.trim() || null,
      observacoes: form.observacoes.trim() || null,
      limite_caderneta: Number(form.limite_caderneta) || 0,
      ativo: form.ativo,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("clientes").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("clientes").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Cliente atualizado" : "Cliente cadastrado");
    setOpenForm(false);
    carregar();
  };

  const excluir = async () => {
    if (!confirmDel) return;
    const { error } = await supabase.from("clientes").delete().eq("id", confirmDel.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Cliente removido");
      carregar();
    }
    setConfirmDel(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" description="Cadastros e histórico de compras">
        <Button onClick={abrirNovo}>
          <Plus className="size-4 mr-2" />
          Novo cliente
        </Button>
      </PageHeader>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              {clientes.length} cliente{clientes.length === 1 ? "" : "s"}
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, documento, telefone..."
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {busca ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}
            </div>
          ) : (
            <div className="grid gap-3">
              {filtrados.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border p-4 hover:bg-muted/40 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <User className="size-4 text-muted-foreground" />
                      <span className="font-semibold truncate">{c.nome}</span>
                      {!c.ativo && <Badge variant="outline">Inativo</Badge>}
                      {c.saldo_devedor > 0 && (
                        <Badge variant="destructive">
                          Devendo {formatBRL(c.saldo_devedor)}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {c.documento && <span>Doc: {c.documento}</span>}
                      {c.telefone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" /> {c.telefone}
                        </span>
                      )}
                      {c.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3" /> {c.email}
                        </span>
                      )}
                      {c.endereco && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" /> {c.endereco}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Limite caderneta: {formatBRL(c.limite_caderneta)}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => abrirEdicao(c)}>
                      <Pencil className="size-3.5 mr-1" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDel(c)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>
              Preencha os dados. Apenas o nome é obrigatório.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome completo"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Documento (CPF/CNPJ)</Label>
              <Input
                value={form.documento}
                onChange={(e) => setForm({ ...form, documento: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Limite caderneta (R$)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.limite_caderneta}
                onChange={(e) => setForm({ ...form, limite_caderneta: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Endereço</Label>
              <Input
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.nome} será removido. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
