import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { brl, fmtDate, STORE_NAME } from "@/lib/format";
import { downloadTablePDF } from "@/lib/exporters";
import { abrirWhatsApp } from "@/lib/whatsapp";
import {
  FileText, Plus, Trash2, Search, Check, MessageCircle, ArrowRight, X, ChevronsUpDown, UserRound,
} from "lucide-react";

export const Route = createFileRoute("/_app/orcamentos")({
  component: OrcamentosPage,
});

type Cliente = { id: string; nome: string; telefone: string | null };
type Produto = { id: string; nome: string; preco: number; estoque: number; categoria_id: string | null };
type Item = { produto_id: string | null; produto_nome: string; categoria_id: string | null; quantidade: number; preco_unitario: number };
type Orc = {
  id: string; numero: number; cliente_nome: string | null; cliente_id: string | null;
  total: number; status: string; validade: string | null; data_orcamento: string;
  observacoes: string | null; venda_convertida_id: string | null;
};

const STATUS_CFG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  enviado: { label: "Enviado", variant: "default" },
  convertido: { label: "Convertido em venda", variant: "outline" },
  cancelado: { label: "Cancelado", variant: "destructive" },
  expirado: { label: "Expirado", variant: "destructive" },
};

function OrcamentosPage() {
  const { user } = useAuth();
  const [orcs, setOrcs] = useState<Orc[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    clienteId: string; clienteNome: string; validade: string;
    observacoes: string; itens: Item[]; busca: string;
  }>({ clienteId: "", clienteNome: "", validade: "", observacoes: "", itens: [], busca: "" });
  const [detalhe, setDetalhe] = useState<Orc | null>(null);
  const [clienteOpen, setClienteOpen] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const [{ data: o }, { data: cl }, { data: p }] = await Promise.all([
      supabase.from("orcamentos").select("*").order("data_orcamento", { ascending: false }),
      supabase.from("clientes").select("id,nome,telefone").eq("ativo", true).order("nome"),
      supabase.from("produtos").select("id,nome,preco,estoque,categoria_id").eq("ativo", true).order("nome"),
    ]);
    setOrcs((o ?? []) as Orc[]);
    setClientes((cl ?? []) as Cliente[]);
    setProdutos((p ?? []) as Produto[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const filtrados = useMemo(() => {
    return orcs.filter((o) => {
      if (statusFilter !== "todos" && o.status !== statusFilter) return false;
      if (busca) {
        const q = busca.toLowerCase();
        if (!(o.cliente_nome ?? "").toLowerCase().includes(q) && !String(o.numero).includes(q)) return false;
      }
      return true;
    });
  }, [orcs, busca, statusFilter]);

  const totalForm = form.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
  const produtosFiltrados = useMemo(() => {
    const q = form.busca.trim().toLowerCase();
    if (!q) return produtos.slice(0, 30);
    return produtos.filter((p) => p.nome.toLowerCase().includes(q)).slice(0, 30);
  }, [produtos, form.busca]);

  const novo = () => {
    setForm({ clienteId: "", clienteNome: "", validade: "", observacoes: "", itens: [], busca: "" });
    setOpen(true);
  };

  const addItem = (p: Produto) => {
    setForm((f) => {
      const ex = f.itens.find((i) => i.produto_id === p.id);
      if (ex) {
        return { ...f, itens: f.itens.map((i) => i.produto_id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i) };
      }
      return {
        ...f,
        itens: [...f.itens, {
          produto_id: p.id, produto_nome: p.nome, categoria_id: p.categoria_id,
          quantidade: 1, preco_unitario: Number(p.preco),
        }],
      };
    });
  };
  const updateItem = (idx: number, patch: Partial<Item>) =>
    setForm((f) => ({ ...f, itens: f.itens.map((i, k) => (k === idx ? { ...i, ...patch } : i)) }));
  const removeItem = (idx: number) =>
    setForm((f) => ({ ...f, itens: f.itens.filter((_, k) => k !== idx) }));

  const salvar = async () => {
    if (form.itens.length === 0) { toast.error("Adicione ao menos um item"); return; }
    setSaving(true);
    try {
      const cliente = clientes.find((c) => c.id === form.clienteId);
      const { data: orc, error } = await supabase
        .from("orcamentos")
        .insert({
          cliente_id: form.clienteId || null,
          cliente_nome: cliente?.nome ?? form.clienteNome.trim() ?? null,
          atendente_id: user?.id ?? null,
          total: totalForm,
          validade: form.validade || null,
          observacoes: form.observacoes || null,
          status: "enviado",
        })
        .select("id")
        .single();
      if (error || !orc) throw error;
      const itens = form.itens.map((i) => ({
        orcamento_id: orc.id,
        produto_id: i.produto_id,
        produto_nome: i.produto_nome,
        categoria_id: i.categoria_id,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        subtotal: i.quantidade * i.preco_unitario,
      }));
      const { error: iErr } = await supabase.from("itens_orcamento").insert(itens);
      if (iErr) throw iErr;
      toast.success("Orçamento criado");
      setOpen(false);
      carregar();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const cancelar = async (o: Orc) => {
    const { error } = await supabase.from("orcamentos").update({ status: "cancelado" }).eq("id", o.id);
    if (error) toast.error(error.message);
    else { toast.success("Cancelado"); carregar(); }
  };

  const converterEmVenda = async (o: Orc) => {
    if (o.status === "convertido") return;
    if (!confirm("Converter este orçamento em venda? O estoque será baixado.")) return;
    try {
      const { data: itens, error: ie } = await supabase
        .from("itens_orcamento").select("*").eq("orcamento_id", o.id);
      if (ie) throw ie;
      const { data: venda, error: ve } = await supabase
        .from("vendas")
        .insert({
          cliente_id: o.cliente_id,
          atendente_id: user?.id ?? null,
          forma_pagamento: "dinheiro",
          total: o.total,
          status: "paga",
          observacoes: `Convertido do orçamento #${o.numero}`,
          data_venda: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (ve || !venda) throw ve;
      const itensVenda = (itens ?? []).map((i: any) => ({
        venda_id: venda.id,
        produto_id: i.produto_id,
        produto_nome: i.produto_nome,
        categoria_id: i.categoria_id,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        subtotal: i.subtotal,
      }));
      const { error: iv } = await supabase.from("itens_venda").insert(itensVenda);
      if (iv) throw iv;
      await supabase.from("orcamentos")
        .update({ status: "convertido", venda_convertida_id: venda.id })
        .eq("id", o.id);
      toast.success("Convertido em venda!");
      carregar();
    } catch (e: any) {
      toast.error(e.message || "Erro ao converter");
    }
  };

  const exportarOrcPDF = async (o: Orc) => {
    const { data: itens } = await supabase
      .from("itens_orcamento").select("*").eq("orcamento_id", o.id).order("created_at");
    downloadTablePDF({
      filename: `orcamento-${o.numero}.pdf`,
      title: `${STORE_NAME}`,
      subtitle: `Orçamento #${o.numero} • ${o.cliente_nome ?? "Sem cliente"} • ${fmtDate(o.data_orcamento)}${o.validade ? ` • Válido até ${new Date(o.validade).toLocaleDateString("pt-BR")}` : ""}`,
      headers: ["Item", "Qtd", "Preço", "Subtotal"],
      rows: [
        ...((itens ?? []) as any[]).map((i) => [
          i.produto_nome, String(i.quantidade), brl(i.preco_unitario), brl(i.subtotal),
        ]),
        ["", "", "TOTAL", brl(o.total)],
      ],
      footer: `${STORE_NAME} • Orçamento #${o.numero}`,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orçamentos"
        description="Crie propostas sem mexer no estoque ou no caixa"
        actions={<Button onClick={novo}><Plus className="size-4 mr-2" /> Novo orçamento</Button>}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por cliente ou nº..." className="pl-9"
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                {Object.entries(STATUS_CFG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> :
            filtrados.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                Nenhum orçamento. Clique em "Novo orçamento" para começar.
              </div>
            ) : (
              <div className="grid gap-3">
                {filtrados.map((o) => {
                  const cfg = STATUS_CFG[o.status] ?? { label: o.status, variant: "outline" as const };
                  const cliente = clientes.find((c) => c.id === o.cliente_id);
                  return (
                    <div key={o.id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-primary">#{o.numero}</span>
                          <span className="font-medium truncate">{o.cliente_nome ?? "Sem cliente"}</span>
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {fmtDate(o.data_orcamento)}{o.validade && ` • Validade: ${new Date(o.validade).toLocaleDateString("pt-BR")}`}
                        </div>
                      </div>
                      <div className="text-lg font-bold">{brl(o.total)}</div>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setDetalhe(o)}>Ver</Button>
                        <Button size="sm" variant="outline" onClick={() => exportarOrcPDF(o)}>
                          <FileText className="size-3.5 mr-1" />PDF
                        </Button>
                        {cliente?.telefone && (
                          <Button size="sm" variant="outline"
                            onClick={() => abrirWhatsApp(cliente.telefone, `Olá ${cliente.nome.split(" ")[0]}! Segue o orçamento #${o.numero} no valor de ${brl(o.total)}.`)}>
                            <MessageCircle className="size-3.5" />
                          </Button>
                        )}
                        {o.status !== "convertido" && o.status !== "cancelado" && (
                          <>
                            <Button size="sm" onClick={() => converterEmVenda(o)}>
                              <ArrowRight className="size-3.5 mr-1" />Converter
                            </Button>
                            <Button size="sm" variant="outline"
                              className="text-destructive" onClick={() => cancelar(o)}>
                              <X className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo orçamento</DialogTitle>
            <DialogDescription>Não baixa estoque nem entra no caixa até ser convertido.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label>Cliente</Label>
              <Popover open={clienteOpen} onOpenChange={setClienteOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={clienteOpen}
                    className="mt-1 w-full justify-between font-normal"
                  >
                    <span className="flex min-w-0 items-center gap-2 truncate">
                      <UserRound className="size-4 shrink-0 text-muted-foreground" />
                      {form.clienteId
                        ? clientes.find((c) => c.id === form.clienteId)?.nome
                        : "Buscar cliente (opcional)"}
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Digite o nome do cliente..." />
                    <CommandList>
                      <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="Sem cliente"
                          onSelect={() => {
                            setForm((f) => ({ ...f, clienteId: "" }));
                            setClienteOpen(false);
                          }}
                        >
                          <Check className={`size-4 ${!form.clienteId ? "opacity-100" : "opacity-0"}`} />
                          Sem cliente
                        </CommandItem>
                        {clientes.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.nome}
                            keywords={c.telefone ? [c.telefone] : undefined}
                            onSelect={() => {
                              setForm((f) => ({ ...f, clienteId: c.id, clienteNome: "" }));
                              setClienteOpen(false);
                            }}
                          >
                            <Check className={`size-4 ${form.clienteId === c.id ? "opacity-100" : "opacity-0"}`} />
                            <span className="truncate">{c.nome}</span>
                            {c.telefone && <span className="ml-auto text-xs text-muted-foreground">{c.telefone}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Validade</Label>
              <Input type="date" value={form.validade} onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))} />
            </div>
            {!form.clienteId && (
              <div className="md:col-span-3">
                <Label>Cliente avulso (nome)</Label>
                <Input value={form.clienteNome} onChange={(e) => setForm((f) => ({ ...f, clienteNome: e.target.value }))} />
              </div>
            )}
          </div>

          <div className="border-t pt-3 mt-2">
            <Label>Adicionar produtos</Label>
            <Input placeholder="Buscar produto..." value={form.busca}
              onChange={(e) => setForm((f) => ({ ...f, busca: e.target.value }))} className="mt-1" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 max-h-40 overflow-y-auto">
              {produtosFiltrados.map((p) => (
                <button key={p.id} onClick={() => addItem(p)}
                  className="text-left border rounded-md p-2 text-xs hover:border-primary">
                  <div className="font-medium line-clamp-1">{p.nome}</div>
                  <div className="text-muted-foreground">{brl(p.preco)} • Est: {p.estoque}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-3">
            <Label>Itens do orçamento</Label>
            {form.itens.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">Nenhum item.</div>
            ) : (
              <div className="space-y-2 mt-1">
                {form.itens.map((i, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center border rounded-md p-2">
                    <div className="col-span-5 text-sm font-medium truncate">{i.produto_nome}</div>
                    <Input className="col-span-2" type="number" min={0.01} step="0.01"
                      value={i.quantidade} onChange={(e) => updateItem(idx, { quantidade: Number(e.target.value) || 0 })} />
                    <Input className="col-span-2" type="number" min={0} step="0.01"
                      value={i.preco_unitario} onChange={(e) => updateItem(idx, { preco_unitario: Number(e.target.value) || 0 })} />
                    <div className="col-span-2 text-sm text-right font-semibold">{brl(i.quantidade * i.preco_unitario)}</div>
                    <button onClick={() => removeItem(idx)} className="col-span-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-xl font-bold text-primary">{brl(totalForm)}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes}
              onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>
              <Check className="size-4 mr-2" />{saving ? "Salvando..." : "Criar orçamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detalhe && <OrcDetalhe orc={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}

function OrcDetalhe({ orc, onClose }: { orc: Orc; onClose: () => void }) {
  const [itens, setItens] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("itens_orcamento").select("*").eq("orcamento_id", orc.id).order("created_at")
      .then(({ data }) => setItens(data ?? []));
  }, [orc.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Orçamento #{orc.numero}</DialogTitle>
          <DialogDescription>
            {orc.cliente_nome ?? "Sem cliente"} • {fmtDate(orc.data_orcamento)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {itens.map((i) => (
            <div key={i.id} className="flex justify-between text-sm border-b pb-1">
              <span>{i.quantidade}x {i.produto_nome}</span>
              <span className="font-semibold">{brl(i.subtotal)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2">
            <span>Total</span>
            <span className="font-bold text-primary text-xl">{brl(orc.total)}</span>
          </div>
          {orc.observacoes && (
            <div className="bg-muted p-2 rounded text-sm">{orc.observacoes}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
