"""
SAR archive handling -- the piece the backend genuinely lacked (spec
section 6/7 of the gap analysis): turning an uploaded file into a `.SAFE`
directory on disk at exactly the path `run_detection_from_safe` and
`jobs/investigation_pipeline.py` already expect
(``{tempdir}/varuna-netra/{product_id}/{product_id}.SAFE``), so ingestion
plugs into the *existing* M1-M6 pipeline rather than duplicating it.

Two upload shapes are supported:

  1. A zip whose members are rooted under a ``<product_id>.SAFE/`` prefix --
     this is the layout of both a raw CDSE product download and of a
     `.SAFE` folder a user zips up themselves. We extract everything under
     that prefix into the canonical path, stripping the prefix.
  2. A standalone GeoTIFF -- registered for metadata purposes only; it has
     no calibration/annotation XML, so it cannot feed the M1 CFAR pipeline
     (which is a real, documented limitation surfaced in the response,
     never silently ignored).

Extraction is zip-slip-safe: every member's resolved path is checked to
stay inside the destination directory before it is written. A zip that
does not contain a `.SAFE` member is rejected with IngestionError rather
than guessed at.
"""
from __future__ import annotations

import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

from app.core.exceptions import IngestionError

VARUNA_TMP_ROOT = Path(tempfile.gettempdir()) / "varuna-netra"


@dataclass
class UnpackedSafe:
    product_id: str
    safe_dir: Path


def _find_safe_prefix(names: list[str]) -> str:
    """Returns the `<product_id>.SAFE/` prefix shared by the archive's
    members. Raises IngestionError if none is found -- e.g. the upload is a
    zip of loose files rather than a genuine SAFE product tree."""
    for name in names:
        parts = Path(name).parts
        for part in parts:
            if part.upper().endswith(".SAFE"):
                idx = parts.index(part)
                return "/".join(parts[: idx + 1]) + "/"
    raise IngestionError(
        "No *.SAFE directory found inside the uploaded archive. Expected a "
        "raw CDSE product zip or a zipped .SAFE folder.",
    )


def _safe_extract_member(zf: zipfile.ZipFile, member: zipfile.ZipInfo, prefix: str, dest_root: Path) -> None:
    if not member.filename.startswith(prefix):
        return
    relative = member.filename[len(prefix):]
    if not relative or member.is_dir():
        return
    target = (dest_root / relative).resolve()
    if dest_root.resolve() not in target.parents and target != dest_root.resolve():
        # Zip-slip guard: a crafted member (e.g. "../../etc/passwd") whose
        # resolved path escapes dest_root is refused outright, not sanitized.
        raise IngestionError(
            "Archive contains a member that would extract outside the target "
            "directory.",
            member=member.filename,
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    with zf.open(member) as src, open(target, "wb") as dst:
        dst.write(src.read())


def unpack_safe_zip(archive_path: Path) -> UnpackedSafe:
    """Extracts the `.SAFE` product tree from `archive_path` into
    ``{tempdir}/varuna-netra/{product_id}/{product_id}.SAFE``, reusing an
    already-unpacked copy if one exists (mirrors save_satellite_scene's
    product_id-is-the-natural-key behaviour elsewhere in this codebase)."""
    if not zipfile.is_zipfile(archive_path):
        raise IngestionError("Uploaded file is not a valid zip archive.", path=str(archive_path))

    with zipfile.ZipFile(archive_path) as zf:
        names = zf.namelist()
        prefix = _find_safe_prefix(names)
        safe_folder_name = prefix.rstrip("/").split("/")[-1]  # "<product_id>.SAFE"
        product_id = safe_folder_name[: -len(".SAFE")] if safe_folder_name.upper().endswith(".SAFE") else safe_folder_name

        dest_root = VARUNA_TMP_ROOT / product_id / safe_folder_name
        if dest_root.exists() and any(dest_root.iterdir()):
            return UnpackedSafe(product_id=product_id, safe_dir=dest_root)

        dest_root.mkdir(parents=True, exist_ok=True)
        for member in zf.infolist():
            _safe_extract_member(zf, member, prefix, dest_root)

    if not any(dest_root.rglob("manifest.safe")) and not any(dest_root.glob("annotation/*.xml")):
        raise IngestionError(
            "Extracted archive does not look like a genuine Sentinel-1 GRD "
            ".SAFE product (no manifest.safe or annotation XML found).",
            safe_dir=str(dest_root),
        )

    return UnpackedSafe(product_id=product_id, safe_dir=dest_root)


def store_geotiff(archive_path: Path, original_filename: str) -> Path:
    """Standalone-GeoTIFF path: no unpacking needed, just move it to a
    stable, namespaced location so a later step (or an analyst) can find it
    again without depending on the upload temp file surviving."""
    stem = Path(original_filename).stem or "upload"
    dest_dir = VARUNA_TMP_ROOT / "geotiff_uploads"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / f"{stem}{Path(original_filename).suffix or '.tif'}"
    archive_path.replace(dest_path)
    return dest_path
