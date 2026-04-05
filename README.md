# Guidewire Decision Intelligence Engine

A real-time, interactive cross-system conflict detection and autopilot remediation dashboard built for Guidewire insurance platforms. It ingests simulated events from PolicyCenter, BillingCenter, and ClaimCenter, correlates them using a NetworkX graph engine, and surfaces actionable conflicts through a live physics-based visualization.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [System Flow](#system-flow)
- [Conflict Detection Rules](#conflict-detection-rules)
- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [UI Components](#ui-components)
- [Remediation Report Schema](#remediation-report-schema)
- [Audit Export Schema](#audit-export-schema)

---

## Overview

Insurance platforms like Guidewire operate across multiple isolated systems — PolicyCenter manages policy lifecycle, BillingCenter handles payments, and ClaimCenter processes claims. These systems rarely talk to each other in real time, which creates dangerous blind spots: a claim can be paid out while a policy is delinquent, or a policy can auto-renew while a fraud investigation is open.

This engine bridges that gap. It correlates events across all three systems, detects cross-center conflicts using a directed graph model, and provides a one-click autopilot remediation workflow with a full downloadable audit trail.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (UI)                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │   Conflict   │  │  Vis.js Physics  │  │   Agentic    │  │
│  │   Sidebar    │  │   Graph (2D)     │  │  Evaluator   │  │
│  │              │  │                  │  │   + Report   │  │
│  │ • Cards      │  │ • Live nodes     │  │              │  │
│  │ • Audit btn  │  │ • Edge links     │  │ • Typewriter │  │
│  │              │  │ • Time scrubber  │  │ • Remediate  │  │
│  └──────────────┘  └──────────────────┘  └──────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ GET /api/intelligence
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     Flask Backend (app.py)                  │
│                                                             │
│   serve_index()  ──►  static/index.html                     │
│   get_intelligence()  ──►  simulate → analyze → jsonify     │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────┐    ┌─────────────────────────────────┐
│   simulator.py       │    │          engine.py              │
│                      │    │                                 │
│  generate_data()     │    │  analyze_events(events)         │
│                      │    │                                 │
│  • 45 noise policies │    │  • Build nx.DiGraph             │
│  • 4 seeded conflict │    │  • Walk events per policy       │
│    scenarios         │    │  • Apply 4 conflict rules       │
│                      │    │  • Serialize graph + conflicts  │
└──────────────────────┘    └─────────────────────────────────┘
```

---

## System Flow

```
  simulator.py                engine.py                  app.js
      │                           │                         │
      │  generate_data()          │                         │
      │ ─────────────────────────►│                         │
      │                           │  analyze_events()       │
      │                           │  Build DiGraph          │
      │                           │  Detect conflicts       │
      │                           │  Serialize nodes/links  │
      │                           │ ───────────────────────►│
      │                           │                         │  fetch /api/intelligence
      │                           │                         │ ◄────────────────────────
      │                           │                         │
      │                           │                         │  initVisGraph()
      │                           │                         │  renderConflicts()
      │                           │                         │  initTimeScrubber()
      │                           │                         │  initAuditExport()
      │                           │                         │
      │                           │          [User clicks conflict card]
      │                           │                         │
      │                           │                         │  selectConflict()
      │                           │                         │  runAgenticEvaluator()
      │                           │                         │  → typewriter log
      │                           │                         │  → reveal remediate btn
      │                           │                         │
      │                           │       [User clicks Execute Autopilot Remediation]
      │                           │                         │
      │                           │                         │  executeRemediation()
      │                           │                         │  → nodes turn green
      │                           │                         │  → card hidden
      │                           │                         │  → counter decrements
      │                           │                         │  → downloadRemediationReport()
      │                           │                         │  → renderRemediationReport()
```

---

## Conflict Detection Rules

The engine walks each policy's event timeline in chronological order and applies four stateful rules:

```
Rule 1 — Claim Paid During Delinquency
───────────────────────────────────────
  PaymentMissed ──► [delinquent = true]
       │
       └──► ClaimPaid while delinquent = true
            → CONFLICT: severity HIGH
            → Nodes: PaymentMissed + ClaimPaid events

Rule 2 — Renewal During Fraud Investigation
────────────────────────────────────────────
  FraudInvestigation ──► [investigating = true]
       │
       └──► PolicyRenew while investigating = true
            → CONFLICT: severity CRITICAL
            → Nodes: FraudInvestigation + PolicyRenew events

Rule 3 — Simultaneous Claims Open
───────────────────────────────────
  ClaimSubmitted × 2 on same policy_id
       → CONFLICT: severity WARNING
       → Nodes: all ClaimSubmitted event IDs

Rule 4 — Billing on Canceled Policy
─────────────────────────────────────
  PolicyCancel exists AND PaymentRequested exists
       → CONFLICT: severity ERROR
       → Nodes: PolicyCancel + PaymentRequested events
```

---

## Features

### 1. Live Physics Graph
Vis.js force-directed network renders all policy events as nodes, grouped and color-coded by system:

| System | Color |
|---|---|
| PolicyCenter | `#10b981` green |
| BillingCenter | `#f59e0b` amber |
| ClaimCenter | `#8b5cf6` purple |

Edges represent chronological event dependencies within the same policy. Conflicting nodes are highlighted in red with a glow shadow on selection.

### 2. Forensic Time Scrubber
A timeline slider pinned to the graph header lets you replay the event history. Dragging left hides nodes whose timestamps fall after the cutoff, revealing how the conflict developed over time. Physics is paused during scrubbing to prevent jitter and re-enabled 300ms after the last input.

### 3. Agentic Root-Cause Evaluator
Selecting a conflict card triggers a typewriter-style log in the right panel that walks through the conflict details, severity rating, and suggested remediation steps — simulating an AI agent reasoning through the problem.

### 4. Autopilot Remediation
One click on `[ Execute Autopilot Remediation ]` (revealed after the evaluator finishes):
- Turns conflicting nodes bright green in the graph
- Removes the conflict card from the sidebar
- Decrements the Active Conflicts counter
- Triggers an auto-download of the remediation report
- Replaces the evaluator log with a live-typed post-remediation report

### 5. Remediation Report (Auto-Download)
Immediately on remediation, a `GW_Remediation_<id>_<timestamp>.json` file is downloaded containing the full structured report with external change requirements and internal review items clearly separated.

### 6. Compliance Audit Export
The `⭳ Audit` button in the sidebar header exports the currently selected conflict's full data as `GW_Audit_<conflict-id>.json`, including raw event traces for compliance review.

---

## Project Structure

```
.
├── app.py              # Flask server — routes and API
├── engine.py           # NetworkX graph builder + conflict detection rules
├── simulator.py        # Event data generator (45 noise + 4 seeded conflicts)
├── requirements.txt    # Python dependencies
└── static/
    ├── index.html      # Dashboard layout and component structure
    ├── app.js          # All UI logic — graph, scrubber, evaluator, remediation
    └── style.css       # Glassmorphism design system + Jutro-inspired tokens
```

---

## Getting Started

**Requirements:** Python 3.11+

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python3 app.py
```

Then open `http://localhost:8080` in your browser.

The dashboard loads fresh simulated data on every page refresh. The 4 seeded conflict scenarios are always present; the 45 background policies are procedurally generated with randomized (but clean) event sequences.

---

## API Reference

### `GET /`
Serves `static/index.html`.

### `GET /api/intelligence`
Runs the simulator and engine on every call. Returns a fresh analysis.

**Response shape:**
```json
{
  "raw_events": [
    {
      "id": "ev5",
      "system": "PolicyCenter",
      "policy_id": "POL-9045-CRIT",
      "type": "PolicyBind",
      "status": "Active",
      "timestamp": "2026-03-06T14:22:00"
    }
  ],
  "conflicts": [
    {
      "id": "C-POL-9045-CRIT-1",
      "policy_id": "POL-9045-CRIT",
      "title": "Claim Paid During Delinquency",
      "description": "A claim was paid out while billing status was Delinquent.",
      "severity": "High",
      "nodes_involved": ["ev6", "ev8"]
    }
  ],
  "graph": {
    "nodes": [
      { "id": "ev5", "system": "PolicyCenter", "group": 1, "type": "PolicyBind", ... }
    ],
    "links": [
      { "source": "ev5", "target": "ev6", "policy_id": "POL-9045-CRIT" }
    ]
  }
}
```

---

## UI Components

```
┌─────────────────────────────────────────────────────────────────────┐
│  Decision Intelligence Engine                  [Events] [Conflicts] │  ← top-nav
├──────────────────┬──────────────────────────┬───────────────────────┤
│                  │  Interactive Physics      │  Agentic Root-Cause   │
│  Conflict        │  Graph          [━━●━━━] │  Evaluator            │
│  Detection  [⭳] │                Timeline  │                       │
│  ─────────────── │                          │  > EXECUTING...       │
│  [card] High     │   ┌──────┐               │  > PULLING DATA...    │
│  [card] Critical │   │ ev5  │──────┐        │                       │
│  [card] Warning  │   └──────┘      │        │  Conflict Detected:   │
│  [card] Error    │            ┌────▼──┐     │  Impact: ...          │
│  ─────────────── │            │  ev6  │     │  Severity: HIGH       │
│  Event Ingestion │            └───────┘     │                       │
│  Analytics       │                          │  ┌─────────────────┐  │
│  [bar chart]     │                          │  │ Execute Autopilot│  │
│                  │                          │  │  Remediation    │  │
└──────────────────┴──────────────────────────┴──┴─────────────────┴──┘
```

---

## Remediation Report Schema

Downloaded automatically as `GW_Remediation_<conflict-id>_<unix-ts>.json` on every remediation.

```json
{
  "report_type": "Autopilot Remediation Report",
  "generated_at": "2026-04-05T10:30:00.000Z",
  "engine": "Guidewire Decision Intelligence Engine",
  "conflict": {
    "id": "C-POL-9045-CRIT-1",
    "title": "Claim Paid During Delinquency",
    "policy_id": "POL-9045-CRIT",
    "severity": "High",
    "description": "...",
    "nodes_involved": ["ev6", "ev8"]
  },
  "systems_affected": ["BillingCenter", "ClaimCenter"],
  "actions": {
    "external_changes_required": [
      "⚠ BillingCenter: Flag account POL-9045-CRIT — delinquency record must be manually reconciled.",
      "⚠ ClaimCenter: Clawback review initiated. Finance team notification required."
    ],
    "internal_review_items": [
      "⟳ PolicyCenter: Policy status locked pending billing resolution. Auto-renewal suspended."
    ]
  },
  "raw_event_traces": [ ... ],
  "resolution_status": "RESOLVED",
  "resolved_by": "Autopilot Remediation Engine v1.0"
}
```

---

## Audit Export Schema

Downloaded on demand via `⭳ Audit` as `GW_Audit_<conflict-id>.json`.

```json
{
  "metadata": {
    "engine": "Guidewire Integrations Gateway",
    "export_time": "2026-04-05T10:30:00.000Z",
    "auditor": "Intelligent Engine Evaluator",
    "compliance_flag": "High"
  },
  "conflict_summary": { ... },
  "raw_event_traces": [ ... ]
}
```
