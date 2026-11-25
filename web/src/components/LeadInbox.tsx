import { ExternalLink, Inbox, MapPin, Search, Tag } from "lucide-react";
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
      "border-white/10 bg-white/[0.04] text-slate-200 hover:border-emerald-200/35 hover:bg-emerald-200/10 hover:text-emerald-50",
  },
  {
    status: "replied",
    label: "Replied",
    className:
      "border-white/10 bg-white/[0.04] text-slate-200 hover:border-emerald-300/35 hover:bg-emerald-300/10 hover:text-emerald-100",
  },
  {
    status: "rejected",
    label: "Rejected",
    className:
      "border-white/10 bg-white/[0.04] text-slate-200 hover:border-red-300/35 hover:bg-red-300/10 hover:text-red-100",
  },
  {
    status: "ignored",
    label: "Ignore",
    className:
      "border-white/10 bg-white/[0.025] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200",
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
    return "border-emerald-200/30 bg-emerald-200/10 text-emerald-50";
  if (status === "replied")
    return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (status === "rejected")
    return "border-red-300/30 bg-red-300/10 text-red-100";
  if (status === "ignored")
    return "border-slate-400/30 bg-slate-400/10 text-slate-300";
  return "border-amber-300/30 bg-amber-300/10 text-amber-100";
}

function sourceRail(source: string): string {
  if (source === "hn") return "bg-hn";
  if (source === "github") return "bg-github";
  if (source === "remotive") return "bg-remotive";
  return "bg-slate-500";
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
    <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-panel/75 shadow-2xl shadow-black/10 backdrop-blur">
      <div className="border-b border-white/10 p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100/70">
              owner workflow
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Lead inbox
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-400">
              Triage newest posts first. Every action is persisted as an
              application and outcome event.
            </p>
          </div>
          <label className="relative block min-w-0 lg:w-96">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
              size={16}
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company, role, tag…"
              className="w-full rounded-full border border-white/10 bg-ink/70 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-200/50 focus:ring-2 focus:ring-emerald-200/20"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3.5 py-2 text-sm transition ${
                filter === key
                  ? "border-emerald-200/60 bg-emerald-200/15 text-white shadow-sm shadow-sky-950/30"
                  : "border-white/10 bg-white/[0.025] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200"
              }`}
            >
              {label}
              <span className="ml-2 rounded-full bg-black/20 px-1.5 py-0.5 text-[11px] opacity-80">
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-white/[0.07]">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400">
              <Inbox size={24} />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-white">
              Nothing matches this view
            </h3>
            <p className="mt-1 max-w-sm text-sm leading-6 text-slate-400">
              Adjust the filter or search query. New leads land here as soon as
              ingestion persists them.
            </p>
          </div>
        ) : (
          filtered.map((lead) => (
            <article
              key={lead.id}
              className="group relative transition hover:bg-white/[0.025]"
            >
              <span
                className={`absolute bottom-5 left-0 top-5 w-1 rounded-r-full opacity-80 ${sourceRail(lead.source)}`}
              />
              <div className="grid gap-5 px-5 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_10.5rem]">
                <div className="min-w-0">
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
                    <span className="text-xs text-slate-500">
                      posted {timeAgo(lead.posted_at)}
                    </span>
                  </div>

                  <a
                    href={lead.canonical_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex max-w-full items-start gap-2 text-left text-lg font-semibold leading-7 tracking-tight text-white transition hover:text-emerald-100"
                  >
                    <span className="min-w-0 line-clamp-2">{lead.title}</span>
                    <ExternalLink
                      className="mt-1.5 shrink-0 text-slate-500 transition group-hover:text-emerald-200"
                      size={15}
                    />
                  </a>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-400">
                    {lead.company ? (
                      <span className="font-medium text-slate-100">
                        {lead.company}
                      </span>
                    ) : null}
                    {lead.location ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={14} /> {lead.location}
                      </span>
                    ) : null}
                    {lead.salary ? (
                      <span className="font-medium text-emerald-200">
                        {lead.salary}
                      </span>
                    ) : null}
                  </div>

                  {lead.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {lead.tags.slice(0, 6).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.035] px-2.5 py-1 text-xs text-slate-400"
                        >
                          <Tag size={11} /> {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <details className="mt-3 max-w-4xl text-sm text-slate-400">
                    <summary className="cursor-pointer select-none text-slate-300 transition hover:text-white">
                      Details
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap leading-6">
                      {lead.description || "No description captured."}
                    </p>
                  </details>
                </div>

                <div className="grid shrink-0 grid-cols-2 content-start gap-2 xl:grid-cols-1">
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
