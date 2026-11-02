import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, CreditCard, Printer } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Choix, EnTete, Liste, Pastille } from "@/components/design";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { api, messageErreur } from "@/lib/api";
import { reduirePhoto, usePhoto } from "@/lib/photo";
import { useAnneeActive, useClasses, useRafraichir } from "@/lib/requetes";
import { ouvrirDocument } from "@/lib/utils";

export type CarteImprimable = {
  eleve: { id: number; prenom: string; nom: string; matricule: string; sexe: string; date_naissance: string | null; classe: string; a_photo: boolean };
  carte: { numero: string; version: number; active: boolean; qr: string };
};

/** Cartes scolaires par classe : photos (prises au téléphone) et impression. */
export function Cartes() {
  const { annee } = useAnneeActive();
  const { data: classes = [] } = useClasses(annee?.id);
  const [classe, setClasse] = useState("");
  useEffect(() => { if (!classe && classes.length) setClasse(String(classes[0].id)); }, [classes, classe]);
  const { data } = useQuery({
    queryKey: ["cartes", classe], enabled: !!classe,
    queryFn: () => api<{ cartes: CarteImprimable[] }>(`/api/cartes?classe=${classe}`),
  });
  const cartes = data?.cartes ?? [];
  const sansPhoto = cartes.filter((c) => !c.eleve.a_photo).length;

  return (
    <div className="space-y-6">
      <EnTete titre="Cartes scolaires" sousTitre="Chaque élève a sa carte, créée automatiquement. Le QR code est signé : il ne peut pas être imité."
        actions={classe ? <Button onClick={() => ouvrirDocument(`/cartes/impression?classe=${classe}`)}><Printer /> Imprimer la classe</Button> : null} />
      <div className="flex flex-wrap items-center gap-3">
        <Choix value={classe} onChange={(e) => setClasse(e.target.value)} className="w-56" aria-label="Classe">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </Choix>
        {sansPhoto ? <Pastille ton="or">{sansPhoto} élève{sansPhoto > 1 ? "s" : ""} sans photo</Pastille> : cartes.length ? <Pastille ton="vert">Toutes les photos sont prises</Pastille> : null}
      </div>
      {cartes.length ? (
        <Liste>{cartes.map((c) => <LigneCarte key={c.eleve.id} c={c} />)}</Liste>
      ) : <EmptyState icon={CreditCard} title="Aucun élève inscrit dans cette classe" />}
    </div>
  );
}

function LigneCarte({ c }: { c: CarteImprimable }) {
  const rafraichir = useRafraichir();
  const photo = usePhoto(c.eleve.id, c.eleve.a_photo);
  const fichier = useRef<HTMLInputElement>(null);
  async function envoyer(f: File | undefined) {
    if (!f) return;
    try {
      await api(`/api/eleves/${c.eleve.id}/photo`, { method: "PUT", body: JSON.stringify({ image: await reduirePhoto(f) }) });
      rafraichir("cartes", "photo", "carte");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      {photo ? <img src={photo} alt="" className="size-11 rounded-lg object-cover" /> : <Avatar prenom={c.eleve.prenom} nom={c.eleve.nom} />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{c.eleve.prenom} {c.eleve.nom}</div>
        <div className="text-xs text-muted-foreground"><span className="font-mono">{c.carte.numero}</span> · {c.eleve.matricule}</div>
      </div>
      {!c.carte.active ? <Pastille ton="rouge">Désactivée</Pastille> : null}
      <input ref={fichier} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => envoyer(e.target.files?.[0])} />
      <Button size="sm" variant={c.eleve.a_photo ? "ghost" : "secondary"} onClick={() => fichier.current?.click()}><Camera /> {c.eleve.a_photo ? "Changer" : "Photo"}</Button>
      <Button size="sm" variant="ghost" onClick={() => ouvrirDocument(`/cartes/impression?eleve=${c.eleve.id}`)} aria-label="Imprimer sa carte"><Printer /></Button>
    </div>
  );
}
