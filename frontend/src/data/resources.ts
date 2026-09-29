/** Static descriptions of the data ecosystem. Live provider state comes from the backend, never from here. */
export interface DataResource {
  key: string
  /** Matches `name` in GET /api/providers/status, when the backend reports on it. */
  providerName?: string
  title: string
  org: string
  role: string
  tags: string[]
  url: string
  dataType: string
  pipelineRole: string
  provenance: string
}

export const DATA_RESOURCES: DataResource[] = [
  { key: 's1', providerName: 'sentinel1_cdse', title: 'Sentinel-1 SAR', org: 'Copernicus Data Space Ecosystem',
    role: 'C-band synthetic aperture radar imagery for detecting oil slicks day or night, through cloud.',
    tags: ['SAR', 'GRD', 'Global'], url: 'https://dataspace.copernicus.eu', dataType: 'Raster imagery (SAR GRD)', pipelineRole: 'Input to M1 detection; defines the observation time used by M2–M3', provenance: 'Product ID, acquisition time, footprint and source URL are recorded on each scene and detection run' },
  { key: 'ais', providerName: 'ais_global_fishing_watch', title: 'AIS Vessel Tracks', org: 'Global Fishing Watch',
    role: 'Automatic Identification System positions used to correlate vessels with the reconstructed origin.',
    tags: ['Vessels', 'AIS'], url: 'https://globalfishingwatch.org', dataType: 'Vessel position tracks', pipelineRole: 'Input to M4 vessel correlation and, through M4 candidates, to M5 PASHA', provenance: 'The vessel-candidates endpoint returns no provenance block; the analysis it correlated against is identified' },
  { key: 'era5', providerName: 'era5_cds', title: 'ERA5 Reanalysis', org: 'ECMWF / Copernicus Climate Data Store',
    role: 'Surface wind fields that drive slick advection alongside ocean currents.',
    tags: ['Wind', 'Atmosphere'], url: 'https://cds.climate.copernicus.eu', dataType: 'Gridded atmosphere (wind)', pipelineRole: 'Forcing for M2 context and M3 drift', provenance: 'Dataset, variable, time window, extent and retrieval time are recorded with each summary' },
  { key: 'cmems', providerName: 'cmems', title: 'Ocean Currents', org: 'Copernicus Marine (CMEMS)',
    role: 'Ocean current fields used by the Lagrangian drift model for backward and forward simulation.',
    tags: ['Currents', 'Ocean'], url: 'https://marine.copernicus.eu', dataType: 'Gridded ocean (currents)', pipelineRole: 'Forcing for M2 context and M3 drift', provenance: 'Dataset, variable, time window, extent and retrieval time are recorded with each summary' },
]

export interface CapabilityLayer { title: string; body: string; items: string[] }

export const SYSTEM_LAYERS: CapabilityLayer[] = [
  { title: 'Storage', body: 'Incidents, scenes, detections, observations and reports persist in PostgreSQL with PostGIS geometry.', items: ['PostgreSQL', 'PostGIS', 'Alembic migrations'] },
  { title: 'Drift modelling', body: 'OpenDrift Lagrangian ensembles run backward and forward, forced by ERA5 and CMEMS.', items: ['OpenDrift', 'xarray', 'Ensembles'] },
  { title: 'AI / ML', body: 'SAR segmentation and slick characterisation built on PyTorch and scikit-image.', items: ['PyTorch', 'scikit-image', 'CFAR baseline'] },
  { title: 'PASHA', body: 'Counterfactual hypothesis replay comparing simulated slicks against the observed one.', items: ['Hypotheses', 'Replay', 'Comparison metrics'] },
  { title: 'Jobs', body: 'Long-running investigations execute as Celery tasks with progress reported from the result backend.', items: ['Celery', 'Redis'] },
  { title: 'Application', body: 'FastAPI service with a React front end and evidence dossiers rendered to PDF.', items: ['FastAPI', 'React', 'WeasyPrint'] },
]

export interface ProcessingModule { code: string; title: string; role: string; endpoint: string }
/** Backend routes that exist in app/main.py. */
export const PROCESSING: ProcessingModule[] = [
  { code: 'M1', title: 'SAR detection', role: 'Calibration, speckle filtering, land masking and CFAR segmentation of a Sentinel-1 scene.', endpoint: 'POST /api/detection/run' },
  { code: 'M2', title: 'Environmental context', role: 'Wind and current summaries for the slick area and hindcast window.', endpoint: 'GET /api/environment/wind · /currents' },
  { code: 'M3', title: 'Drift reconstruction', role: 'Backward ensemble to a candidate origin region; optional forward forecast.', endpoint: 'POST /api/drift/backward · /forecast' },
  { code: 'M4', title: 'Vessel correlation', role: 'Scores AIS candidates against the reconstructed origin.', endpoint: 'GET /api/vessels/candidates' },
  { code: 'M5', title: 'PASHA', role: 'Counterfactual replay, falsification and a decision gate over the submitted candidates.', endpoint: 'POST /api/pasha/run' },
  { code: 'M6', title: 'Report', role: 'Renders an evidence dossier PDF from a stored PASHA run.', endpoint: 'POST /api/reports/{incident}/generate' },
]

export interface ArchNode { id: string; title: string; note: string }
/** Explanatory flow only. Whether a stage is usable in a given deployment depends on provider credentials (see the badges above). */
export const ARCHITECTURE: ArchNode[] = [
  { id: 'src', title: 'Data sources', note: 'Sentinel-1, ERA5, CMEMS, Global Fishing Watch' },
  { id: 'ing', title: 'Ingestion', note: 'Catalogue search and SAR product upload' },
  { id: 'm1', title: 'SAR detection', note: 'M1' },
  { id: 'm2', title: 'Environment', note: 'M2' },
  { id: 'm3', title: 'Drift', note: 'M3' },
  { id: 'm4', title: 'Vessel correlation', note: 'M4' },
  { id: 'm5', title: 'PASHA', note: 'M5' },
  { id: 'ev', title: 'Evidence', note: 'Results and provenance' },
  { id: 'm6', title: 'Report', note: 'M6 · PDF dossier' },
]

/** Present in the repository but not connected in this build. Listed so nothing is implied to be operational. */
export const NOT_CONNECTED: { title: string; why: string }[] = [
  { title: 'Object storage (MinIO / S3)', why: 'Disabled in docker-compose. Report PDFs are written to the backend host’s local disk.' },
  { title: 'Trained segmentation model', why: 'M1 uses a deterministic CFAR baseline; no trained model is included.' },
]
