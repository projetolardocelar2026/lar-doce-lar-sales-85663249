import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Carousel, CarouselApi, CarouselContent, CarouselItem,
} from "@/components/ui/carousel";

type Banner = { id: string; titulo: string; imagem_url: string; link_url: string | null };

export function BannerSlider() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [api, setApi] = useState<CarouselApi | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("banners")
        .select("id,titulo,imagem_url,link_url,inicio,fim,ativo")
        .eq("ativo", true)
        .order("ordem");
      const filtered = (data ?? []).filter((b: any) =>
        (!b.inicio || b.inicio <= today) && (!b.fim || b.fim >= today)
      );
      setBanners(filtered as Banner[]);
    })();
  }, []);

  useEffect(() => {
    if (!api || banners.length < 2) return;
    const id = setInterval(() => api.scrollNext(), 4500);
    return () => clearInterval(id);
  }, [api, banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 pt-4">
      <Carousel setApi={setApi} opts={{ loop: true }} className="rounded-2xl overflow-hidden border-2 border-primary/20 shadow-elevated">
        <CarouselContent className="ml-0">
          {banners.map((b) => {
            const inner = (
              <div className="aspect-[16/7] sm:aspect-[21/8] bg-muted relative">
                <img src={b.imagem_url} alt={b.titulo} className="w-full h-full object-cover" />
              </div>
            );
            return (
              <CarouselItem key={b.id} className="pl-0 basis-full">
                {b.link_url ? (
                  <a href={b.link_url} target="_blank" rel="noreferrer">{inner}</a>
                ) : inner}
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
