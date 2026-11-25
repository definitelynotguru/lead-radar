import { ArrowUpRight, SearchX } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { sourceLabel, timeAgo } from "../lib/format";
import type { ApplicationStatus, LeadRow, LeadSource } from "../types";

const ACTIONS: ApplicationStatus[] = [
  "applied",
  "replied",
  "rejected",
  "ignored",
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
const PAGE_SIZE = 8;

const SOURCE_COLORS: Record<LeadSource, string> = {
  hn: "var(--hn)",
  github: "var(--github)",
  remotive: "var(--remotive)",
};

function matchesFilter(lead: LeadRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "inbox") return !lead.application_status;
  return lead.application_status === filter;
}

function actionLabel(status: ApplicationStatus): string {
  return status === "ignored"
    ? "Ignore"
    : status[0].toUpperCase() + status.slice(1);
}

interface LeadInboxProps {
  leads: LeadRow[];
  busyLeadId: string | null;
  onAction: (lead: LeadRow, status: ApplicationStatus) => void;
}

export function LeadInbox({ leads, busyLeadId, onAction }: LeadInboxProps) {
  const [filter, setFilter] = useState<Filter>("inbox");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  const visibleLeads = filtered.slice(0, visibleCount);

  function resetView() {
    setVisibleCount(PAGE_SIZE);
    setOpenId(null);
  }

  function changeFilter(nextFilter: Filter) {
    setFilter(nextFilter);
    resetView();
  }

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery);
    resetView();
  }

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map(([key]) => [
          key,
          leads.filter((lead) => matchesFilter(lead, key)).length,
        ]),
      ) as Record<Filter, number>,
    [leads],
  );

  return (
    <section className="panel inbox-panel" id="inbox">
      <div className="section-head">
        <div className="section-heading-row">
          <div>
            <div className="eyebrow">Owner workflow</div>
            <h2>Lead inbox</h2>
            <p className="section-copy">
              Triage newest posts first. Every action is persisted as
              application and outcome history.
            </p>
          </div>
          <label className="search-box" htmlFor="lead-search">
            <span>Search</span>
            <input
              id="lead-search"
              className="search-input"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Company, role, tag"
            />
          </label>
        </div>
        <div className="filter-row">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`filter-button ${filter === key ? "active" : ""}`}
              onClick={() => changeFilter(key)}
            >
              {label}
              <span className="filter-count">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="lead-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <SearchX size={21} strokeWidth={1.8} />
            </div>
            <h3>Nothing matches this view</h3>
            <p>
              Adjust the filter or search. New leads appear here as soon as
              ingestion persists them.
            </p>
          </div>
        ) : (
          visibleLeads.map((lead) => {
            const open = openId === lead.id;
            return (
              <article
                className="lead-row"
                key={lead.id}
                style={
                  {
                    "--source-color": SOURCE_COLORS[lead.source],
                  } as CSSProperties
                }
              >
                <div className="lead-main">
                  <div className="lead-meta">
                    <span className="pill source">
                      {sourceLabel(lead.source)}
                    </span>
                    <span
                      className={`pill ${lead.application_status ?? "new"}`}
                    >
                      {lead.application_status ?? "new"}
                    </span>
                    {lead.application_is_demo ? (
                      <span className="pill">demo outcome</span>
                    ) : null}
                    <span>posted {timeAgo(lead.posted_at)}</span>
                  </div>
                  <a
                    className="lead-title"
                    href={lead.canonical_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {lead.title}{" "}
                    <ArrowUpRight size={17} strokeWidth={1.9} aria-hidden />
                  </a>
                  <div className="lead-details">
                    {lead.company ? <strong>{lead.company}</strong> : null}
                    {lead.location ? <span>{lead.location}</span> : null}
                    {lead.salary ? <span>{lead.salary}</span> : null}
                  </div>
                  {lead.tags.length ? (
                    <div className="tag-row">
                      {lead.tags.slice(0, 6).map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <button
                    className="details-toggle"
                    type="button"
                    aria-expanded={open}
                    aria-controls={`lead-description-${lead.id}`}
                    onClick={() => setOpenId(open ? null : lead.id)}
                  >
                    {open ? "Hide details" : "Show details"}
                  </button>
                </div>
                <div
                  className="lead-actions"
                  aria-label={`Actions for ${lead.title}`}
                >
                  {ACTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={
                        busyLeadId === lead.id ||
                        lead.application_status === status
                      }
                      onClick={() => onAction(lead, status)}
                      className={`action-button ${status} ${lead.application_status === status ? "selected" : ""}`}
                    >
                      {busyLeadId === lead.id ? "Saving" : actionLabel(status)}
                    </button>
                  ))}
                </div>
                {open ? (
                  <p
                    className="lead-description"
                    id={`lead-description-${lead.id}`}
                  >
                    {lead.description || "No description captured."}
                  </p>
                ) : null}
              </article>
            );
          })
        )}
      </div>
      {filtered.length ? (
        <div className="list-footer">
          <span>
            Showing {visibleLeads.length} of {filtered.length}
          </span>
          {visibleCount < filtered.length ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              Show more
            </button>
          ) : filtered.length > PAGE_SIZE ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => setVisibleCount(PAGE_SIZE)}
            >
              Show less
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
