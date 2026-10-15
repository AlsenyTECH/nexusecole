import React from "react";
import ReactDOM from "react-dom/client";
import AdminApp from "./AdminApp";
import EcoleApp from "./EcoleApp";
import "./styles.css";

// Un seul build : le sous-domaine décide si l'on affiche la console ou l'espace école.
const estConsole = window.location.hostname.startsWith("admin.");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{estConsole ? <AdminApp /> : <EcoleApp />}</React.StrictMode>,
);
