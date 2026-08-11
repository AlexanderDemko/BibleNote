(function () {
  var root = document.documentElement;
  var stored = null;

  try {
    stored = localStorage.getItem("biblenote-theme");
  } catch (e) {
    stored = null;
  }

  if (stored === "light" || stored === "dark") {
    root.setAttribute("data-theme", stored);
  }

  function currentTheme() {
    var explicit = root.getAttribute("data-theme");
    if (explicit) return explicit;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function label(theme) {
    return theme === "dark" ? "Светлая тема" : "Тёмная тема";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.querySelector(".theme-toggle");
    if (!button) return;

    button.textContent = label(currentTheme());

    button.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      button.textContent = label(next);
      try {
        localStorage.setItem("biblenote-theme", next);
      } catch (e) {
        /* приватный режим — тема не сохранится */
      }
    });
  });
})();
