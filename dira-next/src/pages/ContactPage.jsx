import { useMemo, useState } from 'react';
import { Icon } from '../components/Icons.jsx';
import { Logo } from '../components/Logo.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import { BOOKING_EMAIL } from '../contact.js';
import { href, store } from '../lib.js';
import PrefsControls from '../components/PrefsControls.jsx';
import { currentLang, tr, useT } from '../prefs.js';

// Book a viewing: everything the team needs to plan a demo of Dira for a venue, matched to
// how mapping is priced (floors, visitors a day). Without a server yet, a request is saved on
// this device and sent by email (BOOKING_EMAIL) or copied.

const VENUE_TYPES = ['Shopping mall', 'Hospital or clinic', 'Office or commercial building', 'Conference or expo venue', 'Event', 'Government compound', 'University campus', 'Other'];
const FLOORS = ['1 to 2 floors', '3 to 5 floors', '6 floors or more'];
const VISITORS = ['Under 2,000 a day', '2,000 to 10,000 a day', 'Over 10,000 a day', 'Not sure'];
const PLANS = ['Yes, as PDF or images', 'Yes, on paper only', 'No floor plans'];
const VIEWING = [
  ['site', 'At our venue', 'We walk your building with you and show Dira on a phone.'],
  ['online', 'Online demo', 'A 30 minute video call with a live map.'],
];
const TIMES = ['Morning (9:00 to 12:00)', 'Afternoon (12:00 to 15:00)', 'Late afternoon (15:00 to 17:00)'];
const CONTACT_BY = ['Phone call', 'WhatsApp', 'Email'];

const EMPTY = {
  name: '',
  organisation: '',
  role: '',
  email: '',
  phone: '',
  contactBy: 'Phone call',
  venueType: '',
  venueName: '',
  location: '',
  floors: '',
  visitors: '',
  plans: '',
  viewing: 'site',
  date: '',
  time: '',
  altDate: '',
  message: '',
  consent: false,
};

const LABELS = [
  ['name', 'Name'],
  ['organisation', 'Organisation'],
  ['role', 'Role'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['contactBy', 'Best way to reach you'],
  ['venueType', 'Venue type'],
  ['venueName', 'Venue'],
  ['location', 'Location'],
  ['floors', 'Floors'],
  ['visitors', 'Visitors'],
  ['plans', 'Floor plans'],
  ['viewing', 'Viewing'],
  ['date', 'Preferred date'],
  ['time', 'Preferred time'],
  ['altDate', 'Other date'],
  ['message', 'Notes'],
];

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
const LOCALE = { en: 'en-KE', sw: 'sw-KE', fr: 'fr-FR' };
const prettyDate = (iso, locale = 'en-KE') => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
// In English for the team (copied or emailed); `shown` gives the viewer's language on screen.
const value = (form, key) => (key === 'viewing' ? VIEWING.find((v) => v[0] === form.viewing)[1] : key === 'date' || key === 'altDate' ? prettyDate(form[key]) : form[key]);
const CHOSEN = new Set(['contactBy', 'venueType', 'floors', 'visitors', 'plans', 'viewing', 'time']);
const shown = (form, key) => (key === 'date' || key === 'altDate' ? prettyDate(form[key], LOCALE[currentLang()]) : CHOSEN.has(key) ? tr(value(form, key)) : form[key]);

function summaryText(form, ref) {
  const lines = LABELS.filter(([k]) => form[k]).map(([k, label]) => `${label}: ${value(form, k)}`);
  return `Viewing request ${ref}\n\n${lines.join('\n')}`;
}

function Choice({ name, options, value: current, onChange, required }) {
  return (
    <div className="choice-row" role="radiogroup">
      {options.map((o) => (
        <label key={o} className={`choice${current === o ? ' is-on' : ''}`}>
          <input type="radio" name={name} value={o} checked={current === o} onChange={() => onChange(o)} required={required} />
          {tr(o)}
        </label>
      ))}
    </div>
  );
}

export default function ContactPage() {
  const t = useT();
  const [form, setForm] = useState(EMPTY);
  const [sent, setSent] = useState(null);
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const minDate = useMemo(tomorrow, []);

  function submit(e) {
    e.preventDefault();
    const ref = `DIRA-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const requests = store.get('viewing-requests', []);
    requests.push({ ref, ...form, at: new Date().toISOString() });
    store.set('viewing-requests', requests);
    setSent({ ref, form });
    window.scrollTo({ top: 0 });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryText(sent.form, sent.ref));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked */
    }
  }

  const header = (
    <header className="top-bar">
      <a className="icon-btn plain" href={href('/')} aria-label={t('Back to home')}>
        <Icon name="arrowLeft" strokeWidth={2.75} />
      </a>
      <a className="logo-link" href={href('/')} aria-label={t('Dira home')}>
        <Logo height={34} />
      </a>
      <PrefsControls compact />
    </header>
  );

  if (sent) {
    const mail = BOOKING_EMAIL ? `mailto:${BOOKING_EMAIL}?subject=${encodeURIComponent(`Viewing request ${sent.ref}: ${sent.form.venueName}`)}&body=${encodeURIComponent(summaryText(sent.form, sent.ref))}` : null;
    return (
      <div className="page">
        {header}
        <main className="contact-page">
          <section className="card booked" aria-live="polite">
            <span className="tile tile-accent">
              <Icon name="check" strokeWidth={2.6} />
            </span>
            <h1 className="display">{t('Viewing request ready')}</h1>
            <p>
              {t('Reference')} <strong>{sent.ref}</strong>. {mail ? t('Send it to us by email to confirm your slot; we reply within one working day.') : t('Copy the details and send them to the Dira team to confirm your slot.')}
            </p>
            <dl className="booked-list">
              {LABELS.filter(([k]) => sent.form[k]).map(([k, label]) => (
                <div key={k}>
                  <dt>{t(label)}</dt>
                  <dd>{shown(sent.form, k)}</dd>
                </div>
              ))}
            </dl>
            <div className="row">
              {mail && (
                <a className="btn btn-primary btn-lg" href={mail}>
                  {t('Send by email')} <Icon name="arrowRight" />
                </a>
              )}
              <button className={`btn btn-lg ${mail ? 'btn-outline' : 'btn-primary'}`} type="button" onClick={copy}>
                <Icon name={copied ? 'check' : 'share'} /> {copied ? t('Copied') : t('Copy details')}
              </button>
              <button className="btn btn-outline btn-lg" type="button" onClick={() => setSent(null)}>
                {t('Edit request')}
              </button>
            </div>
            <p className="note">{t('Your request is also saved on this device.')}</p>
          </section>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="page">
      {header}
      <main className="contact-page">
        <div className="contact-head">
          <span className="pill-eyebrow">{t('Contact us')}</span>
          <h1 className="display">{t('Book a viewing')}</h1>
          <p>{t('See Dira working in your own building. Tell us about you, your venue and when suits you, and we will confirm a time within one working day.')}</p>
        </div>

        <form className="booking" onSubmit={submit}>
          <fieldset className="card">
            <legend>
              <span className="num">1</span> {t('About you')}
            </legend>
            <div className="grid2">
              <label className="field">
                <span>{t('Full name')} *</span>
                <input value={form.name} onChange={set('name')} autoComplete="name" required />
              </label>
              <label className="field">
                <span>{t('Organisation')} *</span>
                <input value={form.organisation} onChange={set('organisation')} autoComplete="organization" placeholder={t('Company, hospital or event')} required />
              </label>
              <label className="field">
                <span>{t('Role')}</span>
                <input value={form.role} onChange={set('role')} autoComplete="organization-title" placeholder={t('For example: centre manager')} />
              </label>
              <label className="field">
                <span>{t('Email')} *</span>
                <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
              </label>
              <label className="field">
                <span>{t('Phone')} *</span>
                <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="07XX XXX XXX" pattern="[+0-9 ()-]{9,}" title={t('A phone number, for example 0712 345 678 or +254 712 345 678')} required />
              </label>
              <div className="field">
                <span>{t('Best way to reach you')}</span>
                <Choice name="contactBy" options={CONTACT_BY} value={form.contactBy} onChange={set('contactBy')} />
              </div>
            </div>
          </fieldset>

          <fieldset className="card">
            <legend>
              <span className="num">2</span> {t('Your venue')}
            </legend>
            <div className="grid2">
              <label className="field">
                <span>{t('Type of venue')} *</span>
                <select value={form.venueType} onChange={set('venueType')} required>
                  <option value="" disabled>
                    {t('Choose one')}
                  </option>
                  {VENUE_TYPES.map((o) => (
                    <option key={o} value={o}>
                      {t(o)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('Venue name')} *</span>
                <input value={form.venueName} onChange={set('venueName')} required />
              </label>
              <label className="field wide">
                <span>{t('Location')} *</span>
                <input value={form.location} onChange={set('location')} autoComplete="address-level2" placeholder={t('Area and town, for example Westlands, Nairobi')} required />
              </label>
              <div className="field wide">
                <span>{t('How many floors?')} *</span>
                <Choice name="floors" options={FLOORS} value={form.floors} onChange={set('floors')} required />
              </div>
              <div className="field wide">
                <span>{t('Visitors a day')}</span>
                <Choice name="visitors" options={VISITORS} value={form.visitors} onChange={set('visitors')} />
              </div>
              <div className="field wide">
                <span>{t('Do you have floor plans?')}</span>
                <Choice name="plans" options={PLANS} value={form.plans} onChange={set('plans')} />
              </div>
            </div>
          </fieldset>

          <fieldset className="card">
            <legend>
              <span className="num">3</span> {t('The viewing')}
            </legend>
            <div className="viewing-options" role="radiogroup" aria-label={t('Type of viewing')}>
              {VIEWING.map(([id, title, text]) => (
                <label key={id} className={`viewing-option${form.viewing === id ? ' is-on' : ''}`}>
                  <input type="radio" name="viewing" value={id} checked={form.viewing === id} onChange={() => set('viewing')(id)} />
                  <span>
                    <strong>{t(title)}</strong>
                    <small>{t(text)}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="grid2">
              <label className="field">
                <span>{t('Preferred date')} *</span>
                <input type="date" value={form.date} min={minDate} onChange={set('date')} required />
              </label>
              <label className="field">
                <span>{t('Preferred time')} *</span>
                <select value={form.time} onChange={set('time')} required>
                  <option value="" disabled>
                    {t('Choose a time')}
                  </option>
                  {TIMES.map((o) => (
                    <option key={o} value={o}>
                      {t(o)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('Another date that works')}</span>
                <input type="date" value={form.altDate} min={minDate} onChange={set('altDate')} />
              </label>
              <label className="field wide">
                <span>{t('Anything we should know?')}</span>
                <textarea value={form.message} onChange={set('message')} rows={4} placeholder={t('Parking, who will attend, areas you want mapped first…')} />
              </label>
            </div>
          </fieldset>

          <label className="consent">
            <input type="checkbox" checked={form.consent} onChange={set('consent')} required />
            <span>{t('The Dira team may contact me about this viewing.')} *</span>
          </label>
          <div className="row">
            <button className="btn btn-primary btn-lg" type="submit">
              {t('Book a viewing')} <Icon name="arrowRight" />
            </button>
            <span className="note">{t('* Required. Viewings are free and take about 45 minutes.')}</span>
          </div>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}
