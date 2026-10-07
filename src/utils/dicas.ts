// Motor de dicas do design system Papel e Tinta (componentes/dicas.js), em TypeScript.
// Um balão único em position:fixed: nada o recorta, e funciona com conteúdo criado pelo React.
// Linhas do data-tip viram linhas do balão; "Rótulo:" sai em negrito; data-tip-t é o título.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function iniciarDicas(): void {
  let balao: HTMLDivElement | null = null;
  let alvoAtual: Element | null = null;

  const montar = () => {
    if (balao) return balao;
    balao = document.createElement("div");
    balao.className = "dica";
    balao.setAttribute("role", "tooltip");
    document.body.appendChild(balao);
    return balao;
  };

  const posicionar = (alvo: Element) => {
    const b = montar();
    const r = alvo.getBoundingClientRect();
    const d = b.getBoundingClientRect();
    let topo = r.top - d.height - 9;
    if (topo < 8) topo = Math.min(window.innerHeight - d.height - 8, r.bottom + 9);
    b.style.top = `${Math.max(8, topo)}px`;
    b.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - d.width / 2, window.innerWidth - d.width - 8))}px`;
  };

  const mostrar = (alvo: Element) => {
    const texto = alvo.getAttribute("data-tip");
    if (!texto) return;
    const b = montar();
    alvoAtual = alvo;
    const titulo = alvo.getAttribute("data-tip-t");
    b.innerHTML =
      (titulo ? `<span class="t">${esc(titulo)}</span>` : "") +
      texto
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<span class="l">${esc(l).replace(/^([^:]{3,30}):/, "<b>$1:</b>")}</span>`)
        .join("");
    b.style.maxWidth = `${Math.min(380, window.innerWidth - 24)}px`;
    b.classList.add("visivel");
    posicionar(alvo);
  };

  const esconder = () => {
    balao?.classList.remove("visivel");
    alvoAtual = null;
  };

  const alvoDe = (ev: Event) => ((ev.target as Element | null)?.closest?.("[data-tip]") ?? null);
  document.addEventListener("mouseover", (ev) => {
    const alvo = alvoDe(ev);
    if (alvo === alvoAtual) return;
    if (alvo) mostrar(alvo);
    else esconder();
  });
  document.addEventListener("focusin", (ev) => {
    const alvo = alvoDe(ev);
    if (alvo) mostrar(alvo);
  });
  document.addEventListener("focusout", esconder);
  document.addEventListener("keydown", (ev) => ev.key === "Escape" && esconder());
  window.addEventListener("scroll", esconder, true);
  window.addEventListener("resize", esconder);
}
