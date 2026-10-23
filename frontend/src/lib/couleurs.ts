// Marque blanche : à partir des 2 couleurs d'une école, on calcule toute la palette de l'interface
// (barre latérale, dégradés, fonds doux, version sombre), en gardant un texte lisible.

type RGB = [number, number, number];

const versRGB = (hex: string): RGB => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const versHex = ([r, g, b]: RGB) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
/** Mélange `a` avec `b` : t = 0 → a, t = 1 → b. */
const melange = (a: string, b: string, t: number) => {
  const [x, y] = [versRGB(a), versRGB(b)];
  return versHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB);
};
const luminance = (hex: string) => {
  const c = versRGB(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

const NOIR = "#000000";
const BLANC = "#ffffff";
const valide = (hex?: string) => !!hex && /^#[0-9a-f]{6}$/i.test(hex);

export function appliquerCouleurs(primaire = "#0f766e", secondaire = "#f59e0b") {
  const p = valide(primaire) ? primaire : "#0f766e";
  const s = valide(secondaire) ? secondaire : "#f59e0b";
  // Une couleur très claire (jaune…) est assombrie pour rester lisible sur fond blanc.
  const base = luminance(p) > 0.45 ? melange(p, NOIR, 0.35) : p;
  const sidebar = melange(base, NOIR, 0.78);

  const clair = {
    "--primary": base,
    "--primary-hover": melange(base, NOIR, 0.15),
    "--primary-foreground": BLANC,
    "--primary-soft": melange(base, BLANC, 0.88),
    "--accent": melange(base, BLANC, 0.88),
    "--accent-foreground": melange(base, NOIR, 0.45),
    "--ring": base,
    "--sidebar": sidebar,
    "--sidebar-active": melange(base, NOIR, 0.58),
    "--sidebar-border": melange(base, NOIR, 0.68),
    "--sidebar-muted": melange(melange(base, NOIR, 0.3), BLANC, 0.5),
    "--marque": s,
    "--marque-clair": melange(s, BLANC, 0.3),
    "--degrade-1": base,
    "--degrade-2": melange(base, NOIR, 0.25),
    "--degrade-3": sidebar,
    "--voile": `${sidebar}66`,
  };
  const sombre = {
    "--primary": melange(base, BLANC, 0.35),
    "--primary-hover": melange(base, BLANC, 0.5),
    "--primary-foreground": melange(base, NOIR, 0.85),
    "--primary-soft": melange(base, NOIR, 0.7),
    "--accent": melange(base, NOIR, 0.7),
    "--accent-foreground": melange(base, BLANC, 0.6),
    "--ring": melange(base, BLANC, 0.35),
    "--sidebar": melange(base, NOIR, 0.9),
    "--sidebar-active": melange(base, NOIR, 0.72),
    "--sidebar-border": melange(base, NOIR, 0.82),
  };
  const css = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
  let style = document.getElementById("couleurs-ecole");
  if (!style) {
    style = document.createElement("style");
    style.id = "couleurs-ecole";
    document.head.appendChild(style);
  }
  style.textContent = `:root{${css(clair)}} :root[data-mode="sombre"]{${css(sombre)}}`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", sidebar);
}
