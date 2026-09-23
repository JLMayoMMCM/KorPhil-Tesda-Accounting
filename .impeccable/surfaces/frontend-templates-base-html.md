---
version: 1
slug: "frontend-templates-base-html"
primary_target: "Frontend/templates/base.html"
related_targets: []
---

Scope: whole app shell (Workspace, Vouchers register + side panel, Trade Areas, Reports, Settings). Mode: Operate.
Audience/task: accounting clerks clearing overdue DVs, editing rows that write back to the Google Sheet.

## Direction contract
THESIS: One persistent action strip (+ New DV, Find, Run report, Export, Sync) over every screen; the day's unpaid work grouped by urgency, never a KPI-card dashboard.
OWN-WORLD: White working surface, cool grey-lavender sidebar, TESDA navy (#232a7c, the seal's ring) for primary actions, selection and focus only. Status = shape + color: filled red square overdue, outlined amber square pending, green paid. Public Sans, tabular numerals, hairline row rules, 6px radii, no cards-as-structure.
STORY: Clerk opens Workspace, sees overdue first with days late, ticks rows, "Mark N paid"; drills from Trade Areas cells into filtered register; edits in side panel and saves to the sheet row.
FIRST VIEWPORT: 200px sidebar (seal, nav with counts, sheet footer); 56px action bar; left "Needs action" grouped table; right rail with open balance, unpaid-by-area bars.
FORM: Figma SAMPLE UI 2 (user-pinned; roll skipped, brief-pinned direction beats the roll). Seed key: none (pinned).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
