# Parser fixtures

Captured on 2026-11-25 from live public API responses. JSON was pretty-printed for reviewability; response payloads were
not edited except that the Remotive capture retains the first two jobs rather than the full fifteen-job page.

- `hn/whoishiring-user.json`: official HN API `user/whoishiring.json`
- `hn/who-is-hiring-thread.json`: official HN API item `50338728`, `Ask HN: Who is hiring? (November 2026)`
- `hn/top-level-comments.json`: eight real top-level comments from that thread
- `github/search-issues-bounty.json`: GitHub Search API query `is:issue is:open label:bounty`, first five results
- `remotive/remote-jobs.json`: official Remotive API response, first two jobs, including the legal notice required for
  attribution

These are parser fixtures, not seed data. Dashboard demo rows are separately labelled as demo data in
`web/src/demoData.ts`.
