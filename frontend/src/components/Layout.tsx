import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LogOut, Menu, Moon, Sun, X, type LucideIcon } from "lucide-react";
import { Avatar, initialesEcole } from "@/components/design";
import { choisirMode, useSombre } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type Lien = { vers: string; libelle: string; icone: LucideIcon; visible?: boolean };
export type Groupe = { titre: string; liens: Lien[] };

/**
 * Mise en page commune (école et console), reprise d'AP2A Impact :
 * barre latérale sur ordinateur, barre du haut + barre du bas sur téléphone.
 */
export function Layout({ groupes, bas, marque, utilisateur, deconnecter, bandeau }: {
  groupes: Groupe[];
  /** Chemins des écrans du quotidien (barre du bas sur téléphone). */
  bas: string[];
  marque: { nom: string; sousTitre?: string; logo?: string };
  utilisateur: { prenom: string; nom: string; detail: string };
  deconnecter: () => void;
  bandeau?: ReactNode;
}) {
  const sombre = useSombre();
  const libelleMode = sombre ? "Passer en mode clair" : "Passer en mode sombre";
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [pathname]);

  const visibles = groupes
    .map((g) => ({ ...g, liens: g.liens.filter((l) => l.visible !== false) }))
    .filter((g) => g.liens.length);
  const tous = visibles.flatMap((g) => g.liens);
  // Les 4 premiers écrans visibles pour ce rôle (barre du bas sur téléphone)
  const basLiens = (bas.map((v) => tous.find((l) => l.vers === v)).filter(Boolean) as Lien[]).slice(0, 4);

  const Logo = ({ petit }: { petit?: boolean }) =>
    marque.logo ? (
      <img src={marque.logo} alt="" className={cn("rounded-lg bg-white object-contain p-1", petit ? "h-8 w-8" : "h-10 w-10")} />
    ) : (
      <span className={cn("inline-flex items-center justify-center rounded-lg bg-marque font-heading font-bold text-sidebar",
        petit ? "size-8 text-sm" : "size-10 text-base")}>
        {initialesEcole(marque.nom)}
      </span>
    );

  return (
    <div className="min-h-dvh bg-background md:flex">
      {/* Ordinateur : barre latérale */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-5 pb-6 pt-6">
          <Logo />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-heading text-lg font-semibold">{marque.nom}</div>
            {marque.sousTitre ? <div className="truncate text-[11px] text-sidebar-muted">{marque.sousTitre}</div> : null}
          </div>
        </div>
        <nav className="defilement-fin flex-1 space-y-6 overflow-y-auto px-3">
          {visibles.map((g) => (
            <div key={g.titre}>
              <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/80">{g.titre}</div>
              <div className="space-y-0.5">
                {g.liens.map(({ vers, libelle, icone: Icone }) => (
                  <NavLink
                    key={vers}
                    to={vers}
                    end={vers === "/"}
                    className={({ isActive }) => cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-sidebar-active text-white" : "text-sidebar-foreground/75 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-marque" /> : null}
                        <Icone className={cn("size-[18px]", isActive ? "text-marque" : "text-sidebar-muted group-hover:text-white")} />
                        {libelle}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="m-3 flex items-center gap-1 rounded-xl bg-white/5 p-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-3 p-1.5">
            <Avatar prenom={utilisateur.prenom} nom={utilisateur.nom} taille="sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{utilisateur.prenom} {utilisateur.nom}</div>
              <div className="truncate text-[11px] text-sidebar-muted">{utilisateur.detail}</div>
            </div>
          </div>
          <button onClick={() => choisirMode(sombre ? "clair" : "sombre")} title={libelleMode} aria-label={libelleMode}
            className="rounded-lg p-2 text-sidebar-muted hover:bg-white/10 hover:text-white">
            {sombre ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button onClick={deconnecter} title="Se déconnecter" aria-label="Se déconnecter"
            className="rounded-lg p-2 text-sidebar-muted hover:bg-white/10 hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Téléphone : barre du haut */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/85 px-4 py-2.5 backdrop-blur-md md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo petit />
          <span className="truncate font-heading text-lg font-semibold">{marque.nom}</span>
        </div>
        <button onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu} className="-mr-2 rounded-lg p-2 text-muted-foreground hover:bg-muted">
          {menu ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        {menu ? (
          <>
            <div className="fixed inset-0 top-[57px] bg-black/20" onClick={() => setMenu(false)} />
            <div className="absolute right-3 top-full z-40 mt-2 max-h-[calc(100dvh-57px-5.5rem)] w-64 animate-apparition overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-haute">
              <div className="flex items-center gap-3 border-b border-border px-2 pb-3 pt-1">
                <Avatar prenom={utilisateur.prenom} nom={utilisateur.nom} taille="sm" />
                <div className="leading-tight">
                  <div className="text-sm font-semibold">{utilisateur.prenom} {utilisateur.nom}</div>
                  <div className="text-xs text-muted-foreground">{utilisateur.detail}</div>
                </div>
              </div>
              <div className="py-1">
                {tous.filter((l) => !basLiens.includes(l)).map(({ vers, libelle, icone: Icone }) => (
                  <NavLink key={vers} to={vers} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">
                    <Icone className="size-[18px] text-muted-foreground" /> {libelle}
                  </NavLink>
                ))}
              </div>
              <button onClick={() => choisirMode(sombre ? "clair" : "sombre")} className="flex w-full items-center gap-3 rounded-lg border-t border-border px-3 py-2.5 text-sm font-medium hover:bg-muted">
                {sombre ? <Sun className="size-[18px] text-muted-foreground" /> : <Moon className="size-[18px] text-muted-foreground" />} {libelleMode}
              </button>
              <button onClick={deconnecter} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-muted">
                <LogOut className="size-[18px]" /> Se déconnecter
              </button>
            </div>
          </>
        ) : null}
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        {bandeau}
        <main className="mx-auto w-full max-w-6xl flex-1 animate-apparition px-4 pb-28 pt-5 md:px-10 md:pb-12 md:pt-9" key={pathname}>
          <Outlet />
        </main>
      </div>

      {/* Téléphone : barre du bas */}
      {basLiens.length ? (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${basLiens.length}, minmax(0, 1fr))` }}>
            {basLiens.map(({ vers, libelle, icone: Icone }) => (
              <NavLink key={vers} to={vers} end={vers === "/"} className="flex flex-col items-center gap-1 py-2">
                {({ isActive }) => (
                  <>
                    <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", isActive ? "bg-primary-soft text-primary" : "text-muted-foreground")}>
                      <Icone className="size-5" />
                    </span>
                    <span className={cn("text-[11px]", isActive ? "font-semibold text-primary" : "text-muted-foreground")}>{libelle}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
