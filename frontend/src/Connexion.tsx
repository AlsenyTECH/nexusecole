import { FormEvent, useState } from "react";
import { connexion, ErreurApi } from "./api";

export default function Connexion({ titre, logo, onOk }: { titre: string; logo?: string; onOk: () => void }) {
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur("");
    try {
      await connexion(email, mdp);
      onOk();
    } catch (err) {
      setErreur(err instanceof ErreurApi && err.status === 401 ? "Email ou mot de passe incorrect." : String(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="centre">
      <form className="carte connexion" onSubmit={soumettre}>
        {logo && <img src={logo} alt="" className="logo" />}
        <h1>{titre}</h1>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          Mot de passe
          <input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} required autoComplete="current-password" />
        </label>
        {erreur && <p className="erreur">{erreur}</p>}
        <button disabled={envoi}>{envoi ? "Connexion…" : "Se connecter"}</button>
      </form>
    </main>
  );
}
