import datetime
import uuid
import random

def generate_data():
    events = []
    base_time = datetime.datetime.now() - datetime.timedelta(days=30)
    
    def get_time(days_offset, hours_offset=0):
        # Adding some jitter to make it look realistic
        jitter = random.randint(-12, 12)
        return (base_time + datetime.timedelta(days=days_offset, hours=hours_offset + jitter)).isoformat()

    # -------------------------------
    # Procedurally Generate 45 Normal "Noise" Policies
    # -------------------------------
    for i in range(1, 46):
        pol_id = f"POL-{1000 + i}"
        
        # Every policy has a bind
        bind_time = random.randint(0, 5)
        events.append({"id": str(uuid.uuid4())[:8], "system": "PolicyCenter", "policy_id": pol_id, "type": "PolicyBind", "status": "Active", "timestamp": get_time(bind_time)})
        
        # All noise policies pay — avoids accidental delinquency + claim conflicts
        events.append({"id": str(uuid.uuid4())[:8], "system": "BillingCenter", "policy_id": pol_id, "type": "PaymentReceived", "status": "Paid", "timestamp": get_time(bind_time + 1)})

        # 30% chance to have a single normal claim (never two, never during delinquency)
        if random.random() > 0.7:
            claim_sub = bind_time + random.randint(5, 15)
            events.append({"id": str(uuid.uuid4())[:8], "system": "ClaimCenter", "policy_id": pol_id, "type": "ClaimSubmitted", "status": "Open", "timestamp": get_time(claim_sub)})

            # 80% chance claim is closed cleanly
            if random.random() > 0.2:
                events.append({"id": str(uuid.uuid4())[:8], "system": "ClaimCenter", "policy_id": pol_id, "type": "ClaimPaid", "status": "Closed", "timestamp": get_time(claim_sub + 4)})
            else:
                events.append({"id": str(uuid.uuid4())[:8], "system": "ClaimCenter", "policy_id": pol_id, "type": "ClaimDenied", "status": "Closed", "timestamp": get_time(claim_sub + 3)})


    # -------------------------------
    # SPECIFIC CONFLICT 1 - Claim Paid during Delinquency
    # -------------------------------
    pol2_id = "POL-9045-CRIT"
    events.append({"id": "ev5", "system": "PolicyCenter", "policy_id": pol2_id, "type": "PolicyBind", "status": "Active", "timestamp": get_time(0)})
    events.append({"id": "ev6", "system": "BillingCenter", "policy_id": pol2_id, "type": "PaymentMissed", "status": "Delinquent", "timestamp": get_time(5)})
    events.append({"id": "ev7", "system": "ClaimCenter", "policy_id": pol2_id, "type": "ClaimSubmitted", "status": "Open", "timestamp": get_time(6)})
    events.append({"id": "ev8", "system": "ClaimCenter", "policy_id": pol2_id, "type": "ClaimPaid", "status": "Closed", "timestamp": get_time(10)})

    # -------------------------------
    # SPECIFIC CONFLICT 2 - Policy Renewed while Fraud Investigation Open
    # -------------------------------
    pol3_id = "POL-8992-WARN"
    events.append({"id": "ev9", "system": "PolicyCenter", "policy_id": pol3_id, "type": "PolicyBind", "status": "Active", "timestamp": get_time(-365)}) 
    events.append({"id": "ev10", "system": "ClaimCenter", "policy_id": pol3_id, "type": "ClaimSubmitted", "status": "Open", "timestamp": get_time(25)})
    events.append({"id": "ev11", "system": "ClaimCenter", "policy_id": pol3_id, "type": "FraudInvestigation", "status": "Investigating", "timestamp": get_time(26)})
    events.append({"id": "ev12", "system": "PolicyCenter", "policy_id": pol3_id, "type": "PolicyRenew", "status": "Active", "timestamp": get_time(28)})

    # -------------------------------
    # SPECIFIC CONFLICT 3 - Multiple Open Heavy Claims
    # -------------------------------
    pol4_id = "POL-7721-WARN"
    events.append({"id": "ev13", "system": "PolicyCenter", "policy_id": pol4_id, "type": "PolicyBind", "status": "Active", "timestamp": get_time(-100)})
    events.append({"id": "ev14", "system": "BillingCenter", "policy_id": pol4_id, "type": "PaymentReceived", "status": "Paid", "timestamp": get_time(-99)})
    events.append({"id": "ev15", "system": "ClaimCenter", "policy_id": pol4_id, "type": "ClaimSubmitted", "status": "Open", "timestamp": get_time(10)})
    events.append({"id": "ev16", "system": "ClaimCenter", "policy_id": pol4_id, "type": "ClaimSubmitted", "status": "Open", "timestamp": get_time(12)})
    # Conflict: ev15 and ev16 are two simultaneous open claims

    # -------------------------------
    # SPECIFIC CONFLICT 4 - Billing after Cancellation
    # -------------------------------
    pol5_id = "POL-1102-ERR"
    events.append({"id": "ev17", "system": "PolicyCenter", "policy_id": pol5_id, "type": "PolicyBind", "status": "Active", "timestamp": get_time(-50)})
    events.append({"id": "ev18", "system": "PolicyCenter", "policy_id": pol5_id, "type": "PolicyCancel", "status": "Canceled", "timestamp": get_time(-10)})
    events.append({"id": "ev19", "system": "BillingCenter", "policy_id": pol5_id, "type": "PaymentRequested", "status": "Pending", "timestamp": get_time(-5)})
    # Conflict: Payment requested on a canceled policy

    return events
