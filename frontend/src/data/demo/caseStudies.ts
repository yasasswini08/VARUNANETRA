/**
 * DEMO / PRESENTATION scenarios. These are illustrative narratives used to show
 * what Varuna Netra is designed to do. They are NOT records from the backend and
 * contain no fabricated measurements.
 */
export type CaseCategory = 'Oil Spill' | 'Illegal Dumping' | 'Vessel Behaviour' | 'Environmental'

export interface CaseStudy {
  id: string
  category: CaseCategory
  title: string
  region: string
  problem: string
  investigationType: string
  description: string
  stages: string[]
  hue: number
}

export const CASE_STUDIES: CaseStudy[] = [
  { id: 'coastal-corridor-slick', category: 'Oil Spill', title: 'Dark slick near a busy shipping corridor',
    region: 'Arabian Sea', problem: 'A slick appears in SAR imagery with several vessels transiting nearby.',
    investigationType: 'Full M1–M6 attribution',
    description: 'Walks the full chain: detect the slick, reconstruct backward drift, correlate AIS candidates and test each with counterfactual replay.',
    stages: ['M1', 'M2', 'M4', 'M5', 'M6'], hue: 200 },
  { id: 'repeat-dumping-pattern', category: 'Illegal Dumping', title: 'Repeated slicks along a shipping lane',
    region: 'Bay of Bengal', problem: 'Slick-like signatures recur along a lane, suggesting deliberate discharge.',
    investigationType: 'Multi-scene pattern analysis',
    description: 'Compares detections across acquisitions to test whether the pattern is consistent with vessel-linked release.',
    stages: ['M1', 'M2', 'M4'], hue: 28 },
  { id: 'rendezvous-behaviour', category: 'Vessel Behaviour', title: 'Suspicious rendezvous at sea',
    region: 'Lakshadweep', problem: 'Two vessels meet in open water with AIS irregularities before a slick is observed.',
    investigationType: 'Vessel intelligence',
    description: 'Examines AIS gaps and loitering as supporting evidence, without treating them as proof of involvement.',
    stages: ['M4', 'M5', 'M6'], hue: 260 },
  { id: 'coastal-spill-forecast', category: 'Oil Spill', title: 'Coastal spill trajectory forecast',
    region: 'Kerala Coast', problem: 'A slick is drifting toward a sensitive coastline and responders need a forecast.',
    investigationType: 'Forward drift forecast',
    description: 'Forward ensemble drift with uncertainty bounds to support response planning.',
    stages: ['M1', 'M3'], hue: 190 },
  { id: 'natural-seep', category: 'Environmental', title: 'Natural seep versus vessel discharge',
    region: 'Gulf of Mannar', problem: 'A recurring slick could be a natural seep rather than a vessel release.',
    investigationType: 'Counterfactual exoneration',
    description: 'Uses PASHA to test whether any vessel hypothesis explains the slick better than a fixed-source alternative.',
    stages: ['M1', 'M2', 'M5', 'M6'], hue: 150 },
  { id: 'open-ocean-discharge', category: 'Oil Spill', title: 'Small slick, possible operational discharge',
    region: 'Indian Ocean', problem: 'A small slick with a single nearby fishing vessel and sparse AIS coverage.',
    investigationType: 'Low-evidence attribution',
    description: 'Shows how the platform reports uncertainty and limitations when evidence is thin.',
    stages: ['M1', 'M2', 'M4', 'M6'], hue: 215 },
]

/**
 * Narrative for each pipeline step in a demo case. Written as "what the platform does", never as measured output:
 * no coordinates, scores, vessel names or imagery are stated, because none of this is real data.
 */
export const DEMO_STEP_TEXT: { stage: string; key: string; title: string; text: string }[] = [
  { stage: 'M1', key: 'observation', title: 'Satellite observation', text: 'A Sentinel-1 SAR scene covering the area is selected. Dark, low-backscatter regions are candidates for a slick.' },
  { stage: 'M1', key: 'process', title: 'Investigation process', text: 'Speckle filtering, land masking and CFAR segmentation isolate candidate regions and characterise their shape.' },
  { stage: 'M2', key: 'environment', title: 'Environmental context', text: 'Wind (ERA5) and surface currents (CMEMS) for the hindcast window are retrieved, with provenance recorded for each source.' },
  { stage: 'M3', key: 'drift', title: 'Drift', text: 'An ensemble is run backward from the observed slick to a candidate origin region with a stated uncertainty radius and release-time window.' },
  { stage: 'M4', key: 'vessels', title: 'Vessel correlation', text: 'AIS tracks near the origin region are scored for spatio-temporal agreement. Agreement ranks candidates; it does not establish responsibility.' },
  { stage: 'M5', key: 'pasha', title: 'PASHA', text: 'Each candidate is replayed as a hypothetical source and tested against the observed slick using spatial, temporal, drift and physical checks.' },
  { stage: 'M6', key: 'report', title: 'Report', text: 'Results, provenance and stated limitations are compiled into an evidence dossier.' },
]

export const DEMO_OUTCOME: Record<string, { result: string; limitations: string }> = {
  'coastal-corridor-slick': { result: 'Illustrative outcome: a ranked set of candidate hypotheses, each with the tests it passed or failed, and an explicit statement when no candidate is supported.', limitations: 'Busy corridors produce many spatially plausible candidates; sparse AIS coverage can leave the true source unobserved.' },
  'repeat-dumping-pattern': { result: 'Illustrative outcome: a comparison of recurring detections that states whether the pattern is consistent with a shared source, without naming a responsible party.', limitations: 'Look-alike features such as low-wind areas can recur in SAR imagery and must be ruled out separately.' },
  'rendezvous-behaviour': { result: 'Illustrative outcome: AIS behaviour is reported as supporting evidence next to the counterfactual result, never as proof of involvement.', limitations: 'AIS gaps have many benign causes, including coverage and equipment.' },
  'coastal-spill-forecast': { result: 'Illustrative outcome: forward footprints with spread estimates at chosen horizons, to support response planning.', limitations: 'Forecast skill is bounded by the accuracy of wind and current forcing.' },
  'natural-seep': { result: 'Illustrative outcome: a statement of whether any vessel hypothesis explains the slick better than a fixed-source alternative.', limitations: 'Distinguishing a seep from a discharge needs repeated observations over time.' },
  'open-ocean-discharge': { result: 'Illustrative outcome: a report that states plainly which conclusions the thin evidence cannot support.', limitations: 'A single nearby vessel and sparse AIS coverage cannot support attribution on their own.' },
}
