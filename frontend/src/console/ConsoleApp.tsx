import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Building2, Home, ReceiptText } from "lucide-react";
import { Connexion } from "@/components/Connexion";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/lib/auth";
import { appliquerCouleurs } from "@/lib/couleurs";
import { AccueilConsole, Ecoles, Factures } from "./pages";

/** Console NexusEcole (schéma public) : écoles clientes, forfaits, facturation. */
export function ConsoleApp() {
  const { moi, chargement, deconnecter } = useAuth();
  useEffect(() => {
    appliquerCouleurs("#0f766e", "#f59e0b");
    document.title = "NexusEcole · Console";
  }, []);

  if (chargement) return <div className="grid min-h-dvh place-items-center text-muted-foreground">Chargement…</div>;
  if (!moi) {
    return (
      <Connexion nom="NexusEcole" accroche="La plateforme des écoles, pilotée d'un seul endroit."
        points={[["Créer", "une école en un clic : son espace, son adresse, son directeur"], ["Facturer", "les abonnements et suivre les paiements Wave / OM"], ["Piloter", "le revenu récurrent, les essais et les impayés"]]}
        pied="Console éditeur — accès réservé" />
    );
  }
  return (
    <Routes>
      <Route element={
        <Layout
          groupes={[{ titre: "Plateforme", liens: [
            { vers: "/", libelle: "Tableau de bord", icone: Home },
            { vers: "/ecoles", libelle: "Écoles", icone: Building2 },
            { vers: "/factures", libelle: "Factures", icone: ReceiptText },
          ] }]}
          bas={["/", "/ecoles", "/factures"]}
          marque={{ nom: "NexusEcole", sousTitre: "Console éditeur" }}
          utilisateur={{ prenom: moi.prenom || "Super", nom: moi.nom || "admin", detail: moi.email }}
          deconnecter={deconnecter}
        />
      }>
        <Route index element={<AccueilConsole />} />
        <Route path="ecoles" element={<Ecoles />} />
        <Route path="factures" element={<Factures />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
