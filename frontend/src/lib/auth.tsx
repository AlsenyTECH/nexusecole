import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { aDesJetons, api, oublierJetons, seConnecter } from "./api";
import type { Moi } from "./types";

type Auth = {
  moi: Moi | null;
  chargement: boolean;
  connecter: (email: string, mdp: string) => Promise<void>;
  deconnecter: () => void;
  /** Le serveur reste juge : ceci ne sert qu'à masquer ce qu'on ne peut pas faire. */
  peut: (permission: string) => boolean;
};

const Contexte = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [moi, setMoi] = useState<Moi | null>(null);
  const [chargement, setChargement] = useState(aDesJetons());
  const client = useQueryClient();

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setMoi(await api<Moi>("/api/moi"));
    } catch {
      oublierJetons();
      setMoi(null);
    } finally {
      setChargement(false);
    }
  }, []);

  const deconnecter = useCallback(() => {
    oublierJetons();
    setMoi(null);
    client.clear();
  }, [client]);

  useEffect(() => {
    if (aDesJetons()) charger();
    const fin = () => { setMoi(null); client.clear(); };
    window.addEventListener("nexus:deconnecte", fin);
    return () => window.removeEventListener("nexus:deconnecte", fin);
  }, [charger, client]);

  const connecter = async (email: string, mdp: string) => {
    await seConnecter(email, mdp);
    await charger();
  };

  const peut = (p: string) => !!moi?.permissions?.includes(p);

  return <Contexte.Provider value={{ moi, chargement, connecter, deconnecter, peut }}>{children}</Contexte.Provider>;
}

export function useAuth() {
  const c = useContext(Contexte);
  if (!c) throw new Error("useAuth hors de AuthProvider");
  return c;
}
