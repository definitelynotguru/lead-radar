import { useEffect, useState } from "react";

interface SidebarProps {
  live: boolean;
  endpoint: string;
  counts: { inbox: number; queue: number };
}

const SECTIONS = [
  ["overview", "Overview"],
  ["inbox", "Inbox"],
  ["metrics", "Metrics"],
  ["operations", "Operations"],
] as const;

export function Sidebar({ live, endpoint, counts }: SidebarProps) {
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.2, 0.6] },
    );
    const observed = new Set<string>();
    const observeSections = () => {
      for (const [id] of SECTIONS) {
        if (observed.has(id)) continue;
        const element = document.getElementById(id);
        if (element) {
          observer.observe(element);
          observed.add(id);
        }
      }
    };
    observeSections();
    const mutations = new MutationObserver(observeSections);
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, []);

  function countFor(id: string): number | null {
    if (id === "inbox") return counts.inbox;
    if (id === "operations") return counts.queue;
    return null;
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <img
          className="brand-mark"
          src={`${import.meta.env.BASE_URL}logo-mark.webp`}
          alt=""
          width="40"
          height="40"
        />
        <div>
          <div className="brand-name">Lead Radar</div>
          <div className="brand-sub">zero-cost monitor</div>
        </div>
      </div>
      <div className="nav-label">Workspace</div>
      {SECTIONS.map(([id, label]) => {
        const count = countFor(id);
        return (
          <a
            className={`nav-link ${activeSection === id ? "active" : ""}`}
            href={`#${id}`}
            aria-current={activeSection === id ? "location" : undefined}
            key={id}
          >
            <span>{label}</span>
            {count === null ? null : <span>{count}</span>}
          </a>
        );
      })}
      <div className="sidebar-status">
        <strong>
          <span className={`status-dot ${live ? "live" : ""}`} />
          {live ? "Live snapshot" : "Demo data"}
        </strong>
        <small>
          {live
            ? endpoint.replace(/^https?:\/\//, "")
            : "Connect a deployed dashboard-api to use real owner data."}
        </small>
      </div>
    </aside>
  );
}
