"""Decrit la disposition de l'ecran dans quelques images d'un clip (OpenCV : YuNet, et SFace si des photos sont fournies, CPU).

Entree (JSON sur stdin) :
  {"models": "<dossier>", "frames": [{"path": "f1.jpg", "t": 12.5}, ...], "photos": ["a.jpg", ...]}   ("photos" facultatif)
Sortie (une ligne JSON sur stdout) :
  {"frames": [{"t": 12.5, "faces": [{"x": 0.4, "y": 0.8, "w": 0.03, "h": 0.08, "score": 0.9, "similarity": 0.7,
    "rect": {"x": 0.38, "y": 0.75, "w": 0.24, "h": 0.25}}]}, ...]}
Coordonnees normalisees (0..1). "similarity" n'existe que si des photos sont fournies. "rect" est le rectangle qui entoure ce visage
(une camera incrustee, ou un panneau camera a cote du contenu) retrouve par ses bords droits ; absent si aucun rectangle net
n'entoure le visage (visage plein ecran, par exemple). Un visage minuscule (miniature, 5 % de la hauteur) est ignore.

Methode : une camera incrustee reste au meme endroit, alors que le contenu autour (page web, application) change d'une image a l'autre.
On regroupe donc les visages qui reviennent au meme endroit dans plusieurs images, et on cherche les bords du rectangle sur la force
de bord MINIMALE (percentile bas) de ces images : seul un vrai bord de camera est net dans toutes, un objet de la page ne l'est pas.
"""
import json
import os
import sys

import cv2
import numpy as np

MIN_FACE_H = 0.055   # sous cette part de la hauteur : miniature, pas une camera
EDGE_MIN = 45.0      # force minimale d'un bord (gradient moyen), mesuree sur le percentile bas des images
SNAP = 1.5           # un bord a moins de 1,5 visage du bord de l'image est confondu avec lui
LOW_PERCENTILE = 25  # force de bord retenue : celle qu'ont au moins 75 % des images
CLUSTER_DIST = 0.04  # deux visages a moins de 4 % de l'image l'un de l'autre sont "au meme endroit"


def load(path: str):
    data = np.fromfile(path, dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def peak(profile, lo, hi):
    lo, hi = max(0, int(lo)), min(len(profile), int(hi))
    if hi - lo < 4:
        return None
    seg = profile[lo:hi]
    return lo + int(np.argmax(seg)), float(seg.max())


def profiles(gx, gy, face, w, h):
    """Force des bords verticaux (par colonne) et horizontaux (par ligne) autour du visage dans une image."""
    fx, fy, fw, fh = face
    r0, r1 = int(max(0, fy - 0.5 * fh)), int(min(h, fy + 1.5 * fh))
    c0, c1 = int(max(0, fx - 0.5 * fw)), int(min(w, fx + 1.5 * fw))
    return gx[r0:r1, :].mean(axis=0), gy[:, c0:c1].mean(axis=1)


def find_rect(col, row, face, w, h, support_of):
    """Rectangle (x0, y0, x1, y1 en pixels) dont les quatre cotes sont des bords droits autour du visage, ou None.

    col / row : profils de force de bord (deja reduits au percentile bas des images). support_of(side, a, b, c) : force du bord sur toute
    sa longueur (meme reduction)."""
    fx, fy, fw, fh = face

    def side(profile, lo, hi, to_edge, edge):
        # Le cote est le bord de l'image si celui-ci est proche du visage ; sinon le bord le plus net de la zone.
        if to_edge < SNAP * max(fw, fh):
            return edge, True
        found = peak(profile, lo, hi)
        return (found[0], False) if found and found[1] >= EDGE_MIN else (None, False)

    left, ls = side(col, fx - 12 * fw, fx - 0.3 * fw, fx, 0)
    right, rs = side(col, fx + 1.3 * fw, fx + 12 * fw, w - (fx + fw), w - 1)
    top, ts = side(row, fy - 7 * fh, fy - 0.3 * fh, fy, 0)
    bottom, bs = side(row, fy + 1.3 * fh, fy + 7 * fh, h - (fy + fh), h - 1)
    if None in (left, right, top, bottom):
        return None
    if right - left < 1.6 * fw or bottom - top < 1.4 * fh:
        return None
    # Chaque cote doit etre un bord net sur TOUTE sa longueur (pas un objet de la piece qui passe derriere le visage).
    checks = []
    if not ls:
        checks.append(support_of('v', left, top, bottom))
    if not rs:
        checks.append(support_of('v', right, top, bottom))
    if not ts:
        checks.append(support_of('h', top, left, right))
    if not bs:
        checks.append(support_of('h', bottom, left, right))
    if any(c < EDGE_MIN * 0.6 for c in checks):
        return None
    rw, rh = right - left, bottom - top
    # Camera incrustee : petit rectangle ; panneau camera : pleine hauteur, jusqu'a 60 % de la largeur.
    pip = rw * rh <= 0.25 * w * h and 1.0 <= rw / rh <= 2.4
    panel = rh >= 0.9 * h and rw <= 0.6 * w and rw >= 0.25 * w
    if not (pip or panel):
        return None
    return left, top, right, bottom


def main() -> None:
    request = json.load(sys.stdin)
    models = request["models"]
    detector = cv2.FaceDetectorYN.create(os.path.join(models, "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.7, 0.3, 5000)
    recognizer = None
    references = []
    if request.get("photos"):
        recognizer = cv2.FaceRecognizerSF.create(os.path.join(models, "face_recognition_sface_2021dec.onnx"), "")
        for path in request["photos"]:
            image = load(path)
            if image is None:
                continue
            h, w = image.shape[:2]
            detector.setInputSize((w, h))
            _, faces = detector.detect(image)
            if faces is None or not len(faces):
                continue
            largest = max(faces, key=lambda f: f[2] * f[3])
            references.append(recognizer.feature(recognizer.alignCrop(image, largest)))

    # Phase 1 : visages de chaque image.
    frames = []  # {"t", "w", "h", "gx", "gy", "faces": [{"px": (x,y,w,h), "out": {...}}]}
    for frame in request["frames"]:
        image = load(frame["path"])
        entry = {"t": frame.get("t"), "w": 0, "h": 0, "gx": None, "gy": None, "faces": []}
        if image is not None:
            h, w = image.shape[:2]
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            entry.update(w=w, h=h, gx=np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)), gy=np.abs(cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)))
            detector.setInputSize((w, h))
            _, faces = detector.detect(image)
            for f in ([] if faces is None else faces):
                x, y, fw, fh = (float(v) for v in f[:4])
                if fh / h < MIN_FACE_H:
                    continue
                out = {"x": round(x / w, 4), "y": round(y / h, 4), "w": round(fw / w, 4), "h": round(fh / h, 4), "score": round(float(f[14]), 3)}
                if references and recognizer is not None:
                    candidate = recognizer.feature(recognizer.alignCrop(image, f))
                    out["similarity"] = round(max(float(recognizer.match(ref, candidate, cv2.FaceRecognizerSF_FR_COSINE)) for ref in references), 3)
                entry["faces"].append({"px": (x, y, fw, fh), "out": out})
        frames.append(entry)

    # Phase 2 : visages qui reviennent au meme endroit dans plusieurs images = candidats camera.
    clusters = []  # liste de listes de (index d'image, visage)
    for fi, entry in enumerate(frames):
        for face in entry["faces"]:
            cx, cy, ch = face["out"]["x"] + face["out"]["w"] / 2, face["out"]["y"] + face["out"]["h"] / 2, face["out"]["h"]
            for cluster in clusters:
                ref = cluster[0][1]["out"]
                rx, ry, rh = ref["x"] + ref["w"] / 2, ref["y"] + ref["h"] / 2, ref["h"]
                if abs(cx - rx) <= CLUSTER_DIST and abs(cy - ry) <= CLUSTER_DIST and 0.7 <= ch / max(rh, 1e-6) <= 1.4 and all(i != fi for i, _ in cluster):
                    cluster.append((fi, face))
                    break
            else:
                clusters.append([(fi, face)])

    # Phase 3 : rectangle de chaque groupe, mesure sur la force de bord minimale des images du groupe.
    for cluster in clusters:
        if len(cluster) < 2:
            members = cluster
        else:
            members = cluster
        w, h = frames[members[0][0]]["w"], frames[members[0][0]]["h"]
        boxes = np.array([f["px"] for _, f in members], dtype=np.float32)
        face_px = tuple(float(v) for v in np.median(boxes, axis=0))
        cols, rows = [], []
        for fi, f in members:
            col, row = profiles(frames[fi]["gx"], frames[fi]["gy"], face_px, w, h)
            cols.append(col)
            rows.append(row)
        col = np.percentile(np.stack(cols), LOW_PERCENTILE, axis=0)
        row = np.percentile(np.stack(rows), LOW_PERCENTILE, axis=0)

        def support_of(kind, pos, a, b):
            vals = []
            for fi, _ in members:
                g = frames[fi]["gx"] if kind == "v" else frames[fi]["gy"]
                a2, b2 = int(max(0, a)), int(min(g.shape[0] if kind == "v" else g.shape[1], b + 1))
                if kind == "v":
                    vals.append(float(g[a2:b2, max(0, pos - 1):pos + 2].mean()))
                else:
                    vals.append(float(g[max(0, pos - 1):pos + 2, a2:b2].mean()))
            return float(np.percentile(vals, LOW_PERCENTILE))

        rect = find_rect(col, row, face_px, w, h, support_of)
        if rect:
            r = {"x": round(rect[0] / w, 4), "y": round(rect[1] / h, 4), "w": round((rect[2] - rect[0]) / w, 4), "h": round((rect[3] - rect[1]) / h, 4)}
            for _, f in members:
                f["out"]["rect"] = r

    print(json.dumps({"frames": [{"t": e["t"], "faces": [f["out"] for f in e["faces"]]} for e in frames]}))


if __name__ == "__main__":
    main()
