import { FormEvent, useEffect, useState } from "react";
import { api, deconnexion, ErreurApi, estConnecte, post } from "./api";
import Connexion from "./Connexion";

type Config = {
  nom: string;
  logo_url: string;
  couleur_primaire: string;
  couleur_secondaire: string;
  modules: string[];
  statut: string;
  lecture_seule: boolean;
};
type Eleve = { id: number; matricule: string; prenom: string; nom: string; sexe: "F" | "M"; classe: number | null };
type Page<T> = { count: number; results: T[] };
type Moi = { prenom: string; nom: string; role: string };

export default function EcoleApp() {
  const [config, setConfig] = useState<Config | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [connecte, setConnecte] = useState(estConnecte());

  useEffect(() => {
    api<Config>("/api/ecole/config")
      .then((c) => {
        setConfig(c);
        document.title = c.nom;
        // Marque blanche : les couleurs de l'école deviennent les couleurs de l'interface
        document.documentElement.style.setProperty("--primaire", c.couleur_primaire);
        document.documentElement.style.setProperty("--secondaire", c.couleur_secondaire);
      })
      .catch(() => setIntrouvable(true));
  }, []);

  if (introuvable) return <main className="centre"><p>Établissement introuvable.</p></main>;
  if (!config) return <main className="centre"><p>Chargement…</p></main>;
  if (!connecte) return <Connexion titre={config.nom} logo={config.logo_url} onOk={() => setConnecte(true)} />;
  return <TableauDeBord config={config} onQuitter={() => { deconnexion(); setConnecte(false); }} />;
}

function TableauDeBord({ config, onQuitter }: { config: Config; onQuitter: () => void }) {
  const [moi, setMoi] = useState<Moi | null>(null);
  const [eleves, setEleves] = useState<Page<Eleve> | null>(null);
  const [erreur, setErreur] = useState("");

  const charger = () =>
    api<Page<Eleve>>("/api/eleves").then(setEleves).catch((e) => setErreur(e instanceof ErreurApi ? e.message : String(e)));

  useEffect(() => {
    api<Moi>("/api/moi").then(setMoi).catch(onQuitter);
    charger();
  }, []);

  return (
    <>
      <header className="barre">
        <div className="marque">
          {config.logo_url && <img src={config.logo_url} alt="" />}
          <strong>{config.nom}</strong>
        </div>
        <div>
          {moi && <span className="discret">{moi.prenom} {moi.nom} · {moi.role}</span>}
          <button className="lien" onClick={onQuitter}>Déconnexion</button>
        </div>
      </header>
      <main className="contenu">
        {config.lecture_seule && (
          <p className="alerte">Abonnement suspendu : vos données restent consultables, mais les modifications sont bloquées jusqu'au règlement.</p>
        )}
        {erreur && <p className="erreur">{erreur}</p>}
        <section className="carte">
          <h2>Élèves {eleves && <span className="discret">({eleves.count})</span>}</h2>
          {!config.lecture_seule && <NouvelEleve onAjout={charger} />}
          <table>
            <thead><tr><th>Matricule</th><th>Prénom</th><th>Nom</th><th>Sexe</th></tr></thead>
            <tbody>
              {eleves?.results.map((e) => (
                <tr key={e.id}><td>{e.matricule}</td><td>{e.prenom}</td><td>{e.nom}</td><td>{e.sexe}</td></tr>
              ))}
              {eleves?.count === 0 && <tr><td colSpan={4} className="discret">Aucun élève inscrit pour l'instant.</td></tr>}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}

function NouvelEleve({ onAjout }: { onAjout: () => void }) {
  const vide = { matricule: "", prenom: "", nom: "", sexe: "F" };
  const [f, setF] = useState(vide);
  const [erreur, setErreur] = useState("");

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    try {
      await post("/api/eleves", f);
      setF(vide);
      onAjout();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? JSON.stringify(err.donnees) : String(err));
    }
  }

  return (
    <form className="ligne" onSubmit={soumettre}>
      <input placeholder="Matricule" value={f.matricule} onChange={(e) => setF({ ...f, matricule: e.target.value })} required />
      <input placeholder="Prénom" value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} required />
      <input placeholder="Nom" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required />
      <select value={f.sexe} onChange={(e) => setF({ ...f, sexe: e.target.value })}>
        <option value="F">Fille</option>
        <option value="M">Garçon</option>
      </select>
      <button>Inscrire</button>
      {erreur && <p className="erreur">{erreur}</p>}
    </form>
  );
}
