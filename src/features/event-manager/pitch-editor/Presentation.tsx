import type { Brief } from "../model"
import Board from "../mood-board/Board"
import { fmtRange, registeredPitchTheme, themeByName } from "../shared"

export function Presentation({ brief }: { brief: Brief }) {
  const theme = registeredPitchTheme(brief) ?? themeByName(brief.theme)
  return (
    <div className="em-presentation pr-6 sm:pr-0">
      <p className="em-eyebrow">
        {theme?.category ?? "Event"} · {brief.theme}
      </p>
      <p className="em-presentation-title">
        {brief.title.trim() || "Untitled pitch"}
      </p>
      {theme && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          {theme.description}
        </p>
      )}
      <Board
        pins={brief.pins}
        pages={brief.boardPages}
        theme={brief.theme}
        label="Mood board presentation"
        className="mt-4"
      />
      {theme && (
        <div
          className="mt-3 flex items-center gap-2"
          aria-label="Theme palette"
        >
          {theme.palette.map((c) => (
            <span
              key={c}
              title={c}
              className="size-5 rounded-full ring-1 ring-line"
              style={{ background: c }}
            />
          ))}
        </div>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        {[
          ["Client", brief.client || "—"],
          ["When", fmtRange(brief)],
          ["Venue", brief.venue || "—"],
          ["Guests", String(brief.pax)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.02em] text-muted-foreground">
              {k}
            </dt>
            <dd className="mt-0.5 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {brief.notes.trim() && (
        <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-fg/[0.05] p-3 text-[13px] leading-5">
          {brief.notes}
        </p>
      )}
    </div>
  )
}

export default Presentation

