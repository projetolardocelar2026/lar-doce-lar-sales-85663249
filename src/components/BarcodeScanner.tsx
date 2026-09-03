import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanBarcode } from "lucide-react";

export function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1100;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close().catch(() => {});
    }, 140);
  } catch {
    /* som é opcional */
  }
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDetected: (code: string) => void;
  title?: string;
};

export function BarcodeScanner({ open, onOpenChange, onDetected, title = "Bipar código de barras" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    let stream: MediaStream | null = null;
    let raf = 0;

    const finish = (code: string) => {
      if (stopped || !code) return;
      stopped = true;
      beep();
      onDetected(code.trim());
      onOpenChange(false);
    };

    (async () => {
      setErro(null);
      try {
        const NativeDetector = (window as any).BarcodeDetector;
        if (NativeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          const detector = new NativeDetector({
            formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "itf", "qr_code"],
          });
          const tick = async () => {
            if (stopped) return;
            try {
              const res = await detector.detect(videoRef.current!);
              if (res?.[0]?.rawValue) return finish(res[0].rawValue);
            } catch {
              /* frame inválido */
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          return;
        }

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current!,
          (result) => {
            if (result) finish(result.getText());
          },
        );
      } catch (e: any) {
        setErro(e?.message ?? "Não foi possível acessar a câmera. Digite o código manualmente.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5" /> {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-black aspect-video">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-destructive/80" />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <p className="text-xs text-muted-foreground">Aponte a câmera para o código de barras do produto.</p>
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              placeholder="Ou digite o código"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manual.trim()) {
                  beep();
                  onDetected(manual.trim());
                  setManual("");
                  onOpenChange(false);
                }
              }}
            />
            <Button
              type="button"
              onClick={() => {
                if (!manual.trim()) return;
                beep();
                onDetected(manual.trim());
                setManual("");
                onOpenChange(false);
              }}
            >
              Usar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
