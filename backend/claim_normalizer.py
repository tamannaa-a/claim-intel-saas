# backend/claim_normalizer.py
from typing import Dict, Any
import re

def _guess_loss_type(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ["theft", "stolen", "robbed"]):
        return "Theft"
    if any(w in t for w in ["accident", "collision", "crash", "hit", "impact"]):
        return "Accident"
    if any(w in t for w in ["fire", "burn", "flames"]):
        return "Fire"
    if any(w in t for w in ["flood", "water logging", "water damage", "inundation"]):
        return "Flood / Water Damage"
    if any(w in t for w in ["vandalism", "malicious", "broken window", "smashed"]):
        return "Vandalism"
    if any(w in t for w in ["storm", "hail", "cyclone", "hurricane"]):
        return "Storm / Natural Peril"
    return "Other / Unknown"


def _guess_severity(text: str) -> str:
    t = text.lower()
    high = ["total loss", "severe", "major", "complete loss", "engine damage"]
    medium = ["moderate", "partial damage", "bumper", "door", "panel damage"]
    low = ["minor", "scratch", "dent", "small"]
    if any(w in t for w in high):
        return "High"
    if any(w in t for w in medium):
        return "Medium"
    if any(w in t for w in low):
        return "Low"
    return "Medium"


def _guess_asset(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ["car", "vehicle", "auto", "four wheeler", "sedan", "suv"]):
        return "Motor Vehicle"
    if any(w in t for w in ["bike", "two wheeler", "motorcycle", "scooter"]):
        return "Two Wheeler"
    if any(w in t for w in ["house", "home", "building", "flat", "apartment"]):
        return "Residential Property"
    if any(w in t for w in ["shop", "office", "factory", "warehouse"]):
        return "Commercial Property"
    if any(w in t for w in ["mobile", "phone", "laptop", "jewellery", "jewelry"]):
        return "Portable Gadget / Valuables"
    return "Unknown Asset"


def _extract_amounts(text: str):
    nums = re.findall(r"\b\d{3,}\b", text.replace(",", ""))
    if not nums:
        return None, None
    nums_int = sorted([int(n) for n in nums], reverse=True)
    claimed = nums_int[0]
    estimated = nums_int[1] if len(nums_int) > 1 else None
    return claimed, estimated


def normalize_claim_text(text: str) -> Dict[str, Any]:
    loss_type = _guess_loss_type(text)
    severity = _guess_severity(text)
    asset = _guess_asset(text)
    claimed_amount, estimated_amount = _extract_amounts(text)

    structured = {
        "loss_type": loss_type,
        "severity": severity,
        "affected_asset": asset,
        "claimed_amount": claimed_amount,
        "estimated_repair_amount": estimated_amount,
        "raw_text_excerpt": text[:400],
    }
    return structured
