import StatCards from '../components/StatCards'
import { currentSession as summarySession } from '../auth/session'
import Dropdown from '../components/Dropdown'
import { useMemo, useState } from 'react'
import { FolderKanban, Loader, Check, TriangleAlert, Plus, Search, RotateCcw, Eye, Trash2, Undo2, FileCode2, ChevronDown } from 'lucide-react'
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui'
import Modal from '../components/Modal'
import RowMenu from '../components/RowMenu'
import type { Project, ProjectStatus } from '../data'

type SetList = React.Dispatch<React.SetStateAction<Project[]>>
const tone = (s: ProjectStatus): 'success' | 'danger' | 'warning' => (s === 'Ready' ? 'success' : s === 'Blocked' ? 'danger' : 'warning')
const empty = { search: '', name: '', status: '', env: '' }

function ProjectIcon({ size = 36 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-md bg-gradient-to-br from-elev to-field text-muted-foreground ring-1 ring-line">
      <FileCode2 size={size * 0.45} strokeWidth={1.5} />
    </span>
  )
}

export default function ProjectsPage({
  deleted,
  onHome,
  all,
  setAll,
  trash,
  setTrash,
}: {
  deleted?: boolean
  onHome: () => void
  all: Project[]
  setAll: SetList
  trash: Project[]
  setTrash: SetList
}) {
  const [draft, setDraft] = useState(empty)
  const [f, setF] = useState(empty)
  const [limit, setLimit] = useState(5)
  const [viewing, setViewing] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', environment: 'Development' as Project['environment'] })

  const source = deleted ? trash : all
  const rows = useMemo(() => {
    const has = (v: string, q: string) => v.toLowerCase().includes(q.toLowerCase())
    return source.filter(
      (p) =>
        (!f.search || has(p.name + p.description, f.search)) &&
        (!f.name || has(p.name, f.name)) &&
        (!f.status || p.status === f.status) &&
        (!f.env || has(p.environment, f.env)),
    )
  }, [source, f])

  const count = (s: ProjectStatus) => all.filter((p) => p.status === s).length

  return (
    <>
      <PageHeader
        onHome={onHome}
        crumbs={['Dashboard', 'Projects', deleted ? 'Deleted Projects' : 'All Projects']}
        title={deleted ? 'Deleted Projects' : 'All Projects'}
        subtitle={deleted ? 'View and restore deleted projects' : 'Manage development projects and deployments'}
        actions={!deleted && <Button icon={Plus} onClick={() => setCreating(true)}>Create Project</Button>}
      />
      <StatCards key={`${summarySession()?.accountId}-${deleted ? 'deleted-projects' : 'projects'}`} userId={summarySession()?.accountId ?? 0} groupId={deleted ? 'deleted-projects' : 'projects'} preserveDesign gridCols="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data={[
        { id: 'total-projects', title: 'Total Projects', icon: FolderKanban, value: all.length },
        { id: 'in-progress', title: 'In Progress', icon: Loader, value: count('In Progress') },
        { id: 'ready-projects', title: 'Ready Projects', icon: Check, value: count('Ready') },
        { id: 'blocked', title: 'Blocked', icon: TriangleAlert, value: count('Blocked') },
      ]} />

      <Card className="filter-toolbar mt-4 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setF(draft)
            setLimit(5)
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search"><Input placeholder="Search projects..." value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} /></Field>
            <Field label="Name"><Input placeholder="Search by project name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Filter by Status">
              <div className="relative">
                <Dropdown
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  className="h-10 w-full appearance-none rounded-lg border border-line bg-field px-3 text-[13px] outline-none focus:border-muted"
                >
                  <option value="">Select status</option>
                  <option>Ready</option>
                  <option>In Progress</option>
                  <option>Blocked</option>
                </Dropdown>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </Field>
            <Field label="Filter by Environment"><Input placeholder="Filter by environment" value={draft.env} onChange={(e) => setDraft({ ...draft, env: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="submit" icon={Search} className="h-8 px-3">Filter</Button>
            <Button type="button" variant="ghost" icon={RotateCcw} className="h-8 px-3" onClick={() => (setDraft(empty), setF(empty))}>Reset</Button>
          </div>
        </form>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="bg-elev/70 text-left">
              <tr>
                <th className="w-[45%] px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Environment</th>
                <th className="px-4 py-3 font-semibold">Last Updated</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((p) => (
                <tr key={p.id} className="border-t border-line transition-colors hover:bg-elev/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProjectIcon />
                      <div className="min-w-0">
                        <p className="font-semibold">{p.name}</p>
                        <p className="max-w-64 truncate text-xs text-muted-foreground">{p.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge tone={tone(p.status)}>{p.status}</Badge></td>
                  <td className="px-4 py-3">{p.environment}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.updated}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {!deleted && <Button variant="ghost" icon={Eye} className="h-8 px-3" onClick={() => setViewing(p)}>View</Button>}
                      <RowMenu
                        items={
                          deleted
                            ? [
                                { label: 'Restore', icon: Undo2, onClick: () => (setTrash((t) => t.filter((x) => x.id !== p.id)), setAll((a) => [p, ...a])) },
                                { label: 'Delete forever', icon: Trash2, danger: true, onClick: () => setTrash((t) => t.filter((x) => x.id !== p.id)) },
                              ]
                            : [
                                { label: 'View', icon: Eye, onClick: () => setViewing(p) },
                                { label: 'Delete', icon: Trash2, danger: true, onClick: () => (setAll((a) => a.filter((x) => x.id !== p.id)), setTrash((t) => [p, ...t])) },
                              ]
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No projects match these filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 5 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted-foreground">
            <span>Showing {Math.min(limit, rows.length)} of {rows.length}</span>
            <button className="font-semibold text-foreground hover:underline" onClick={() => setLimit(limit >= rows.length ? 5 : limit + 5)}>
              {limit >= rows.length ? 'Show less' : 'Show more'}
            </button>
          </div>
        )}
      </Card>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Project Details">
        {viewing && (
          <div>
            <div className="flex items-center gap-4">
              <ProjectIcon size={56} />
              <div>
                <p className="text-base font-semibold">{viewing.name}</p>
                <p className="text-xs text-muted-foreground">{viewing.description}</p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-field p-4">
              <div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</dt><dd className="mt-1"><Badge tone={tone(viewing.status)}>{viewing.status}</Badge></dd></div>
              {[['Environment', viewing.environment], ['Version', viewing.version], ['Last Updated', viewing.updated]].map(([k, v]) => (
                <div key={k}><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </Modal>

      <Modal open={creating} onClose={() => setCreating(false)} title="Create Project">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.name) return
            const n = new Date()
            setAll((a) => [{ id: Date.now(), ...form, status: 'In Progress', updated: `${n.getMonth() + 1}/${n.getDate()}/${n.getFullYear()}`, version: 'v0.1.0' }, ...a])
            setForm({ name: '', description: '', environment: 'Development' })
            setCreating(false)
          }}
        >
          <Field label="Project Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="New service" /></Field>
          <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does it do?" /></Field>
          <Field label="Environment">
            <Dropdown value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value as Project['environment'] })} className="h-10 w-full rounded-lg border border-line bg-field px-3 text-[13px] outline-none">
              <option>Development</option>
              <option>Staging</option>
              <option>Production</option>
            </Dropdown>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" icon={Plus}>Create Project</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
