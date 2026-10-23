import { useSyncExternalStore } from "react";

/** Mode clair ou sombre ; « auto » suit le réglage du téléphone. */
export type Mode = "clair" | "sombre" | "auto";
const CLE = "nexus.mode";
const EVENEMENT = "nexus:mode";
const prefereSombre = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

export function modeEnregistre(): Mode {
  try {
    const m = localStorage.getItem(CLE);
    return m === "sombre" || m === "clair" ? m : "auto";
  } catch {
    return "auto";
  }
}

export function appliquerMode(m: Mode) {
  const sombre = m === "sombre" || (m === "auto" && prefereSombre());
  if (sombre) document.documentElement.setAttribute("data-mode", "sombre");
  else document.documentElement.removeAttribute("data-mode");
  window.dispatchEvent(new Event(EVENEMENT));
}

export function choisirMode(m: Mode) {
  try {
    localStorage.setItem(CLE, m);
  } catch {
    /* stockage indisponible */
  }
  appliquerMode(m);
}

const abonner = (f: () => void) => {
  window.addEventListener(EVENEMENT, f);
  return () => window.removeEventListener(EVENEMENT, f);
};
export const useSombre = () =>
  useSyncExternalStore(abonner, () => document.documentElement.getAttribute("data-mode") === "sombre");
