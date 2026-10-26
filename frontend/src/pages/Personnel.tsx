import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Champ, Choix, EnTete, Liste, Pastille } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, messageErreur, patch, post, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateHeure } from "@/lib/format";
import { useRafraichir, useRoles } from "@/lib/requetes";
import type { Personnel as Compte, RoleEcole } from "@/lib/types";

/** Rôles qu'on peut attribuer au personnel administratif (les enseignants ont leur page). */
export function useRolesPersonnel() {
  const { moi } = useAuth();
  const { data: roles = [] } = useRoles();
  return roles.filter((r) => r.code !== "enseignant" && (r.code !== "directeur" || moi?.role === "directeur"));
}

export function Personnel() {
  const { moi } = useAuth();
  const rafraichir = useRafraichir();
  const { data: comptes } = useQuery({
    queryKey: ["personnel"],
    queryFn: async () => (await api<Page<Compte>>("/api/personnel?page_size=200")).results,
  });
  const roles = useRolesPersonnel();
  const [nouveau, setNouveau] = useState(false);

  async function modifier(c: Compte, champs: Partial<Compte>) {
    try {
      await patch(`/api/personnel/${c.id}`, champs);
      rafraichir("personnel", "roles");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <div className="space-y-6">
      <EnTete titre="Personnel" sousTitre="Direction, secrétariat, comptabilité, surveillance… Les enseignants ont leur propre page. Un compte se désactive, il ne se supprime pas."
        actions={<Button onClick={() => setNouveau(true)}><Plus /> Nouveau compte</Button>} />
      {comptes?.length ? (
        <Liste>
          {comptes.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar prenom={c.prenom} nom={c.nom || c.email} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.prenom} {c.nom} {c.id === moi?.id ? <Pastille ton="vert" className="ml-1">vous</Pastille> : null}</div>
                <div className="truncate text-xs text-muted-foreground">{c.email}{c.telephone ? ` · ${c.telephone}` : ""} · dernière connexion : {c.last_login ? dateHeure(c.last_login) : "jamais"}</div>
              </div>
              <Choix value={c.role_ecole ?? ""} disabled={c.id === moi?.id || (c.role === "directeur" && moi?.role !== "directeur")}
                onChange={(e) => modifier(c, { role_ecole: Number(e.target.value) })} className="h-9 w-52" aria-label={`Rôle de ${c.prenom} ${c.nom}`}>
                {!roles.some((r) => r.id === c.role_ecole) ? <option value={c.role_ecole ?? ""}>{c.role_nom}</option> : null}
                {roles.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
              </Choix>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={c.is_active} disabled={c.id === moi?.id} onCheckedChange={(v) => modifier(c, { is_active: v })} /> Actif
              </label>
            </div>
          ))}
        </Liste>
      ) : comptes ? <EmptyState icon={UsersRound} title="Aucun compte" /> : null}
      <NouveauCompte ouvert={nouveau} fermer={() => setNouveau(false)} roles={roles} />
    </div>
  );
}

function NouveauCompte({ ouvert, fermer, roles }: { ouvert: boolean; fermer: () => void; roles: RoleEcole[] }) {
  const rafraichir = useRafraichir();
  const vide = { prenom: "", nom: "", email: "", telephone: "", role_ecole: "", mot_de_passe: "" };
  const [f, setF] = useState(vide);
  const champ = (k: keyof typeof vide) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  const role = roles.find((r) => String(r.id) === f.role_ecole);
  async function valider(e: FormEvent) {
    e.preventDefault();
    try {
      await post("/api/personnel", { ...f, role_ecole: Number(f.role_ecole) });
      toast.success(`Compte créé : transmettez l'email et le mot de passe à ${f.prenom}.`);
      rafraichir("personnel", "roles");
      setF(vide);
      fermer();
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau compte du personnel</DialogTitle>
          <DialogDescription>Les droits viennent du rôle (voir « Rôles et droits »). Pour un enseignant, utilisez la page Enseignants.</DialogDescription>
        </DialogHeader>
        <form onSubmit={valider} className="grid gap-4 sm:grid-cols-2">
          <Champ label="Prénom"><Input required {...champ("prenom")} /></Champ>
          <Champ label="Nom"><Input required {...champ("nom")} /></Champ>
          <Champ label="Email (identifiant de connexion)"><Input type="email" required {...champ("email")} /></Champ>
          <Champ label="Téléphone"><Input type="tel" inputMode="tel" {...champ("telephone")} /></Champ>
          <Champ label="Rôle" aide={role?.description || undefined}>
            <Choix required {...champ("role_ecole")}>
              <option value="">Choisir…</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
            </Choix>
          </Champ>
          <Champ label="Mot de passe initial" aide="10 caractères minimum."><Input type="text" required minLength={10} {...champ("mot_de_passe")} /></Champ>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
            <Button type="submit">Créer le compte</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
