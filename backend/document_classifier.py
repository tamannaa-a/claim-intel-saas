# backend/document_classifier.py
from typing import Dict, Any, List

DOC_TYPES = {
    "claim_form": {
        "keywords": [
            "claim form", "policy no", "policy number", "insured name",
            "date of loss", "type of loss", "claimant", "claim number"
        ],
        "display_name": "Claim Form"
    },
    "inspection_report": {
        "keywords": [
            "inspection report", "assessor", "surveyor", "site visit",
            "inspection date", "observations", "damage assessment"
        ],
        "display_name": "Inspection Report"
    },
    "invoice": {
        "keywords": [
            "invoice", "tax invoice", "amount due", "bill to",
            "gst", "total amount", "invoice no", "invoice number"
        ],
        "display_name": "Invoice"
    },
    "repair_estimate": {
        "keywords": [
            "estimate", "repair estimate", "parts", "labour", "labor",
            "garage", "workshop", "job card"
        ],
        "display_name": "Repair Estimate"
    },
    "other": {
        "keywords": [],
        "display_name": "Other / Unclassified"
    }
}


def classify_document(text: str) -> Dict[str, Any]:
    """
    Keyword-based, explainable classifier.
    Output:
      - predicted_type
      - predicted_type_label
      - confidence (0-1)
      - matched_keywords
      - quality_flags
      - reasoning
    """
    text_lower = text.lower()
    scores = {}
    matched_details: Dict[str, List[str]] = {}

    for doc_type, cfg in DOC_TYPES.items():
        keywords = cfg["keywords"]
        matches = [kw for kw in keywords if kw in text_lower]
        scores[doc_type] = len(matches)
        matched_details[doc_type] = matches

    best_type = max(scores, key=scores.get)
    best_score = scores[best_type]

    max_possible = max(len(cfg["keywords"]) for cfg in DOC_TYPES.values() if cfg["keywords"])
    confidence = 0.0
    if max_possible > 0:
        confidence = min(1.0, best_score / max_possible)

    reasoning_lines = []
    if best_score == 0:
        reasoning_lines.append(
            "No strong document-type patterns were detected. "
            "Classified as 'Other / Unclassified' with low confidence."
        )
    else:
        reasoning_lines.append(
            f"Classified as {DOC_TYPES[best_type]['display_name']} because it contains "
            f"{best_score} characteristic phrase(s): {', '.join(matched_details[best_type])}."
        )

    quality_flags = []
    if "signature" not in text_lower and "signed" not in text_lower:
        quality_flags.append("No signature-related text detected (e.g., 'Signature', 'Signed').")
    if "date" not in text_lower and "dd/mm" not in text_lower and "mm/dd" not in text_lower:
        quality_flags.append("No clear date field detected.")
    if "policy" not in text_lower and "policy no" not in text_lower:
        quality_flags.append("No policy identifier field detected.")

    reasoning = " ".join(reasoning_lines)
    if quality_flags:
        reasoning += " Quality checks: " + " ".join(quality_flags)

    return {
        "predicted_type": best_type,
        "predicted_type_label": DOC_TYPES[best_type]["display_name"],
        "confidence": round(confidence, 2),
        "matched_keywords": matched_details[best_type],
        "quality_flags": quality_flags,
        "reasoning": reasoning,
    }
