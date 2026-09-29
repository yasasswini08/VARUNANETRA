import { useState, type FormEvent } from 'react'
import { Crown, Github, Globe, Handshake, Info, Lightbulb, Linkedin, Mail, MapPin, MessageSquare, Send, User, Users, Youtube } from 'lucide-react'
import { CONTACT, TEAM } from '../config/site'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const MAX = 1000
/** Only http(s) links are ever rendered; a bare domain is upgraded to https. */
function safe(u: string | undefined): string | undefined {
  if (!u) return undefined
  const v = /^https?:\/\//i.test(u) ? u : `https://${u}`
  try { const x = new URL(v); return x.protocol === 'https:' || x.protocol === 'http:' ? x.toString() : undefined } catch { return undefined }
}
const TOPICS = [
  { value: 'Technical support', hint: 'Help with the platform', icon: MessageSquare },
  { value: 'Partnerships', hint: 'Collaborate with the team', icon: Handshake },
  { value: 'Research query', hint: 'Discuss methods and data', icon: Lightbulb },
  { value: 'General inquiry', hint: 'We are here to help', icon: Users },
] as const

const STYLES = `
.cx { max-width: 1180px; margin: 0 auto; }
.cx-hero { display: grid; gap: 10px; margin-bottom: 28px; }
.cx-hero h1 { font-family: var(--font-display); font-size: clamp(38px, 5vw, 56px); line-height: 1.05; }
.cx-hero p { color: var(--text-2); max-width: 56ch; font-size: 16px; }
.cx-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 22px; align-items: start; }
.cx-panel { background: linear-gradient(180deg, rgba(16,38,63,.55), rgba(8,20,36,.7)); border: 1px solid var(--line); border-radius: var(--r-lg, 16px); padding: 26px; }
.cx-panel h2 { font-family: var(--font-display); font-size: 26px; margin-bottom: 4px; }
.cx-sub { color: var(--muted); font-size: 13.5px; margin-bottom: 20px; }
.cx-form { display: grid; gap: 18px; }
.cx-label { display: grid; gap: 7px; font-size: 12.5px; letter-spacing: .04em; color: var(--text-2); }
.cx-label > span:first-child b { color: var(--primary); font-weight: 500; }
.cx-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.cx-in { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line-strong); background: rgba(4,11,22,.55); color: var(--text); font: inherit; font-size: 15px; transition: border-color .15s, box-shadow .15s; }
.cx-in::placeholder { color: var(--muted); opacity: .7; }
.cx-in:hover { border-color: rgba(63,216,232,.35); }
.cx-in:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-dim); }
textarea.cx-in { min-height: 150px; resize: vertical; line-height: 1.5; }
.cx-count { justify-self: end; font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); }
.cx-count.is-near { color: var(--warn); }
.cx-topics { border: 0; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cx-topics legend { font-size: 12.5px; letter-spacing: .04em; color: var(--text-2); margin-bottom: 8px; padding: 0; }
.cx-topic { position: relative; display: flex; gap: 12px; align-items: center; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; background: rgba(4,11,22,.35); transition: border-color .15s, background .15s; }
.cx-topic:hover { border-color: rgba(63,216,232,.4); }
.cx-topic input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
.cx-topic svg { flex: none; width: 20px; height: 20px; color: var(--muted); transition: color .15s; }
.cx-topic b { display: block; font-size: 14px; font-weight: 500; }
.cx-topic small { color: var(--muted); font-size: 12.5px; }
.cx-topic:has(input:checked) { border-color: var(--primary); background: var(--primary-dim); }
.cx-topic:has(input:checked) svg { color: var(--primary); }
.cx-topic:has(input:focus-visible) { outline: 2px solid var(--primary); outline-offset: 2px; }
.cx-foot { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.cx-foot small { color: var(--muted); font-size: 12.5px; }
.cx-note { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px dashed var(--line-strong); border-radius: 10px; color: var(--text-2); font-size: 13.5px; margin-bottom: 18px; }
.cx-note svg { flex: none; width: 16px; height: 16px; margin-top: 2px; color: var(--primary); }
.cx-side { display: grid; gap: 22px; }
.cx-reach { display: grid; gap: 4px; }
.cx-line { display: flex; gap: 14px; align-items: center; padding: 12px 0; border-top: 1px solid var(--line); min-width: 0; }
.cx-line:first-of-type { border-top: 0; }
.cx-line > svg { flex: none; width: 34px; height: 34px; padding: 8px; border-radius: 10px; color: var(--primary); background: var(--primary-dim); }
.cx-line b { display: block; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 500; }
.cx-line span { overflow-wrap: anywhere; font-size: 15px; }
.cx-line a { color: var(--primary); }
.cx-line a:hover { text-decoration: underline; }
.cx-soc { display: flex; gap: 10px; padding-top: 14px; border-top: 1px solid var(--line); }
.cx-soc a { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--line-strong); color: var(--text-2); transition: color .15s, border-color .15s; }
.cx-soc a:hover, .cx-soc a:focus-visible { color: var(--primary); border-color: var(--primary); outline: none; }
.cx-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.cx-head small { font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); }
.cx-team { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 8px; }
.cx-mem { display: flex; gap: 14px; align-items: center; padding: 11px 12px; border: 1px solid var(--line); border-radius: 12px; background: rgba(4,11,22,.3); min-width: 0; }
.cx-mem--lead { border-color: rgba(63,216,232,.45); background: var(--primary-dim); }
.cx-av { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; border: 1px dashed var(--primary); color: var(--primary); }
.cx-av svg { width: 18px; height: 18px; }
.cx-mem b { display: block; font-weight: 500; font-size: 14.5px; overflow-wrap: anywhere; }
.cx-mem.is-tbd b { color: var(--muted); font-weight: 400; }
.cx-mem small { color: var(--primary); font-size: 12.5px; }
.cx-mem p { color: var(--text-2); font-size: 13px; margin-top: 4px; }
.cx-mem nav { display: flex; gap: 12px; margin-top: 6px; font-size: 12.5px; }
.cx-mem nav a { color: var(--primary); }
@media (max-width: 980px) { .cx-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) { .cx-row, .cx-topics { grid-template-columns: minmax(0, 1fr); } .cx-panel { padding: 20px 16px; } }
`

export default function ContactPage() {
  useDocumentTitle('Contact')
  const [msg, setMsg] = useState('')
  const configured = CONTACT.email.length > 0

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!configured) return
    const f = new FormData(e.currentTarget)
    const body = `${String(f.get('message'))}\n\n— ${String(f.get('name'))}${f.get('org') ? `, ${String(f.get('org'))}` : ''}\n${String(f.get('email'))}`
    window.location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent(`[Varuna Netra] ${String(f.get('subject'))}`)}&body=${encodeURIComponent(body)}`
  }

  const socials = [
    { key: 'github', href: CONTACT.socials.github, icon: Github, label: 'GitHub' },
    { key: 'linkedin', href: CONTACT.socials.linkedin, icon: Linkedin, label: 'LinkedIn' },
    { key: 'youtube', href: CONTACT.socials.youtube, icon: Youtube, label: 'YouTube' },
  ].filter((s) => s.href)

  return (
    <div className="inner cx">
      <style>{STYLES}</style>
      <header className="cx-hero">
        <span className="eyebrow">Get in touch</span>
        <h1>Contact us</h1>
        <p>Questions, collaboration ideas or research enquiries about Varuna Netra. Choose a topic and tell us what you need.</p>
      </header>

      <div className="cx-grid">
        <form className="cx-panel cx-form" onSubmit={submit} aria-label="Contact form">
          <div>
            <h2>Send a message</h2>
            <p className="cx-sub">Opens your email app with the message ready to send.</p>
            {!configured && (
              <div className="cx-note" role="status"><Info aria-hidden="true" /><span>No project email is configured (<code>VITE_CONTACT_EMAIL</code>), so sending is disabled.</span></div>
            )}
          </div>

          <fieldset className="cx-topics">
            <legend>What is this about? <b style={{ color: 'var(--primary)', fontWeight: 500 }}>*</b></legend>
            {TOPICS.map((t, i) => { const I = t.icon; return (
              <label className="cx-topic" key={t.value}>
                <input type="radio" name="subject" value={t.value} required={i === 0} />
                <I aria-hidden="true" /><span><b>{t.value}</b><small>{t.hint}</small></span>
              </label>
            ) })}
          </fieldset>

          <div className="cx-row">
            <label className="cx-label"><span>Full name <b>*</b></span><input className="cx-in" name="name" required autoComplete="name" placeholder="Your name" /></label>
            <label className="cx-label"><span>Email address <b>*</b></span><input className="cx-in" type="email" name="email" required autoComplete="email" placeholder="you@example.com" /></label>
          </div>
          <label className="cx-label"><span>Organization (optional)</span><input className="cx-in" name="org" autoComplete="organization" placeholder="University, agency or company" /></label>
          <label className="cx-label"><span>Message <b>*</b></span>
            <textarea className="cx-in" name="message" required maxLength={MAX} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="How can we help?" />
            <span className={`cx-count${msg.length > MAX * 0.9 ? ' is-near' : ''}`} aria-live="polite">{msg.length}/{MAX}</span>
          </label>
          <div className="cx-foot">
            <button className="btn btn--primary" type="submit" disabled={!configured}><Send size={16} /> Open in email app</button>
            <small>Nothing is sent from this site.</small>
          </div>
        </form>

        <aside className="cx-side" aria-label="Contact details">
          <section className="cx-panel">
            <h2>Reach us</h2>
            <div className="cx-reach" style={{ marginTop: 12 }}>
              <div className="cx-line"><Mail aria-hidden="true" /><div><b>Email</b><span>{configured ? <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> : 'Not configured'}</span></div></div>
              {CONTACT.location && <div className="cx-line"><MapPin aria-hidden="true" /><div><b>Location</b><span>{CONTACT.location}</span></div></div>}
              {CONTACT.website && <div className="cx-line"><Globe aria-hidden="true" /><div><b>Website</b><span><a href={CONTACT.website}>{CONTACT.website}</a></span></div></div>}
            </div>
            {socials.length > 0 && (
              <div className="cx-soc">
                {socials.map((s) => { const I = s.icon; return <a key={s.key} href={s.href} target="_blank" rel="noreferrer noopener" aria-label={s.label}><I size={18} /></a> })}
              </div>
            )}
          </section>
        </aside>
      </div>

      {TEAM.length > 0 && (
        <section className="tg" aria-labelledby="team-h">
          <div className="cx-head"><h2 id="team-h">Meet the team</h2><small>{TEAM.length} members</small></div>
          <ul className="tg__grid">
            {TEAM.map((m, i) => (
              <li key={`${m.name}-${i}`} className={`tg__card${i === 0 ? ' tg__card--lead' : ''}`}>
                <span className="cx-av" aria-hidden="true">{i === 0 ? <Crown /> : <User />}</span>
                <h3>{m.name}</h3>
                <small>{m.role}</small>
                {m.bio && <p>{m.bio}</p>}
                <ul className="tg__links" aria-label={`${m.name} contact links`}>
                  {m.email && <li><a href={`mailto:${m.email}`}><Mail size={14} aria-hidden="true" /> Email</a></li>}
                  {safe(m.linkedin) && <li><a href={safe(m.linkedin)} target="_blank" rel="noreferrer noopener"><Linkedin size={14} aria-hidden="true" /> LinkedIn<span className="sr-only"> (opens in new tab)</span></a></li>}
                  {safe(m.github) && <li><a href={safe(m.github)} target="_blank" rel="noreferrer noopener"><Github size={14} aria-hidden="true" /> GitHub<span className="sr-only"> (opens in new tab)</span></a></li>}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}