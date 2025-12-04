# backend/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import PyPDF2
import io
import matplotlib.pyplot as plt
from io import BytesIO
from fastapi.responses import Response

from document_classifier import classify_document
from claim_normalizer import normalize_claim_text
from fraud_detector import score_fraud_risk

app = FastAPI(
    title="ClaimAxis – AI-Powered Insurance Intelligence",
    description=(
        "ClaimAxis is a SaaS-style platform unifying a Document Classification Agent, "
        "Claims Description Normalizer, and Fraud Detection Copilot into one axis."
    ),
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # open for demo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------
# Simple in-memory auth
# -------------------------------------------------------------------

USERS = {
    "agent@claimaxis.com": {"password": "agent123", "role": "AGENT"},
    "manager@claimaxis.com": {"password": "manager123", "role": "MANAGER"},
    "admin@claimaxis.com": {"password": "admin123", "role": "ADMIN"},
}

TOKENS: Dict[str, Dict[str, str]] = {}  # token -> {email, role}


class LoginRequest(BaseModel):
    email: str
    password: str


class ClaimTextRequest(BaseModel):
    text: str


class FraudRequest(BaseModel):
    text: str
    claimed_amount: Optional[int] = None
    estimated_amount: Optional[int] = None


class PipelineTextRequest(BaseModel):
    claim_text: str
    claimed_amount: Optional[int] = None
    estimated_amount: Optional[int] = None


def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        pages_text = []
        for page in reader.pages:
            try:
                page_text = page.extract_text()
                if page_text:
                    pages_text.append(page_text)
            except Exception:
                continue
        return "\n".join(pages_text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read PDF: {str(e)}")


def get_current_user(request: Request) -> Dict[str, str]:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = auth_header.split(" ", 1)[1]
    user = TOKENS.get(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return user


@app.get("/")
def root():
    return {
        "name": "ClaimAxis",
        "tagline": "AI-Powered Insurance Intelligence Platform",
        "status": "ready",
        "modules": [
            "Document Classifier",
            "Claims Normalizer",
            "Fraud Detector",
            "Intelligence Pipeline",
        ],
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "ClaimAxis"}


@app.post("/auth/login")
def login(req: LoginRequest):
    user = USERS.get(req.email)
    if not user or user["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    # simple token
    token = f"token-{req.email}"
    TOKENS[token] = {"email": req.email, "role": user["role"]}
    return {"access_token": token, "email": req.email, "role": user["role"]}


@app.post("/auth/logout")
def logout(request: Request):
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        TOKENS.pop(token, None)
    return {"detail": "Logged out"}


# -------------------------------------------------------------------
# Core APIs (protected)
# -------------------------------------------------------------------

@app.post("/api/classify-document")
async def api_classify_document(
    file: UploadFile = File(...),
    user: Dict[str, str] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for now.")
    file_bytes = await file.read()
    text = extract_text_from_pdf(file_bytes)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF.")
    result = classify_document(text)
    result["raw_text_excerpt"] = text[:800]
    return result


@app.post("/api/normalize-claim")
def api_normalize_claim(
    req: ClaimTextRequest,
    user: Dict[str, str] = Depends(get_current_user),
):
    return normalize_claim_text(req.text)


@app.post("/api/fraud-score")
def api_fraud_score(
    req: FraudRequest,
    user: Dict[str, str] = Depends(get_current_user),
):
    return score_fraud_risk(req.text, req.claimed_amount, req.estimated_amount)


@app.post("/api/pipeline-from-text")
def api_pipeline_from_text(
    req: PipelineTextRequest,
    user: Dict[str, str] = Depends(get_current_user),
):
    normalized = normalize_claim_text(req.claim_text)
    fraud = score_fraud_risk(
        req.claim_text,
        req.claimed_amount or normalized.get("claimed_amount"),
        req.estimated_amount or normalized.get("estimated_repair_amount"),
    )
    return {
        "normalized_claim": normalized,
        "fraud_insights": fraud,
    }


@app.post("/api/pipeline-from-pdf")
async def api_pipeline_from_pdf(
    file: UploadFile = File(...),
    claim_text: Optional[str] = None,
    claimed_amount: Optional[int] = None,
    estimated_amount: Optional[int] = None,
    user: Dict[str, str] = Depends(get_current_user),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for now.")
    file_bytes = await file.read()
    pdf_text = extract_text_from_pdf(file_bytes)
    if not pdf_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF.")

    classification = classify_document(pdf_text)
    base_text = claim_text or pdf_text
    normalized = normalize_claim_text(base_text)
    fraud = score_fraud_risk(
        base_text,
        claimed_amount or normalized.get("claimed_amount"),
        estimated_amount or normalized.get("estimated_repair_amount"),
    )

    return {
        "document_classification": classification,
        "normalized_claim": normalized,
        "fraud_insights": fraud,
        "source_text_excerpt": base_text[:800],
    }


# -------------------------------------------------------------------
# Chart endpoints (PNG images)
# -------------------------------------------------------------------

def _chart_response(fig) -> Response:
    buf = BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/png")


@app.get("/api/chart/document")
def chart_document(confidence: float, health: int, matched: int):
    fig, ax = plt.subplots()
    labels = ["Confidence", "Health", "Keywords"]
    values = [confidence * 100, health, matched]
    ax.bar(labels, values)
    ax.set_ylim(0, max(100, max(values) + 10))
    ax.set_ylabel("Score")
    ax.set_title("Document Classification Metrics")
    return _chart_response(fig)


@app.get("/api/chart/normalize")
def chart_normalize(severity: str):
    levels = ["Low", "Medium", "High"]
    values = []
    for lvl in levels:
        if lvl.lower() == severity.lower():
            values.append(100)
        else:
            values.append(40)
    fig, ax = plt.subplots()
    ax.bar(levels, values)
    ax.set_ylim(0, 110)
    ax.set_ylabel("Relative Severity")
    ax.set_title("Claim Severity")
    return _chart_response(fig)


@app.get("/api/chart/fraud")
def chart_fraud(level: str, score: int):
    levels = ["Low", "Medium", "High"]
    values = []
    for idx, lvl in enumerate(levels):
        if lvl.lower() == level.lower():
            values.append(score * 20 + 40)
        else:
            values.append(20)
    fig, ax = plt.subplots()
    ax.bar(levels, values)
    ax.set_ylim(0, 120)
    ax.set_ylabel("Risk Score")
    ax.set_title("Fraud Risk Profile")
    return _chart_response(fig)
