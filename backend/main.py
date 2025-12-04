# backend/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import PyPDF2
import io

from document_classifier import classify_document
from claim_normalizer import normalize_claim_text
from fraud_detector import score_fraud_risk

app = FastAPI(
    title="ClaimAxis – AI-Powered Insurance Intelligence",
    description=(
        "ClaimAxis is a SaaS-style platform unifying a Document Classification Agent, "
        "Claims Description Normalizer, and Fraud Detection Copilot into one axis."
    ),
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # open for demo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# ---------- 1. Document Classifier ----------

@app.post("/api/classify-document")
async def api_classify_document(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for now.")
    file_bytes = await file.read()
    text = extract_text_from_pdf(file_bytes)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF.")
    result = classify_document(text)
    result["raw_text_excerpt"] = text[:800]
    return result


# ---------- 2. Claims Normalizer ----------

@app.post("/api/normalize-claim")
def api_normalize_claim(req: ClaimTextRequest):
    return normalize_claim_text(req.text)


# ---------- 3. Fraud Detector ----------

@app.post("/api/fraud-score")
def api_fraud_score(req: FraudRequest):
    return score_fraud_risk(req.text, req.claimed_amount, req.estimated_amount)


# ---------- 4. Intelligence Pipeline ----------

@app.post("/api/pipeline-from-text")
def api_pipeline_from_text(req: PipelineTextRequest):
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
