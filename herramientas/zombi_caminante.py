# =====================================================================
#  ZOMBI CAMINANTE  ·  generador para Blender (estilo cómic, 2012)
# ---------------------------------------------------------------------
#  Crea un zombi "caminante" low-poly con:
#    · cara demacrada: cuencas oscuras, ojos lechosos, dientes, mandíbula
#    · ropa rota: camisa de franela con agujeros y borde deshilachado,
#      jeans sucios, botas, cinturón
#    · texturas pintadas por código (piel manchada, cuadros, sangre)
#    · esqueleto con 20 huesos y pesos suaves
#    · animaciones: caminar, reposo, atacar y morir
#  y lo exporta como .glb listo para Three.js.
#
#  CÓMO USARLO
#    1. Abre Blender (3.6 o más nuevo).
#    2. Pestaña "Scripting" → botón "Open" → elige este archivo.
#    3. Botón ▶ (Run Script).
#    4. El .glb queda junto a tu .blend, o en tu carpeta personal si el
#       .blend no está guardado. La ruta sale en la consola de sistema.
#
#  Cambia SEMILLA para obtener otro zombi (otra camisa, pelo, heridas).
#  Solo toca la colección "Zombi"; el resto de tu escena no se modifica.
# =====================================================================

import bpy
import bmesh
import math
import os
import random
from mathutils import Vector

# ---------------------------- AJUSTES --------------------------------
SEMILLA = 7            # cambia el número para otra variante
NOMBRE = "zombi_caminante"
EXPORTAR = True        # False = solo crear el modelo en la escena
RUTA = ""              # carpeta de salida; vacío = automática
TAM_TEXTURA = 256      # 256 es suficiente para el estilo cómic
# ---------------------------------------------------------------------

rnd = random.Random(SEMILLA)


# =========================== ESCENA ==================================
def preparar_coleccion():
    col = bpy.data.collections.get("Zombi")
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new("Zombi")
        bpy.context.scene.collection.children.link(col)
    # borra datos huérfanos de ejecuciones anteriores
    for coleccion in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials,
                      bpy.data.images, bpy.data.actions):
        for b in list(coleccion):
            if b.name.startswith("zc_") and b.users <= (1 if b.use_fake_user else 0):
                coleccion.remove(b)
    return col


COL = preparar_coleccion()


# ========================== TEXTURAS =================================
class Ruido:
    """Ruido de valor suave y repetible (sin dependencias externas)."""

    def __init__(self, n):
        self.n = n
        self.g = [[rnd.random() for _ in range(n)] for _ in range(n)]

    def __call__(self, u, v):
        n = self.n
        x, y = u * n, v * n
        i, j = int(x) % n, int(y) % n
        fx, fy = x - int(x), y - int(y)
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        a, b = self.g[j][i], self.g[j][(i + 1) % n]
        c, d = self.g[(j + 1) % n][i], self.g[(j + 1) % n][(i + 1) % n]
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy


def fbm(capas):
    def f(u, v):
        t, peso, suma = 0.0, 1.0, 0.0
        for r in capas:
            t += r(u, v) * peso
            suma += peso
            peso *= 0.5
        return t / suma
    return f


def mezclar(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def manchas(n, zona_v=(0.0, 1.0), radio=(0.03, 0.09)):
    """Lista de salpicaduras (u, v, r) para sangre o mugre."""
    return [(rnd.random(), rnd.uniform(*zona_v), rnd.uniform(*radio)) for _ in range(n)]


def en_mancha(u, v, lista, borde):
    m = 0.0
    for (mu, mv, r) in lista:
        du = min(abs(u - mu), 1 - abs(u - mu))      # se repite en U
        d = math.hypot(du, v - mv) / (r * (0.7 + 0.6 * borde))
        if d < 1.0:
            m = max(m, 1.0 - d * d)
    return m


def textura(nombre, f):
    tam = TAM_TEXTURA
    img = bpy.data.images.new("zc_" + nombre, tam, tam)
    px = [1.0] * (tam * tam * 4)
    k = 0
    for y in range(tam):
        v = (y + 0.5) / tam
        for x in range(tam):
            r, g, b = f((x + 0.5) / tam, v)
            px[k], px[k + 1], px[k + 2] = r, g, b
            k += 4
    img.pixels.foreach_set(px)
    img.pack()
    return img


# --- variantes ---
CAMISAS = [
    ((0.42, 0.09, 0.08), (0.10, 0.05, 0.05), (0.62, 0.48, 0.40)),   # franela roja
    ((0.13, 0.20, 0.34), (0.05, 0.06, 0.10), (0.50, 0.52, 0.55)),   # franela azul
    ((0.17, 0.26, 0.15), (0.06, 0.08, 0.05), (0.55, 0.50, 0.38)),   # franela verde
    ((0.40, 0.38, 0.33), None, None),                               # playera gris
]
PELOS = [(0.08, 0.06, 0.05), (0.04, 0.04, 0.04), (0.30, 0.29, 0.27), (0.33, 0.25, 0.14)]

camisa = rnd.choice(CAMISAS)
color_pelo = rnd.choice(PELOS)
tono_piel = rnd.uniform(-0.04, 0.04)
manga_enrollada = rnd.choice(("L", "R", "ambas", "ninguna"))
pierna_rota = rnd.choice(("L", "R", None))

SANGRE = (0.22, 0.03, 0.02)
SANGRE_SECA = (0.16, 0.06, 0.04)
MUGRE = (0.22, 0.18, 0.12)


def tex_piel():
    base = (0.47 + tono_piel, 0.50 + tono_piel, 0.41 + tono_piel)
    oscuro = (0.30, 0.31, 0.27)
    moreton = (0.33, 0.25, 0.30)
    r1 = fbm([Ruido(6), Ruido(14), Ruido(32)])
    r2 = Ruido(9)
    sangre = manchas(7, radio=(0.02, 0.07))

    def f(u, v):
        n = r1(u, v)
        c = mezclar(base, oscuro, (n - 0.45) * 2.2)
        c = mezclar(c, moreton, (r2(u, v) - 0.72) * 4.0)
        return mezclar(c, SANGRE_SECA, en_mancha(u, v, sangre, n) * 1.4)
    return textura("piel", f)


def tex_camisa():
    base, linea, hilo = camisa
    r1 = fbm([Ruido(8), Ruido(24)])
    sangre = manchas(6, zona_v=(0.55, 0.95), radio=(0.04, 0.12))
    mugre = manchas(9, zona_v=(0.0, 0.45), radio=(0.05, 0.14))

    def f(u, v):
        n = r1(u, v)
        if linea:
            bu = (u * 8) % 1.0 < 0.32
            bv = (v * 8) % 1.0 < 0.32
            c = base
            if bu or bv:
                c = mezclar(base, linea, 0.55 if (bu != bv) else 0.9)
            if abs((u * 8) % 1.0 - 0.66) < 0.03 or abs((v * 8) % 1.0 - 0.66) < 0.03:
                c = mezclar(c, hilo, 0.45)
        else:
            c = base
        c = mezclar(c, MUGRE, (n - 0.5) * 1.2 + en_mancha(u, v, mugre, n) * 0.7)
        return mezclar(c, SANGRE, en_mancha(u, v, sangre, n) * 1.5)
    return textura("camisa", f)


def tex_jeans():
    base = (0.16, 0.20, 0.28)
    claro = (0.30, 0.34, 0.40)
    r1 = fbm([Ruido(10), Ruido(40)])
    sangre = manchas(4, radio=(0.03, 0.08))

    def f(u, v):
        n = r1(u, v)
        c = mezclar(base, claro, (n - 0.4) * 1.6)
        c = mezclar(c, MUGRE, (0.45 - v) * 1.8 + (n - 0.5))     # barro abajo
        return mezclar(c, SANGRE_SECA, en_mancha(u, v, sangre, n) * 1.3)
    return textura("jeans", f)


# ========================= MATERIALES ================================
def material(nombre, color, rugosidad=0.9, imagen=None):
    m = bpy.data.materials.new("zc_" + nombre)
    try:
        m.use_nodes = True
    except Exception:
        pass
    m.diffuse_color = (*color, 1.0)
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = rugosidad
        for k in ("Specular IOR Level", "Specular"):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = 0.15
        if imagen:
            t = m.node_tree.nodes.new("ShaderNodeTexImage")
            t.image = imagen
            t.location = (-320, 260)
            m.node_tree.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    return m


MAT = {
    "piel": material("piel", (0.47, 0.50, 0.41), 0.75, tex_piel()),
    "camisa": material("camisa", camisa[0], 0.95, tex_camisa()),
    "jeans": material("jeans", (0.16, 0.20, 0.28), 0.95, tex_jeans()),
    "cuero": material("cuero", (0.14, 0.09, 0.06), 0.7),
    "botas": material("botas", (0.12, 0.09, 0.07), 0.8),
    "suela": material("suela", (0.05, 0.05, 0.05), 0.9),
    "pelo": material("pelo", color_pelo, 1.0),
    "cuenca": material("cuenca", (0.10, 0.07, 0.07), 1.0),
    "ojo": material("ojo", (0.80, 0.78, 0.62), 0.35),
    "boca": material("boca", (0.09, 0.02, 0.02), 0.6),
    "dientes": material("dientes", (0.62, 0.55, 0.38), 0.5),
    "sangre": material("sangre", SANGRE, 0.35),
}


# ========================== ESQUELETO ================================
#  Frente del personaje = -Y.  Izquierda del personaje = +X.
HUESOS = {
    #  nombre        cabeza                 cola                    padre
    "cadera":     ((0, 0, 0.93),        (0, 0, 1.05),          None),
    "columna":    ((0, 0, 1.05),        (0, 0, 1.28),          "cadera"),
    "pecho":      ((0, 0, 1.28),        (0, 0, 1.47),          "columna"),
    "cuello":     ((0, -0.01, 1.47),    (0, -0.02, 1.57),      "pecho"),
    "cabeza":     ((0, -0.02, 1.57),    (0, -0.02, 1.79),      "cuello"),
    "mandibula":  ((0, -0.03, 1.605),   (0, -0.11, 1.575),     "cabeza"),
}
for s, lado in ((1, "L"), (-1, "R")):
    HUESOS.update({
        "hombro." + lado:    ((0.03 * s, 0, 1.43),   (0.17 * s, 0, 1.44),      "pecho"),
        "brazo." + lado:     ((0.17 * s, 0, 1.44),   (0.215 * s, 0, 1.16),     "hombro." + lado),
        "antebrazo." + lado: ((0.215 * s, 0, 1.16),  (0.245 * s, -0.02, 0.93), "brazo." + lado),
        "mano." + lado:      ((0.245 * s, -0.02, 0.93), (0.255 * s, -0.03, 0.84), "antebrazo." + lado),
        "muslo." + lado:     ((0.095 * s, 0, 0.93),  (0.105 * s, 0, 0.50),     "cadera"),
        "pierna." + lado:    ((0.105 * s, 0, 0.50),  (0.11 * s, 0.02, 0.10),   "muslo." + lado),
        "pie." + lado:       ((0.11 * s, 0.02, 0.10), (0.11 * s, -0.12, 0.03), "pierna." + lado),
    })
POS = {k: (Vector(v[0]), Vector(v[1])) for k, v in HUESOS.items()}


def crear_esqueleto():
    datos = bpy.data.armatures.new("zc_esqueleto")
    arm = bpy.data.objects.new(NOMBRE + "_esqueleto", datos)
    COL.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for nombre, (cab, cola, _) in HUESOS.items():
        b = datos.edit_bones.new(nombre)
        b.head, b.tail, b.roll = cab, cola, 0.0
    for nombre, (_, _, padre) in HUESOS.items():
        if padre:
            datos.edit_bones[nombre].parent = datos.edit_bones[padre]
    bpy.ops.object.mode_set(mode="OBJECT")
    try:
        datos.display_type = "STICK"
    except Exception:
        pass
    return arm


# =========================== MALLAS ==================================
PARTES = []


def nuevo_bm():
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")
    return bm


def a_objeto(nombre, bm):
    me = bpy.data.meshes.new("zc_" + nombre)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nombre, me)
    COL.objects.link(ob)
    return ob


def dist_segmento(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


def agregar(ob, mat, huesos, suave=True):
    """Asigna material y pesos: 1 hueso = rígido; varios = mezcla por distancia."""
    ob.data.materials.append(MAT[mat])
    grupos = {h: ob.vertex_groups.new(name=h) for h in huesos}
    for v in ob.data.vertices:
        if len(huesos) == 1:
            grupos[huesos[0]].add([v.index], 1.0, "REPLACE")
            continue
        ws = [1.0 / (dist_segmento(v.co, *POS[h]) ** 2 + 1e-4) ** 2 for h in huesos]
        tot = sum(ws)
        for h, w in zip(huesos, ws):
            if w / tot > 0.03:
                grupos[h].add([v.index], w / tot, "REPLACE")
    for p in ob.data.polygons:
        p.use_smooth = suave
    PARTES.append(ob)
    return ob


def cono(nombre, p1, p2, r1, r2, seg=8, esc=(1, 1), tapas=True, cortes=0):
    """Tronco de cono de p1 a p2 (radio r1 → r2). Devuelve (bm, función para cerrar)."""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bm = nuevo_bm()
    bmesh.ops.create_cone(bm, cap_ends=tapas, cap_tris=False, segments=seg,
                          radius1=r1, radius2=r2, depth=d.length, calc_uvs=True)
    if cortes:
        verticales = [e for e in bm.edges
                      if abs((e.verts[0].co - e.verts[1].co).normalized().z) > 0.6]
        bmesh.ops.subdivide_edges(bm, edges=verticales, cuts=cortes, use_grid_fill=False)
    bmesh.ops.scale(bm, vec=(esc[0], esc[1], 1), verts=bm.verts)
    return bm, (lambda bm_: _colocar(bm_, p1, p2, nombre))


def _colocar(bm, p1, p2, nombre):
    d = p2 - p1
    q = d.normalized().to_track_quat("Z", "Y")
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=q.to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(p1 + p2) / 2, verts=bm.verts)
    return a_objeto(nombre, bm)


def tubo(nombre, p1, p2, r1, r2, mat, huesos, **kw):
    bm, cerrar = cono(nombre, p1, p2, r1, r2, **kw)
    return agregar(cerrar(bm), mat, huesos)


def esfera(nombre, centro, escala, mat, huesos, seg=(10, 7), suave=True, deformar=None):
    bm = nuevo_bm()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=1.0, calc_uvs=True)
    bmesh.ops.scale(bm, vec=escala, verts=bm.verts)
    if deformar:
        deformar(bm)
    bmesh.ops.translate(bm, vec=centro, verts=bm.verts)
    return agregar(a_objeto(nombre, bm), mat, huesos, suave)


def caja(nombre, centro, dim, mat, huesos, deformar=None):
    bm = nuevo_bm()
    bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    bmesh.ops.scale(bm, vec=dim, verts=bm.verts)
    if deformar:
        deformar(bm)
    bmesh.ops.translate(bm, vec=centro, verts=bm.verts)
    return agregar(a_objeto(nombre, bm), mat, huesos, suave=False)


def deshilachar(bm, abajo=True, amplitud=0.035):
    """Borde irregular: mueve los vértices del extremo de un tubo abierto."""
    zs = [v.co.z for v in bm.verts]
    limite = min(zs) if abajo else max(zs)
    for v in bm.verts:
        if abs(v.co.z - limite) < 1e-5:
            v.co.z += rnd.uniform(-amplitud, amplitud * 0.4) * (1 if abajo else -1)


def agujeros(bm, n, zona=(0.25, 0.75)):
    """Borra caras al azar en la parte media para que se vea la piel."""
    zs = [v.co.z for v in bm.verts]
    z0, z1 = min(zs), max(zs)
    caras = [f for f in bm.faces if len(f.verts) == 4 and
             zona[0] < (f.calc_center_median().z - z0) / (z1 - z0) < zona[1]]
    rnd.shuffle(caras)
    bmesh.ops.delete(bm, geom=caras[:n], context="FACES")


# ---------------------------- CABEZA ---------------------------------
CAB = Vector((0, -0.015, 1.67))
CAB_ESC = (0.098, 0.113, 0.125)


def craneo(bm):
    for v in bm.verts:
        x, y, z = v.co
        if z < -0.03 and abs(x) > 0.04:          # mejillas hundidas
            v.co.x *= 0.86
        if y < -0.06 and z > 0.04:               # frente algo plana
            v.co.y *= 0.95
        if y < -0.07 and -0.01 < z < 0.05 and 0.01 < abs(x) < 0.065:
            v.co.y *= 0.9                        # cuencas hundidas


def construir_cabeza():
    cab = ["cabeza"]
    esfera("craneo", CAB, CAB_ESC, "piel", cab, seg=(14, 10), deformar=craneo)

    # pelo: casquete encima del cráneo, con calvas y mechones
    def casquete(bm):
        borrar = []
        for f in bm.faces:
            c = f.calc_center_median()
            frente = c.y < -0.06 and c.z < 0.075
            limite = 0.02 + rnd.uniform(-0.03, 0.03)
            if c.z < limite or frente or (c.y > 0.0 and c.z < -0.03) or rnd.random() < 0.25:
                borrar.append(f)
        bmesh.ops.delete(bm, geom=borrar, context="FACES")
        for v in bm.verts:                       # mechones en punta
            v.co *= 1.0 + rnd.uniform(0.0, 0.14)
            if v.co.z < 0.04:
                v.co.z -= rnd.uniform(0.0, 0.025)
    esfera("pelo", CAB + Vector((0, 0.004, 0.006)),
           tuple(e * 1.07 for e in CAB_ESC), "pelo", cab, seg=(14, 10), deformar=casquete)

    # ojos hundidos y lechosos
    for s in (1, -1):
        esfera("cuenca", (0.035 * s, -0.104, 1.689), (0.025, 0.02, 0.021), "cuenca", cab, seg=(10, 7))
        esfera("ojo", (0.034 * s, -0.117, 1.69), (0.012, 0.009, 0.011), "ojo", cab, seg=(8, 6))
        esfera("oreja", (0.097 * s, -0.005, 1.668), (0.012, 0.024, 0.034), "piel", cab, seg=(8, 6))
    for s in (1, -1):
        esfera("ceja", (0.034 * s, -0.096, 1.713), (0.032, 0.018, 0.011), "piel", cab, seg=(8, 5))
    tubo("nariz", (0, -0.112, 1.68), (0, -0.136, 1.646), 0.014, 0.006, "piel", cab, seg=6)

    # boca abierta, dientes arriba y mandíbula articulada
    esfera("boca", (0, -0.088, 1.6), (0.034, 0.03, 0.017), "boca", cab, seg=(10, 6))
    for i in range(6):
        x = -0.022 + i * 0.0088
        alto = 0.010 + rnd.uniform(0, 0.005)
        if rnd.random() < 0.85:
            caja("diente", (x, -0.111 + abs(x) * 0.4, 1.613 - alto / 2), (0.0075, 0.006, alto),
                 "dientes", cab)
    mand = ["mandibula"]
    esfera("mandibula", (0, -0.062, 1.572), (0.06, 0.058, 0.024), "piel", mand, seg=(10, 6))
    esfera("barbilla", (0, -0.098, 1.566), (0.034, 0.02, 0.016), "piel", mand, seg=(8, 5))
    esfera("encia", (0, -0.1, 1.586), (0.028, 0.012, 0.007), "boca", mand, seg=(8, 5))
    for i in range(5):
        x = -0.018 + i * 0.009
        if rnd.random() < 0.8:
            caja("diente_inf", (x, -0.108 + abs(x) * 0.4, 1.594), (0.007, 0.006, 0.009),
                 "dientes", mand)


# ---------------------------- TORSO ----------------------------------
def construir_torso():
    tronco = ["cadera", "columna", "pecho"]
    # piel debajo de la ropa (se ve por los agujeros)
    tubo("torso", (0, 0, 0.99), (0, 0, 1.48), 0.15, 0.172, "piel", tronco, seg=10, esc=(1, 0.66))

    # camisa con borde roto y agujeros
    bm, cerrar = cono("camisa", (0, 0, 0.96), (0, 0, 1.49), 0.168, 0.19, seg=12,
                      esc=(1, 0.69), tapas=False, cortes=4)
    deshilachar(bm, abajo=True, amplitud=0.045)
    agujeros(bm, rnd.randint(3, 5))
    agregar(cerrar(bm), "camisa", tronco)

    esfera("hombros", (0, 0, 1.455), (0.205, 0.118, 0.07), "camisa",
           ["pecho", "hombro.L", "hombro.R"], seg=(12, 7))
    tubo("cuello", (0, -0.004, 1.43), (0, -0.02, 1.6), 0.055, 0.047, "piel",
         ["pecho", "cuello", "cabeza"], seg=8)

    # mordida en el cuello
    lado = rnd.choice((1, -1))
    esfera("mordida", (0.045 * lado, -0.005, 1.515), (0.012, 0.028, 0.03), "sangre",
           ["cuello"], seg=(8, 6))

    # pantalón y cinturón
    tubo("pantalon", (0, 0, 0.86), (0, 0, 1.05), 0.165, 0.157, "jeans",
         ["cadera", "muslo.L", "muslo.R"], seg=12, esc=(1, 0.68))
    tubo("cinturon", (0, 0, 1.0), (0, 0, 1.035), 0.162, 0.161, "cuero",
         ["cadera"], seg=12, esc=(1, 0.69), tapas=False)
    caja("hebilla", (0, -0.112, 1.017), (0.035, 0.01, 0.028), "dientes", ["cadera"])


# ------------------------ BRAZOS Y MANOS -----------------------------
def construir_brazo(s, lado):
    h, b, a, m = ("hombro." + lado, "brazo." + lado, "antebrazo." + lado, "mano." + lado)
    hombro, codo = POS[b]
    _, muneca = POS[a]
    enrollada = manga_enrollada in (lado, "ambas")

    # manga superior (abierta y rota si está enrollada)
    fin = codo + (codo - hombro).normalized() * (0.01 if enrollada else 0.0)
    bm, cerrar = cono("manga", hombro + Vector((-0.01 * s, 0, 0.01)), fin, 0.06, 0.047,
                      seg=8, tapas=False, cortes=1)
    if enrollada:
        deshilachar(bm, abajo=True, amplitud=0.02)
    agregar(cerrar(bm), "camisa", [h, b, a, "pecho"])

    if enrollada:
        tubo("antebrazo", codo, muneca, 0.041, 0.03, "piel", [b, a, m], seg=8)
        tubo("puno", codo + Vector((0, 0, 0.02)), codo - Vector((0, 0, 0.03)), 0.052, 0.05,
             "camisa", [b, a], seg=8, tapas=False)
    else:
        bm, cerrar = cono("manga_baja", codo, muneca + (codo - muneca) * 0.12, 0.048, 0.04,
                          seg=8, tapas=False)
        deshilachar(bm, abajo=True, amplitud=0.015)
        agregar(cerrar(bm), "camisa", [b, a, m])
        tubo("muneca", muneca + (codo - muneca) * 0.2, muneca, 0.033, 0.03, "piel", [a, m], seg=8)

    # mano: palma plana y dedos curvados como garras
    dirm = (POS[m][1] - POS[m][0]).normalized()
    palma_fin = muneca + dirm * 0.075
    tubo("palma", muneca, palma_fin, 0.034, 0.03, "piel", [m], seg=6, esc=(0.48, 1))
    for i, dy in enumerate((-0.021, -0.007, 0.007, 0.021)):
        largo = (0.05, 0.058, 0.055, 0.045)[i]
        base = palma_fin + Vector((0, dy, 0))
        punta = base + dirm * largo + Vector((-0.012 * s, -0.012, 0))
        tubo("dedo", base, punta, 0.0085, 0.006, "piel", [m], seg=5)
    pulgar = muneca + dirm * 0.03 + Vector((0, -0.028, 0))
    tubo("pulgar", pulgar, pulgar + Vector((-0.01 * s, -0.02, -0.035)), 0.009, 0.0065,
         "piel", [m], seg=5)


# ------------------------- PIERNAS Y BOTAS ---------------------------
def construir_pierna(s, lado):
    c, mu, pi, pie = ("cadera", "muslo." + lado, "pierna." + lado, "pie." + lado)
    cadera, rodilla = POS[mu]
    _, tobillo = POS[pi]
    tubo("muslo", cadera, rodilla, 0.082, 0.058, "jeans", [c, mu, pi], seg=10, tapas=False)

    if pierna_rota == lado:
        corte = rodilla + (tobillo - rodilla) * 0.5
        bm, cerrar = cono("pantorrilla", rodilla, corte, 0.058, 0.053, seg=10, tapas=False, cortes=1)
        deshilachar(bm, abajo=True, amplitud=0.03)
        agregar(cerrar(bm), "jeans", [mu, pi])
        tubo("espinilla", rodilla, tobillo, 0.046, 0.034, "piel", [mu, pi, pie], seg=8)
    else:
        tubo("pantorrilla", rodilla, tobillo + Vector((0, 0, 0.03)), 0.058, 0.047, "jeans",
             [mu, pi, pie], seg=10, tapas=False)

    def punta(bm):
        for v in bm.verts:                      # punta más baja y redondeada
            if v.co.y < 0 and v.co.z > 0:
                v.co.z -= 0.025
                v.co.x *= 0.85
    caja("bota", (0.11 * s, -0.04, 0.058), (0.105, 0.27, 0.1), "botas", [pie], deformar=punta)
    caja("suela", (0.11 * s, -0.04, 0.008), (0.11, 0.275, 0.018), "suela", [pie])
    tubo("cana", tobillo + Vector((0, 0, 0.06)), tobillo - Vector((0, 0, 0.05)), 0.052, 0.054,
         "botas", [pi, pie], seg=10)


# ========================== ANIMACIONES ==============================
def lados(nombre_base, rot_l, rot_r=None):
    """Pose espejo: rot_r = None → refleja Y/Z de rot_l."""
    if rot_r is None:
        rot_r = (rot_l[0], -rot_l[1], -rot_l[2])
    return {nombre_base + ".L": rot_l, nombre_base + ".R": rot_r}


EXTREMIDADES = {"brazo", "antebrazo", "mano", "muslo", "pierna", "pie"}


def poner_pose(arm, pose, cuadro):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        rx, ry, rz = pose.get(pb.name, (0, 0, 0))
        if pb.name.split(".")[0] in EXTREMIDADES:   # huesos que apuntan hacia abajo
            rx = -rx
        pb.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
        pb.location = pose.get(pb.name + "@pos", (0, 0, 0))
        pb.keyframe_insert("rotation_euler", frame=cuadro, group=pb.name)
        pb.keyframe_insert("location", frame=cuadro, group=pb.name)


def crear_animacion(arm, nombre, claves):
    ad = arm.animation_data_create()
    ad.action = None
    for cuadro, pose in claves:
        poner_pose(arm, pose, cuadro)
    accion = ad.action
    accion.name = nombre
    accion.use_fake_user = True
    pista = ad.nla_tracks.new()
    pista.name = nombre
    tira = pista.strips.new(nombre, int(claves[0][0]), accion)
    tira.name = nombre
    pista.mute = True
    ad.action = None
    return accion


def P(**partes):
    """Ayuda para escribir poses: P(columna=(x,y,z), cadera_pos=(x,y,z), ...)."""
    pose = {}
    for k, v in partes.items():
        if k.endswith("_pos"):
            pose[k[:-4].replace("_", ".") + "@pos"] = v
        elif isinstance(v, dict):
            pose.update(v)
        else:
            pose[k.replace("_", ".")] = v
    return pose


def unir(*poses):
    r = {}
    for p in poses:
        r.update(p)
    return r


# Convenciones (comprobadas en render):
#   muslo  X+ = pierna hacia adelante     pierna X- = doblar rodilla
#   brazo  X+ = brazo hacia adelante      antebrazo X+ = doblar codo
#   columna/cuello/cabeza X+ = inclinar hacia adelante   Z = girar
#   mandíbula X+ = abrir boca             cadera "@pos" Y = subir/bajar

COJEA = "R" if pierna_rota != "R" else "L"     # la pierna que arrastra


def paso(fase):
    """Ciclo de caminar zombi: fase 0..1. Arrastra una pierna y lleva un brazo adelante."""
    sen = math.sin(fase * 2 * math.pi)
    cos = math.cos(fase * 2 * math.pi)
    amp_l = 22 if COJEA != "L" else 12
    amp_r = 22 if COJEA != "R" else 12
    rodilla_l = max(0.0, cos) * (38 if COJEA != "L" else 16) + 6
    rodilla_r = max(0.0, -cos) * (38 if COJEA != "R" else 16) + 6
    return P(
        cadera=(4, sen * 6, sen * 3),
        cadera_pos=(0, -0.025 * abs(cos) + 0.005, 0),
        columna=(12, -sen * 4, -sen * 3),
        pecho=(6, -sen * 3, 0),
        cuello=(8, 0, 0),
        cabeza=(-6 + abs(sen) * 4, 8 * sen, 14),
        mandibula=(14 + 5 * abs(sen), 0, 0),
        **{
            "muslo.L": (sen * amp_l, 0, 2),
            "muslo.R": (-sen * amp_r, 0, -2),
            "pierna.L": (-rodilla_l, 0, 0),
            "pierna.R": (-rodilla_r, 0, 0),
            "pie.L": (sen * 10, 0, 0),
            "pie.R": (-sen * 10 + (15 if COJEA == "R" else 0), 0, 0),
            "hombro.L": (0, 0, 0),
            "brazo.L": (62 + sen * 6, 0, -8),
            "antebrazo.L": (22 + cos * 6, 0, 0),
            "mano.L": (10, 0, 0),
            "brazo.R": (18 - sen * 10, 0, 10),
            "antebrazo.R": (14, 0, 0),
            "mano.R": (6, 0, 0),
        },
    )


def reposo(t):
    s = math.sin(t * 2 * math.pi)
    s2 = math.sin(t * 4 * math.pi + 1.0)
    return P(
        cadera=(3, s * 3, 0),
        columna=(14 + s * 2, 0, s * 3),
        pecho=(6, 0, 0),
        cuello=(10, 0, 0),
        cabeza=(-4 + s2 * 3, s * 10, 18 + s * 4),
        mandibula=(10 + 8 * max(0.0, s2), 0, 0),
        **{
            "brazo.L": (14 + s * 4, 0, -6), "antebrazo.L": (18, 0, 0), "mano.L": (8, 0, 0),
            "brazo.R": (10 - s * 3, 0, 6), "antebrazo.R": (14, 0, 0), "mano.R": (6, 0, 0),
            "muslo.L": (4, 0, 3), "pierna.L": (-8, 0, 0),
            "muslo.R": (-3, 0, -3), "pierna.R": (-4, 0, 0), "pie.R": (6, 0, 0),
        },
    )


def ataque(fase):
    """0 = preparación, 1 = embestida."""
    return P(
        cadera=(6 + 10 * fase, 0, 0),
        cadera_pos=(0, -0.04 * fase, -0.12 * fase),
        columna=(10 + 12 * fase, 0, 0),
        pecho=(4 + 6 * fase, 0, 0),
        cuello=(-10 + 10 * fase, 0, 0),
        cabeza=(-18 + 14 * fase, 0, 6),
        mandibula=(24 + 18 * fase, 0, 0),
        **{
            "brazo.L": (125 - 30 * fase, 0, -14 + 10 * fase),
            "brazo.R": (120 - 28 * fase, 0, 14 - 10 * fase),
            "antebrazo.L": (45 - 35 * fase, 0, 0),
            "antebrazo.R": (45 - 35 * fase, 0, 0),
            "mano.L": (20, 0, 0), "mano.R": (20, 0, 0),
            "muslo.L": (10 + 20 * fase, 0, 3), "pierna.L": (-14 - 10 * fase, 0, 0),
            "muslo.R": (-10 - 8 * fase, 0, -3), "pierna.R": (-8, 0, 0),
        },
    )


def muerte(t):
    """Se dobla de rodillas y cae de frente. t 0..1."""
    rod = min(1.0, t / 0.45)
    caer = max(0.0, (t - 0.35) / 0.65)
    caer = caer * caer * (3 - 2 * caer)
    return P(
        cadera=(10 * rod + 70 * caer, 0, 6 * caer),
        cadera_pos=(0, -0.38 * rod - 0.42 * caer, -0.08 * rod + 0.32 * caer),
        columna=(15 + 10 * caer, 0, 0),
        pecho=(5, 0, 0),
        cuello=(10 - 40 * caer, 0, 0),
        cabeza=(0, 20 * caer, 25 * caer),
        mandibula=(30, 0, 0),
        **{
            "muslo.L": (85 * rod - 75 * caer, 0, 4), "pierna.L": (-110 * rod + 95 * caer, 0, 0),
            "muslo.R": (80 * rod - 72 * caer, 0, -6), "pierna.R": (-105 * rod + 90 * caer, 0, 0),
            "pie.L": (20 * rod, 0, 0), "pie.R": (25 * rod, 0, 0),
            "brazo.L": (20 + 60 * caer, 0, -10), "antebrazo.L": (20, 0, 0),
            "brazo.R": (10 + 75 * caer, 0, 15), "antebrazo.R": (30, 0, 0),
        },
    )


def construir_animaciones(arm):
    fps = bpy.context.scene.render.fps
    crear_animacion(arm, "caminar", [(int(i * 4), paso(i / 8)) for i in range(9)])
    crear_animacion(arm, "reposo", [(int(i * 10), reposo(i / 6)) for i in range(7)])
    crear_animacion(arm, "atacar", [
        (0, reposo(0)), (7, ataque(0)), (13, ataque(1)), (17, ataque(1)), (26, reposo(0)),
    ])
    crear_animacion(arm, "morir", [(int(i * 5), muerte(i / 8)) for i in range(9)])
    return fps


# ============================ MONTAJE ================================
def unir_partes(arm):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object else None
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in PARTES:
        o.select_set(True)
    cuerpo = PARTES[0]
    bpy.context.view_layer.objects.active = cuerpo
    bpy.ops.object.join()
    cuerpo.name = NOMBRE
    cuerpo.data.name = "zc_" + NOMBRE
    # funde vértices duplicados de cada pieza y limpia
    bm = bmesh.new()
    bm.from_mesh(cuerpo.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(cuerpo.data)
    bm.free()
    cuerpo.parent = arm
    mod = cuerpo.modifiers.new("Esqueleto", "ARMATURE")
    mod.object = arm
    return cuerpo


def exportar(cuerpo, arm):
    carpeta = RUTA or (bpy.path.abspath("//") if bpy.data.filepath else os.path.expanduser("~"))
    ruta = os.path.join(carpeta, NOMBRE + ".glb")
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    cuerpo.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    opciones = dict(filepath=ruta, export_format="GLB", use_selection=True,
                    export_animations=True, export_skins=True, export_yup=True)
    for extra in ({"export_animation_mode": "ACTIONS"}, {"export_nla_strips": True}, {}):
        try:
            bpy.ops.export_scene.gltf(**opciones, **extra)
            break
        except TypeError:
            continue
    return ruta


def main():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    arm = crear_esqueleto()
    construir_cabeza()
    construir_torso()
    for s, lado in ((1, "L"), (-1, "R")):
        construir_brazo(s, lado)
        construir_pierna(s, lado)
    cuerpo = unir_partes(arm)
    construir_animaciones(arm)

    # deja la animación de caminar puesta para verla con la barra espaciadora
    arm.animation_data.action = bpy.data.actions.get("caminar")
    escena = bpy.context.scene
    escena.frame_start, escena.frame_end = 0, 32

    tris = sum(len(p.vertices) - 2 for p in cuerpo.data.polygons)
    print(f"[Zombi] semilla {SEMILLA}: {tris} triángulos, {len(arm.data.bones)} huesos")
    if EXPORTAR:
        arm.animation_data.action = None
        ruta = exportar(cuerpo, arm)
        arm.animation_data.action = bpy.data.actions.get("caminar")
        print(f"[Zombi] exportado en: {ruta}")


main()
