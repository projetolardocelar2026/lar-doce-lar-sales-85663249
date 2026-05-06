import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/_app/banners")({
  component: BannersPage,
});

type Banner = {
  id: string; titulo: string; imagem_url: string; link_url: string | null;
  ordem: number; ativo: boolean; inicio: string | null; fim: string | null;
};

const empty = { titulo: "", link_url: "", ordem: "0", ativo: true, inicio: "", fim: "" };

function BannersPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("banners").select("*").order("ordem");
    if (error) toast.error(error.message);
    setItems((data ?? []) as Banner[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function reset() {
    setForm({ ...empty }); setFile(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast.error("Máx 8MB");
    setFile(f); setPreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!form.titulo.trim()) return toast.error("Título obrigatório");
    if (!file) return toast.error("Envie a arte do banner");
    setSaving(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("banners").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("banners").getPublicUrl(path);
      const { error } = await supabase.from("banners").insert({
        titulo: form.titulo.trim(),
        imagem_url: pub.publicUrl,
        link_url: form.link_url.trim() || null,
        ordem: parseInt(form.ordem) || 0,
        ativo: form.ativo,
        inicio: form.inicio || null,
        fim: form.fim || null,
      });
      if (error) throw error;
      toast.success("Banner criado");
      setOpen(false); reset(); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function toggle(b: Banner) {
    await supabase.from("banners").update({ ativo: !b.ativo }).eq("id", b.id);
    load();
  }
  async function remove(b: Banner) {
    if (!confirm(`Remover banner "${b.titulo}"?`)) return;
    await supabase.from("banners").delete().eq("id", b.id);
    load();
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Banners" />
        <Card><CardContent className="p-8 text-center text-muted-foreground">Acesso restrito ao administrador.</CardContent></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Banners promocionais"
        description="Artes que rodam no topo da vitrine"
        actions={<Button variant="hero" onClick={() => { reset(); setOpen(true); }}><Plus className="h-4 w-4" /> Novo banner</Button>}
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhum banner cadastrado.
            </div>
          ) : (
            <div className="divide-y">
              {items.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3">
                  <img src={b.imagem_url} alt={b.titulo} className="h-16 w-28 object-cover rounded-lg border" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{b.titulo}</div>
                    <div className="text-xs text-muted-foreground">
                      Ordem {b.ordem}
                      {b.inicio && ` · de ${b.inicio}`}{b.fim && ` até ${b.fim}`}
                    </div>
                  </div>
                  <Switch checked={b.ativo} onCheckedChange={() => toggle(b)} />
                  <Button size="icon" variant="ghost" onClick={() => remove(b)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo banner</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="aspect-[16/7] w-full rounded-xl bg-muted border-2 border-primary/20 overflow-hidden flex items-center justify-center">
              {preview ? <img src={preview} className="w-full h-full object-cover" alt="" /> : <ImageIcon className="h-10 w-10 text-muted-foreground" />}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
            <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> {preview ? "Trocar arte" : "Enviar arte"}
            </Button>
            <div>
              <Label>Título *</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Oferta da Semana" />
            </div>
            <div>
              <Label>Link (opcional)</Label>
              <Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} />
              </div>
              <div>
                <Label>Início</Label>
                <Input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="date" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Ativo</span>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button variant="hero" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
