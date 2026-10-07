"""Mobília dos modelos de exemplo (humanização da obra pronta, ADR-23).

Cada função devolve caixas (x0, y0, z0, x1, y1, z1) em coordenadas do lote: x para leste,
y para o fundo, z para cima. `costas` diz de que lado fica o encosto ou a cabeceira:
"x0" (oeste), "x1" (leste), "y0" (frente) ou "y1" (fundos).
"""

MATERIAIS_MOBILIA = {
    "Tecido": ((0.36, 0.42, 0.50), 0.0),
    "Tecido claro": ((0.90, 0.88, 0.84), 0.0),
    "Madeira clara": ((0.74, 0.58, 0.40), 0.0),
    "Tela de TV": ((0.05, 0.05, 0.06), 0.0),
    "Aço inox": ((0.76, 0.77, 0.78), 0.0),
    "Terracota": ((0.62, 0.36, 0.24), 0.0),
    "Folhagem": ((0.25, 0.45, 0.20), 0.0),
}


def _encosto(x0, y0, x1, y1, z0, z1, costas, e):
    return {
        "x0": (x0, y0, z0, x0 + e, y1, z1),
        "x1": (x1 - e, y0, z0, x1, y1, z1),
        "y0": (x0, y0, z0, x1, y0 + e, z1),
        "y1": (x0, y1 - e, z0, x1, y1, z1),
    }[costas]


def sofa(x0, y0, x1, y1, z, costas):
    e = 0.2
    caixas = [(x0, y0, z, x1, y1, z + 0.42), _encosto(x0, y0, x1, y1, z, z + 0.85, costas, e)]
    if costas in ("x0", "x1"):
        caixas += [(x0, y0, z, x1, y0 + e, z + 0.62), (x0, y1 - e, z, x1, y1, z + 0.62)]
    else:
        caixas += [(x0, y0, z, x0 + e, y1, z + 0.62), (x1 - e, y0, z, x1, y1, z + 0.62)]
    return caixas


def mesa(x0, y0, x1, y1, z, altura=0.76, perna=0.06):
    tampo = (x0, y0, z + altura - 0.04, x1, y1, z + altura)
    pernas = [(x, y, z, x + perna, y + perna, z + altura - 0.04) for x in (x0 + 0.04, x1 - 0.04 - perna) for y in (y0 + 0.04, y1 - 0.04 - perna)]
    return [tampo] + pernas


def cadeira(x, y, z, costas, l=0.44):
    x0, y0, x1, y1 = x - l / 2, y - l / 2, x + l / 2, y + l / 2
    return mesa(x0, y0, x1, y1, z, 0.45, 0.04) + [_encosto(x0, y0, x1, y1, z + 0.45, z + 0.9, costas, 0.05)]


def cama(x0, y0, x1, y1, z, costas):
    return [(x0, y0, z, x1, y1, z + 0.3), (x0 + 0.03, y0 + 0.03, z + 0.3, x1 - 0.03, y1 - 0.03, z + 0.52), _encosto(x0, y0, x1, y1, z, z + 1.05, costas, 0.08)]


def travesseiros(x0, y0, x1, y1, z, costas):
    """Dois travesseiros junto à cabeceira de uma cama de casal."""
    if costas in ("x0", "x1"):
        xa, xb = (x0 + 0.12, x0 + 0.52) if costas == "x0" else (x1 - 0.52, x1 - 0.12)
        meio = (y0 + y1) / 2
        return [(xa, y0 + 0.12, z + 0.52, xb, meio - 0.06, z + 0.64), (xa, meio + 0.06, z + 0.52, xb, y1 - 0.12, z + 0.64)]
    ya, yb = (y0 + 0.12, y0 + 0.52) if costas == "y0" else (y1 - 0.52, y1 - 0.12)
    meio = (x0 + x1) / 2
    return [(x0 + 0.12, ya, z + 0.52, meio - 0.06, yb, z + 0.64), (meio + 0.06, ya, z + 0.52, x1 - 0.12, yb, z + 0.64)]


def armario(x0, y0, x1, y1, z, altura=2.1):
    return [(x0, y0, z, x1, y1, z + altura)]


def rack(x0, y0, x1, y1, z):
    return [(x0, y0, z, x1, y1, z + 0.5)]


def tv(x0, y0, x1, y1, z, costas):
    """Tela de 50" sobre o rack, encostada no lado `costas`."""
    if costas in ("x0", "x1"):
        x = x0 + 0.05 if costas == "x0" else x1 - 0.1
        meio = (y0 + y1) / 2
        return [(x, meio - 0.56, z + 0.62, x + 0.05, meio + 0.56, z + 1.27)]
    y = y0 + 0.05 if costas == "y0" else y1 - 0.1
    meio = (x0 + x1) / 2
    return [(meio - 0.56, y, z + 0.62, meio + 0.56, y + 0.05, z + 1.27)]


def vaso(x, y, z):
    return [(x - 0.2, y - 0.2, z, x + 0.2, y + 0.2, z + 0.45)]


def planta(x, y, z):
    return [(x - 0.3, y - 0.3, z + 0.45, x + 0.3, y + 0.3, z + 1.25)]


def tapete(x0, y0, x1, y1, z):
    return [(x0, y0, z + 0.02, x1, y1, z + 0.03)]
