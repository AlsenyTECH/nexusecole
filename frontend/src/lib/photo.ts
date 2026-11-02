import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiBlob } from "./api";

/** Photo d'un élève (requête authentifiée → adresse locale affichable dans <img>). */
export function usePhoto(eleve: number | null | undefined, presente = true) {
  const { data: blob } = useQuery({
    queryKey: ["photo", eleve],
    enabled: !!eleve && presente,
    staleTime: 5 * 60_000,
    queryFn: () => apiBlob(`/api/eleves/${eleve}/photo`),
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** Réduit une photo (appareil du téléphone) en JPEG carré de 360 px : ~30 Ko, envoyé en base64. */
export function reduirePhoto(fichier: File, cote = 360): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = cote;
      const taille = Math.min(img.width, img.height);
      c.getContext("2d")!.drawImage(img, (img.width - taille) / 2, (img.height - taille) / 2, taille, taille, 0, 0, cote, cote);
      URL.revokeObjectURL(img.src);
      resoudre(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => rejeter(new Error("Image illisible"));
    img.src = URL.createObjectURL(fichier);
  });
}
