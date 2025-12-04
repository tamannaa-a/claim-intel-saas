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
    title="Claim Intelligence SaaS",
    description=(
        "SaaS-ready platform that combines Document Classification, "
        "Claims Description Normalization, and Fraud Detection Copilot."
    ),
    version="1.0.0"
)

# CORS for localhost frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten for production
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


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "claim-intelligence-saas"}


# 1. Document Classification Agent -----------------------------------------

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


# 2. Claims Description Normalizer -----------------------------------------

@app.post("/api/normalize-claim")
def api_normalize_claim(req: ClaimTextRequest):
    structured = normalize_claim_text(req.text)
    return structured


# 3. Fraud Detection Copilot -----------------------------------------------

@app.post("/api/fraud-score")
def api_fraud_score(req: FraudRequest):
    result = score_fraud_risk(req.text, req.claimed_amount, req.estimated_amount)
    return result


# 4. Full "Claim Intelligence Pipeline"
#    Upload doc + (optional) description -> returns unified view

class PipelineRequest(BaseModel):
    claim_text: str
    claimed_amount: Optional[int] = None
    estimated_amount: Optional[int] = None


@app.post("/api/pipeline-from-text")
def api_pipeline_from_text(req: PipelineRequest):
    """
    Use this when there is no document, but we still want
    normalization + fraud scoring.
    """
    normalized = normalize_claim_text(req.claim_text)
    fraud = score_fraud_risk(
        req.claim_text,
        req.claimed_amount or normalized.get("claimed_amount"),
        req.estimated_amount or normalized.get("estimated_repair_amount"),
    )
    return {
        "normalized_claim": normalized,
        "fraud_insights": fraud
    }


@app.post("/api/pipeline-from-pdf")
async def api_pipeline_from_pdf(
    file: UploadFile = File(...),
    claim_text: Optional[str] = None,
    claimed_amount: Optional[int] = None,
    estimated_amount: Optional[int] = None,
):
    """
    Core SaaS-demo endpoint: upload a document and optional free-text description,
    get: document classification + normalized claim + fraud risk.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for now.")
    file_bytes = await file.read()
    pdf_text = extract_text_from_pdf(file_bytes)
    if not pdf_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF.")

    classification = classify_document(pdf_text)

    # Use user claim_text if provided, else fallback to pdf text
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
        "source_text_excerpt": base_text[:800]
    }
