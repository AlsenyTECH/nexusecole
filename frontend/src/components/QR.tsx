import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

/** QR code d'un texte (carte, ticket). */
export function QR({ texte, taille = 160, className }: { texte: string; taille?: number; className?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { QRCode.toDataURL(texte, { margin: 1, width: taille * 2, errorCorrectionLevel: "M" }).then(setSrc); }, [texte, taille]);
  return src ? <img src={src} alt="QR code" width={taille} height={taille} className={cn("bg-white", className)} /> : <span style={{ width: taille, height: taille }} className="inline-block" />;
}
