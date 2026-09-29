/** Architectural overview of the M1–M6 pipeline. Presentation copy only — not backend state. */
export interface PipelineStage {
  id: string
  title: string
  short: string
  detail: string
  inputs: string[]
}

export const PIPELINE: PipelineStage[] = [
  { id: 'M1', title: 'Detect', short: 'Identify oil-slick candidates in Sentinel-1 SAR imagery.',
    detail: 'Speckle filtering, calibration, land masking and CFAR-based segmentation isolate dark-slick candidates and characterise their geometry.',
    inputs: ['Sentinel-1 GRD', 'Land mask'] },
  { id: 'M2', title: 'Reconstruct', short: 'Trace the slick backward in time to its probable origin.',
    detail: 'Backward Lagrangian particle ensembles driven by ocean currents and wind produce an origin-probability surface and release-time window.',
    inputs: ['CMEMS currents', 'ERA5 wind'] },
  { id: 'M3', title: 'Forecast', short: 'Project the slick forward to anticipate landfall and spread.',
    detail: 'Forward ensemble drift propagates the observed slick with quantified uncertainty from environmental forcing.',
    inputs: ['CMEMS currents', 'ERA5 wind'] },
  { id: 'M4', title: 'Correlate', short: 'Find and rank vessels whose tracks intersect the origin region.',
    detail: 'AIS trajectories are filtered and matched spatio-temporally to the reconstructed origin; behaviour such as gaps and loitering is scored as supporting evidence.',
    inputs: ['AIS / Global Fishing Watch'] },
  { id: 'M5', title: 'PASHA', short: 'Replay counterfactual spills from each candidate vessel.',
    detail: 'Hypothesis-driven simulation asks: if this vessel had released here, would the resulting slick match what the satellite saw?',
    inputs: ['M2 origin', 'M4 candidates'] },
  { id: 'M6', title: 'Explain', short: 'Assemble an evidence dossier with full provenance.',
    detail: 'Scoring, physical-plausibility checks and falsification tests are compiled into an auditable evidence report.',
    inputs: ['M1–M5 outputs'] },
]
