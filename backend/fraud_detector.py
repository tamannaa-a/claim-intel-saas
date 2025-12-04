# backend/fraud_detector.py
from typing import Dict, Any, List

def score_fraud_risk(text: str,
                     claimed_amount: int | None = None,
                     estimated_amount: int | None = None) -> Dict[str, Any]:
    t = text.lower()
    score = 0
    reasons: List[str] = []

    # textual red flags
    if any(phrase in t for phrase in [
        "previous claim", "multiple claims", "again damaged",
        "third time", "second time", "repeated damage"
    ]):
        score += 2
        reasons.append("History of previous or repeated claims mentioned.")
    
    if any(phrase in t for phrase in [
        "backdated", "pre-existing", "old damage", "existing damage"
    ]):
        score += 2
        reasons.append("Possible pre-existing or backdated damage indicators.")

    if any(phrase in t for phrase in [
        "urgent approval", "process fast", "asap", "immediately without checks"
    ]):
        score += 1
        reasons.append("High urgency / pressure to approve quickly.")

    if any(phrase in t for phrase in [
        "no police report", "refused to file", "no fir", "no proof"
    ]):
        score += 2
        reasons.append("No police / external report despite loss context.")

    # numeric inconsistencies
    if claimed_amount is not None and estimated_amount is not None:
        if claimed_amount > 1.5 * estimated_amount:
            score += 2
            reasons.append(
                f"Claimed amount ({claimed_amount}) is significantly higher than estimated repair "
                f"({estimated_amount})."
            )
        elif claimed_amount > 1.2 * estimated_amount:
            score += 1
            reasons.append(
                f"Claimed amount ({claimed_amount}) is moderately higher than estimated repair "
                f"({estimated_amount})."
            )

    # map score -> risk level
    if score >= 4:
        level = "High"
    elif score >= 2:
        level = "Medium"
    else:
        level = "Low"

    explanation = (
        f"Overall fraud risk scored as {level} based on {len(reasons)} signals. "
        + (" ".join(reasons) if reasons else "No obvious red flags found in text.")
    )

    return {
        "fraud_risk_level": level,
        "fraud_score": score,
        "reasons": reasons,
        "explanation": explanation
    }
