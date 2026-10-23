"""Telecharge les modeles de reconnaissance de visage (OpenCV Zoo) et verifie leur empreinte SHA-256.

Usage : python download_models.py <dossier>
Un fichier dont l'empreinte ne correspond pas a models.json est supprime : on n'utilise jamais un modele non verifie.
"""
import hashlib
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


def sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    target = sys.argv[1]
    os.makedirs(target, exist_ok=True)
    with open(os.path.join(HERE, "models.json"), encoding="utf-8") as handle:
        models = json.load(handle)

    for name, meta in models.items():
        path = os.path.join(target, name)
        if os.path.exists(path) and sha256(path) == meta["sha256"]:
            print(f"deja present et verifie : {name}")
            continue
        print(f"telechargement : {name} ({meta['size']} octets)")
        urllib.request.urlretrieve(meta["url"], path)
        if sha256(path) != meta["sha256"]:
            os.remove(path)
            sys.exit(f"empreinte invalide pour {name} : fichier supprime")
        print(f"verifie : {name}")


if __name__ == "__main__":
    main()
