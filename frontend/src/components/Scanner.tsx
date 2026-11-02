import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, CameraOff, Keyboard } from "lucide-react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Detecteur = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detecteur } }

/**
 * Lecture d'une carte : caméra du téléphone (lecteur intégré du navigateur si disponible, sinon jsQR),
 * ou saisie du numéro imprimé sous le QR code. Une même carte n'est pas relue avant 3 secondes.
 */
export function Scanner({ onLecture, occupe = false }: { onLecture: (texte: string) => void; occupe?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState(false);
  const [erreur, setErreur] = useState("");
  const [saisie, setSaisie] = useState("");
  const dernier = useRef({ texte: "", le: 0 });
  const rappel = useRef(onLecture);
  rappel.current = onLecture;
  const pause = useRef(occupe);
  pause.current = occupe;

  useEffect(() => {
    if (!camera) return;
    let flux: MediaStream | null = null;
    let fini = false;
    const canvas = document.createElement("canvas");
    const detecteur = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;

    const lu = (texte: string) => {
      const maintenant = Date.now();
      if (pause.current || (texte === dernier.current.texte && maintenant - dernier.current.le < 3000)) return;
      dernier.current = { texte, le: maintenant };
      navigator.vibrate?.(60);
      rappel.current(texte);
    };
    const boucle = async () => {
      const v = video.current;
      if (fini || !v) return;
      if (v.readyState >= 2) {
        try {
          if (detecteur) {
            const codes = await detecteur.detect(v);
            if (codes[0]) lu(codes[0].rawValue);
          } else {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0);
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            if (code?.data) lu(code.data);
          }
        } catch { /* image suivante */ }
      }
      setTimeout(boucle, 250);
    };
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((f) => {
        flux = f;
        if (video.current) { video.current.srcObject = f; video.current.play(); }
        boucle();
      })
      .catch(() => { setErreur("Caméra indisponible : autorisez-la dans le navigateur, ou saisissez le numéro de la carte."); setCamera(false); });
    return () => { fini = true; flux?.getTracks().forEach((t) => t.stop()); };
  }, [camera]);

  function valider(e: FormEvent) {
    e.preventDefault();
    if (saisie.trim()) { onLecture(saisie.trim()); setSaisie(""); }
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl bg-[#0b1512]">
        {camera ? (
          <>
            <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
            <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/70" />
          </>
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
            <Camera className="size-10" />
            <p className="text-sm">Présentez la carte (ou la carte virtuelle sur le téléphone du parent) devant la caméra.</p>
            <Button onClick={() => { setErreur(""); setCamera(true); }}><Camera /> Activer la caméra</Button>
          </div>
        )}
      </div>
      {camera ? <Button variant="secondary" size="sm" onClick={() => setCamera(false)}><CameraOff /> Arrêter la caméra</Button> : null}
      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
      <form onSubmit={valider} className="flex gap-2">
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={saisie} onChange={(e) => setSaisie(e.target.value)} inputMode="numeric" placeholder="N° de carte (8 chiffres)" className="pl-9" aria-label="Numéro de carte" />
        </div>
        <Button type="submit" variant="secondary" disabled={!saisie.trim()}>Valider</Button>
      </form>
    </div>
  );
}
