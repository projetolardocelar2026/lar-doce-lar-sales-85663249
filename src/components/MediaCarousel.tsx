import { useState } from "react";
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext,
} from "@/components/ui/carousel";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Play, Package, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type Midia = { id: string; url: string; tipo: "foto" | "arte" | "video" };

export function MediaCarousel({
  midias, fallback, alt, rounded = "rounded-2xl",
}: { midias: Midia[]; fallback?: string | null; alt: string; rounded?: string }) {
  const [videoOpen, setVideoOpen] = useState<string | null>(null);

  const list: Midia[] = midias.length
    ? midias
    : fallback
      ? [{ id: "fallback", url: fallback, tipo: "foto" }]
      : [];

  if (list.length === 0) {
    return (
      <div className={`aspect-square w-full bg-muted flex items-center justify-center ${rounded} overflow-hidden`}>
        <Package className="h-12 w-12 text-primary/30" />
      </div>
    );
  }

  return (
    <>
      <Carousel className={`relative w-full ${rounded} overflow-hidden border-2 border-primary/20`}>
        <CarouselContent className="ml-0">
          {list.map((m) => (
            <CarouselItem key={m.id} className="pl-0 basis-full">
              <div className="aspect-square w-full bg-muted relative">
                {m.tipo === "video" ? (
                  <button
                    type="button"
                    onClick={() => setVideoOpen(m.url)}
                    className="group relative w-full h-full"
                    aria-label="Reproduzir vídeo"
                  >
                    <video src={m.url} className="w-full h-full object-cover" muted preload="metadata" playsInline />
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 flex items-center justify-center transition">
                      <div className="h-14 w-14 rounded-full bg-white/95 flex items-center justify-center shadow-elevated">
                        <Play className="h-6 w-6 text-primary fill-primary ml-0.5" />
                      </div>
                    </div>
                    <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground">Vídeo</Badge>
                  </button>
                ) : (
                  <>
                    <img src={m.url} alt={alt} className="w-full h-full object-cover" loading="lazy" />
                    {m.tipo === "arte" && (
                      <Badge className="absolute top-2 left-2 bg-accent text-accent-foreground">Arte</Badge>
                    )}
                  </>
                )}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {list.length > 1 && (
          <>
            <CarouselPrevious className="left-2 h-8 w-8 bg-white/90 border-primary/30" />
            <CarouselNext className="right-2 h-8 w-8 bg-white/90 border-primary/30" />
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-semibold">
              {list.length} mídias
            </div>
          </>
        )}
      </Carousel>

      <Dialog open={!!videoOpen} onOpenChange={(v) => !v && setVideoOpen(null)}>
        <DialogContent className="max-w-md p-0 bg-black border-0 overflow-hidden rounded-2xl">
          {videoOpen && (
            <video
              src={videoOpen}
              className="w-full aspect-[9/16] object-contain bg-black"
              controls autoPlay playsInline
            />
          )}
        </DialogContent>
      </Dialog>

      {!list.length && fallback === null && (
        <div className="hidden"><ImageOff /></div>
      )}
    </>
  );
}
