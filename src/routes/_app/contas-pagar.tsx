import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { brl, fmtDateOnly } from "@/lib/format";
import { Plus, Pencil, Trash2, Check, AlertTriangle, Calendar, Receipt } from "lucide-react";

export const Route = createFileRoute("/_app/contas-pagar")({
  component: ContasPagarPage,
});

type Conta = {
  id: string; descricao: string; fornecedor: string | null; categoria: string | null;
  valor: number; vencimento: string; status: string;
  data_pagamento: string | null; forma_pagamento: string | null;
  observacoes: string | null; recorrente: boolean;
};

type FormState = Omit<Conta, "id" | "data_pagamento" | "status"> & { status: string };

const empty: FormState = {
  descricao: "", fornecedor: "", categoria: "", valor: 0,
  vencimento: new Date().toISOString().slice(0, 10),
  status: "pendente", forma_pagamento: "", observacoes: "", recorrente: false,
};

const CATEGORIAS_DESPESA = [
  "Fornecedores",
  "Aluguel / Despesas Fixas",
  "Manutenção",
  "Avarias / Quebras",
  "Outros",
] as const;

const STATUS_CFG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pendente: { label: "Pendente", variant: "secondary" },
  paga: { label: "Paga", variant: "default" },
  atrasada: { label: "Atrasada", variant: "destructive" },
  cancelada: { label: "Cancelada", variant: "outline" },
};

function ContasPagarPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Conta | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contas_pagar").select("*").order("vencimento", { ascending: true });
    if (error) toast.error(error.message);
    else setContas((data ?? []) as Conta[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const hoje = new Date().toISOString().slice(0, 10);
  const filtradas = useMemo(() => {
    return contas.map((c) => {
      const status = c.status === "pendente" && c.vencimento < hoje ? "atrasada" : c.status;
      return { ...c, status };
    }).filter((c) => filtro === "todos" || c.status === filtro);
  }, [contas, filtro, hoje]);

  const totais = useMemo(() => {
    const pendentes = contas.filter((c) => c.status === "pendente" || c.status === "atrasada");
    const atrasadas = pendentes.filter((c) => c.vencimento < hoje);
    const proximas = pendentes.filter((c) => c.vencimento >= hoje && c.vencimento <= addDays(hoje, 7));
    return {
      totalPendente: pendentes.reduce((s, c) => s + Number(c.valor), 0),
      qtdAtrasadas: atrasadas.length,
      valorAtrasadas: atrasadas.reduce((s, c) => s + Number(c.valor), 0),
      qtdProximas: proximas.length,
    };
  }, [contas, hoje]);

  const novo = () => { setEditing(null); setForm(empty); setOpen(true); };
  const editar = (c: Conta) => {
    setEditing(c);
    setForm({
      descricao: c.descricao, fornecedor: c.fornecedor ?? "", categoria: c.categoria ?? "",
      valor: Number(c.valor), vencimento: c.vencimento, status: c.status,
      forma_pagamento: c.forma_pagamento ?? "", observacoes: c.observacoes ?? "",
      recorrente: c.recorrente,
    });
    setOpen(true);
  };

  const salvar = async () => {
    if (!form.descricao.trim()) { toast.error("Informe a descrição"); return; }
    if (!form.valor || form.valor <= 0) { toast.error("Valor deve ser maior que zero"); return; }
    setSaving(true);
    const payload = {
      descricao: form.descricao.trim(),
      fornecedor: form.fornecedor?.trim() || null,
      categoria: form.categoria?.trim() || null,
      valor: form.valor,
      vencimento: form.vencimento,
      status: form.status as any,
      forma_pagamento: form.forma_pagamento?.trim() || null,
      observacoes: form.observacoes?.trim() || null,
      recorrente: form.recorrente,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("contas_pagar").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("contas_pagar").insert(payload));
    }
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Salvo"); setOpen(false); carregar(); }
  };

  const marcarPaga = async (c: Conta) => {
    const { error } = await supabase
      .from("contas_pagar")
      .update({ status: "paga", data_pagamento: new Date().toISOString() })
      .eq("id", c.id);
    if (error) toast.error(error.message);
    else { toast.success("Conta paga e lançada no fluxo"); carregar(); }
  };

  const remover = async (c: Conta) => {
    if (!confirm(`Remover "${c.descricao}"?`)) return;
    const { error } = await supabase.from("contas_pagar").delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else { toast.success("Removida"); carregar(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas a Pagar"
        description="Despesas, fornecedores e alertas de vencimento"
        actions={<Button onClick={novo}><Plus className="size-4 mr-2" /> Nova conta</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total pendente</div>
            <div className="text-2xl font-bold text-primary">{brl(totais.totalPendente)}</div>
          </CardContent>
        </Card>
        <Card className={totais.qtdAtrasadas > 0 ? "border-destructive" : ""}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              {totais.qtdAtrasadas > 0 && <AlertTriangle className="size-3 text-destructive" />}
              Atrasadas
            </div>
            <div className="text-2xl font-bold text-destructive">{totais.qtdAtrasadas}</div>
            <div className="text-xs">{brl(totais.valorAtrasadas)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="size-3" /> Próximos 7 dias
            </div>
            <div className="text-2xl font-bold">{totais.qtdProximas}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">{filtradas.length} conta(s)</CardTitle>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="atrasada">Atrasadas</SelectItem>
              <SelectItem value="paga">Pagas</SelectItem>
              <SelectItem value="cancelada">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> :
            filtradas.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Receipt className="size-8 mx-auto mb-2 opacity-50" />
                Nenhuma conta cadastrada.
              </div>
            ) : (
              <div className="grid gap-2">
                {filtradas.map((c) => {
                  const cfg = STATUS_CFG[c.status] ?? { label: c.status, variant: "outline" as const };
                  const venc = new Date(c.vencimento);
                  const diasParaVenc = Math.ceil((venc.getTime() - new Date(hoje).getTime()) / 86400000);
                  return (
                    <div key={c.id} className="border rounded-lg p-3 flex flex-col md:flex-row gap-2 md:items-center">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold truncate">{c.descricao}</span>
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          {c.categoria && <Badge variant="outline">{c.categoria}</Badge>}
                          {c.recorrente && <Badge variant="secondary">Recorrente</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {c.fornecedor && <>{c.fornecedor} • </>}
                          Vence: {fmtDateOnly(c.vencimento)}
                          {c.status !== "paga" && c.status !== "cancelada" && (
                            <> ({diasParaVenc < 0 ? `${-diasParaVenc}d em atraso` : diasParaVenc === 0 ? "hoje" : `em ${diasParaVenc}d`})</>
                          )}
                        </div>
                      </div>
                      <div className="text-lg font-bold">{brl(c.valor)}</div>
                      <div className="flex gap-1.5">
                        {c.status !== "paga" && c.status !== "cancelada" && (
                          <Button size="sm" onClick={() => marcarPaga(c)}>
                            <Check className="size-3.5 mr-1" /> Pagar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => editar(c)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="outline"
                          className="text-destructive" onClick={() => remover(c)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar conta" : "Nova conta a pagar"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2"><Label>Descrição *</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div><Label>Fornecedor</Label>
              <Input value={form.fornecedor ?? ""} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
            </div>
            <div><Label>Categoria</Label>
              <Select value={form.categoria || undefined} onValueChange={(categoria) => setForm({ ...form, categoria })}>
                <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_DESPESA.map((categoria) => (
                    <SelectItem key={categoria} value={categoria}>{categoria}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Valor *</Label>
              <Input type="number" min={0} step="0.01" value={form.valor}
                onChange={(e) => setForm({ ...form, valor: Number(e.target.value) || 0 })} />
            </div>
            <div><Label>Vencimento *</Label>
              <Input type="date" value={form.vencimento}
                onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
            </div>
            <div><Label>Forma de pagamento</Label>
              <Input placeholder="PIX, Boleto..." value={form.forma_pagamento ?? ""}
                onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="rec" checked={form.recorrente}
                onChange={(e) => setForm({ ...form, recorrente: e.target.checked })} />
              <Label htmlFor="rec" className="cursor-pointer">Recorrente (mensal)</Label>
            </div>
            <div className="md:col-span-2"><Label>Observações</Label>
              <Textarea rows={2} value={form.observacoes ?? ""}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
