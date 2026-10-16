# Render cinematográfico do Construction 4D Studio no Blender (INC-23, ADR-43).
#
# Uso (o renderizar.bat faz isto):
#   blender -b --factory-startup -P dani_blender.py -- <pasta do pacote> <rascunho|final> [--quadros 0,30,60-90] [--sem-mp4]
#
# Lê cena.glb e faixas.json (gravados pelo app quadro a quadro), refaz cada quadro do vídeo com o EEVEE e
# grava um PNG por quadro em quadros-<qualidade>/ (dá para parar e retomar: os PNGs prontos são pulados).
# No fim, monta <nome>-<assinatura>-<qualidade>.mp4 na linha do tempo inteira, com preto nos quadros sem 3D.
# O app põe por cima a apresentadora, a marca, as legendas e o áudio.
import json
import math
import os
import shutil
import sys
import time

import bpy
from mathutils import Matrix, Vector

QUALIDADES = {
    # escala da resolução (%), amostras e raytracing (medidos na Intel UHD 770, 16/10/2026)
    "rascunho": {"escala": 50, "amostras": 16, "raytracing": False},
    "final": {"escala": 100, "amostras": 16, "raytracing": True},
}

# três (Y para cima, frente em +Z) -> Blender (Z para cima): (x, y, z) -> (x, -z, y), como o importador do glTF
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
C_INV = C.inverted()
COLUNAS_LUZ = [
    "quadro", "elevacao", "sol_x", "sol_y", "sol_z", "luz_x", "luz_y", "luz_z",
    "cor_sol", "forca_sol", "cor_ceu", "forca_ceu", "reflexos", "exposicao", "noturno", "luminarias",
]
# calibração da luz do app (ACES no WebGL) para o EEVEE (AgX); ver ADR-43
K_SOL = 2.6          # força do sol: intensidade do three -> irradiância (W/m²)
K_CEU = 0.18         # força do céu de Nishita pela força do céu do three
K_LAMPADA = 4.0      # potência (W) da luminária por unidade de força do three
EXPOSICAO_BASE = 0.8 # exposição do three que vale 0 EV no Blender
COR_2700K = (1.0, 0.72, 0.45)
LOOK = "AgX - Punchy"


def ajustar(texto):
    """--ajuste K_SOL=2,K_CEU=0.3,LOOK=Punchy: muda a calibração sem editar o script (para testes)."""
    g = globals()
    for par in texto.split(","):
        k, v = par.split("=", 1)
        g[k] = v if k == "LOOK" else float(v)


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(a) < 1:
        sys.exit("uso: blender -b -P dani_blender.py -- <pasta> <rascunho|final> [--quadros 0,30,60-90] [--sem-mp4]")
    pasta = os.path.abspath(a[0])
    qualidade = (a[1] if len(a) > 1 and not a[1].startswith("--") else "rascunho").lower()
    if qualidade not in QUALIDADES:
        sys.exit(f"qualidade desconhecida: {qualidade} (use rascunho ou final)")
    so = None
    if "--quadros" in a:
        so = set()
        for parte in a[a.index("--quadros") + 1].split(","):
            if "-" in parte:
                i, f = parte.split("-")
                so.update(range(int(i), int(f) + 1))
            else:
                so.add(int(parte))
    if "--ajuste" in a:
        ajustar(a[a.index("--ajuste") + 1])
    return pasta, qualidade, so, "--sem-mp4" in a or so is not None


def cor_linear(hexa):
    """Cor sRGB em inteiro (0xRRGGBB) -> RGB linear."""
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin((hexa >> 16) & 255), lin((hexa >> 8) & 255), lin(hexa & 255))


def para_blender(v):
    return Vector((v[0], -v[2], v[1]))


def matriz_three(e16):
    """Matriz 4×4 do three (por colunas) -> Matrix."""
    return Matrix([[e16[c * 4 + r] for c in range(4)] for r in range(4)])


def matriz_afim(e12):
    """Os 12 números da faixa (três linhas, por colunas) -> Matrix 4×4."""
    m = Matrix.Identity(4)
    for c in range(4):
        for r in range(3):
            m[r][c] = e12[c * 3 + r]
    return m


def limpar_cena():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def importar(pasta):
    bpy.ops.import_scene.gltf(filepath=os.path.join(pasta, "cena.glb"))
    materiais = {}
    for m in bpy.data.materials:
        materiais[m.name.split(".")[0]] = m
    # os triângulos que só trazem materiais saem da cena
    for o in list(bpy.data.objects):
        if o.name.startswith("mat:"):
            bpy.data.objects.remove(o, do_unlink=True)
    return materiais


def refinar_materiais(materiais, faixas):
    """Ajustes por tipo (vidro, transparência) e as luminárias acesas; o resto vem do glTF (PBR do app)."""
    tipos = faixas.get("tiposMaterial", {})
    for nome, m in materiais.items():
        t = tipos.get(nome, {})
        if not m.use_nodes:
            continue
        p = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        alfa = t.get("opacidade", 1.0)
        if alfa < 0.99 and hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"
        if p and t.get("vidro"):
            p.inputs["Roughness"].default_value = 0.02
            p.inputs["IOR"].default_value = 1.5
            if "Specular IOR Level" in p.inputs:
                p.inputs["Specular IOR Level"].default_value = 0.8
        if t.get("emissivo"):
            # o disco aceso da luminária: o glTF traz só a cor (unlit); aqui ele brilha
            nt = m.node_tree
            for n in list(nt.nodes):
                if n.type != "OUTPUT_MATERIAL":
                    nt.nodes.remove(n)
            em = nt.nodes.new("ShaderNodeEmission")
            em.inputs["Color"].default_value = (*COR_2700K, 1)
            em.inputs["Strength"].default_value = 12.0
            saida = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
            nt.links.new(em.outputs[0], saida.inputs["Surface"])


class Objeto:
    """Um objeto do app e as cópias dele, uma por material (a troca de material vira troca de visibilidade)."""

    def __init__(self, base, materiais, usados):
        self.variantes = {}
        mat_base = base.material_slots[0].material if base.material_slots else None
        k_base = int(mat_base.name.split(".")[0][1:]) if mat_base and mat_base.name.startswith("m") else None
        for k in usados:
            if k == k_base or (k_base is None and not self.variantes):
                self.variantes[k] = base
                continue
            v = base.copy()  # a malha é compartilhada
            for col in base.users_collection:
                col.objects.link(v)
            m = materiais.get(f"m{k}")
            if m is not None:
                if not v.material_slots:
                    v.data.materials.append(None)
                v.material_slots[0].link = "OBJECT"
                v.material_slots[0].material = m
            self.variantes[k] = v
        if base not in self.variantes.values():
            bpy.data.objects.remove(base, do_unlink=True)
        for v in self.variantes.values():
            v.hide_render = True
            v.hide_viewport = True

    def aplicar(self, linha):
        vis, mat = linha[1], linha[2]
        if len(linha) >= 15:
            m = C @ matriz_afim(linha[3:15]) @ C_INV
            for v in self.variantes.values():
                v.matrix_world = m
        for k, v in self.variantes.items():
            esconder = not (vis == 1 and k == mat)
            if v.hide_render != esconder:
                v.hide_render = esconder
                v.hide_viewport = esconder


def montar_objetos(faixas, materiais):
    objetos = {}
    for k, linhas in enumerate(faixas["estados"]):
        base = bpy.data.objects.get(faixas["objetos"][k])
        if base is None or not linhas:
            continue
        usados = sorted({l[2] for l in linhas if l[1] == 1})
        if not usados:
            bpy.data.objects.remove(base, do_unlink=True)
            continue
        objetos[k] = Objeto(base, materiais, usados)
    # eventos por quadro: (objeto, linha)
    eventos = {}
    for k, linhas in enumerate(faixas["estados"]):
        if k not in objetos:
            continue
        for l in linhas:
            eventos.setdefault(l[0], []).append((k, l))
    return objetos, eventos


def montar_mundo():
    w = bpy.data.worlds.new("ceu")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    fundo = nt.nodes["Background"]
    ceu = nt.nodes.new("ShaderNodeTexSky")
    for tipo in ("MULTIPLE_SCATTERING", "NISHITA", "SINGLE_SCATTERING"):
        try:
            ceu.sky_type = tipo
            break
        except TypeError:
            continue
    if hasattr(ceu, "sun_disc"):
        ceu.sun_disc = False  # o disco do sol estoura a imagem; a luz direta é a lâmpada do sol
    noite = nt.nodes.new("ShaderNodeRGB")
    noite.outputs[0].default_value = (0.012, 0.022, 0.06, 1)
    mistura = nt.nodes.new("ShaderNodeMixRGB")
    nt.links.new(ceu.outputs["Color"], mistura.inputs[1])
    nt.links.new(noite.outputs[0], mistura.inputs[2])
    nt.links.new(mistura.outputs[0], fundo.inputs["Color"])
    return {"ceu": ceu, "fundo": fundo, "mistura": mistura}


def montar_luzes(faixas):
    sd = bpy.data.lights.new("sol", "SUN")
    sd.angle = math.radians(1.5)
    sol = bpy.data.objects.new("sol", sd)
    bpy.context.scene.collection.objects.link(sol)
    lampadas = []
    for i, l in enumerate(faixas.get("lampadas", [])):
        d = bpy.data.lights.new(f"luminaria{i}", "POINT")
        d.color = COR_2700K
        d.shadow_soft_size = 0.05
        if hasattr(d, "use_custom_distance"):
            d.use_custom_distance = True
            d.cutoff_distance = max(l["alcance"], 1.0)
        o = bpy.data.objects.new(f"luminaria{i}", d)
        o.location = para_blender(l["pos"])
        bpy.context.scene.collection.objects.link(o)
        lampadas.append((o, l["forca"]))
    return sol, lampadas


def aplicar_luz(linha, sol, lampadas, mundo, cena):
    v = dict(zip(COLUNAS_LUZ, linha))
    d = para_blender((v["luz_x"], v["luz_y"], v["luz_z"])).normalized()
    sol.rotation_mode = "QUATERNION"
    sol.rotation_quaternion = d.to_track_quat("Z", "Y")  # +Z para o sol: a luz desce por -Z
    sol.data.energy = v["forca_sol"] * K_SOL
    sol.data.color = cor_linear(int(v["cor_sol"]))
    # céu de Nishita com o sol real; à noite, o azul-marinho
    s = para_blender((v["sol_x"], v["sol_y"], v["sol_z"])).normalized()
    ceu = mundo["ceu"]
    ceu.sun_elevation = math.radians(max(v["elevacao"], -10))
    ceu.sun_rotation = math.atan2(s.x, s.y) % (2 * math.pi)
    mundo["mistura"].inputs[0].default_value = 1.0 if v["noturno"] else 0.0
    mundo["fundo"].inputs["Strength"].default_value = max(v["forca_ceu"], 0.05) * K_CEU
    cena.view_settings.exposure = math.log2(max(v["exposicao"], 0.05) / EXPOSICAO_BASE)
    for o, forca in lampadas:
        o.data.energy = forca * v["luminarias"] * K_LAMPADA
        o.hide_render = v["luminarias"] <= 0.001


def configurar_render(cena, faixas, q):
    cena.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE_NEXT"
    cena.render.resolution_x = faixas["largura"]
    cena.render.resolution_y = faixas["altura"]
    cena.render.resolution_percentage = q["escala"]
    cena.render.fps = faixas["fps"]
    cena.render.image_settings.file_format = "PNG"
    cena.render.image_settings.color_mode = "RGB"
    ee = cena.eevee
    ee.taa_render_samples = q["amostras"]
    if hasattr(ee, "use_raytracing"):
        ee.use_raytracing = q["raytracing"]
    if hasattr(ee, "use_shadows"):
        ee.use_shadows = True
    cena.view_settings.view_transform = "AgX"
    for nome in (LOOK, LOOK.replace("AgX - ", ""), f"AgX - {LOOK}"):
        try:
            cena.view_settings.look = nome
            break
        except TypeError:
            continue


def montar_camera(cena):
    d = bpy.data.cameras.new("camera")
    d.sensor_fit = "VERTICAL"
    o = bpy.data.objects.new("camera", d)
    cena.collection.objects.link(o)
    cena.camera = o
    return o


def aplicar_camera(cam, c):
    fov, perto, longe = c[0], c[1], c[2]
    cam.data.angle_y = math.radians(fov)
    cam.data.clip_start = max(perto, 0.01)
    cam.data.clip_end = longe
    cam.matrix_world = C @ matriz_three(c[3:19])


def quadro_preto(caminho, w, h):
    img = bpy.data.images.new("preto", w, h, alpha=False)
    img.pixels = [0.0, 0.0, 0.0, 1.0] * (w * h)
    img.filepath_raw = caminho
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def montar_mp4(pasta, faixas, qualidade, dir_quadros, w, h):
    nome = f"{faixas['nome']}-{faixas['assinatura']}-{qualidade}.mp4"
    saida = os.path.join(pasta, nome)
    cena = bpy.data.scenes.new("montagem")
    cena.render.resolution_x, cena.render.resolution_y = w, h
    cena.render.resolution_percentage = 100
    cena.render.fps = faixas["fps"]
    cena.frame_start, cena.frame_end = 1, faixas["quadros"]
    cena.view_settings.view_transform = "Standard"  # os PNGs já estão prontos (AgX aplicado no render)
    se = cena.sequence_editor_create()
    faixas_vse = getattr(se, "strips", None) or se.sequences
    arquivos = [f"q{i:05d}.png" for i in range(faixas["quadros"])]
    s = faixas_vse.new_image("quadros", os.path.join(dir_quadros, arquivos[0]), 1, 1)
    for a in arquivos[1:]:
        s.elements.append(a)
    if hasattr(s, "colorspace_settings"):
        s.colorspace_settings.name = "sRGB"
    im = cena.render.image_settings
    if hasattr(im, "media_type"):
        im.media_type = "VIDEO"
    im.file_format = "FFMPEG"
    ff = cena.render.ffmpeg
    ff.format = "MPEG4"
    ff.codec = "H264"
    ff.constant_rate_factor = "HIGH"
    ff.ffmpeg_preset = "GOOD"
    ff.gopsize = 12
    ff.audio_codec = "NONE"
    cena.render.filepath = saida
    with bpy.context.temp_override(scene=cena):
        bpy.ops.render.render(animation=True, scene=cena.name)
    # o Blender pode acrescentar o intervalo de quadros ao nome
    if not os.path.exists(saida):
        for f in os.listdir(pasta):
            if f.startswith(nome[:-4]) and f.endswith(".mp4") and f != nome:
                shutil.move(os.path.join(pasta, f), saida)
                break
    return saida


def main():
    pasta, qualidade, so, sem_mp4 = args()
    q = QUALIDADES[qualidade]
    with open(os.path.join(pasta, "faixas.json"), encoding="utf-8") as f:
        faixas = json.load(f)
    if faixas.get("versao") != 1:
        sys.exit(f"pacote de versão {faixas.get('versao')}: atualize o script (gere o pacote de novo no app)")
    print(f"[dani] {faixas['nome']} ({faixas['origem']}): {faixas['quadros']} quadros a {faixas['fps']} fps, {qualidade}")
    limpar_cena()
    cena = bpy.context.scene
    configurar_render(cena, faixas, q)
    t0 = time.time()
    materiais = importar(pasta)
    refinar_materiais(materiais, faixas)
    objetos, eventos = montar_objetos(faixas, materiais)
    mundo = montar_mundo()
    sol, lampadas = montar_luzes(faixas)
    cam = montar_camera(cena)
    print(f"[dani] cena montada em {time.time() - t0:.1f} s: {len(objetos)} objetos, {len(materiais)} materiais")
    w = round(faixas["largura"] * q["escala"] / 100)
    h = round(faixas["altura"] * q["escala"] / 100)
    dir_q = os.path.join(pasta, f"quadros-{qualidade}")
    os.makedirs(dir_q, exist_ok=True)
    preto = os.path.join(dir_q, "_preto.png")
    if not os.path.exists(preto):
        quadro_preto(preto, w, h)
    luz = {l[0]: l[1:] for l in faixas["luz"]}
    n = faixas["quadros"]
    a_render = [i for i in range(n) if faixas["camera"][i] is not None and (so is None or i in so)]
    feitos, inicio = 0, time.time()
    for i in range(n):
        # o estado é cumulativo: os eventos entram em todos os quadros, mesmo nos que não se renderizam
        for k, l in eventos.get(i, []):
            objetos[k].aplicar(l)
        if i in luz:
            aplicar_luz([i, *luz[i]], sol, lampadas, mundo, cena)
        caminho = os.path.join(dir_q, f"q{i:05d}.png")
        c = faixas["camera"][i]
        if c is None:
            if so is None and not os.path.exists(caminho):
                shutil.copyfile(preto, caminho)
            continue
        if so is not None and i not in so:
            continue
        if os.path.exists(caminho) and os.path.getsize(caminho) > 0 and so is None:
            feitos += 1
            continue
        aplicar_camera(cam, c)
        cena.frame_set(i + 1)
        cena.render.filepath = caminho
        t = time.time()
        bpy.ops.render.render(write_still=True)
        feitos += 1
        decorrido = time.time() - inicio
        resta = (decorrido / feitos) * (len(a_render) - feitos)
        print(f"[dani] quadro {i + 1}/{n} em {time.time() - t:.1f} s; faltam ~{resta / 60:.0f} min", flush=True)
    print(f"[dani] quadros prontos em {(time.time() - inicio) / 60:.1f} min")
    if not sem_mp4:
        saida = montar_mp4(pasta, faixas, qualidade, dir_q, w, h)
        print(f"[dani] vídeo: {saida}")
        print("[dani] no app, use \"Usar o render do Blender\" com este arquivo.")


main()
