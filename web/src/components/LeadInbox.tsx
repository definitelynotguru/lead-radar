import { ExternalLink, MapPin, Search, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { sourceAccent, sourceLabel, timeAgo } from "../lib/format";
import type { ApplicationStatus, LeadRow } from "../types";

const ACTIONS: Array<{
  status: ApplicationStatus;
  label: string;
  className: string;
}> = [
  {
    status: "applied",
    label: "Applied",
    className:
      "border-sky-300/30 bg-sky-300/10 text-sky-100 hover:bg-sky-300/20",
  },
  {
    status: "replied",
    label: "Replied",
    className:
      "border-emerald-300/30 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20",
  },
  {
    status: "rejected",
    label: "Rejected",
    className:
      "border-red-300/30 bg-red-300/10 text-red-100 hover:bg-red-300/20",
  },
  {
    status: "ignored",
    label: "Ignore",
    className:
      "border-slate-400/30 bg-slate-400/10 text-slate-200 hover:bg-slate-400/20",
  },
];

const FILTERS = [
  ["inbox", "Inbox"],
  ["applied", "Applied"],
  ["replied", "Replied"],
  ["rejected", "Rejected"],
  ["ignored", "Ignored"],
  ["all", "All"],
] as const;

type Filter = (typeof FILTERS)[number][0];

function matchesFilter(lead: LeadRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "inbox") return !lead.application_status;
  return lead.application_status === filter;
}

function statusClass(status: ApplicationStatus | null | undefined): string {
  if (status === "applied")
    return "border-sky-300/30 bg-sky-300/10 text-sky-100";
  if (status === "replied")
    return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (status === "rejected")
    return "border-red-300/30 bg-red-300/10 text-red-100";
  if (status === "ignored")
    return "border-slate-400/30 bg-slate-400/10 text-slate-300";
  return "border-amber-300/30 bg-amber-300/10 text-amber-100";
}

interface LeadInboxProps {
  leads: LeadRow[];
  busyLeadId: string | null;
  onAction: (lead: LeadRow, status: ApplicationStatus) => void;
}

export function LeadInbox({ leads, busyLeadId, onAction }: LeadInboxProps) {
  const [filter, setFilter] = useState<Filter>("inbox");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (!matchesFilter(lead, filter)) return false;
      if (!normalized) return true;
      return [
        lead.title,
        lead.company,
        lead.location,
        lead.salary,
        lead.description,
        ...lead.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [leads, filter, query]);

  const counts = useMemo(() => {
    return Object.fromEntries(
      FILTERS.map(([key]) => [
        key,
        leads.filter((lead) => matchesFilter(lead, key)).length,
      ]),
    ) as Record<Filter, number>;
  }, [leads]);

  return (
    <section className="rounded-3xl border border-line bg-panel/75 p-5 backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Lead inbox</h2>
          <p className="mt-1 text-sm text-mist">
            Newest first. Owner actions are persisted as application and outcome
            events.
          </p>
        </div>
        <label className="relative block min-w-0 lg:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist"
            size={16}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company, role, tag…"
            className="w-full rounded-xl border border-line bg-ink/70 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/50"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              filter === key
                ? "border-sky-300/50 bg-sky-300/15 text-white"
                : "border-line bg-white/[0.03] text-mist hover:bg-white/[0.07]"
            }`}
          >
            {label}{" "}
            <span className="ml-1 text-xs opacity-70">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-mist">
            No leads match this view.
          </div>
        ) : (
          filtered.map((lead) => (
            <article
              key={lead.id}
              className="rounded-2xl border border-line bg-ink/45 p-4 transition hover:border-slate-400/30"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${sourceAccent(lead.source)}`}
                    >
                      {sourceLabel(lead.source)}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(lead.application_status)}`}
                    >
                      {lead.application_status ?? "new"}
                    </span>
                    {lead.application_is_demo ? (
                      <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-xs text-amber-100">
                        demo outcome
                      </span>
                    ) : null}
                    <span className="text-xs text-mist">
                      posted {timeAgo(lead.posted_at)}
                    </span>
                  </div>
                  <a
                    href={lead.canonical_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex items-start gap-2 text-left text-base font-semibold text-white transition hover:text-sky-200"
                  >
                    <span className="min-w-0">{lead.title}</span>
                    <ExternalLink
                      className="mt-1 shrink-0 text-mist"
                      size={15}
                    />
                  </a>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-mist">
                    {lead.company ? (
                      <span className="font-medium text-slate-200">
                        {lead.company}
                      </span>
                    ) : null}
                    {lead.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={14} /> {lead.location}
                      </span>
                    ) : null}
                    {lead.salary ? (
                      <span className="text-emerald-200">{lead.salary}</span>
                    ) : null}
                  </div>
                  {lead.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {lead.tags.slice(0, 6).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-1 text-xs text-mist"
                        >
                          <Tag size={11} /> {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <details className="mt-3 text-sm text-mist">
                    <summary className="cursor-pointer select-none text-slate-300 transition hover:text-white">
                      Details
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap leading-6">
                      {lead.description || "No description captured."}
                    </p>
                  </details>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 xl:w-44 xl:grid-cols-1">
                  {ACTIONS.map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      disabled={
                        busyLeadId === lead.id ||
                        lead.application_status === action.status
                      }
                      onClick={() => onAction(lead, action.status)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${action.className}`}
                    >
                      {busyLeadId === lead.id ? "Saving…" : action.label}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
