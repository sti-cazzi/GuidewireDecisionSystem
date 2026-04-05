let rawEventsData = [];
let networkInstance = null;
let riskChartInstance = null;
let currentActiveConflict = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/intelligence');
        const data = await response.json();
        
        rawEventsData = data.raw_events;
        
        document.getElementById('val-events').innerText = data.raw_events.length;
        document.getElementById('val-conflicts').innerText = data.conflicts.length;
        
        renderAnalytics(data.raw_events);
        renderConflicts(data.conflicts);
        initVisGraph(data.graph);
        initTimeScrubber();
        initAuditExport();
        
    } catch (err) {
        console.error("Failed to load intelligence data:", err);
        document.getElementById('ai-log').innerHTML = `<div class="log-placeholder"><p style="color:#f43f5e">Code Error: ${err.message}.</p></div>`;
    }
});

function initVisGraph(graphData) {
    const container = document.getElementById('graph-2d');

    const nodes = new vis.DataSet(
        graphData.nodes.map(n => {
            let color = '#38bdf8'; // Default
            if (n.group === 1) color = '#10b981'; // Policy PC
            if (n.group === 2) color = '#f59e0b'; // Billing BC
            if (n.group === 3) color = '#8b5cf6'; // Claim CC

            return {
                id: n.id,
                label: `${n.type}\n${n.policy_id}`,
                color: {
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: color,
                    highlight: { background: '#07090e', border: '#fff' }
                },
                font: { color: '#f8fafc', face: 'Outfit', size: 14 },
                shape: 'box',
                margin: 12,
                borderWidth: 2,
                borderWidthSelected: 3,
                title: n.system
            };
        })
    );

    const edges = new vis.DataSet(
        graphData.links.map(l => ({
            from: l.source,
            to: l.target,
            color: { color: 'rgba(56, 189, 248, 0.4)', highlight: '#fff' },
            arrows: 'to',
            smooth: { type: 'dynamic' }
        }))
    );

    const data = { nodes, edges };
    const options = {
        interaction: { hover: true, dragNodes: true, zoomView: true, dragView: true },
        physics: {
            enabled: true, solver: 'forceAtlas2Based',
            forceAtlas2Based: { gravitationalConstant: -100, centralGravity: 0.01, springLength: 150, springConstant: 0.08 }
        }
    };

    networkInstance = new vis.Network(container, data, options);
}

function initTimeScrubber() {
    if (!rawEventsData || rawEventsData.length === 0) return;

    // Build a fast lookup: event id -> timestamp ms
    const eventTimeMap = {};
    rawEventsData.forEach(e => { eventTimeMap[e.id] = new Date(e.timestamp).getTime(); });

    const allTimestamps = Object.values(eventTimeMap).sort((a, b) => a - b);
    const minT = allTimestamps[0];
    const maxT = allTimestamps[allTimestamps.length - 1];

    const scrubber = document.getElementById('time-scrubber');
    const label = document.getElementById('time-label');

    // Update the CSS custom property for the filled-track effect
    function updateTrackFill(val) {
        scrubber.style.setProperty('--fill-pct', `${val}%`);
    }
    updateTrackFill(100);

    scrubber.addEventListener('input', (e) => {
        const pct = parseFloat(e.target.value) / 100;
        updateTrackFill(e.target.value);

        const currentCutoff = pct >= 1 ? maxT : minT + pct * (maxT - minT);

        const d = new Date(currentCutoff);
        label.innerText = pct >= 1
            ? 'Timeline: Live'
            : `Timeline: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        if (!networkInstance) return;

        // Pause physics while we batch-update to avoid jitter
        networkInstance.setOptions({ physics: { enabled: false } });

        const nodesData = networkInstance.body.data.nodes;
        const updates = nodesData.get().map(n => {
            const evTime = eventTimeMap[n.id];
            return { id: n.id, hidden: evTime !== undefined && evTime > currentCutoff };
        });
        nodesData.update(updates);

        // Re-enable physics after a short delay
        clearTimeout(window._physicsTimer);
        window._physicsTimer = setTimeout(() => {
            networkInstance.setOptions({ physics: { enabled: true } });
        }, 300);
    });
}

function initAuditExport() {
    document.getElementById('btn-export-audit').addEventListener('click', () => {
        if (!currentActiveConflict) {
            alert("No Active Conflict Selected for Audit.");
            return;
        }
        
        // Pull full raw payloads of the involved nodes for compliance review
        const fullAuditPayload = {
            metadata: {
                engine: "Guidewire Integrations Gateway",
                export_time: new Date().toISOString(),
                auditor: "Intelligent Engine Evaluator",
                compliance_flag: currentActiveConflict.severity
            },
            conflict_summary: currentActiveConflict,
            raw_event_traces: rawEventsData.filter(e => currentActiveConflict.nodes_involved.includes(e.id))
        };

        const blob = new Blob([JSON.stringify(fullAuditPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GW_Audit_${currentActiveConflict.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

function renderConflicts(conflicts) {
    const list = document.getElementById('conflict-list');
    list.innerHTML = '';
    
    if(conflicts.length === 0) {
        list.innerHTML = '<p style="color:#94a3b8; text-align:center;">No conflicts detected.</p>';
        return;
    }

    conflicts.forEach(c => {
        const div = document.createElement('div');
        div.className = 'conflict-card';
        div.innerHTML = `
            <h4>${c.title}</h4>
            <p>Policy: <strong>${c.policy_id}</strong></p>
            <p style="margin-top:4px"><span style="color:#f43f5e; font-size:0.75rem; border:1px solid #f43f5e; padding:1px 4px; border-radius:3px;">Severity: ${c.severity}</span></p>
        `;
        div.onclick = () => selectConflict(c, div);
        list.appendChild(div);
    });
}

function selectConflict(conflict, element) {
    currentActiveConflict = conflict;
    
    document.querySelectorAll('.conflict-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    // Reset Action footer state
    const footer = document.getElementById('action-footer');
    footer.style.opacity = '0';
    footer.style.pointerEvents = 'none';
    const btn = document.getElementById('btn-remediate');
    btn.innerText = "[ Execute Autopilot Remediation ]";
    btn.classList.remove('btn-success');
    
    if (networkInstance) {
        const activeNodes = conflict.nodes_involved;
        
        const nodesData = networkInstance.body.data.nodes;
        const allNodes = nodesData.get();
        allNodes.forEach(n => {
            n.color = undefined;
            n.shadow = { enabled: false };
        });
        
        activeNodes.forEach(nodeId => {
            const node = nodesData.get(nodeId);
            if (node) {
                node.color = {
                    background: 'rgba(244, 63, 94, 0.4)',
                    border: '#f43f5e',
                    highlight: { background: 'rgba(244, 63, 94, 0.8)', border: '#fff' }
                };
                node.shadow = { enabled: true, color: '#f43f5e', size: 25 };
                // ensure parent is not hidden if user scrubbed back in time
                node.hidden = false;
            }
        });
        
        nodesData.update(allNodes);
        networkInstance.selectNodes(activeNodes);
        networkInstance.fit({ nodes: activeNodes, animation: { duration: 1000, easingFunction: "easeInOutQuad" } });
    }
    
    runAgenticEvaluator(conflict);
}

function runAgenticEvaluator(conflict) {
    const output = document.getElementById('ai-log');
    
    let lines = [
        `<span class="log-system">> EXECUTING NETWORKX RULES PROCESSOR for [${conflict.policy_id}]...</span>`,
        `<span class="log-system">> PULLING DATA FROM FLASK BACKEND...</span>`,
        `<br>`,
        `<strong>Conflict Detected:</strong> ${conflict.title}`,
        `<strong>Impact:</strong> ${conflict.description}`,
        `<span class="log-alert">> CORRELATION SEVERITY RATING: ${conflict.severity.toUpperCase()}</span>`,
        `<br>`,
        `<strong>Suggested Remediation Protocol:</strong>`,
        `- Halt immediate auto-renewal / payout pathways.`,
        `- Review linked nodes (${conflict.nodes_involved.join(', ')}) immediately.`,
        `- Adjust correlation thresholds in engine.py.`
    ];
    
    output.innerHTML = '';
    let currentLine = 0;
    
    clearInterval(window.typingInterval);
    window.typingInterval = setInterval(() => {
        if(currentLine < lines.length) {
            output.innerHTML += `<div class="log-entry">${lines[currentLine]}</div>`;
            output.scrollTop = output.scrollHeight;
            currentLine++;
        } else {
            clearInterval(window.typingInterval);
            // REVEAL ACTION BUTTON
            const footer = document.getElementById('action-footer');
            footer.style.opacity = '1';
            footer.style.pointerEvents = 'all';
        }
    }, 400);
}

window.executeRemediation = function() {
    if (!currentActiveConflict) return;

    const btn = document.getElementById('btn-remediate');
    if (btn.classList.contains('btn-success')) return;
    btn.innerText = "Remediation Successful ✓";
    btn.classList.add('btn-success');

    const conflict = currentActiveConflict;

    // Turn conflicting nodes green
    const nodesData = networkInstance.body.data.nodes;
    const updates = conflict.nodes_involved
        .map(nodeId => nodesData.get(nodeId))
        .filter(Boolean)
        .map(node => ({
            ...node,
            color: {
                background: 'rgba(16, 185, 129, 0.4)',
                border: '#10b981',
                highlight: { background: 'rgba(16, 185, 129, 0.8)', border: '#fff' }
            },
            shadow: { enabled: true, color: '#10b981', size: 25 }
        }));
    nodesData.update(updates);

    // Hide conflict card
    const activeCard = document.querySelector('.conflict-card.active');
    if (activeCard) activeCard.style.display = 'none';

    // Decrement counter
    const countEl = document.getElementById('val-conflicts');
    const current = parseInt(countEl.innerText);
    if (!isNaN(current)) countEl.innerText = Math.max(0, current - 1);

    currentActiveConflict = null;

    // Download remediation report
    downloadRemediationReport(conflict);

    // Build context-aware remediation report
    renderRemediationReport(conflict);
};

function downloadRemediationReport(conflict) {
    const ts = new Date().toISOString();
    const involvedEvents = rawEventsData.filter(e => conflict.nodes_involved.includes(e.id));
    const systems = [...new Set(involvedEvents.map(e => e.system))];
    const actions = getRemediationActions(conflict, systems);

    // Strip HTML tags from action lines for clean JSON output
    const stripHtml = str => str.replace(/<[^>]*>/g, '').trim();

    const externalActions = actions.filter(a => a.includes('log-ext')).map(stripHtml);
    const reviewActions = actions.filter(a => a.includes('log-review')).map(stripHtml);

    const report = {
        report_type: "Autopilot Remediation Report",
        generated_at: ts,
        engine: "Guidewire Decision Intelligence Engine",
        conflict: {
            id: conflict.id,
            title: conflict.title,
            policy_id: conflict.policy_id,
            severity: conflict.severity,
            description: conflict.description,
            nodes_involved: conflict.nodes_involved
        },
        systems_affected: systems,
        actions: {
            external_changes_required: externalActions,
            internal_review_items: reviewActions
        },
        raw_event_traces: involvedEvents,
        resolution_status: "RESOLVED",
        resolved_by: "Autopilot Remediation Engine v1.0"
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GW_Remediation_${conflict.id}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function renderRemediationReport(conflict) {
    const output = document.getElementById('ai-log');
    const ts = new Date().toLocaleString();

    // Determine involved systems from raw events
    const involvedEvents = rawEventsData.filter(e => conflict.nodes_involved.includes(e.id));
    const systems = [...new Set(involvedEvents.map(e => e.system))];

    // Build action lines based on conflict type
    const actionLines = getRemediationActions(conflict, systems);

    const lines = [
        `<span class="log-success">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>`,
        `<span class="log-success">✓ AUTOPILOT REMEDIATION EXECUTED</span>`,
        `<span class="log-success">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>`,
        `<br>`,
        `<strong>Conflict ID:</strong> <span style="color:#94a3b8">${conflict.id}</span>`,
        `<strong>Policy:</strong> <span style="color:#94a3b8">${conflict.policy_id}</span>`,
        `<strong>Resolved At:</strong> <span style="color:#94a3b8">${ts}</span>`,
        `<strong>Severity Cleared:</strong> <span style="color:#10b981">${conflict.severity}</span>`,
        `<br>`,
        `<span class="log-system">── REMEDIATION ACTIONS TAKEN ──</span>`,
        `<br>`,
        ...actionLines,
        `<br>`,
        `<span class="log-system">── SYSTEM STATUS ──</span>`,
        `<br>`,
        ...systems.map(sys => {
            const isExternal = sys !== 'ClaimCenter';
            return isExternal
                ? `<span class="log-ext">⚠ ${sys}: EXTERNAL CHANGE REQUIRED — Manual override needed in ${sys} portal to finalize resolution.</span>`
                : `<span class="log-review">⟳ ${sys}: UNDER REVIEW — Conflict pathway halted. No further payouts will process until cleared.</span>`;
        }),
        `<br>`,
        `<span class="log-success">✓ Conflict node graph updated. Affected nodes marked resolved.</span>`,
        `<span class="log-success">✓ Active Conflicts counter decremented.</span>`,
        `<span class="log-success">✓ Audit trail available via "⭳ Audit" export.</span>`,
    ];

    output.innerHTML = '';
    let i = 0;
    clearInterval(window.typingInterval);
    window.typingInterval = setInterval(() => {
        if (i < lines.length) {
            output.innerHTML += `<div class="log-entry">${lines[i]}</div>`;
            output.scrollTop = output.scrollHeight;
            i++;
        } else {
            clearInterval(window.typingInterval);
        }
    }, 180);
}

function getRemediationActions(conflict, systems) {
    const base = {
        'Claim Paid During Delinquency': [
            `<span class="log-ext">⚠ BillingCenter: Flag account ${conflict.policy_id} — delinquency record must be manually reconciled.</span>`,
            `<span class="log-ext">⚠ ClaimCenter: Clawback review initiated for payout on ${conflict.policy_id}. Finance team notification required.</span>`,
            `<span class="log-review">⟳ PolicyCenter: Policy status locked pending billing resolution. Auto-renewal pathway suspended.</span>`,
        ],
        'Renewal During Fraud Investigation': [
            `<span class="log-ext">⚠ PolicyCenter: Renewal for ${conflict.policy_id} flagged as INVALID — must be voided externally in PolicyCenter admin.</span>`,
            `<span class="log-review">⟳ ClaimCenter: Fraud investigation on ${conflict.policy_id} remains OPEN. No claim payouts will process.</span>`,
            `<span class="log-ext">⚠ BillingCenter: Renewal billing cycle for ${conflict.policy_id} must be halted — contact billing ops team.</span>`,
        ],
        'Simultaneous Claims Open': [
            `<span class="log-review">⟳ ClaimCenter: Duplicate claim detection triggered for ${conflict.policy_id}. Both claims placed in HOLD status.</span>`,
            `<span class="log-ext">⚠ ClaimCenter: Manual adjuster review REQUIRED — assign a senior adjuster to ${conflict.policy_id} to determine valid claim.</span>`,
            `<span class="log-review">⟳ PolicyCenter: Policy ${conflict.policy_id} flagged for SIU (Special Investigations Unit) referral.</span>`,
        ],
        'Billing on Canceled Policy': [
            `<span class="log-ext">⚠ BillingCenter: Payment request on ${conflict.policy_id} must be VOIDED immediately in BillingCenter — policy is canceled.</span>`,
            `<span class="log-review">⟳ PolicyCenter: Cancellation record for ${conflict.policy_id} confirmed valid. No reinstatement triggered.</span>`,
            `<span class="log-ext">⚠ BillingCenter: Notify collections team — any issued invoices for ${conflict.policy_id} must be recalled.</span>`,
        ],
    };

    return base[conflict.title] || [
        `<span class="log-review">⟳ Conflict pathway for ${conflict.policy_id} has been halted across all involved systems.</span>`,
        `<span class="log-ext">⚠ Manual review required — escalate ${conflict.id} to compliance team for resolution.</span>`,
    ];
}

function renderAnalytics(events) {
    try {
        const ctx = document.getElementById('riskChart').getContext('2d');
        const centers = {"PolicyCenter": 0, "BillingCenter": 0, "ClaimCenter": 0};
        
        events.forEach(e => {
            if(centers[e.system] !== undefined) centers[e.system]++;
        });

        riskChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Policy', 'Billing', 'Claim'],
                datasets: [{
                    label: 'Events Logged',
                    data: [centers["PolicyCenter"], centers["BillingCenter"], centers["ClaimCenter"]],
                    backgroundColor: ['#10b981', '#f59e0b', '#8b5cf6'],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    } catch(e) { console.error("Chart failed", e); }
}
