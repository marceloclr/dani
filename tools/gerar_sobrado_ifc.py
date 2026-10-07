"""Gera o sobrado de exemplo do Construction 4D Studio (segundo modelo IFC de teste).

Sobrado de 8,00 × 12,00 m em dois pavimentos (Térreo e Pavimento superior),
com escada, laje intermediária com vão, telhado de duas águas com oitões,
portas e janelas em vãos, louças, caixa d'água e paisagismo. Serve para testar
tarefas por pavimento (ADR-19) e o cronograma estimado (ADR-18) com um IFC real.

Uso (só no desenvolvimento):
    .venv/bin/python tools/gerar_sobrado_ifc.py
Saída: public/modelos/sobrado-exemplo.ifc (IFC4, metros). Norte verdadeiro no IFC: a frente olha para 70°;
y para o fundo do lote, z para cima. Medidas pelo eixo das paredes.
"""

from pathlib import Path

import numpy as np
import math
import ifcopenshell
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.feature
import ifcopenshell.api.geometry
import ifcopenshell.api.material
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.style
import ifcopenshell.api.unit
import ifcopenshell.guid
from ifcopenshell.util.shape_builder import ShapeBuilder, V

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mobilia import MATERIAIS_MOBILIA, armario, cadeira, cama, mesa, planta, rack, sofa, tapete, travesseiros, tv, vaso  # noqa: E402

SAIDA = Path(__file__).resolve().parent.parent / "public" / "modelos" / "sobrado-exemplo.ifc"

W, D = 8.0, 12.0  # largura (x) e profundidade (y)
ESP = 0.15
PD = 2.80  # pé-direito
LAJE = 0.20
N1 = PD + LAJE  # cota do pavimento superior (3,00)
FORRO = N1 + PD  # topo das paredes do superior (5,80)
BEIRAL = 0.5

m = ifcopenshell.file(schema="IFC4")
_seq = iter(range(1, 10_000))
ifcopenshell.guid.new = lambda: ifcopenshell.guid.compress(f"{0x50B2:08x}0000400080000000{next(_seq):08x}")

projeto = ifcopenshell.api.root.create_entity(m, ifc_class="IfcProject", name="Sobrado de exemplo 4D")
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
corpo = ifcopenshell.api.context.add_context(m, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=modelo)
# norte verdadeiro (ADR-26): a fachada frontal (−Y do IFC) olha para o lés-nordeste (70°), para o sol da
# tarde bater nos fundos e na lateral; o vetor do norte, no plano XY do modelo, sai dessa orientação
RUMO_FRENTE = math.radians(70)
modelo.TrueNorth = m.createIfcDirection((math.sin(RUMO_FRENTE), -math.cos(RUMO_FRENTE)))

sitio = ifcopenshell.api.root.create_entity(m, ifc_class="IfcSite", name="Lote 12,00 × 25,00")


def gms(graus):
    """Ângulo composto do IFC (graus, minutos, segundos, milionésimos), todos com o mesmo sinal."""
    sinal = -1 if graus < 0 else 1
    resto = abs(graus)
    g = int(resto); resto = (resto - g) * 60
    mi = int(resto); resto = (resto - mi) * 60
    se = int(resto); mil = int(round((resto - se) * 1e6))
    return tuple(sinal * x for x in (g, mi, se, mil))


# sede de Fortaleza (IBGE), para a posição do sol
sitio.RefLatitude, sitio.RefLongitude, sitio.RefElevation = gms(-3.71664), gms(-38.5423), 21.0
edificio = ifcopenshell.api.root.create_entity(m, ifc_class="IfcBuilding", name="Sobrado")
terreo = ifcopenshell.api.root.create_entity(m, ifc_class="IfcBuildingStorey", name="Térreo")
superior = ifcopenshell.api.root.create_entity(m, ifc_class="IfcBuildingStorey", name="Pavimento superior")
terreo.Elevation, superior.Elevation = 0.0, N1
ifcopenshell.api.aggregate.assign_object(m, products=[sitio], relating_object=projeto)
ifcopenshell.api.aggregate.assign_object(m, products=[edificio], relating_object=sitio)
ifcopenshell.api.aggregate.assign_object(m, products=[terreo, superior], relating_object=edificio)
for obj in (sitio, edificio, terreo, superior):
    ifcopenshell.api.geometry.edit_object_placement(m, product=obj)

sb = ShapeBuilder(m)

MATERIAIS = {
    "Terreno natural": ((0.54, 0.44, 0.30), 0.0),
    "Concreto armado": ((0.62, 0.62, 0.60), 0.0),
    "Bloco cerâmico": ((0.71, 0.40, 0.22), 0.0),
    "Telha cerâmica": ((0.55, 0.27, 0.18), 0.0),
    "Madeira": ((0.55, 0.36, 0.17), 0.0),
    "Vidro": ((0.56, 0.72, 0.82), 0.55),
    "Porcelanato": ((0.85, 0.82, 0.76), 0.0),
    # acabamentos (INC-13)
    "Esquadria de alumínio preto": ((0.13, 0.13, 0.14), 0.0),
    "Granito cinza": ((0.55, 0.55, 0.54), 0.0),
    "Laca branca": ((0.94, 0.93, 0.90), 0.0),
    "Rodapé de porcelanato": ((0.85, 0.82, 0.76), 0.0),
    "Pedra em cacos": ((0.62, 0.58, 0.52), 0.0),
    "Ripado de madeira freijó": ((0.62, 0.43, 0.26), 0.0),
    "Louça sanitária": ((0.96, 0.96, 0.95), 0.0),
    "PVC": ((0.23, 0.49, 0.85), 0.0),
    "Polietileno": ((0.20, 0.36, 0.62), 0.0),
    "Grama": ((0.37, 0.54, 0.29), 0.0),
    "Copa de árvore": ((0.31, 0.48, 0.23), 0.0),
}
MATERIAIS.update(MATERIAIS_MOBILIA)
_mat, _estilo = {}, {}
for nome, (rgb, transp) in MATERIAIS.items():
    _mat[nome] = ifcopenshell.api.material.add_material(m, name=nome)
    estilo = ifcopenshell.api.style.add_style(m, name=nome)
    ifcopenshell.api.style.add_surface_style(
        m, style=estilo, ifc_class="IfcSurfaceStyleShading",
        attributes={"SurfaceColour": {"Name": None, "Red": rgb[0], "Green": rgb[1], "Blue": rgb[2]}, "Transparency": transp},
    )
    _estilo[nome] = estilo


def caixa(x0, y0, z0, x1, y1, z1):
    """Item de geometria: caixa alinhada aos eixos, em coordenadas do lote."""
    return sb.extrude(sb.rectangle(size=V(x1 - x0, y1 - y0), position=V(x0, y0)), magnitude=z1 - z0, position=V(0, 0, z0))


def prisma_xz(pontos_xz, y_fundo, comprimento):
    """Perfil no plano XZ (x, z) extrudado de y_fundo em direção à frente (−y), por `comprimento`."""
    perfil = sb.polyline([V(x, z) for x, z in pontos_xz], closed=True)
    return sb.extrude(perfil, magnitude=comprimento, position=V(0, y_fundo, 0), position_x_axis=V(1, 0, 0), position_z_axis=V(0, -1, 0))


def elemento(ifc_class, nome, material, itens, predefined=None, object_type=None, container=None):
    e = ifcopenshell.api.root.create_entity(m, ifc_class=ifc_class, name=nome, predefined_type=predefined)
    if object_type:
        e.ObjectType = object_type
    ifcopenshell.api.geometry.edit_object_placement(m, product=e, matrix=np.eye(4))
    rep = sb.get_representation(corpo, itens)
    ifcopenshell.api.geometry.assign_representation(m, product=e, representation=rep)
    ifcopenshell.api.style.assign_representation_styles(m, shape_representation=rep, styles=[_estilo[material]] * len(itens))
    ifcopenshell.api.material.assign_material(m, products=[e], material=_mat[material])
    if container is not None:
        ifcopenshell.api.spatial.assign_container(m, products=[e], relating_structure=container)
    return e


def faixa(eixo, a, b, fixo, z0, z1, esp=ESP):
    h = esp / 2
    return caixa(a - h, fixo - h, z0, b + h, fixo + h, z1) if eixo == "x" else caixa(fixo - h, a - h, z0, fixo + h, b + h, z1)


# ---------------------------------------------------------------- terreno (lote 12 × 25, área da casa escavada)
LX0, LX1, LY0, LY1 = -2.0, 10.0, -5.0, 20.0
g = 0.45
elemento("IfcGeographicElement", "Terreno", "Terreno natural",
         [caixa(LX0, LY0, -0.4, LX1, -g, -0.1), caixa(LX0, D + g, -0.4, LX1, LY1, -0.1), caixa(LX0, -g, -0.4, -g, D + g, -0.1), caixa(W + g, -g, -0.4, LX1, D + g, -0.1)],
         predefined="TERRAIN", container=sitio)

# ---------------------------------------------------------------- paredes por pavimento
# (nome, eixo, início, fim, fixo)
EXTERNAS = [("fachada frontal", "x", 0, W, 0), ("fachada dos fundos", "x", 0, W, D), ("lateral oeste", "y", 0, D, 0), ("lateral leste", "y", 0, D, W)]
INTERNAS = {
    "Térreo": [("sala e cozinha", "x", 0, 5.8, 7.0), ("cozinha e escada", "y", 7.0, D, 6.7)],
    "Pavimento superior": [("quartos e corredor", "x", 0, W, 6.0), ("entre os quartos", "y", 0, 6.0, 4.0), ("banheiro, frente", "x", 0, 3.0, 8.5), ("banheiro, lado", "y", 8.5, D, 3.0)],
}
# (parede, classe, nome, início, largura, peitoril, altura)
VAOS = {
    "Térreo": [
        ("fachada frontal", "IfcDoor", "Porta de entrada", 1.0, 1.1, 0.0, 2.1),
        ("fachada frontal", "IfcWindow", "Janela da sala", 3.5, 3.0, 0.5, 2.0),
        ("lateral oeste", "IfcWindow", "Janela lateral da sala", 2.0, 2.0, 1.0, 1.2),
        ("lateral leste", "IfcWindow", "Janela leste da sala", 1.5, 2.0, 1.0, 1.2),
        ("fachada dos fundos", "IfcDoor", "Porta da cozinha", 4.0, 0.9, 0.0, 2.1),
        ("fachada dos fundos", "IfcWindow", "Janela da cozinha", 1.0, 2.0, 1.1, 1.0),
        ("lateral oeste", "IfcWindow", "Janela lateral da cozinha", 9.0, 1.5, 1.1, 1.0),
    ],
    "Pavimento superior": [
        ("fachada frontal", "IfcWindow", "Janela do quarto 1", 1.0, 2.0, 1.0, 1.2),
        ("fachada frontal", "IfcWindow", "Janela do quarto 2", 5.0, 2.0, 1.0, 1.2),
        ("fachada dos fundos", "IfcWindow", "Basculante do banheiro", 1.0, 1.0, 1.6, 0.6),
        ("fachada dos fundos", "IfcWindow", "Janela do escritório", 4.2, 1.6, 1.0, 1.2),
        ("quartos e corredor", "IfcDoor", "Porta do quarto 1", 1.5, 0.9, 0.0, 2.1),
        ("quartos e corredor", "IfcDoor", "Porta do quarto 2", 4.8, 0.9, 0.0, 2.1),
        ("banheiro, lado", "IfcDoor", "Porta do banheiro", 9.0, 0.8, 0.0, 2.1),
    ],
}

for pav, z0 in (("Térreo", 0.0), ("Pavimento superior", N1)):
    pavimento = terreo if pav == "Térreo" else superior
    linhas = [(n, e, a, b, f, True) for n, e, a, b, f in EXTERNAS] + [(n, e, a, b, f, False) for n, e, a, b, f in INTERNAS[pav]]
    paredes = {}
    for nome, eixo, a, b, fixo, ext in linhas:
        paredes[nome] = elemento("IfcWall", f"Parede: {nome} ({pav.lower()})", "Bloco cerâmico", [faixa(eixo, a, b, fixo, z0, z0 + PD)], predefined="SOLIDWALL", container=pavimento)
    eixos = {n: (e, f) for n, e, _a, _b, f, _x in linhas}
    for parede, classe, nome, ini, larg, peit, alt in VAOS[pav]:
        eixo, fixo = eixos[parede]
        folga = ESP / 2 + 0.05
        if eixo == "x":
            vao = caixa(ini, fixo - folga, z0 + peit, ini + larg, fixo + folga, z0 + peit + alt)
            folha = caixa(ini, fixo - 0.02, z0 + peit, ini + larg, fixo + 0.02, z0 + peit + alt)
        else:
            vao = caixa(fixo - folga, ini, z0 + peit, fixo + folga, ini + larg, z0 + peit + alt)
            folha = caixa(fixo - 0.02, ini, z0 + peit, fixo + 0.02, ini + larg, z0 + peit + alt)
        abertura = elemento("IfcOpeningElement", f"Vão: {nome}", "Concreto armado", [vao], predefined="OPENING")
        ifcopenshell.api.feature.add_feature(m, feature=abertura, element=paredes[parede])
        esq = elemento(classe, nome, "Madeira" if classe == "IfcDoor" else "Vidro", [folha], predefined="DOOR" if classe == "IfcDoor" else "WINDOW", container=pavimento)
        esq.OverallWidth, esq.OverallHeight = larg, alt
        ifcopenshell.api.feature.add_filling(m, opening=abertura, element=esq)

    # pilares e vigas do pavimento
    for x in (0, W / 2, W):
        for y in (0, 6.0, D):
            elemento("IfcColumn", f"Pilar P({x:g};{y:g}) {pav.lower()}", "Concreto armado", [caixa(x - 0.1, y - 0.1, z0, x + 0.1, y + 0.1, z0 + PD)], predefined="COLUMN", container=pavimento)
    for nome, eixo, a, b, fixo in EXTERNAS + [("eixo y = 6", "x", 0, W, 6.0), ("eixo x = 4", "y", 0, D, W / 2)]:
        elemento("IfcBeam", f"Viga: {nome} ({pav.lower()})", "Concreto armado", [faixa(eixo, a - ESP / 2, b + ESP / 2, fixo, z0 + PD - 0.35, z0 + PD)], predefined="BEAM", container=pavimento)

# ---------------------------------------------------------------- fundação (térreo)
for nome, eixo, a, b, fixo in EXTERNAS + [(n, e, a, b, f) for n, e, a, b, f in INTERNAS["Térreo"]]:
    elemento("IfcFooting", f"Viga baldrame: {nome}", "Concreto armado", [faixa(eixo, a - ESP / 2, b + ESP / 2, fixo, -0.5, -0.1, 0.4)], predefined="STRIP_FOOTING", container=terreo)
for x in (0, W / 2, W):
    for y in (0, 6.0, D):
        elemento("IfcFooting", f"Sapata P({x:g};{y:g})", "Concreto armado", [caixa(x - 0.4, y - 0.4, -1.1, x + 0.4, y + 0.4, -0.5)], predefined="PAD_FOOTING", container=terreo)
elemento("IfcSlab", "Contrapiso", "Concreto armado", [caixa(-ESP / 2, -ESP / 2, -0.1, W + ESP / 2, D + ESP / 2, 0.0)], predefined="BASESLAB", container=terreo)

# ---------------------------------------------------------------- escada (térreo) e lajes
NDEG = 16
ESPELHO = N1 / NDEG
PISO = 0.28
EX0, EX1 = 6.85, 7.90
EY0 = 6.4
EY1 = EY0 + NDEG * PISO  # 10,88
elemento("IfcStair", "Escada", "Concreto armado", [caixa(EX0, EY0 + i * PISO, 0, EX1, EY0 + (i + 1) * PISO, (i + 1) * ESPELHO) for i in range(NDEG)], predefined="STRAIGHT_RUN_STAIR", container=terreo)

h = ESP / 2
elemento("IfcSlab", "Laje do pavimento superior", "Concreto armado",
         [caixa(-h, -h, PD, EX0 - 0.1, D + h, N1), caixa(EX0 - 0.1, -h, PD, W + h, EY0, N1), caixa(EX0 - 0.1, EY1, PD, W + h, D + h, N1)],
         predefined="FLOOR", container=terreo)
elemento("IfcSlab", "Laje de forro", "Concreto armado", [caixa(-h, -h, FORRO, W + h, D + h, FORRO + LAJE)], predefined="FLOOR", container=superior)

# ---------------------------------------------------------------- cobertura: duas águas, cumeeira no eixo x = 4, 30%
TOPO = FORRO + LAJE  # 6,00
Z_BEIRAL = TOPO + 0.2


def z_telhado(x):
    return Z_BEIRAL + 0.3 * (W / 2 - abs(x - W / 2))


telhado = ifcopenshell.api.root.create_entity(m, ifc_class="IfcRoof", name="Cobertura", predefined_type="GABLE_ROOF")
ifcopenshell.api.spatial.assign_container(m, products=[telhado], relating_structure=superior)
ifcopenshell.api.geometry.edit_object_placement(m, product=telhado)
e_telha = 0.08
aguas = []
for xa, xb, nome in ((-BEIRAL, W / 2, "Telhado, água oeste"), (W / 2, W + BEIRAL, "Telhado, água leste")):
    perfil = [(xa, z_telhado(xa)), (xb, z_telhado(xb)), (xb, z_telhado(xb) + e_telha), (xa, z_telhado(xa) + e_telha)]
    aguas.append(elemento("IfcSlab", nome, "Telha cerâmica", [prisma_xz(perfil, D + BEIRAL, D + 2 * BEIRAL)], predefined="ROOF"))
ifcopenshell.api.aggregate.assign_object(m, products=aguas, relating_object=telhado)
for y, nome in ((ESP / 2, "Oitão frontal"), (D + ESP / 2, "Oitão dos fundos")):
    perfil = [(-h, TOPO), (W + h, TOPO), (W + h, z_telhado(W)), (W / 2, z_telhado(W / 2)), (-h, z_telhado(0))]
    elemento("IfcWall", nome, "Bloco cerâmico", [prisma_xz(perfil, y, ESP)], predefined="SOLIDWALL", container=superior)
for x, nome in ((0, "Respaldo oeste"), (W, "Respaldo leste")):
    elemento("IfcWall", nome, "Bloco cerâmico", [caixa(x - h, -h, TOPO, x + h, D + h, Z_BEIRAL)], predefined="SOLIDWALL", container=superior)

# ---------------------------------------------------------------- pisos
for pav, z0, comodos in (
    ("Térreo", 0.0, [("Sala", 0, 0, W, 7.0), ("Cozinha", 0, 7.0, 6.7, D)]),
    ("Pavimento superior", N1, [("Quarto 1", 0, 0, 4.0, 6.0), ("Quarto 2", 4.0, 0, W, 6.0), ("Corredor", 0, 6.0, EX0 - 0.1, 8.5), ("Banheiro", 0, 8.5, 3.0, D), ("Escritório", 3.0, 8.5, EX0 - 0.1, D)]),
):
    for nome, x0, y0, x1, y1 in comodos:
        elemento("IfcCovering", f"Piso: {nome.lower()}", "Porcelanato", [caixa(x0 + h, y0 + h, z0, x1 - h, y1 - h, z0 + 0.02)], predefined="FLOORING", container=terreo if pav == "Térreo" else superior)

# ---------------------------------------------------------------- instalações e louças
elemento("IfcTank", "Caixa d'água 1.000 L", "Polietileno", [caixa(1.0, 9.5, TOPO, 2.4, 10.9, TOPO + 1.0)], predefined="STORAGE", container=superior)
for nome, (x, y), z0, z1, cont in (
    ("Prumada de água, cozinha", (0.2, 11.6), 0.0, N1, terreo),
    ("Prumada de água, banheiro", (0.2, 11.6), N1, TOPO, superior),
):
    elemento("IfcPipeSegment", nome, "PVC", [caixa(x, y, z0, x + 0.1, y + 0.1, z1)], predefined="RIGIDSEGMENT", container=cont)
for nome, pred, c, cont in (
    ("Pia da cozinha", "SINK", (0.2, 8.5, 0.85, 0.75, 10.5, 0.92), terreo),
    ("Bacia sanitária", "TOILETPAN", (0.3, 10.8, N1, 0.9, 11.2, N1 + 0.42), superior),
    ("Lavatório", "WASHHANDBASIN", (1.6, 11.4, N1 + 0.78, 2.2, 11.85, N1 + 0.88), superior),
):
    elemento("IfcSanitaryTerminal", nome, "Louça sanitária", [caixa(*c)], predefined=pred, container=cont)

# ---------------------------------------------------------------- paisagismo
for nome, c in (("Gramado frontal", (LX0, LY0, -0.1, LX1, -0.6, -0.05)), ("Gramado do quintal", (LX0, D + 0.6, -0.1, LX1, LY1, -0.05))):
    elemento("IfcGeographicElement", nome, "Grama", [caixa(*c)], predefined="USERDEFINED", object_type="PAISAGISMO", container=sitio)
for i, (x, y) in enumerate([(-1.0, 16.0), (9.0, 17.5)], start=1):
    elemento("IfcGeographicElement", f"Árvore {i}", "Copa de árvore", [caixa(x - 0.12, y - 0.12, -0.05, x + 0.12, y + 0.12, 2.2), caixa(x - 1.0, y - 1.0, 2.2, x + 1.0, y + 1.0, 4.0)],
             predefined="USERDEFINED", object_type="PAISAGISMO", container=sitio)

# ---------------------------------------------------------------- mobília (humanização da obra pronta, ADR-23)
# no fim do arquivo, para não mudar os GUIDs dos elementos anteriores
def movel(nome, material, caixas, pav, tipo="USERDEFINED"):
    elemento("IfcFurniture", nome, material, [caixa(*c) for c in caixas], predefined=tipo, container=terreo if pav == 0 else superior)


T, S = 0.02, N1 + 0.02  # piso acabado do térreo e do superior
movel("Sofá da sala", "Tecido", sofa(0.2, 2.2, 1.1, 4.6, T, "x0"), 0, "SOFA")
movel("Tapete da sala", "Tecido claro", tapete(1.3, 2.4, 3.1, 4.4, T), 0)
movel("Mesa de centro", "Madeira", mesa(1.5, 3.0, 2.1, 3.8, T, 0.42), 0, "TABLE")
movel("Rack da TV", "Madeira", rack(3.3, 2.6, 3.7, 4.2, T), 0)
movel("TV da sala", "Tela de TV", tv(3.3, 2.6, 3.7, 4.2, T, "x1"), 0)
movel("Mesa de jantar", "Madeira clara", mesa(1.0, 5.2, 2.6, 6.2, T), 0, "TABLE")
for i, (x, y, c) in enumerate([(1.4, 4.85, "y0"), (2.2, 4.85, "y0"), (1.4, 6.55, "y1"), (2.2, 6.55, "y1")], start=1):
    movel(f"Cadeira de jantar {i}", "Madeira clara", cadeira(x, y, T, c), 0, "CHAIR")
movel("Vaso da sala", "Terracota", vaso(7.5, 0.6, T), 0)
movel("Planta da sala", "Folhagem", planta(7.5, 0.6, T), 0)
movel("Bancada da cozinha", "Madeira clara", [(0.15, 7.5, T, 0.75, 8.45, 0.85), (0.15, 10.55, T, 0.75, 11.0, 0.85)], 0)
movel("Geladeira", "Aço inox", armario(0.15, 11.1, 0.85, 11.8, T, 1.8), 0)
movel("Mesa da cozinha", "Madeira clara", mesa(3.0, 9.4, 4.2, 10.2, T), 0, "TABLE")
movel("Cama de casal", "Tecido claro", cama(0.15, 2.0, 2.15, 3.6, S, "x0"), 1, "BED")
movel("Travesseiros", "Tecido", travesseiros(0.15, 2.0, 2.15, 3.6, S, "x0"), 1)
movel("Guarda-roupa do quarto 1", "Madeira", armario(3.3, 0.4, 3.9, 2.4, S), 1, "SHELF")
movel("Cama de solteiro", "Tecido claro", cama(6.15, 0.6, 7.85, 1.6, S, "x1"), 1, "BED")
movel("Escrivaninha do quarto 2", "Madeira clara", mesa(7.25, 2.6, 7.85, 3.8, S, 0.75), 1, "DESK")
movel("Cadeira do quarto 2", "Tecido", cadeira(6.85, 3.2, S, "x0"), 1, "CHAIR")
movel("Mesa do escritório", "Madeira clara", mesa(3.3, 11.2, 4.9, 11.8, S, 0.75), 1, "DESK")
movel("Cadeira do escritório", "Tecido", cadeira(4.1, 10.75, S, "y0"), 1, "CHAIR")
movel("Estante do escritório", "Madeira", armario(6.0, 9.0, 6.5, 10.6, S, 1.8), 1, "SHELF")


# ---------------------------------------------------------------- acabamentos (INC-13): esquadrias, rodapé e fachada
# também no fim do arquivo, depois da mobília, para não mudar os GUIDs dos elementos anteriores.
# Caixilhos, guarnições, batentes, peitoris e soleiras são IfcCovering MOLDING (entram com as esquadrias);
# rodapé é SKIRTINGBOARD e os revestimentos de fachada são CLADDING (entram com o revestimento).
def acabamento(nome, material, itens, tipo, pav):
    elemento("IfcCovering", nome, material, itens, predefined=tipo, container=terreo if pav == "Térreo" else superior)


# lado de fora de cada parede externa: −1 ou +1 no eixo perpendicular
FORA = {"fachada frontal": -1, "fachada dos fundos": 1, "lateral oeste": -1, "lateral leste": 1}
eixos_paredes = {n: (e, a, b, f) for n, e, a, b, f in EXTERNAS}
for pav in ("Térreo", "Pavimento superior"):
    eixos_paredes.update({(pav, n): (e, a, b, f) for n, e, a, b, f in INTERNAS[pav]})


def bloco(eixo, u0, u1, v0, v1, z0, z1):
    """Caixa num sistema da parede: u ao longo dela, v perpendicular."""
    return caixa(u0, v0, z0, u1, v1, z1) if eixo == "x" else caixa(v0, u0, z0, v1, u1, z1)


PERFIL, PROF = 0.05, 0.07  # largura e profundidade do perfil do caixilho
for pav, z0 in (("Térreo", 0.0), ("Pavimento superior", N1)):
    for parede, classe, nome, ini, larg, peit, alt in VAOS[pav]:
        eixo, _a, _b, fixo = eixos_paredes.get(parede) or eixos_paredes[(pav, parede)]
        zb, zt = z0 + peit, z0 + peit + alt
        if classe == "IfcWindow":
            barras = [bloco(eixo, ini, ini + larg, fixo - PROF / 2, fixo + PROF / 2, zt - PERFIL, zt),
                      bloco(eixo, ini, ini + larg, fixo - PROF / 2, fixo + PROF / 2, zb, zb + PERFIL),
                      bloco(eixo, ini, ini + PERFIL, fixo - PROF / 2, fixo + PROF / 2, zb, zt),
                      bloco(eixo, ini + larg - PERFIL, ini + larg, fixo - PROF / 2, fixo + PROF / 2, zb, zt)]
            if larg >= 1.5:  # janela de correr: montante central
                meio = ini + larg / 2
                barras.append(bloco(eixo, meio - PERFIL / 2, meio + PERFIL / 2, fixo - PROF / 2, fixo + PROF / 2, zb, zt))
            acabamento(f"Caixilho: {nome.lower()}", "Esquadria de alumínio preto", barras, "MOLDING", pav)
            if parede in FORA:  # peitoril de granito, para fora, com 4 cm de pingadeira
                s_ = FORA[parede]
                v0, v1 = sorted((fixo, fixo + s_ * (ESP / 2 + 0.04)))
                acabamento(f"Peitoril: {nome.lower()}", "Granito cinza", [bloco(eixo, ini - 0.05, ini + larg + 0.05, v0, v1, zb - 0.03, zb)], "MOLDING", pav)
        else:
            externa = parede in FORA
            material = "Madeira" if externa else "Laca branca"
            h_ = ESP / 2
            # batente (forra o vão) e guarnições nas duas faces da parede
            itens = [bloco(eixo, ini, ini + 0.03, fixo - h_, fixo + h_, zb, zt),
                     bloco(eixo, ini + larg - 0.03, ini + larg, fixo - h_, fixo + h_, zb, zt),
                     bloco(eixo, ini, ini + larg, fixo - h_, fixo + h_, zt - 0.03, zt)]
            for face in (-1, 1):
                v0, v1 = sorted((fixo + face * h_, fixo + face * (h_ + 0.015)))
                itens += [bloco(eixo, ini - 0.07, ini, v0, v1, zb, zt + 0.07),
                          bloco(eixo, ini + larg, ini + larg + 0.07, v0, v1, zb, zt + 0.07),
                          bloco(eixo, ini - 0.07, ini + larg + 0.07, v0, v1, zt, zt + 0.07)]
            acabamento(f"Guarnição: {nome.lower()}", material, itens, "MOLDING", pav)
            acabamento(f"Soleira: {nome.lower()}", "Granito cinza", [bloco(eixo, ini, ini + larg, fixo - h_, fixo + h_, z0, z0 + 0.02)], "MOLDING", pav)

# rodapé de porcelanato, 7 cm, nas faces internas (externas: só a de dentro), sem os vãos das portas
for pav, z0 in (("Térreo", 0.0), ("Pavimento superior", N1)):
    portas = {}
    for parede, classe, _n, ini, larg, _p, _h in VAOS[pav]:
        if classe == "IfcDoor":
            portas.setdefault(parede, []).append((ini, ini + larg))
    itens = []
    linhas = [(n, e, a, b, f, [-FORA[n]]) for n, e, a, b, f in EXTERNAS] + [(n, e, a, b, f, [-1, 1]) for n, e, a, b, f in INTERNAS[pav]]
    for nome_, eixo, a, b, fixo, faces in linhas:
        cortes = sorted(portas.get(nome_, []))
        trechos, inicio = [], a + ESP / 2
        for c0, c1 in cortes:
            trechos.append((inicio, c0)); inicio = c1
        trechos.append((inicio, b - ESP / 2))
        for face in faces:
            v0, v1 = sorted((fixo + face * ESP / 2, fixo + face * (ESP / 2 + 0.012)))
            for u0, u1 in trechos:
                if u1 - u0 > 0.05:
                    itens.append(bloco(eixo, u0, u1, v0, v1, z0 + 0.02, z0 + 0.09))
    acabamento(f"Rodapé ({pav.lower()})", "Rodapé de porcelanato", itens, "SKIRTINGBOARD", pav)

# fachada frontal no estilo dos projetos da cliente: pedra em cacos ao lado da porta de entrada e
# ripado de freijó entre as janelas dos quartos (sobre a pintura)
fora_frente = -ESP / 2
acabamento("Revestimento: pedra em cacos (fachada frontal, térreo)", "Pedra em cacos",
           [caixa(-ESP / 2, fora_frente - 0.03, 0.0, 0.92, fora_frente, PD), caixa(2.18, fora_frente - 0.03, 0.0, 3.42, fora_frente, PD)], "CLADDING", "Térreo")
ripas = [caixa(x, fora_frente - 0.035, N1 + 0.12, x + 0.045, fora_frente, N1 + PD - 0.12) for x in [3.15 + 0.09 * k for k in range(19)]]
acabamento("Revestimento: ripado de freijó (fachada frontal, superior)", "Ripado de madeira freijó", ripas, "CLADDING", "Pavimento superior")

SAIDA.parent.mkdir(parents=True, exist_ok=True)
m.header.file_name.time_stamp = "2026-10-07T00:00:00"
m.header.file_name.author = ("Construction 4D Studio",)
m.write(str(SAIDA))
print(f"{SAIDA} gravado: {len(m.by_type('IfcProduct'))} produtos")
