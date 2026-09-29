"""Persistence helpers for restart-safe M2 trajectory artifacts."""

from __future__ import annotations

from pathlib import Path

import xarray as xr


M2_ARTIFACT_DIR = Path("/tmp/varuna-netra/m2")


def _sanitize_attrs(obj):
    """Make xarray attributes NetCDF-serializable."""
    for key, value in list(obj.attrs.items()):
        if isinstance(value, type):
            obj.attrs[key] = value.__name__
        elif hasattr(value, "item"):
            try:
                obj.attrs[key] = value.item()
            except (ValueError, TypeError):
                obj.attrs[key] = str(value)

    return obj


def save_m2_trajectory(result_ds, analysis_id: str) -> str:
    """Persist only the M2 particle trajectory required by M3."""
    M2_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    artifact_path = M2_ARTIFACT_DIR / f"{analysis_id}.nc"

    trajectory = xr.Dataset(
        {
            "lon": result_ds["lon"].copy(),
            "lat": result_ds["lat"].copy(),
        },
        coords={
            "time": result_ds["time"].copy(),
        },
    )

    # OpenDrift/xarray can carry NumPy/Python type objects in attrs.
    # NetCDF requires serializable attribute values.
    trajectory = _sanitize_attrs(trajectory)

    for name in trajectory.data_vars:
        trajectory[name] = _sanitize_attrs(trajectory[name])

    for name in trajectory.coords:
        trajectory[name] = _sanitize_attrs(trajectory[name])

    trajectory.to_netcdf(
        artifact_path,
        engine="netcdf4",
    )

    return str(artifact_path)


def load_m2_trajectory(path: str):
    """Load a persisted M2 trajectory artifact."""
    artifact_path = Path(path)

    if not artifact_path.exists():
        raise FileNotFoundError(
            f"M2 trajectory artifact not found: {artifact_path}"
        )

    return xr.open_dataset(artifact_path)