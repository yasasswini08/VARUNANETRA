import { Link } from 'react-router-dom'
import { UploadCloud } from 'lucide-react'
import { ErrorState, SkeletonRows } from '../StateViews'
import { useObservations } from '../../hooks/useMissionData'
import type { InvestigationCtx, useDetection } from '../../hooks/useInvestigation'
import { formatDateTime } from '../../lib/format'
import type { StageInfo } from '../../lib/investigation'
import { Busy, Kv, LockedNote, num, OpError, RunButton, Section, utc } from './parts'

export function M1Panel({ ctx, detection, stage }: { ctx: InvestigationCtx; detection: ReturnType<typeof useDetection>; stage: StageInfo }) {
  const all = useObservations()
  const { input, attach } = ctx
  const spare = (all.data?.observations ?? []).filter((o) => !o.incident_id && o.status === 'ready' && o.product_id && o.bbox)
  const running = detection.op.status === 'running'
  const res = detection.result
  const rows = res?.candidates ?? []
  const d = res?.diagnostics

  return (
    <div className="mod">
      <Section title="Input · SAR observation">
        {input ? (
          <Kv rows={[
            ['Product ID', input.product_id], ['Sensor', input.sensor], ['Product type', input.product_type], ['Acquired', utc(input.acquisition_time)],
            ['Polarization', input.polarization], ['Extent (lon, lat)', input.bbox ? `${input.bbox[0].toFixed(3)}, ${input.bbox[1].toFixed(3)} → ${input.bbox[2].toFixed(3)}, ${input.bbox[3].toFixed(3)}` : null],
            ['Observation ID', input.id], ['Uploaded', utc(input.created_at)],
          ]} />
        ) : (
          <>
            <LockedNote>No ready SAR observation is linked to this investigation. M1 needs a product ID, footprint and acquisition time.</LockedNote>
            {all.status === 'loading' && <SkeletonRows rows={2} height={34} />}
            {all.status === 'error' && <ErrorState compact error={all.error} onRetry={all.retry} />}
            {all.status === 'success' && (spare.length > 0 ? (
              <div className="attach">
                <label>Attach an ingested observation
                  <select id="attach-obs" defaultValue="" aria-label="Observation to attach" onChange={(e) => { if (e.target.value) void attach.run(e.target.value).then(() => all.retry()) }}>
                    <option value="" disabled>Select a ready observation…</option>
                    {spare.map((o) => <option key={o.id} value={o.id}>{o.product_id} · {o.acquisition_time ? formatDateTime(o.acquisition_time) : 'no time'}</option>)}
                  </select>
                </label>
                {attach.state.status === 'running' && <Busy>Linking observation…</Busy>}
                {attach.state.status === 'error' && <OpError error={attach.state.error} onRetry={attach.reset} title="Could not attach observation" />}
              </div>
            ) : <p className="hint">No unattached ready observations exist. <Link to="/sar-ingestion" className="link-more"><UploadCloud size={13} /> Ingest a SAR product</Link></p>)}
          </>
        )}
      </Section>

      <Section title="Processing" aside={<RunButton busy={running} disabled={stage.state === 'locked' || stage.state === 'unavailable'} why={stage.note} onClick={() => void detection.start()}>{res ? 'Re-run detection' : 'Run M1 detection'}</RunButton>}>
        {running && <Busy>PROCESSING — the backend runs detection synchronously and reports no percentage. It may download the scene first.</Busy>}
        {stage.state === 'unavailable' && <LockedNote>{stage.note}</LockedNote>}
        {detection.op.status === 'error' && <OpError error={detection.op.error} onRetry={() => void detection.start()} title="Detection failed" />}
        {!running && detection.op.status !== 'error' && stage.state === 'ready' && !res && <p className="hint">READY TO RUN — no detection has been run for this investigation.</p>}
        {detection.stored.status === 'error' && !detection.result && <OpError error={detection.stored.error} onRetry={detection.stored.retry} title="Stored detection run could not be read" />}
      </Section>

      <Section title="Output">
        {!res && ctx.detections.length === 0 && <p className="hint">No detection output yet.</p>}
        {res && (
          <>
            <div className={`callout callout--${(d?.accepted_count ?? 0) > 0 ? 'ok' : 'warn'}`} role="status">
              {(d?.accepted_count ?? 0) > 0 ? `${d?.accepted_count} candidate(s) accepted` : 'Detection completed — no candidate passed the look-alike filters'}
            </div>
            <Kv rows={[
              ['Detection run', res.detection_id], ['Scene record', res.scene_id], ['Raw components', d?.raw_component_count],
              ['Accepted', d?.accepted_count], ['Dark-pixel fraction', d?.dark_pixel_fraction !== undefined ? num(d.dark_pixel_fraction, 4) : null],
              ['CFAR parameters', d?.cfar_params ? JSON.stringify(d.cfar_params) : null],
            ]} />
            {rows.length > 0 && (
              <div className="table-wrap"><table className="tbl">
                <caption className="sr-only">Detection candidates</caption>
                <thead><tr><th>Label</th><th>Area km²</th><th>Score</th><th>Length km</th><th>Width km</th><th>Contrast dB</th><th>Land km</th><th>Rejected because</th></tr></thead>
                <tbody>{rows.map((c, i) => (
                  <tr key={i}><td>{c.classification_label}</td><td className="mono">{num(c.area_km2)}</td><td className="mono">{num(c.detection_score, 3)}</td><td className="mono">{num(c.length_km)}</td><td className="mono">{num(c.width_km)}</td><td className="mono">{num(c.contrast_db)}</td><td className="mono">{num(c.distance_to_land_km, 1)}</td><td>{c.rejected_reason ?? '—'}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </>
        )}
        {!res && ctx.detections.length > 0 && (
          <>
            <p className="hint">Persisted detections for this incident (the originating run is not linked in this browser).</p>
            <div className="table-wrap"><table className="tbl">
              <caption className="sr-only">Persisted detections</caption>
              <thead><tr><th>ID</th><th>Label</th><th>Area km²</th><th>Score</th></tr></thead>
              <tbody>{ctx.detections.map((x) => <tr key={x.id}><td className="mono">{x.id.slice(0, 8)}</td><td>{x.classification_label}</td><td className="mono">{num(x.area_km2)}</td><td className="mono">{num(x.detection_score, 3)}</td></tr>)}</tbody>
            </table></div>
          </>
        )}
        {ctx.slick?.reduced && <p className="hint">The top detection is a MultiPolygon; downstream drift uses its largest part.</p>}
      </Section>
    </div>
  )
}
