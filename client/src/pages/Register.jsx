import { useEffect, useState } from 'react';
import api from '../api';

export function PublicCard({ children }) { return <main className="flex min-h-screen items-center justify-center p-4"><div className="w-full max-w-md rounded-xl bg-white p-7 shadow">{children}</div></main>; }
function Field({ label, children }) { return <label className="block text-sm font-medium text-slate-700">{label}<span className="mt-1 block">{children}</span></label>; }
export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', requestedBlockIds: [] });
  const [blocks, setBlocks] = useState([]); const [error, setError] = useState(''); const [submitted, setSubmitted] = useState(false);
  useEffect(() => { api.get('/blocks').then(({ data }) => setBlocks(data.blocks)).catch(() => setError('Could not load available blocks.')); }, []);
  function update(event) { setForm({ ...form, [event.target.name]: event.target.value }); }
  function blocksChanged(event) { setForm({ ...form, requestedBlockIds: [...event.target.selectedOptions].map((option) => Number(option.value)) }); }
  async function submit(event) { event.preventDefault(); setError(''); if (form.password !== form.confirmPassword) return setError('Passwords do not match.'); try { await api.post('/instructor-auth/register', { name: form.name, email: form.email, password: form.password, requestedBlockIds: form.requestedBlockIds }); setSubmitted(true); } catch (err) { setError(err.response?.data?.message || 'Unable to submit your request.'); } }
  if (submitted) return <PublicCard><h1 className="text-2xl font-bold">Request submitted</h1><p className="mt-3 text-slate-600">You’ll be notified once an admin reviews it.</p></PublicCard>;
  return <PublicCard><h1 className="text-2xl font-bold">Instructor registration</h1><form className="mt-6 space-y-4" onSubmit={submit}><Field label="Full name"><input name="name" value={form.name} onChange={update} required className="input" /></Field><Field label="Email"><input name="email" type="email" value={form.email} onChange={update} required className="input" /></Field><Field label="Password"><input name="password" type="password" minLength="8" value={form.password} onChange={update} required className="input" /></Field><Field label="Confirm password"><input name="confirmPassword" type="password" minLength="8" value={form.confirmPassword} onChange={update} required className="input" /></Field><Field label="Requested blocks (select one or more)"><select multiple value={form.requestedBlockIds.map(String)} onChange={blocksChanged} className="input h-32">{blocks.map((block) => <option key={block.id} value={block.id}>{block.name} — {block.schedule}</option>)}</select></Field>{error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button className="w-full rounded bg-sky-600 px-4 py-2 font-semibold text-white">Submit request</button></form></PublicCard>;
}
