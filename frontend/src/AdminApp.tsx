import { FormEvent, useEffect, useState } from "react";
import { api, deconnexion, ErreurApi, estConnecte, fcfa, post } from "./api";
import Connexion from "./Connexion";

type Ecole = {
  id: number; nom: string; domaine: string; statut: string; forfait: string | null;
  ville: string; fin_essai: string | null; modules_actifs: string[];
};
type Forfait = { code: string; nom: string; prix_mensuel: number; max_eleves: number | null };
type Facture = { id: number; numero: string; ecole_nom: string; montant: number; echeance: string; statut: string };
type Stats = { ecoles_total: number; ecoles_par_statut: Record<string, number>; revenu_mensuel_recurrent: number; factures_impayees: number };
type Page<T> = { results: T[] };

const STATUTS: Record<string, string> = { essai: "Essai", actif: "Actif", suspendu: "Suspendu", resilie: "Résilié" };

export default function AdminApp() {
  const [connecte, setConnecte] = useState(estConnecte());
  if (!connecte) return <Connexion titre="NexusEcole · Console" onOk={() => setConnecte(true)} />;
  return <Console onQuitter={() => { deconnexion(); setConnecte(false); }} />;
}

function Console({ onQuitter }: { onQuitter: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [ecoles, setEcoles] = useState<Ecole[]>([]);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [erreur, setErreur] = useState("");

  const charger = async () => {
    try {
      const [s, e, f, fo] = await Promise.all([
        api<Stats>("/api/admin/statistiques"),
        api<Page<Ecole>>("/api/admin/ecoles"),
        api<Page<Facture>>("/api/admin/factures"),
        api<Page<Forfait>>("/api/admin/forfaits"),
      ]);
      setStats(s); setEcoles(e.results); setFactures(f.results); setForfaits(fo.results);
    } catch (err) {
      if (err instanceof ErreurApi && (err.status === 401 || err.status === 403)) onQuitter();
      else setErreur(String(err));
    }
  };
  useEffect(() => { charger(); }, []);

  const agir = (chemin: string, corps: unknown = {}) =>
    post(chemin, corps).then(charger).catch((e) => setErreur(e instanceof ErreurApi ? JSON.stringify(e.donnees) : String(e)));

  return (
    <>
      <header className="barre">
        <div className="marque"><strong>NexusEcole</strong><span className="discret">Console</span></div>
        <button className="lien" onClick={onQuitter}>Déconnexion</button>
      </header>
      <main className="contenu">
        {erreur && <p className="erreur" onClick={() => setErreur("")}>{erreur}</p>}
        {stats && (
          <div className="kpis">
            <div className="carte kpi"><span>Écoles</span><strong>{stats.ecoles_total}</strong></div>
            <div className="carte kpi"><span>Revenu mensuel récurrent</span><strong>{fcfa(stats.revenu_mensuel_recurrent)}</strong></div>
            <div className="carte kpi"><span>Factures impayées</span><strong>{fcfa(stats.factures_impayees)}</strong></div>
            <div className="carte kpi"><span>En essai / suspendues</span><strong>{stats.ecoles_par_statut.essai ?? 0} / {stats.ecoles_par_statut.suspendu ?? 0}</strong></div>
          </div>
        )}

        <section className="carte">
          <h2>Écoles</h2>
          <div className="defile">
            <table>
              <thead><tr><th>École</th><th>Domaine</th><th>Forfait</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {ecoles.map((e) => (
                  <tr key={e.id}>
                    <td>{e.nom}<div className="discret">{e.ville}</div></td>
                    <td><a href={`${location.protocol}//${e.domaine}${location.port ? ":" + location.port : ""}`}>{e.domaine}</a></td>
                    <td>{e.forfait ?? "—"}</td>
                    <td><span className={`pastille ${e.statut}`}>{STATUTS[e.statut]}</span>{e.statut === "essai" && e.fin_essai && <div className="discret">jusqu'au {e.fin_essai}</div>}</td>
                    <td className="actions">
                      <button onClick={() => agir(`/api/admin/ecoles/${e.id}/facturer`, { mois: 1 })}>Facturer 1 mois</button>
                      <button onClick={() => agir(`/api/admin/ecoles/${e.id}/facturer`, { mois: 10 })}>Facturer l'année</button>
                      {e.statut === "suspendu"
                        ? <button onClick={() => agir(`/api/admin/ecoles/${e.id}/activer`)}>Réactiver</button>
                        : <button className="danger" onClick={() => agir(`/api/admin/ecoles/${e.id}/suspendre`)}>Suspendre</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <NouvelleEcole forfaits={forfaits} onCree={charger} />

        <section className="carte">
          <h2>Factures</h2>
          <div className="defile">
            <table>
              <thead><tr><th>N°</th><th>École</th><th>Montant</th><th>Échéance</th><th>Statut</th><th></th></tr></thead>
              <tbody>
                {factures.map((f) => (
                  <tr key={f.id}>
                    <td>{f.numero}</td><td>{f.ecole_nom}</td><td>{fcfa(f.montant)}</td><td>{f.echeance}</td>
                    <td><span className={`pastille ${f.statut}`}>{f.statut}</span></td>
                    <td className="actions">
                      {f.statut !== "payee" && (
                        <>
                          <button onClick={() => agir(`/api/admin/factures/${f.id}/payer`, { moyen: "wave" })}>Payée (Wave)</button>
                          <button onClick={() => agir(`/api/admin/factures/${f.id}/payer`, { moyen: "orange_money" })}>Payée (OM)</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

function NouvelleEcole({ forfaits, onCree }: { forfaits: Forfait[]; onCree: () => void }) {
  const vide = { nom: "", sous_domaine: "", ville: "", forfait: "starter", email: "", mot_de_passe: "" };
  const [f, setF] = useState(vide);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const champ = (k: keyof typeof vide) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur("");
    try {
      await post("/api/admin/ecoles", {
        nom: f.nom, sous_domaine: f.sous_domaine, ville: f.ville, forfait: f.forfait,
        directeur: { email: f.email, mot_de_passe: f.mot_de_passe },
      });
      setF(vide);
      onCree();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? JSON.stringify(err.donnees) : String(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="carte">
      <h2>Nouvelle école</h2>
      <form className="grille" onSubmit={soumettre}>
        <label>Nom<input {...champ("nom")} required /></label>
        <label>Sous-domaine<input {...champ("sous_domaine")} pattern="[a-z0-9-]{3,40}" required /></label>
        <label>Ville<input {...champ("ville")} /></label>
        <label>Forfait
          <select {...champ("forfait")}>
            {forfaits.map((fo) => <option key={fo.code} value={fo.code}>{fo.nom} · {fcfa(fo.prix_mensuel)}/mois</option>)}
          </select>
        </label>
        <label>Email du directeur<input type="email" {...champ("email")} required /></label>
        <label>Mot de passe initial<input type="password" {...champ("mot_de_passe")} minLength={10} required /></label>
        <button disabled={envoi}>{envoi ? "Création du schéma…" : "Créer l'école (30 jours d'essai)"}</button>
      </form>
      {erreur && <p className="erreur">{erreur}</p>}
    </section>
  );
}
