"""Gera a casa de demonstração do Construction 4D Studio (ADR-08, opção A).

Casa térrea de 10,00 × 18,00 m inspirada na "Residência simétrica do nascente"
(repositório plantas): duas suítes na frente, vestíbulo no eixo, sala com
pé-direito duplo (5,40 m livres), cozinha, WC e serviço no fundo.

Uso (só no desenvolvimento; o app não depende do IfcOpenShell):
    python -m venv .venv && .venv/bin/pip install ifcopenshell==0.9.0
    .venv/bin/python tools/gerar_demo_ifc.py

Saída: public/samples/demo.ifc (IFC4). Coordenadas em metros; x para leste,
y para o fundo do lote, z para cima. Medidas pelo eixo das paredes.
"""

from pathlib import Path

import numpy as np
import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.feature
import ifcopenshell.api.geometry
import ifcopenshell.api.material
import ifcopenshell.api.project
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.style
import ifcopenshell.api.unit
import ifcopenshell.guid
from ifcopenshell.util.shape_builder import ShapeBuilder, V

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mobilia import MATERIAIS_MOBILIA, armario, cadeira, cama, mesa, planta, rack, sofa, tapete, travesseiros, tv, vaso  # noqa: E402

SAIDA = Path(__file__).resolve().parent.parent / "public" / "samples" / "demo.ifc"

# Alturas (m)
ESP = 0.15            # espessura das paredes
BAIXO = 2.80          # topo das vigas e base da laje nas áreas comuns
PLATIBANDA = 3.40     # topo das paredes externas das áreas baixas
SALA = 5.60           # topo das vigas da sala (5,40 livres + viga)
PLATIBANDA_SALA = 6.00

m = ifcopenshell.file(schema="IFC4")
# GUIDs determinísticos: o arquivo sai igual a cada execução (diff limpo no git)
_seq = iter(range(1, 10_000))
ifcopenshell.guid.new = lambda: ifcopenshell.guid.compress(f"{0xD4A1:08x}0000400080000000{next(_seq):08x}")

projeto = ifcopenshell.api.root.create_entity(m, ifc_class="IfcProject", name="Casa de demonstração 4D")
ifcopenshell.api.unit.assign_unit(
    m,
    units=[
        ifcopenshell.api.unit.add_si_unit(m, unit_type="LENGTHUNIT"),
        ifcopenshell.api.unit.add_si_unit(m, unit_type="AREAUNIT"),
        ifcopenshell.api.unit.add_si_unit(m, unit_type="VOLUMEUNIT"),
        ifcopenshell.api.unit.add_si_unit(m, unit_type="PLANEANGLEUNIT"),
    ],
)
modelo = ifcopenshell.api.context.add_context(m, context_type="Model")
corpo = ifcopenshell.api.context.add_context(
    m, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=modelo
)

sitio = ifcopenshell.api.root.create_entity(m, ifc_class="IfcSite", name="Lote 13,30 × 30,00")
edificio = ifcopenshell.api.root.create_entity(m, ifc_class="IfcBuilding", name="Residência térrea")
terreo = ifcopenshell.api.root.create_entity(m, ifc_class="IfcBuildingStorey", name="Térreo")
ifcopenshell.api.aggregate.assign_object(m, products=[sitio], relating_object=projeto)
ifcopenshell.api.aggregate.assign_object(m, products=[edificio], relating_object=sitio)
ifcopenshell.api.aggregate.assign_object(m, products=[terreo], relating_object=edificio)
for obj in (sitio, edificio, terreo):
    ifcopenshell.api.geometry.edit_object_placement(m, product=obj)

sb = ShapeBuilder(m)

# ---------------------------------------------------------------- materiais

MATERIAIS = {
    # nome: (RGB 0..1, transparência)
    "Terreno natural": ((0.54, 0.44, 0.30), 0.0),
    "Concreto armado": ((0.62, 0.62, 0.60), 0.0),
    "Bloco cerâmico": ((0.71, 0.40, 0.22), 0.0),
    "Telha metálica termoacústica": ((0.42, 0.48, 0.55), 0.0),
    "Madeira": ((0.55, 0.36, 0.17), 0.0),
    "Vidro": ((0.56, 0.72, 0.82), 0.55),
    "Porcelanato": ((0.85, 0.82, 0.76), 0.0),
    "Louça sanitária": ((0.96, 0.96, 0.95), 0.0),
    "PVC": ((0.23, 0.49, 0.85), 0.0),
    "Polietileno": ((0.20, 0.36, 0.62), 0.0),
    "Aço pintado": ((0.30, 0.30, 0.32), 0.0),
    "Grama": ((0.37, 0.54, 0.29), 0.0),
    "Copa de árvore": ((0.31, 0.48, 0.23), 0.0),
    "Tronco": ((0.42, 0.29, 0.18), 0.0),
}
MATERIAIS.update(MATERIAIS_MOBILIA)
_mat, _estilo = {}, {}
for nome, (rgb, transp) in MATERIAIS.items():
    _mat[nome] = ifcopenshell.api.material.add_material(m, name=nome)
    estilo = ifcopenshell.api.style.add_style(m, name=nome)
    ifcopenshell.api.style.add_surface_style(
        m, style=estilo, ifc_class="IfcSurfaceStyleShading",
        attributes={
            "SurfaceColour": {"Name": None, "Red": rgb[0], "Green": rgb[1], "Blue": rgb[2]},
            "Transparency": transp,
        },
    )
    _estilo[nome] = estilo


def caixa(x0, y0, z0, x1, y1, z1):
    """Item de geometria: caixa alinhada aos eixos, em coordenadas locais do elemento."""
    perfil = sb.rectangle(size=V(x1 - x0, y1 - y0), position=V(x0, y0))
    return sb.extrude(perfil, magnitude=z1 - z0, position=V(0, 0, z0))


def elemento(ifc_class, nome, material, caixas, predefined=None, object_type=None, container=terreo):
    """Cria o produto, a geometria (lista de caixas em coordenadas do lote), o material e a cor."""
    e = ifcopenshell.api.root.create_entity(m, ifc_class=ifc_class, name=nome, predefined_type=predefined)
    if object_type:
        e.ObjectType = object_type
    x, y, z = (min(c[i] for c in caixas) for i in range(3))
    matriz = np.eye(4)
    matriz[:3, 3] = (x, y, z)
    ifcopenshell.api.geometry.edit_object_placement(m, product=e, matrix=matriz)
    itens = [caixa(c[0] - x, c[1] - y, c[2] - z, c[3] - x, c[4] - y, c[5] - z) for c in caixas]
    rep = sb.get_representation(corpo, itens)
    ifcopenshell.api.geometry.assign_representation(m, product=e, representation=rep)
    ifcopenshell.api.style.assign_representation_styles(m, shape_representation=rep, styles=[_estilo[material]] * len(itens))
    ifcopenshell.api.material.assign_material(m, products=[e], material=_mat[material])
    if container is not None:
        ifcopenshell.api.spatial.assign_container(m, products=[e], relating_structure=container)
    return e


def segmento(eixo, a, b, fixo):
    """Caixa em planta de uma faixa de largura ESP ao longo de x ('x') ou de y ('y')."""
    h = ESP / 2
    return (a - h, fixo - h, b + h, fixo + h) if eixo == "x" else (fixo - h, a - h, fixo + h, b + h)


# ---------------------------------------------------------------- terreno
# Lote mínimo 13,30 × 30,00 (recuos laterais de 1,65), com a área da casa escavada
# para que as fundações fiquem visíveis na etapa de fundação.
LX0, LX1, LY0, LY1 = -1.65, 11.65, -5.0, 25.0
HX0, HX1, HY0, HY1 = -0.45, 10.45, -0.45, 18.45
elemento(
    "IfcGeographicElement", "Terreno", "Terreno natural",
    [
        (LX0, LY0, -0.40, LX1, HY0, -0.10),
        (LX0, HY1, -0.40, LX1, LY1, -0.10),
        (LX0, HY0, -0.40, HX0, HY1, -0.10),
        (HX1, HY0, -0.40, LX1, HY1, -0.10),
    ],
    predefined="TERRAIN", container=sitio,
)

# ---------------------------------------------------------------- paredes
# (nome, eixo, início, fim, coordenada fixa, altura)
PAREDES = [
    ("Fachada frontal", "x", 0, 10, 0, PLATIBANDA),
    ("Fachada dos fundos", "x", 0, 10, 18, PLATIBANDA),
    ("Lateral oeste, suítes", "y", 0, 7.5, 0, PLATIBANDA),
    ("Lateral oeste, sala", "y", 7.5, 13.5, 0, PLATIBANDA_SALA),
    ("Lateral oeste, cozinha", "y", 13.5, 18, 0, PLATIBANDA),
    ("Lateral leste, suítes", "y", 0, 7.5, 10, PLATIBANDA),
    ("Lateral leste, sala", "y", 7.5, 13.5, 10, PLATIBANDA_SALA),
    ("Lateral leste, serviço", "y", 13.5, 18, 10, PLATIBANDA),
    ("Sala, frente", "x", 0, 10, 7.5, PLATIBANDA_SALA),
    ("Sala, fundo", "x", 0, 10, 13.5, PLATIBANDA_SALA),
    ("Vestíbulo, oeste", "y", 0, 7.5, 4, BAIXO),
    ("Vestíbulo, leste", "y", 0, 7.5, 6, BAIXO),
    ("Suíte oeste, banho", "x", 0, 4, 5, BAIXO),
    ("Suíte leste, banho", "x", 6, 10, 5, BAIXO),
    ("Cozinha, WC e serviço", "y", 13.5, 18, 6, BAIXO),
    ("WC, serviço", "x", 6, 10, 16, BAIXO),
]
paredes = {}
for nome, eixo, a, b, fixo, altura in PAREDES:
    x0, y0, x1, y1 = segmento(eixo, a, b, fixo)
    paredes[nome] = elemento("IfcWall", f"Parede: {nome}", "Bloco cerâmico", [(x0, y0, 0, x1, y1, altura)], predefined="SOLIDWALL")

# ---------------------------------------------------------------- esquadrias
# (parede, classe, nome, início ao longo do eixo, largura, peitoril, altura, predefinido)
ESQUADRIAS = [
    ("Fachada frontal", "IfcDoor", "Porta de entrada", 4.40, 1.20, 0.00, 2.10, "DOOR"),
    ("Fachada frontal", "IfcWindow", "Janela-banco da suíte oeste", 0.90, 2.20, 0.45, 2.20, "WINDOW"),
    ("Fachada frontal", "IfcWindow", "Janela-banco da suíte leste", 6.90, 2.20, 0.45, 2.20, "WINDOW"),
    ("Vestíbulo, oeste", "IfcDoor", "Porta da suíte oeste", 3.80, 0.90, 0.00, 2.10, "DOOR"),
    ("Vestíbulo, leste", "IfcDoor", "Porta da suíte leste", 3.80, 0.90, 0.00, 2.10, "DOOR"),
    ("Suíte oeste, banho", "IfcDoor", "Porta do banho oeste", 2.80, 0.90, 0.00, 2.10, "DOOR"),
    ("Suíte leste, banho", "IfcDoor", "Porta do banho leste", 6.30, 0.90, 0.00, 2.10, "DOOR"),
    ("Lateral oeste, suítes", "IfcWindow", "Basculante do banho oeste", 5.80, 0.80, 1.60, 0.60, "WINDOW"),
    ("Lateral leste, suítes", "IfcWindow", "Basculante do banho leste", 5.80, 0.80, 1.60, 0.60, "WINDOW"),
    ("Sala, frente", "IfcDoor", "Porta da sala", 4.50, 1.00, 0.00, 2.10, "DOOR"),
    ("Sala, frente", "IfcWindow", "Janela alta da sala, frente oeste", 1.00, 2.00, 3.60, 1.20, "WINDOW"),
    ("Sala, frente", "IfcWindow", "Janela alta da sala, frente leste", 7.00, 2.00, 3.60, 1.20, "WINDOW"),
    ("Lateral oeste, sala", "IfcWindow", "Pano de vidro oeste da sala", 9.00, 3.00, 0.40, 4.60, "WINDOW"),
    ("Lateral leste, sala", "IfcWindow", "Pano de vidro leste da sala", 9.00, 3.00, 0.40, 4.60, "WINDOW"),
    ("Sala, fundo", "IfcDoor", "Passagem para a cozinha", 1.50, 2.00, 0.00, 2.10, "DOOR"),
    ("Sala, fundo", "IfcWindow", "Janela alta da sala, fundo leste", 7.00, 2.00, 3.60, 1.20, "WINDOW"),
    ("Cozinha, WC e serviço", "IfcDoor", "Porta do WC", 14.20, 0.90, 0.00, 2.10, "DOOR"),
    ("Cozinha, WC e serviço", "IfcDoor", "Porta do serviço", 16.50, 0.90, 0.00, 2.10, "DOOR"),
    ("Fachada dos fundos", "IfcDoor", "Porta dos fundos", 8.00, 0.90, 0.00, 2.10, "DOOR"),
    ("Fachada dos fundos", "IfcWindow", "Janela da cozinha", 1.50, 3.00, 1.10, 1.00, "WINDOW"),
    ("Lateral oeste, cozinha", "IfcWindow", "Janela lateral da cozinha", 15.00, 2.00, 1.10, 1.00, "WINDOW"),
    ("Lateral leste, serviço", "IfcWindow", "Basculante do WC", 14.50, 0.80, 1.60, 0.60, "WINDOW"),
    ("Lateral leste, serviço", "IfcWindow", "Janela do serviço", 16.60, 0.80, 1.10, 1.00, "WINDOW"),
]
EIXO = {n: (e, f) for n, e, _a, _b, f, _h in PAREDES}
for parede, classe, nome, ini, larg, peitoril, alt, predef in ESQUADRIAS:
    eixo, fixo = EIXO[parede]
    folga = ESP / 2 + 0.05
    if eixo == "x":
        vao = (ini, fixo - folga, peitoril, ini + larg, fixo + folga, peitoril + alt)
        folha = (ini, fixo - 0.02, peitoril, ini + larg, fixo + 0.02, peitoril + alt)
    else:
        vao = (fixo - folga, ini, peitoril, fixo + folga, ini + larg, peitoril + alt)
        folha = (fixo - 0.02, ini, peitoril, fixo + 0.02, ini + larg, peitoril + alt)
    abertura = elemento("IfcOpeningElement", f"Vão: {nome}", "Concreto armado", [vao], predefined="OPENING", container=None)
    ifcopenshell.api.feature.add_feature(m, feature=abertura, element=paredes[parede])
    if nome.startswith("Passagem"):
        continue  # vão livre, sem folha
    material = "Madeira" if classe == "IfcDoor" else "Vidro"
    esq = elemento(classe, nome, material, [folha], predefined=predef)
    esq.OverallWidth, esq.OverallHeight = larg, alt
    ifcopenshell.api.feature.add_filling(m, opening=abertura, element=esq)

# ---------------------------------------------------------------- fundação
for nome, eixo, a, b, fixo, _h in PAREDES:
    x0, y0, x1, y1 = segmento(eixo, a, b, fixo)
    elemento("IfcFooting", f"Viga baldrame: {nome}", "Concreto armado", [(x0, y0, -0.50, x1, y1, -0.10)], predefined="STRIP_FOOTING")

PILARES = [(x, y) for y in (0, 5, 7.5, 13.5, 18) for x in (0, 4, 6, 10)]
PILARES = [p for p in PILARES if not (p[1] == 18 and p[0] in (4,))]
for x, y in PILARES:
    elemento("IfcFooting", f"Sapata P({x:g};{y:g})", "Concreto armado",
             [(x - 0.40, y - 0.40, -1.10, x + 0.40, y + 0.40, -0.50)], predefined="PAD_FOOTING")

elemento("IfcSlab", "Contrapiso", "Concreto armado", [(-0.075, -0.075, -0.10, 10.075, 18.075, 0.0)], predefined="BASESLAB")

# ---------------------------------------------------------------- estrutura
for x, y in PILARES:
    topo = SALA if y in (7.5, 13.5) or (x in (0, 10) and 7.5 < y < 13.5) else BAIXO
    elemento("IfcColumn", f"Pilar P({x:g};{y:g})", "Concreto armado",
             [(x - 0.10, y - 0.10, 0, x + 0.10, y + 0.10, topo)], predefined="COLUMN")

for nome, eixo, a, b, fixo, altura in PAREDES:
    x0, y0, x1, y1 = segmento(eixo, a, b, fixo)
    topo = SALA if altura == PLATIBANDA_SALA else BAIXO
    elemento("IfcBeam", f"Viga: {nome}", "Concreto armado", [(x0, y0, topo - 0.35, x1, y1, topo)], predefined="BEAM")
    if altura == PLATIBANDA_SALA and eixo == "x":
        # as paredes da sala também apoiam a laje baixa vizinha
        elemento("IfcBeam", f"Viga baixa: {nome}", "Concreto armado", [(x0, y0, BAIXO - 0.35, x1, y1, BAIXO)], predefined="BEAM")

# ---------------------------------------------------------------- lajes e cobertura
elemento("IfcSlab", "Laje de forro, suítes e vestíbulo", "Concreto armado", [(0, 0, BAIXO, 10, 7.5, BAIXO + 0.10)], predefined="FLOOR")
elemento("IfcSlab", "Laje de forro, cozinha e serviço", "Concreto armado", [(0, 13.5, BAIXO, 10, 18, BAIXO + 0.10)], predefined="FLOOR")

telhado = ifcopenshell.api.root.create_entity(m, ifc_class="IfcRoof", name="Cobertura", predefined_type="FLAT_ROOF")
ifcopenshell.api.spatial.assign_container(m, products=[telhado], relating_structure=terreo)
ifcopenshell.api.geometry.edit_object_placement(m, product=telhado)
aguas = [
    elemento("IfcSlab", "Telhado, suítes e vestíbulo", "Telha metálica termoacústica", [(0.075, 0.075, 3.05, 9.925, 7.425, 3.12)], predefined="ROOF", container=None),
    elemento("IfcSlab", "Telhado, cozinha e serviço", "Telha metálica termoacústica", [(0.075, 13.575, 3.05, 9.925, 17.925, 3.12)], predefined="ROOF", container=None),
    elemento("IfcSlab", "Telhado da sala", "Telha metálica termoacústica", [(0.075, 7.575, SALA + 0.10, 9.925, 13.425, SALA + 0.17)], predefined="ROOF", container=None),
]
ifcopenshell.api.aggregate.assign_object(m, products=aguas, relating_object=telhado)

# ---------------------------------------------------------------- instalações
elemento("IfcTank", "Caixa d'água 1.000 L", "Polietileno", [(4.30, 2.00, BAIXO + 0.10, 5.70, 3.40, BAIXO + 1.10)], predefined="STORAGE")
elemento("IfcElectricDistributionBoard", "Quadro de distribuição", "Aço pintado", [(4.09, 0.80, 1.40, 4.17, 1.30, 1.90)], predefined="DISTRIBUTIONBOARD")
PRUMADAS = [
    ("Prumada de água, banho oeste", (0.20, 6.80)),
    ("Prumada de água, banho leste", (9.70, 6.80)),
    ("Prumada de água, cozinha", (0.20, 17.70)),
    ("Prumada de água, WC e serviço", (9.70, 15.90)),
]
for nome, (x, y) in PRUMADAS:
    elemento("IfcPipeSegment", nome, "PVC", [(x, y, 0, x + 0.10, y + 0.10, BAIXO + 0.10)], predefined="RIGIDSEGMENT")
elemento("IfcPipeSegment", "Barrilete", "PVC", [(0.20, 2.60, BAIXO + 0.12, 9.80, 2.70, BAIXO + 0.22)], predefined="RIGIDSEGMENT")

# ---------------------------------------------------------------- pisos
COMODOS = [
    ("Suíte oeste", 0, 0, 4, 5),
    ("Suíte leste", 6, 0, 10, 5),
    ("Banho oeste", 0, 5, 4, 7.5),
    ("Banho leste", 6, 5, 10, 7.5),
    ("Vestíbulo", 4, 0, 6, 7.5),
    ("Sala", 0, 7.5, 10, 13.5),
    ("Cozinha", 0, 13.5, 6, 18),
    ("WC", 6, 13.5, 10, 16),
    ("Serviço", 6, 16, 10, 18),
]
h = ESP / 2
for nome, x0, y0, x1, y1 in COMODOS:
    elemento("IfcCovering", f"Piso: {nome}", "Porcelanato", [(x0 + h, y0 + h, 0, x1 - h, y1 - h, 0.02)], predefined="FLOORING")

# ---------------------------------------------------------------- louças e metais
LOUCAS = [
    ("Bacia sanitária, banho oeste", "TOILETPAN", (0.30, 6.30, 0, 0.90, 6.70, 0.42)),
    ("Lavatório, banho oeste", "WASHHANDBASIN", (2.80, 5.20, 0.78, 3.40, 5.65, 0.88)),
    ("Bacia sanitária, banho leste", "TOILETPAN", (9.10, 6.30, 0, 9.70, 6.70, 0.42)),
    ("Lavatório, banho leste", "WASHHANDBASIN", (6.60, 5.20, 0.78, 7.20, 5.65, 0.88)),
    ("Bacia sanitária, WC", "TOILETPAN", (9.10, 14.40, 0, 9.70, 14.80, 0.42)),
    ("Lavatório, WC", "WASHHANDBASIN", (7.00, 15.30, 0.78, 7.60, 15.75, 0.88)),
    ("Pia da cozinha", "SINK", (0.20, 15.00, 0.85, 0.75, 16.80, 0.92)),
    ("Tanque", "SINK", (9.25, 17.00, 0.75, 9.80, 17.60, 0.95)),
]
for nome, predef, c in LOUCAS:
    elemento("IfcSanitaryTerminal", nome, "Louça sanitária", [c], predefined=predef)

# ---------------------------------------------------------------- paisagismo
def paisagismo(nome, material, caixas):
    elemento("IfcGeographicElement", nome, material, caixas, predefined="USERDEFINED", object_type="PAISAGISMO", container=sitio)


paisagismo("Gramado frontal", "Grama", [(-1.65, -5.0, -0.10, 11.65, -0.60, -0.05)])
paisagismo("Gramado do quintal", "Grama", [(-1.65, 18.60, -0.10, 11.65, 25.0, -0.05)])
for i, (x, y) in enumerate([(-0.80, 21.5), (5.0, 23.0), (10.8, 21.5)], start=1):
    paisagismo(f"Árvore {i}", "Copa de árvore", [(x - 0.12, y - 0.12, -0.05, x + 0.12, y + 0.12, 2.20), (x - 1.0, y - 1.0, 2.20, x + 1.0, y + 1.0, 4.00)])

# ---------------------------------------------------------------- mobília (humanização da obra pronta, ADR-23)
# no fim do arquivo, para não mudar os GUIDs dos elementos anteriores
def movel(nome, material, caixas, tipo="USERDEFINED"):
    elemento("IfcFurniture", nome, material, caixas, predefined=tipo)


P = 0.02  # piso acabado
# sala (0–10 × 7,5–13,5)
movel("Sofá da sala", "Tecido", sofa(6.3, 7.7, 8.7, 8.6, P, "y0"), "SOFA")
movel("Tapete da sala", "Tecido claro", tapete(6.2, 8.9, 8.8, 11.6, P))
movel("Mesa de centro", "Madeira", mesa(6.9, 9.3, 8.1, 9.9, P, 0.42), "TABLE")
movel("Rack da TV", "Madeira", rack(6.4, 12.9, 8.6, 13.35, P))
movel("TV da sala", "Tela de TV", tv(6.4, 12.9, 8.6, 13.35, P, "y1"))
movel("Mesa de jantar", "Madeira clara", mesa(1.2, 9.5, 2.8, 11.0, P), "TABLE")
for i, (x, y, c) in enumerate([(1.6, 9.1, "y0"), (2.4, 9.1, "y0"), (1.6, 11.4, "y1"), (2.4, 11.4, "y1")], start=1):
    movel(f"Cadeira de jantar {i}", "Madeira clara", cadeira(x, y, P, c), "CHAIR")
movel("Vaso da sala", "Terracota", vaso(9.4, 8.1, P))
movel("Planta da sala", "Folhagem", planta(9.4, 8.1, P))
# suítes (0–4 e 6–10 × 0–5)
movel("Cama da suíte oeste", "Tecido claro", cama(0.15, 1.6, 2.15, 3.2, P, "x0"), "BED")
movel("Travesseiros da suíte oeste", "Tecido", travesseiros(0.15, 1.6, 2.15, 3.2, P, "x0"))
movel("Guarda-roupa da suíte oeste", "Madeira", armario(3.3, 0.3, 3.9, 2.3, P), "SHELF")
movel("Cama da suíte leste", "Tecido claro", cama(7.85, 1.6, 9.85, 3.2, P, "x1"), "BED")
movel("Travesseiros da suíte leste", "Tecido", travesseiros(7.85, 1.6, 9.85, 3.2, P, "x1"))
movel("Guarda-roupa da suíte leste", "Madeira", armario(6.1, 0.3, 6.7, 2.3, P), "SHELF")
# cozinha (0–6 × 13,5–18)
movel("Bancada da cozinha", "Madeira clara", [(0.15, 13.9, P, 0.75, 14.9, 0.85), (0.15, 16.9, P, 0.75, 17.8, 0.85)], "USERDEFINED")
movel("Geladeira", "Aço inox", armario(4.6, 13.7, 5.3, 14.35, P, 1.8))
movel("Mesa da cozinha", "Madeira clara", mesa(2.4, 15.4, 3.6, 16.2, P), "TABLE")

# ---------------------------------------------------------------- gravação
SAIDA.parent.mkdir(parents=True, exist_ok=True)
m.header.file_name.time_stamp = "2026-10-07T00:00:00"
m.header.file_name.author = ("Construction 4D Studio",)
m.write(str(SAIDA))
print(f"{SAIDA} gravado: {len(m.by_type('IfcProduct'))} produtos")
