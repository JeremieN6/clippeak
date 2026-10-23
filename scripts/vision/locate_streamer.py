"""Retrouve le streamer dans des images a partir de quelques photos de reference (OpenCV : YuNet + SFace, CPU).

Entree (JSON sur stdin) :
  {"models": "<dossier>", "photos": ["a.jpg", ...], "frames": [{"path": "f1.jpg", "t": 12.5}, ...], "threshold": 0.363}
Sortie (une ligne JSON sur stdout) :
  {"photos_used": n, "photos_without_face": [...], "frames": [{"t": 12.5, "faces": 2, "found": true,
   "similarity": 0.61, "box": {"x": 0.4, "y": 0.1, "w": 0.2, "h": 0.35}}, ...]}
Les coordonnees de "box" sont normalisees (0..1) par la taille de l'image.

Le seuil 0,363 est celui recommande par OpenCV pour SFace (cosinus). Une personne qui n'est pas dans les photos de
reference donne une similarite nettement plus basse : elle n'est jamais cadree a la place du streamer.
"""
import json
import os
import sys

import cv2
import numpy as np


def load(path: str):
    # imdecode + fromfile : lit aussi les chemins Windows avec accents.
    data = np.fromfile(path, dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def main() -> None:
    request = json.load(sys.stdin)
    models = request["models"]
    threshold = float(request.get("threshold", 0.363))
    detector = cv2.FaceDetectorYN.create(os.path.join(models, "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.7, 0.3, 5000)
    recognizer = cv2.FaceRecognizerSF.create(os.path.join(models, "face_recognition_sface_2021dec.onnx"), "")

    def faces_in(image):
        h, w = image.shape[:2]
        detector.setInputSize((w, h))
        _, faces = detector.detect(image)
        return [] if faces is None else list(faces)

    def feature(image, face):
        return recognizer.feature(recognizer.alignCrop(image, face))

    references, without_face = [], []
    for path in request["photos"]:
        image = load(path)
        faces = faces_in(image) if image is not None else []
        if not faces:
            without_face.append(os.path.basename(path))
            continue
        largest = max(faces, key=lambda f: f[2] * f[3])
        references.append(feature(image, largest))

    results = []
    for frame in request["frames"]:
        image = load(frame["path"])
        entry = {"t": frame.get("t"), "faces": 0, "found": False, "similarity": 0.0}
        if image is not None and references:
            h, w = image.shape[:2]
            faces = faces_in(image)
            entry["faces"] = len(faces)
            best, best_face = 0.0, None
            for face in faces:
                candidate = feature(image, face)
                similarity = max(recognizer.match(ref, candidate, cv2.FaceRecognizerSF_FR_COSINE) for ref in references)
                if similarity > best:
                    best, best_face = similarity, face
            entry["similarity"] = round(float(best), 3)
            if best_face is not None and best >= threshold:
                x, y, fw, fh = (float(v) for v in best_face[:4])
                entry["found"] = True
                entry["box"] = {"x": round(x / w, 4), "y": round(y / h, 4), "w": round(fw / w, 4), "h": round(fh / h, 4)}
        results.append(entry)

    print(json.dumps({"photos_used": len(references), "photos_without_face": without_face, "frames": results}))


if __name__ == "__main__":
    main()
