"""Prévia estática da simulação 4D da casa de demonstração.

Aplica as regras-padrão do ADR-02 ao demo.ifc e ao demo-cronograma.csv e
desenha a casa em seis datas. Serve para conferir o arquivo de demonstração
antes de o app existir; não faz parte do app.

Uso:
    .venv/bin/pip install ifcopenshell==0.9.0 matplotlib
    .venv/bin/python tools/previa_demo.py
Saída: docs/demo-etapas.png
"""

import csv
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element

RAIZ = Path(__file__).resolve().parent.parent
IFC = RAIZ / "public" / "samples" / "demo.ifc"
CSV = RAIZ / "public" / "samples" / "demo-cronograma.csv"
SAIDA = RAIZ / "docs" / "demo-etapas.png"

# Regras-padrão (ADR-02): categoria da tarefa -> (ação, filtro do elemento)
def _pt(e):
    return getattr(e, "PredefinedType", None)


REGRAS = {
    "terreno": ("construct", lambda e: e.is_a("IfcGeographicElement") and _pt(e) == "TERRAIN"),
    "fundacao": ("construct", lambda e: e.is_a("IfcFooting") or (e.is_a("IfcSlab") and _pt(e) == "BASESLAB")),
    "estrutura": ("construct", lambda e: e.is_a("IfcColumn") or e.is_a("IfcBeam")),
    "alvenaria": ("construct", lambda e: e.is_a("IfcWall")),
    "laje": ("construct", lambda e: e.is_a("IfcSlab") and _pt(e) == "FLOOR"),
    "cobertura": ("construct", lambda e: e.is_a("IfcSlab") and _pt(e) == "ROOF"),
    "instalacoes": ("install", lambda e: e.is_a("IfcPipeSegment") or e.is_a("IfcTank") or e.is_a("IfcElectricDistributionBoard")),
    "reboco": ("finish", lambda e: e.is_a("IfcWall")),
    "esquadrias": ("install", lambda e: e.is_a("IfcDoor") or e.is_a("IfcWindow")),
    "revestimento": ("construct", lambda e: e.is_a("IfcCovering") and _pt(e) == "FLOORING"),
    "pintura": ("finish", lambda e: e.is_a("IfcWall")),
    "loucas": ("install", lambda e: e.is_a("IfcSanitaryTerminal")),
    "paisagismo": ("construct", lambda e: e.is_a("IfcGeographicElement") and e.ObjectType == "PAISAGISMO"),
}
# Aparência das paredes conforme o último acabamento concluído
COR_PAREDE = {None: (0.71, 0.40, 0.22), "reboco": (0.78, 0.76, 0.72), "pintura": (0.95, 0.93, 0.88)}

modelo = ifcopenshell.open(str(IFC))
with open(CSV, encoding="utf-8") as f:
    tarefas = list(csv.DictReader(f))
inicio = date.fromisoformat(tarefas[0]["inicio"])
for t in tarefas:  # índice de dia, fim inclusivo (ADR-05)
    t["ini"] = (date.fromisoformat(t["inicio"]) - inicio).days
    t["fim"] = (date.fromisoformat(t["fim"]) - inicio).days

# elemento -> tarefas que o constroem / acabam
vinculos = {}
for e in modelo.by_type("IfcElement"):
    for t in tarefas:
        regra = REGRAS.get(t["categoria"])
        if regra and regra[1](e):
            vinculos.setdefault(e.id(), []).append((regra[0], t))

# geometria em coordenadas globais
cfg = ifcopenshell.geom.settings()
cfg.set("use-world-coords", True)
malhas = {}
it = ifcopenshell.geom.iterator(cfg, modelo)
if it.initialize():
    while True:
        s = it.get()
        v = np.array(s.geometry.verts).reshape(-1, 3)
        fc = np.array(s.geometry.faces).reshape(-1, 3)
        mats = s.geometry.materials
        cor = tuple(mats[0].diffuse.components) if mats else (0.6, 0.6, 0.6)
        malhas[s.id] = (v[fc], tuple(cor), mats[0].transparency if mats else 0.0)
        if not it.next():
            break


def avaliar(dia):
    """Função pura do ADR-03, simplificada: id -> (visível, em execução, cor)."""
    estado = {}
    for eid, lista in vinculos.items():
        construir = [t for a, t in lista if a in ("construct", "install")]
        if not construir or dia < construir[0]["ini"]:
            continue
        em_exec = dia <= construir[0]["fim"]
        _tri, cor, _tr = malhas[eid]
        acab = [t for a, t in lista if a == "finish" and dia > t["fim"]]
        if modelo.by_id(eid).is_a("IfcWall"):
            cor = COR_PAREDE[acab[-1]["categoria"] if acab else None]
        estado[eid] = (em_exec, cor)
    return estado


DATAS = [25, 45, 85, 108, 150, 179]
fig = plt.figure(figsize=(18, 11), facecolor="white")
for i, dia in enumerate(DATAS):
    ax = fig.add_subplot(2, 3, i + 1, projection="3d")
    est = avaliar(dia)
    # uma única coleção, para o matplotlib ordenar a profundidade triângulo a triângulo
    tris, cores = [], []
    for eid, (em_exec, cor) in est.items():
        tri, _c, transp = malhas[eid]
        rgba = (*cor, 0.45 if transp > 0.3 else 1.0)
        if em_exec:  # destaque laranja para o que está em execução
            rgba = (0.95, 0.55, 0.15, 0.95)
        tris.extend(tri)
        cores.extend([rgba] * len(tri))
    if tris:
        ax.add_collection3d(Poly3DCollection(tris, facecolors=cores, edgecolors=(0, 0, 0, 0.10), linewidths=0.15))
    ax.set_xlim(-2, 12); ax.set_ylim(-5, 25); ax.set_zlim(-1.5, 7)
    ax.set_box_aspect((14, 30, 8.5))
    ax.view_init(elev=28, azim=-58)
    ax.set_axis_off()
    andamento = [t["nome"] for t in tarefas if t["ini"] <= dia <= t["fim"]]
    d = date.fromordinal(inicio.toordinal() + dia)
    ax.set_title(f"Dia {dia + 1} · {d:%d/%m/%Y}\n{', '.join(andamento)}", fontsize=10)
fig.suptitle("Casa de demonstração 4D: em laranja, o que está em execução", fontsize=13)
fig.tight_layout()
SAIDA.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(SAIDA, dpi=110)
print(f"{SAIDA} gravado; {len(vinculos)} elementos vinculados de {len(malhas)} com geometria")
