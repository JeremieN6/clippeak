"""Decrit la disposition de l'ecran dans quelques images d'un clip (OpenCV : YuNet, et SFace si des photos sont fournies, CPU).

Entree (JSON sur stdin) :
  {"models": "<dossier>", "frames": [{"path": "f1.jpg", "t": 12.5}, ...], "photos": ["a.jpg", ...]}   ("photos" facultatif)
Sortie (une ligne JSON sur stdout) :
  {"frames": [{"t": 12.5, "faces": [{"x": 0.4, "y": 0.8, "w": 0.03, "h": 0.08, "score": 0.9, "similarity": 0.7,
    "rect": {"x": 0.38, "y": 0.75, "w": 0.24, "h": 0.25}}]}, ...]}
Coordonnees normalisees (0..1). "similarity" n'existe que si des photos sont fournies. "rect" est le rectangle qui entoure ce visage
(une camera incrustee, ou un panneau camera a cote du contenu) retrouve par ses bords droits ; absent si aucun rectangle net
n'entoure le visage (visage plein ecran, par exemple). Un visage minuscule (miniature, 4 % de la hauteur) est ignore.
"""
import json
import os
import sys

import cv2
import numpy as np

MIN_FACE_H = 0.055   # sous cette part de la hauteur : miniature, pas une camera
EDGE_MIN = 55.0      # force minimale d'un bord (gradient moyen)
SNAP = 1.5           # un bord a moins de 1,5 visage du bord de l'image est confondu avec lui


def load(path: str):
    data = np.fromfile(path, dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def peak(profile, lo, hi):
    lo, hi = max(0, int(lo)), min(len(profile), int(hi))
    if hi - lo < 4:
        return None
    seg = profile[lo:hi]
    return lo + int(np.argmax(seg)), float(seg.max())


def find_rect(gray, gx, gy, face):
    """Rectangle (x0, y0, x1, y1 en pixels) dont les quatre cotes sont des bords droits autour du visage, ou None."""
    h, w = gray.shape
    fx, fy, fw, fh = face
    r0, r1 = int(max(0, fy - 0.5 * fh)), int(min(h, fy + 1.5 * fh))
    c0, c1 = int(max(0, fx - 0.5 * fw)), int(min(w, fx + 1.5 * fw))
    col = gx[r0:r1, :].mean(axis=0)
    row = gy[:, c0:c1].mean(axis=1)

    def side(profile, lo, hi, to_edge, edge, near):
        # Le cote est le bord de l'image si celui-ci est proche du visage ; sinon le bord le plus net de la zone.
        if near and to_edge < SNAP * max(fw, fh):
            return edge, True
        found = peak(profile, lo, hi)
        return (found[0], False) if found and found[1] >= EDGE_MIN else (None, False)

    left, ls = side(col, fx - 12 * fw, fx - 0.3 * fw, fx, 0, True)
    right, rs = side(col, fx + 1.3 * fw, fx + 12 * fw, w - (fx + fw), w - 1, True)
    top, ts = side(row, fy - 7 * fh, fy - 0.3 * fh, fy, 0, True)
    bottom, bs = side(row, fy + 1.3 * fh, fy + 7 * fh, h - (fy + fh), h - 1, True)
    if None in (left, right, top, bottom):
        return None
    if right - left < 1.6 * fw or bottom - top < 1.4 * fh:
        return None
    # Chaque cote doit etre un bord net sur TOUTE sa longueur (pas un objet de la piece qui passe derriere le visage).
    def support(vals):
        return float(np.mean(vals))
    length_v, length_h = slice(top, bottom + 1), slice(left, right + 1)
    checks = []
    if not ls:
        checks.append(support(gx[length_v, max(0, left - 1):left + 2].mean(axis=1)))
    if not rs:
        checks.append(support(gx[length_v, right - 1:min(w, right + 2)].mean(axis=1)))
    if not ts:
        checks.append(support(gy[max(0, top - 1):top + 2, length_h].mean(axis=0)))
    if not bs:
        checks.append(support(gy[bottom - 1:min(h, bottom + 2), length_h].mean(axis=0)))
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

    results = []
    for frame in request["frames"]:
        image = load(frame["path"])
        entry = {"t": frame.get("t"), "faces": []}
        if image is not None:
            h, w = image.shape[:2]
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            gx = np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3))
            gy = np.abs(cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))
            detector.setInputSize((w, h))
            _, faces = detector.detect(image)
            for f in ([] if faces is None else faces):
                x, y, fw, fh = (float(v) for v in f[:4])
                if fh / h < MIN_FACE_H:
                    continue
                face = {"x": round(x / w, 4), "y": round(y / h, 4), "w": round(fw / w, 4), "h": round(fh / h, 4), "score": round(float(f[14]), 3)}
                if references and recognizer is not None:
                    candidate = recognizer.feature(recognizer.alignCrop(image, f))
                    face["similarity"] = round(max(float(recognizer.match(ref, candidate, cv2.FaceRecognizerSF_FR_COSINE)) for ref in references), 3)
                rect = find_rect(gray, gx, gy, (x, y, fw, fh))
                if rect:
                    face["rect"] = {"x": round(rect[0] / w, 4), "y": round(rect[1] / h, 4), "w": round((rect[2] - rect[0]) / w, 4), "h": round((rect[3] - rect[1]) / h, 4)}
                entry["faces"].append(face)
        results.append(entry)
    print(json.dumps({"frames": results}))


if __name__ == "__main__":
    main()
