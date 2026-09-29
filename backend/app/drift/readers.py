"""
Bridges the xarray Datasets returned by the ERA5/CMEMS providers (already
in memory, CF-compliant) to OpenDrift's own reader interface, which expects
a NetCDF file path rather than an in-memory Dataset. This writes the
Dataset back to a temp file and opens it with OpenDrift's generic CF reader
-- no field values are altered or synthesized in the round trip, this is
purely a format bridge.

No fallback/synthetic reader lives in this module or anywhere else under
app/ -- if a caller needs a reader and has no real environmental Dataset,
that is a ProviderNotConfigured/ProviderUnavailable situation to surface,
not something for this module to paper over. (Test-only constant-field
readers are constructed directly in the test files that need them, using
opendrift.readers.reader_constant, precisely so nothing resembling a
synthetic fallback exists in application code.)
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import xarray as xr


def dataset_to_opendrift_reader(ds: xr.Dataset, tmp_dir: str | None = None):
    from opendrift.readers import reader_netCDF_CF_generic

    tmp_dir = tmp_dir or tempfile.mkdtemp(prefix="varuna_netra_env_")
    path = str(Path(tmp_dir) / "field.nc")
    ds.to_netcdf(path)
    return reader_netCDF_CF_generic.Reader(path)
