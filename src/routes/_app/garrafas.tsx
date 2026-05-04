import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { brl, fmtDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Recycle, Wallet } from "lucide-react";

export const Route = createFileRoute("/_app/garrafas")({ component: GarrafasPage });

type Cliente = { id: string; nome: string; saldo_credito: number };
type Retorno = { id: string; cliente_id: string; quantidade: number; valor_unitario: number; valor_credito: number; observacoes: string | null; created_at: string };

const VALOR_GARRAFA = 0.20;

function GarrafasPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [historico, setHistorico] = useState<Retorno[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [qtd, setQtd] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: cl }, { data: hist }] = await Promise.all([
      supabase.from("clientes").select("id,nome,saldo_credito").eq("ativo", true).order("nome"),
      supabase.from("garrafas_retornadas").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setClientes((cl as any) || []);
    setHistorico((hist as any) || []);
  };
  useEffect(() => { load(); }, []);

  const cliente = clientes.find((c) => c.id === clienteId);
  const credito = (parseInt(qtd) || 0) * VALOR_GARRAFA;

  const salvar = async () => {
    if (!clienteId) return toast.error("Selecione o cliente");
    const q = parseInt(qtd);
    if (!q || q <= 0) return toast.error("Informe a quantidade");
    setSaving(true);
    const { error } = await supabase.rpc("registrar_garrafas", {
      _cliente: clienteId, _qtd: q, _valor_unit: VALOR_GARRAFA, _obs: obs || undefined,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Crédito de ${brl(credito)} adicionado!`);
    setQtd(""); setObs(""); load();
  };

  return (
    <div>
      <PageHeader title="Garrafas Vazias — Cashback" description={`Cada garrafa em bom estado (com tampa) gera ${brl(VALOR_GARRAFA)} de crédito.`} />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Recycle className="h-5 w-5"/>Registrar retorno</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger><SelectValue placeholder="Selecione…"/></SelectTrigger>
                <SelectContent>
                  {clientes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome} {Number(c.saldo_credito) > 0 ? `— crédito ${brl(c.saldo_credito)}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {cliente && (
              <div className="rounded-md border bg-muted/40 p-2 text-xs flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3"/>Saldo de crédito atual</span>
                <strong>{brl(cliente.saldo_credito)}</strong>
              </div>
            )}
            <div>
              <Label>Quantidade de garrafas</Label>
              <Input type="number" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="Ex.: 5" />
              <p className="text-xs text-muted-foreground mt-1">Confira se cada garrafa está com tampa e em bom estado.</p>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            <div className="rounded-md bg-success/10 text-success p-3 text-center font-semibold">
              Crédito a gerar: {brl(credito)}
            </div>
            <Button onClick={salvar} disabled={saving} className="w-full">
              {saving ? "Salvando…" : "Confirmar retorno"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Últimos retornos</CardTitle></CardHeader>
          <CardContent>
            {historico.length === 0 ? <p className="text-sm text-muted-foreground">Sem registros.</p> : (
              <div className="space-y-1 max-h-[480px] overflow-y-auto">
                {historico.map(h => {
                  const cli = clientes.find((c) => c.id === h.cliente_id);
                  return (
                    <div key={h.id} className="flex items-center justify-between border-b py-2 text-sm">
                      <div>
                        <div className="font-medium">{cli?.nome || "Cliente"}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(h.created_at)} • {h.quantidade} un.</div>
                      </div>
                      <strong className="text-success">+{brl(h.valor_credito)}</strong>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
