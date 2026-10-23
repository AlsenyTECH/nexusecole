import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Champ, initialesEcole } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErreurApi, messageErreur } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Connexion en deux volets (présentation en dégradé + formulaire), comme AP2A Impact. */
export function Connexion({ nom, accroche, points, pied, logo }: {
  nom: string; accroche: string; points: [string, string][]; pied: string; logo?: string;
}) {
  const { connecter } = useAuth();
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    try {
      await connecter(email, mdp);
    } catch (err) {
      toast.error(err instanceof ErreurApi && err.status === 401 ? "Email ou mot de passe incorrect." : messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  const Logo = ({ grand }: { grand?: boolean }) =>
    logo ? <img src={logo} alt="" className={grand ? "h-20 rounded-xl bg-white object-contain p-2 shadow-carte" : "h-12 w-12 rounded-lg bg-white object-contain p-1"} />
      : <span className={(grand ? "size-20 text-3xl shadow-carte" : "size-12 text-lg") + " inline-flex items-center justify-center rounded-xl bg-marque font-heading font-bold text-sidebar"}>
          {initialesEcole(nom)}
        </span>;

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-degrade-1 via-degrade-2 to-degrade-3 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <svg aria-hidden className="absolute -bottom-24 -right-24 size-[28rem] opacity-[0.07]" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="90" fill="none" stroke="white" strokeWidth="14" />
          <circle cx="100" cy="100" r="58" fill="none" stroke="white" strokeWidth="14" />
          <circle cx="100" cy="100" r="26" fill="none" stroke="white" strokeWidth="14" />
        </svg>
        <div className="relative flex items-center gap-3">
          <Logo />
          <div className="font-heading text-xl font-semibold">{nom}</div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight text-white">{accroche}</h1>
          <ul className="mt-8 space-y-4 text-white/85">
            {points.map(([titre, texte]) => (
              <li key={titre} className="flex gap-3">
                <span className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-marque text-[11px] font-bold text-sidebar">✓</span>
                <span><b className="font-semibold text-white">{titre}</b> {texte}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">{pied}</p>
      </div>

      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <Logo grand />
            <div className="font-heading text-xl font-semibold">{nom}</div>
          </div>
          <h2 className="text-2xl font-semibold">Bon retour parmi nous</h2>
          <p className="mt-1 text-sm text-muted-foreground">Connectez-vous avec l'email et le mot de passe reçus de l'établissement.</p>
          <form onSubmit={valider} className="mt-6 space-y-4">
            <Champ label="Email">
              <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.sn" />
            </Champ>
            <Champ label="Mot de passe">
              <Input type="password" autoComplete="current-password" required value={mdp} onChange={(e) => setMdp(e.target.value)} />
            </Champ>
            <Button type="submit" size="lg" className="w-full" disabled={envoi}>{envoi ? "Patientez…" : "Se connecter"}</Button>
          </form>
          <p className="mt-6 rounded-xl bg-muted/60 p-3 text-center text-xs text-muted-foreground">
            Mot de passe oublié ou pas encore de compte ? Adressez-vous à l'administration de l'établissement.
          </p>
        </div>
      </div>
    </div>
  );
}
