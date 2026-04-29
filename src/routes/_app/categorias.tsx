import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";

export const Route = createFileRoute("/_app/categorias")({
  component: CategoriasPage,
});

type Categoria = {
  id: string;
  nome: string;
  icone: string | null;
  ordem: number;
  ativa: boolean;
};

function CategoriasPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Categoria | null>(null);
  const [nome, setNome] = useState("");
  const [icone, setIcone] = useState("package");
  const [ordem, setOrdem] = useState(0);
  const [ativa, setAtiva] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("categorias")
      .select("*")
      .order("ordem")
      .order("nome");
    if (error) toast.error(error.message);
    setItems(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function reset() {
    setEditing(null);
    setNome("");
    setIcone("package");
    setOrdem(0);
    setAtiva(true);
  }
  function openNew() { reset(); setOpen(true); }
  function openEdit(c: Categoria) {
    setEditing(c);
    setNome(c.nome);
    setIcone(c.icone ?? "package");
    setOrdem(c.ordem);
    setAtiva(c.ativa);
    setOpen(true);
  }

  async function save() {
    if (!nome.trim()) return toast.error("Informe o nome");
    const payload = { nome: nome.trim(), icone, ordem, ativa };
    const { error } = editing
      ? await supabase.from("categorias").update(payload).eq("id", editing.id)
      : await supabase.from("categorias").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Categoria atualizada" : "Categoria criada");
    setOpen(false);
    reset();
    load();
  }

  async function remove(c: Categoria) {
    if (!confirm(`Excluir categoria "${c.nome}"?`)) return;
    const { error } = await supabase.from("categorias").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Categoria excluída");
    load();
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Categorias" />
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Acesso restrito ao administrador.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Categorias"
        description="Organize os produtos por seção"
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew} variant="hero"><Plus className="h-4 w-4" /> Nova categoria</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Limpeza" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Ícone (lucide)</Label>
                    <Input value={icone} onChange={(e) => setIcone(e.target.value)} placeholder="package" />
                  </div>
                  <div>
                    <Label>Ordem</Label>
                    <Input type="number" value={ordem} onChange={(e) => setOrdem(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-medium text-sm">Ativa</div>
                    <div className="text-xs text-muted-foreground">Aparece para clientes na vitrine</div>
                  </div>
                  <Switch checked={ativa} onCheckedChange={setAtiva} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} variant="hero">Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Tags className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhuma categoria cadastrada.
            </div>
          ) : (
            <div className="divide-y">
              {items.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
                    <Tags className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      Ordem {c.ordem} · {c.ativa ? "Ativa" : "Inativa"} · {c.icone ?? "—"}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(c)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
