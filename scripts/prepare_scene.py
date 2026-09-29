"""
python -m scripts.prepare_scene --product-id <STAC item id>

Unzips the .zip CDSE download for a scene (already fetched by
POST /api/detection/run's first call) into the sibling `<product_id>.SAFE`
directory `detection.py` expects on its second call. Kept as an explicit,
separately-runnable step rather than folded into the API endpoint so a
corrupt or partial download fails here, at the command line, with the
actual zip error -- not silently inside an HTTP request.
"""
import argparse
import tempfile
import zipfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--product-id", required=True)
    args = parser.parse_args()

    safe_root = Path(tempfile.gettempdir()) / "varuna-netra" / args.product_id
    archive_path = safe_root / f"{args.product_id}.zip"
    if not archive_path.exists():
        raise SystemExit(f"No downloaded archive at {archive_path} -- call POST /api/detection/run first.")

    with zipfile.ZipFile(archive_path) as zf:
        zf.extractall(safe_root)

    expected = safe_root / f"{args.product_id}.SAFE"
    if not expected.exists():
        candidates = list(safe_root.glob("*.SAFE"))
        if len(candidates) == 1:
            candidates[0].rename(expected)
        else:
            raise SystemExit(
                f"Extracted archive but found {len(candidates)} .SAFE directories under "
                f"{safe_root}, expected exactly 1 named {args.product_id}.SAFE -- check the archive manually."
            )
    print(f"Ready: {expected}")


if __name__ == "__main__":
    main()
