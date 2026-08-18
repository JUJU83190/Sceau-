// theme-toggle.js — bascule mode clair/sombre, mémorisée dans localStorage.
// Le choix initial (avant chargement de ce script) est déjà appliqué par le
// petit script inline présent dans <head> de chaque page, pour éviter un
// flash de la mauvaise couleur au chargement.
(function () {
  var STORAGE_KEY = "sceau-theme";
  var btn = document.getElementById("theme-toggle");
  if (!btn) return;

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function currentTheme() {
    var explicit = document.documentElement.getAttribute("data-theme");
    if (explicit === "light" || explicit === "dark") return explicit;
    return systemPrefersDark() ? "dark" : "light";
  }

  function applyLabel(theme) {
    btn.setAttribute("aria-pressed", String(theme === "dark"));
    btn.setAttribute("aria-label", theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre");
  }

  applyLabel(currentTheme());

  btn.addEventListener("click", function () {
    var next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    applyLabel(next);
  });
})();
