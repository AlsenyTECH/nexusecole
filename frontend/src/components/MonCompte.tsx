import { useEffect, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Champ } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, messageErreur } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Chacun modifie son identifiant de connexion, son nom, son téléphone et son mot de passe. */
export function MonCompte({ ouvert, fermer }: { ouvert: boolean; fermer: () => void }) {
  const { moi, recharger } = useAuth();
  const [f, setF] = useState({ email: "", prenom: "", nom: "", telephone: "", actuel: "", nouveau: "", confirmation: "" });
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    if (ouvert && moi) setF({ email: moi.email, prenom: moi.prenom, nom: moi.nom, telephone: moi.telephone, actuel: "", nouveau: "", confirmation: "" });
  }, [ouvert, moi]);
  const champ = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (f.nouveau && f.nouveau !== f.confirmation) return toast.error("Les deux nouveaux mots de passe ne sont pas identiques.");
    setEnvoi(true);
    try {
      await api("/api/moi", { method: "PATCH", body: JSON.stringify({
        email: f.email.trim(), prenom: f.prenom.trim(), nom: f.nom.trim(), telephone: f.telephone.trim(),
        mot_de_passe_actuel: f.actuel, ...(f.nouveau ? { nouveau_mot_de_passe: f.nouveau } : {}) }) });
      toast.success(f.nouveau ? "Compte mis à jour : utilisez le nouveau mot de passe à la prochaine connexion." : "Compte mis à jour");
      await recharger();
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mon compte</DialogTitle>
          <DialogDescription>Votre mot de passe actuel est demandé pour confirmer toute modification.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Identifiant de connexion (e-mail)" className="sm:col-span-2"><Input required autoComplete="username" {...champ("email")} /></Champ>
          <Champ label="Prénom"><Input {...champ("prenom")} /></Champ>
          <Champ label="Nom"><Input {...champ("nom")} /></Champ>
          <Champ label="Téléphone" className="sm:col-span-2"><Input type="tel" inputMode="tel" {...champ("telephone")} /></Champ>
          <Champ label="Nouveau mot de passe" aide="Laisser vide pour le garder. 10 caractères minimum, pas un mot de passe courant.">
            <Input type="password" autoComplete="new-password" minLength={10} {...champ("nouveau")} />
          </Champ>
          <Champ label="Confirmer le nouveau mot de passe"><Input type="password" autoComplete="new-password" {...champ("confirmation")} /></Champ>
          <Champ label="Mot de passe actuel" className="sm:col-span-2"><Input type="password" required autoComplete="current-password" {...champ("actuel")} /></Champ>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi}><KeyRound /> Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
