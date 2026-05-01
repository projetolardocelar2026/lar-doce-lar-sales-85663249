import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { PageHeader } from "../_app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Search, Phone, Mail, MapPin, User, Instagram,
  Facebook, FileDown, FileText, Eye, MessageCircle, Heart,
} from "lucide-react";
import { brl, fmtDate, fmtDateOnly, formaPagamentoLabel, STORE_NAME } from "@/lib/format";
import {
  validateDocumento, validateTelefone, maskDocumento, maskTelefone,
} from "@/lib/validators";
import { downloadCSV, downloadTablePDF } from "@/lib/exporters";
import { abrirWhatsApp } from "@/lib/whatsapp";

type Cliente = {
  id: string;
  nome: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
  observacao_relacionamento: string | null;
  instagram: string | null;
  facebook: string | null;
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
  observacao_relacionamento: string;
  instagram: string;
  facebook: string;
  limite_caderneta: string;
  ativo: boolean;
};

const emptyForm: FormState = {
  nome: "", documento: "", telefone: "", email: "", endereco: "",
  observacoes: "", observacao_relacionamento: "", instagram: "", facebook: "",
  limite_caderneta: "0", ativo: true,
};

type ItemVenda = { produto_nome: string; quantidade: number; preco_unitario: number; subtotal: number };
type VendaCli = {
  id: string; data_venda: string; total: number; forma_pagamento: string; status: string;
  itens: ItemVenda[];
};
type PagCli = { id: string; data_pagamento: string; valor: number; forma_pagamento: string; observacoes: string | null };

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
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Cliente | null>(null);
  const [detalhe, setDetalhe] = useState<Cliente | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("nome", { ascending: true });
    if (error) toast.error("Erro ao carregar clientes");
    else setClientes((data ?? []) as Cliente[]);
    setLoading(false);
  };

  useEffect(() => {
    carregar();
    // Realtime: cadastro/edição/exclusão atualizam a lista sem refresh
    const ch = supabase
      .channel("clientes-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clientes" },
        (payload) => {
          setClientes((cur) => {
            if (payload.eventType === "INSERT") {
              const novo = payload.new as Cliente;
              if (cur.some((c) => c.id === novo.id)) return cur;
              return [...cur, novo].sort((a, b) => a.nome.localeCompare(b.nome));
            }
            if (payload.eventType === "UPDATE") {
              const upd = payload.new as Cliente;
              return cur
                .map((c) => (c.id === upd.id ? upd : c))
                .sort((a, b) => a.nome.localeCompare(b.nome));
            }
            if (payload.eventType === "DELETE") {
              const del = payload.old as Cliente;
              return cur.filter((c) => c.id !== del.id);
            }
            return cur;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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
    setErrors({});
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
      observacao_relacionamento: c.observacao_relacionamento ?? "",
      instagram: c.instagram ?? "",
      facebook: c.facebook ?? "",
      limite_caderneta: String(c.limite_caderneta ?? 0),
      ativo: c.ativo,
    });
    setErrors({});
    setOpenForm(true);
  };

  const validar = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.nome.trim()) e.nome = "Informe o nome";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = "E-mail inválido";
    }
    const docErr = validateDocumento(form.documento);
    if (docErr) e.documento = docErr;
    const telErr = validateTelefone(form.telefone);
    if (telErr) e.telefone = telErr;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const salvar = async () => {
    if (!validar()) {
      toast.error("Verifique os campos destacados");
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
      observacao_relacionamento: form.observacao_relacionamento.trim() || null,
      instagram: form.instagram.trim() || null,
      facebook: form.facebook.trim() || null,
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
  };

  const excluir = async () => {
    if (!confirmDel) return;
    const { error } = await supabase.from("clientes").delete().eq("id", confirmDel.id);
    if (error) toast.error(error.message);
    else toast.success("Cliente removido");
    setConfirmDel(null);
  };

  const exportarCSV = () => {
    const rows = filtrados.map((c) => ({
      Nome: c.nome,
      Documento: c.documento ?? "",
      Telefone: c.telefone ?? "",
      Email: c.email ?? "",
      Endereço: c.endereco ?? "",
      Instagram: c.instagram ?? "",
      Facebook: c.facebook ?? "",
      "Limite Caderneta": Number(c.limite_caderneta).toFixed(2),
      "Saldo Devedor": Number(c.saldo_devedor).toFixed(2),
      Ativo: c.ativo ? "Sim" : "Não",
      "Cadastrado em": fmtDateOnly(c.created_at),
    }));
    downloadCSV(`clientes-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const exportarPDF = () => {
    downloadTablePDF({
      filename: `clientes-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: `${STORE_NAME} — Clientes`,
      subtitle: `${filtrados.length} cliente(s)${busca ? ` — filtro: "${busca}"` : ""} • ${new Date().toLocaleString("pt-BR")}`,
      headers: ["Nome", "Documento", "Telefone", "Limite", "Devedor", "Status"],
      rows: filtrados.map((c) => [
        c.nome,
        c.documento ?? "—",
        c.telefone ?? "—",
        brl(c.limite_caderneta),
        brl(c.saldo_devedor),
        c.ativo ? "Ativo" : "Inativo",
      ]),
      footer: STORE_NAME,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Cadastros, histórico e relacionamento"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={exportarCSV}>
              <FileDown className="size-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" onClick={exportarPDF}>
              <FileText className="size-4 mr-2" /> PDF
            </Button>
            <Button onClick={abrirNovo}>
              <Plus className="size-4 mr-2" /> Novo cliente
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              {filtrados.length} de {clientes.length} cliente{clientes.length === 1 ? "" : "s"}
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
                        <Badge variant="destructive">Devendo {brl(c.saldo_devedor)}</Badge>
                      )}
                      {c.observacao_relacionamento && (
                        <Badge variant="secondary" className="gap-1">
                          <Heart className="size-3" /> VIP
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
                      {c.instagram && (
                        <span className="inline-flex items-center gap-1">
                          <Instagram className="size-3" /> {c.instagram}
                        </span>
                      )}
                      {c.facebook && (
                        <span className="inline-flex items-center gap-1">
                          <Facebook className="size-3" /> {c.facebook}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Limite caderneta: {brl(c.limite_caderneta)}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setDetalhe(c)}>
                      <Eye className="size-3.5 mr-1" /> Ver
                    </Button>
                    {c.telefone && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          abrirWhatsApp(c.telefone, `Olá ${c.nome.split(" ")[0]}! Aqui é da ${STORE_NAME}.`)
                        }
                      >
                        <MessageCircle className="size-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => abrirEdicao(c)}>
                      <Pencil className="size-3.5" />
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

      {/* Form */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>
              Apenas o nome é obrigatório. CPF/CNPJ e telefone são validados antes de salvar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome completo"
                autoFocus
                aria-invalid={!!errors.nome}
              />
              {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
            </div>
            <div className="space-y-1">
              <Label>Documento (CPF/CNPJ)</Label>
              <Input
                value={form.documento}
                onChange={(e) => setForm({ ...form, documento: maskDocumento(e.target.value) })}
                placeholder="000.000.000-00"
                aria-invalid={!!errors.documento}
              />
              {errors.documento && <p className="text-xs text-destructive">{errors.documento}</p>}
            </div>
            <div className="space-y-1">
              <Label>Telefone / WhatsApp</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: maskTelefone(e.target.value) })}
                placeholder="(11) 90000-0000"
                aria-invalid={!!errors.telefone}
              />
              {errors.telefone && <p className="text-xs text-destructive">{errors.telefone}</p>}
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1">
              <Label>Limite caderneta (R$)</Label>
              <Input
                type="number" min={0} step="0.01"
                value={form.limite_caderneta}
                onChange={(e) => setForm({ ...form, limite_caderneta: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center gap-1">
                <Instagram className="size-3.5" /> Instagram
              </Label>
              <Input
                value={form.instagram}
                onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                placeholder="@usuario"
              />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center gap-1">
                <Facebook className="size-3.5" /> Facebook
              </Label>
              <Input
                value={form.facebook}
                onChange={(e) => setForm({ ...form, facebook: e.target.value })}
                placeholder="Nome ou link"
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Endereço</Label>
              <Input
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label className="inline-flex items-center gap-1">
                <Heart className="size-3.5" /> Companheirismo / Relacionamento
              </Label>
              <Textarea
                rows={2}
                placeholder="Ex.: Cliente antiga da empresa anterior, prefere atendimento por WhatsApp..."
                value={form.observacao_relacionamento}
                onChange={(e) => setForm({ ...form, observacao_relacionamento: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Observações gerais</Label>
              <Textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)} disabled={saving}>Cancelar</Button>
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

      {detalhe && (
        <ClienteDetalheDialog
          cliente={detalhe}
          onClose={() => setDetalhe(null)}
          onEdit={() => { const c = detalhe; setDetalhe(null); abrirEdicao(c); }}
        />
      )}
    </div>
  );
}

function ClienteDetalheDialog({
  cliente, onClose, onEdit,
}: { cliente: Cliente; onClose: () => void; onEdit: () => void }) {
  const [vendas, setVendas] = useState<VendaCli[]>([]);
  const [pagamentos, setPagamentos] = useState<PagCli[]>([]);
  const [cupons, setCupons] = useState<{ id: string; created_at: string; conteudo: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [vRes, pRes, cRes] = await Promise.all([
        supabase
          .from("vendas")
          .select("id,data_venda,total,forma_pagamento,status, itens_venda(produto_nome,quantidade,preco_unitario,subtotal)")
          .eq("cliente_id", cliente.id)
          .order("data_venda", { ascending: false }),
        supabase
          .from("pagamentos_caderneta")
          .select("id,data_pagamento,valor,forma_pagamento,observacoes")
          .eq("cliente_id", cliente.id)
          .order("data_pagamento", { ascending: false }),
        supabase
          .from("cupons_enviados")
          .select("id,created_at,conteudo")
          .eq("cliente_id", cliente.id)
          .order("created_at", { ascending: false }),
      ]);
      setVendas(
        ((vRes.data ?? []) as any[]).map((v) => ({
          id: v.id, data_venda: v.data_venda, total: Number(v.total),
          forma_pagamento: v.forma_pagamento, status: v.status,
          itens: (v.itens_venda ?? []).map((i: any) => ({
            produto_nome: i.produto_nome, quantidade: Number(i.quantidade),
            preco_unitario: Number(i.preco_unitario), subtotal: Number(i.subtotal),
          })),
        })),
      );
      setPagamentos(((pRes.data ?? []) as any[]).map((p) => ({ ...p, valor: Number(p.valor) })));
      setCupons((cRes.data ?? []) as any[]);
      setLoading(false);
    })();
  }, [cliente.id]);

  const exportarExtratoCadernetaPDF = () => {
    const rows: (string | number)[][] = [];
    const movs = [
      ...vendas
        .filter((v) => v.forma_pagamento === "caderneta")
        .map((v) => ({ data: v.data_venda, tipo: "Compra na caderneta", valor: v.total, sinal: 1, desc: v.itens.map((i) => `${i.quantidade}x ${i.produto_nome}`).join(", ") })),
      ...pagamentos.map((p) => ({ data: p.data_pagamento, tipo: `Pagamento (${formaPagamentoLabel[p.forma_pagamento] ?? p.forma_pagamento})`, valor: p.valor, sinal: -1, desc: p.observacoes ?? "" })),
    ].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    let saldo = 0;
    for (const m of movs) {
      saldo += m.sinal * m.valor;
      rows.push([
        fmtDate(m.data),
        m.tipo,
        m.desc,
        m.sinal > 0 ? brl(m.valor) : "—",
        m.sinal < 0 ? brl(m.valor) : "—",
        brl(saldo),
      ]);
    }
    downloadTablePDF({
      filename: `extrato-caderneta-${cliente.nome.replace(/\s+/g, "_")}.pdf`,
      title: `Extrato de Caderneta — ${cliente.nome}`,
      subtitle: `${STORE_NAME} • Gerado em ${new Date().toLocaleString("pt-BR")} • Saldo atual: ${brl(cliente.saldo_devedor)}`,
      headers: ["Data/Hora", "Movimento", "Detalhes", "Compra", "Pagamento", "Saldo"],
      rows: rows.length ? rows : [["—", "Sem movimentações", "", "", "", brl(0)]],
      footer: STORE_NAME,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="size-5" /> {cliente.nome}
          </DialogTitle>
          <DialogDescription>
            Cadastrado em {fmtDateOnly(cliente.created_at)}
            {cliente.saldo_devedor > 0 && (
              <> • <span className="text-destructive font-medium">Devendo {brl(cliente.saldo_devedor)}</span></>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="dados">
          <TabsList className="w-full">
            <TabsTrigger value="dados" className="flex-1">Dados</TabsTrigger>
            <TabsTrigger value="historico" className="flex-1">
              Histórico ({vendas.length})
            </TabsTrigger>
            <TabsTrigger value="caderneta" className="flex-1">Caderneta</TabsTrigger>
            <TabsTrigger value="cupons" className="flex-1">Cupons ({cupons.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-3">
            <DadosLinha label="Documento" value={cliente.documento} />
            <DadosLinha label="Telefone" value={cliente.telefone} />
            <DadosLinha label="E-mail" value={cliente.email} />
            <DadosLinha label="Endereço" value={cliente.endereco} />
            <DadosLinha label="Instagram" value={cliente.instagram} />
            <DadosLinha label="Facebook" value={cliente.facebook} />
            <DadosLinha label="Limite caderneta" value={brl(cliente.limite_caderneta)} />
            <DadosLinha label="Saldo devedor" value={brl(cliente.saldo_devedor)} />
            {cliente.observacao_relacionamento && (
              <div className="p-3 rounded-md bg-accent/30 border">
                <div className="text-xs font-medium uppercase text-muted-foreground mb-1 flex items-center gap-1">
                  <Heart className="size-3" /> Companheirismo
                </div>
                <div className="text-sm">{cliente.observacao_relacionamento}</div>
              </div>
            )}
            {cliente.observacoes && (
              <div className="p-3 rounded-md bg-muted">
                <div className="text-xs font-medium uppercase text-muted-foreground mb-1">Observações</div>
                <div className="text-sm whitespace-pre-wrap">{cliente.observacoes}</div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={onEdit} variant="outline">
                <Pencil className="size-4 mr-2" /> Editar dados
              </Button>
              {cliente.telefone && (
                <Button
                  variant="outline"
                  onClick={() => abrirWhatsApp(cliente.telefone, `Olá ${cliente.nome.split(" ")[0]}!`)}
                >
                  <MessageCircle className="size-4 mr-2" /> WhatsApp
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="historico">
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">Carregando...</div>
            ) : vendas.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Nenhuma compra registrada.</div>
            ) : (
              <div className="space-y-3">
                {vendas.map((v) => (
                  <Card key={v.id}>
                    <CardContent className="p-3">
                      <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                        <div className="text-sm">
                          <strong>{fmtDate(v.data_venda)}</strong>
                          <Badge variant="outline" className="ml-2">
                            {formaPagamentoLabel[v.forma_pagamento] ?? v.forma_pagamento}
                          </Badge>
                          {v.status === "pendente" && (
                            <Badge variant="destructive" className="ml-1">Pendente</Badge>
                          )}
                        </div>
                        <div className="font-bold text-primary">{brl(v.total)}</div>
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-0.5">
                        {v.itens.map((i, ix) => (
                          <li key={ix}>
                            {i.quantidade}x {i.produto_nome} — {brl(i.subtotal)}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="caderneta" className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="text-sm">
                Saldo atual:{" "}
                <strong className={cliente.saldo_devedor > 0 ? "text-destructive" : "text-success"}>
                  {brl(cliente.saldo_devedor)}
                </strong>
              </div>
              <Button onClick={exportarExtratoCadernetaPDF} variant="outline" size="sm">
                <FileText className="size-4 mr-2" /> Extrato em PDF
              </Button>
            </div>
            {pagamentos.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Sem pagamentos registrados.</div>
            ) : (
              <div className="space-y-2">
                {pagamentos.map((p) => (
                  <div key={p.id} className="flex justify-between items-center border rounded-md p-2 text-sm">
                    <div>
                      <div className="font-medium">{fmtDate(p.data_pagamento)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formaPagamentoLabel[p.forma_pagamento] ?? p.forma_pagamento}
                        {p.observacoes && ` — ${p.observacoes}`}
                      </div>
                    </div>
                    <div className="font-bold text-success">−{brl(p.valor)}</div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cupons">
            {cupons.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Nenhum cupom enviado ainda.</div>
            ) : (
              <div className="space-y-2">
                {cupons.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="p-3 space-y-1">
                      <div className="text-xs text-muted-foreground">{fmtDate(c.created_at)}</div>
                      <pre className="text-xs whitespace-pre-wrap font-sans">{c.conteudo}</pre>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function DadosLinha({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value || "—"}</span>
    </div>
  );
}
