import { useEffect, useState } from "react"
import { PackageOpen, Search } from "lucide-react"
import { cx } from "../../components/ui/ui"
import { StateCard } from "./PageHead"
import { catalog, onCatalogSync, type Project } from "./model"
import { FALLBACK_COVER, Visual } from "./shared"

export function AssetsView({ projects }: { projects: Project[] }) {
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("")
  const [, setCatalogVersion] = useState(0)
  useEffect(() => onCatalogSync(() => setCatalogVersion((v) => v + 1)), [])
  const categories = [...new Set(catalog.map((a) => a.category))]
  const now = Date.now()
  // Stock held by approved events that have not yet finished.
  const reserved = (id: string) =>
    projects
      .filter((p) => p.status === "approved" && Date.parse(p.brief.end) >= now)
      .reduce(
        (s, p) =>
          s +
          (p.brief.requirements.find((r) => r.assetId === id)?.quantity ?? 0),
        0,
      )
  const rows = catalog.filter(
    (a) =>
      (!category || a.category === category) &&
      `${a.name} ${a.category}`.toLowerCase().includes(q.trim().toLowerCase()),
  )
  return (
    <>
      <div className="em-toolbar -mt-3">
        <div role="group" aria-label="Category" className="em-chips">
          {["", ...categories].map((c) => (
            <button
              key={c || "all"}
              type="button"
              aria-pressed={category === c}
              className="em-chip"
              onClick={() => setCategory(c)}
            >
              {c || "All categories"}
            </button>
          ))}
        </div>
        <label className="em-search">
          <Search size={15} strokeWidth={1.5} aria-hidden />
          <span className="sr-only">Search sample stock</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sample stock"
          />
        </label>
      </div>
      {rows.length === 0 ? (
        <StateCard
          icon={PackageOpen}
          title="Nothing in the library matches."
          copy="Try another search or category."
          action={
            <button
              type="button"
              className="em-btn em-btn--outline"
              onClick={() => {
                setQ("")
                setCategory("")
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <ul className="em-card-grid em-asset-grid" aria-label="Sample stock">
          {rows.map((a) => {
            const stock = a.stock ?? 0
            const held = reserved(a.id)
            const free = Math.max(0, stock - held)
            return (
              <li key={a.id} className="em-asset-card">
                <Visual
                  src={a.image}
                  fallbackSrc={FALLBACK_COVER}
                  label={a.alt}
                  icon={PackageOpen}
                  framing={a.thumbnailFraming}
                  className={cx("em-asset-card-media em-product", a.cutout && "em-product--cutout")}
                />
                <div className="em-pitch-card-body">
                  <p className="em-eyebrow">{a.category}</p>
                  <p className="em-card-title mt-1.5">{a.name}</p>
                  {a.stock === undefined ? (
                    <p className="em-asset-stats em-card-copy">
                      Library only. Record stock to add it to an asset plan.
                    </p>
                  ) : (
                    <>
                      <dl className="em-asset-stats">
                        <div>
                          <dt>Sample stock</dt>
                          <dd>
                            {stock} {a.unit}
                          </dd>
                        </div>
                        <div>
                          <dt>Held by upcoming approvals</dt>
                          <dd>{held}</dd>
                        </div>
                      </dl>
                      <div
                        className="em-meter"
                        role="img"
                        aria-label={`${free} of ${stock} not held by upcoming approvals`}
                      >
                        <span style={{ width: `${(free / stock) * 100}%` }} />
                      </div>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export default AssetsView

