import networkx as nx

def analyze_events(events):
    G = nx.DiGraph()
    conflicts = []
    
    events_sorted = sorted(events, key=lambda x: x["timestamp"])
    policy_events = {}
    
    # Node colors/groups
    sys_to_group = {"PolicyCenter": 1, "BillingCenter": 2, "ClaimCenter": 3}
    
    for ev in events_sorted:
        node_id = ev["id"]
        group = sys_to_group.get(ev["system"], 4)
        
        # Add Node
        G.add_node(node_id, 
                   id=node_id,
                   system=ev["system"],
                   policy_id=ev["policy_id"],
                   type=ev["type"],
                   status=ev["status"],
                   timestamp=ev["timestamp"],
                   group=group, 
                   name=f"{ev['system']}: {ev['type']}")
        
        pid = ev["policy_id"]
        if pid not in policy_events:
            policy_events[pid] = []
        else:
            prev_id = policy_events[pid][-1]["id"]
            G.add_edge(prev_id, node_id, policy_id=pid)
        
        policy_events[pid].append(ev)
        
    for pid, evs in policy_events.items():
        is_delinquent = False
        is_investigating = False
        
        for e in evs:
            if e["type"] == "PaymentMissed":
                is_delinquent = True
            elif e["type"] == "PaymentReceived":
                is_delinquent = False
                
            if e["type"] == "FraudInvestigation":
                is_investigating = True
            elif e["type"] == "InvestigationCleared":
                is_investigating = False
                
            if e["type"] == "ClaimPaid" and is_delinquent:
                conflicts.append({
                    "id": f"C-{pid}-1",
                    "policy_id": pid,
                    "title": "Claim Paid During Delinquency",
                    "description": f"A claim was paid out for {pid} while the billing status was logged as Delinquent.",
                    "severity": "High",
                    "nodes_involved": [ev["id"] for ev in evs if ev["type"] in ["PaymentMissed", "ClaimPaid"]]
                })
                
            if e["type"] == "PolicyRenew" and is_investigating:
                conflicts.append({
                    "id": f"C-{pid}-2",
                    "policy_id": pid,
                    "title": "Renewal During Fraud Investigation",
                    "description": f"Policy {pid} auto-renewed in PolicyCenter while an active fraud investigation is open in ClaimCenter.",
                    "severity": "Critical",
                    "nodes_involved": [ev["id"] for ev in evs if ev["type"] in ["FraudInvestigation", "PolicyRenew"]]
                })
                
        # Post-loop checks for full event list
        claim_submits = [ev.get("id") for ev in evs if ev.get("type") == "ClaimSubmitted"]
        if len(claim_submits) > 1:
            conflicts.append({
                "id": f"C-{pid}-3",
                "policy_id": pid,
                "title": "Simultaneous Claims Open",
                "description": f"Policy {pid} has multiple simultaneous claims opened within a highly suspect timeframe.",
                "severity": "Warning",
                "nodes_involved": claim_submits
            })
            
        is_canceled = any(ev.get("type") == "PolicyCancel" for ev in evs)
        payment_req = [ev.get("id") for ev in evs if ev.get("type") == "PaymentRequested"]
        if is_canceled and payment_req:
            cancel_nodes = [ev.get("id") for ev in evs if ev.get("type") == "PolicyCancel"]
            conflicts.append({
                "id": f"C-{pid}-4",
                "policy_id": pid,
                "title": "Billing on Canceled Policy",
                "description": f"BillingCenter requested a payment on policy {pid} AFTER it was canceled in PolicyCenter.",
                "severity": "Error",
                "nodes_involved": cancel_nodes + payment_req
            })

    # Build serializable graph manually to preserve string IDs and all node attrs
    graph_data = {
        "nodes": [{"id": nid, **attrs} for nid, attrs in G.nodes(data=True)],
        "links": [{"source": u, "target": v, **attrs} for u, v, attrs in G.edges(data=True)]
    }
    
    return {
        "graph": graph_data,
        "conflicts": conflicts,
        "raw_events": events_sorted
    }
