// ===============================
// ClaimAxis Frontend Logic
// ===============================

const API_BASE = "http://localhost:8000";

// ---------- Tab Switching ----------
const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;

    tabButtons.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById(target).classList.add("active");
  });
});

// ---------- Helpers ----------
async function postJSON(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function postForm(url, formData) {
  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Utility: show/hide loaders and result sections
function show(el) {
  if (el) el.classList.remove("hidden");
}
function hide(el) {
  if (el) el.classList.add("hidden");
}

// ===================================================================
// 1️⃣ Document Classification Agent (ClaimAxis Document Classifier)
// ===================================================================
const dropArea = document.getElementById("drop-area");
const docFileInput = document.getElementById("doc-file-input");
const docResult = document.getElementById("doc-result");
const docLoader = document.getElementById("doc-loader");

if (dropArea && docFileInput) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropArea.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropArea.classList.remove("dragover");
    });
  });

  dropArea.addEventListener("click", () => docFileInput.click());

  dropArea.addEventListener("drop", async (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
      await handleDocumentUpload(file);
    }
  });

  docFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      await handleDocumentUpload(file);
    }
  });
}

async function handleDocumentUpload(file) {
  if (!docResult || !docLoader) return;

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    alert("Please upload a PDF file.");
    return;
  }

  hide(docResult);
  show(docLoader);

  try {
    const formData = new FormData();
    formData.append("file", file);

    const data = await postForm(`${API_BASE}/api/classify-document`, formData);

    const badgeClass =
      data.confidence >= 0.8 ? "success" :
      data.confidence >= 0.5 ? "warning" : "danger";

    docResult.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <h3 style="margin:0 0 4px;">${data.predicted_type_label}</h3>
            <p style="margin:0;font-size:0.8rem;color:#9ca3af;">
              Type ID: <code>${data.predicted_type}</code>
            </p>
          </div>
          <span class="badge-pill ${badgeClass}">
            Confidence ${(data.confidence * 100).toFixed(0)}%
          </span>
        </div>

        <p style="margin:10px 0 6px;">${data.reasoning}</p>

        ${
          data.matched_keywords?.length
            ? `<p style="margin:4px 0 4px;font-size:0.85rem;">
                 Matched keywords:
                 <code>${data.matched_keywords.join(", ")}</code>
               </p>`
            : ""
        }

        ${
          data.quality_flags?.length
            ? `<ul style="margin:6px 0 0 18px;font-size:0.85rem;color:#fca5a5;">
                 ${data.quality_flags.map((f) => `<li>${f}</li>`).join("")}
               </ul>`
            : ""
        }
      </div>
    `;

    hide(docLoader);
    show(docResult);
  } catch (err) {
    console.error(err);
    docResult.innerHTML = `<span style="color:#fca5a5;">Error: ${err.message}</span>`;
    hide(docLoader);
    show(docResult);
  }
}

// ===================================================================
// 2️⃣ Claims Description Normalizer
// ===================================================================
const normalizeInput = document.getElementById("normalize-input");
const normalizeBtn = document.getElementById("normalize-btn");
const normalizeResult = document.getElementById("normalize-result");
const normalizeLoader = document.getElementById("normalize-loader");

if (normalizeBtn && normalizeInput) {
  normalizeBtn.addEventListener("click", async () => {
    const text = normalizeInput.value.trim();
    if (!text) {
      alert("Please paste claim notes first.");
      return;
    }

    hide(normalizeResult);
    show(normalizeLoader);

    try {
      const data = await postJSON(`${API_BASE}/api/normalize-claim`, { text });
      normalizeResult.textContent = JSON.stringify(data, null, 2);
      hide(normalizeLoader);
      show(normalizeResult);
    } catch (err) {
      console.error(err);
      normalizeResult.textContent = `Error: ${err.message}`;
      hide(normalizeLoader);
      show(normalizeResult);
    }
  });
}

// ===================================================================
// 3️⃣ Fraud Detection Copilot
// ===================================================================
const fraudInput = document.getElementById("fraud-input");
const fraudBtn = document.getElementById("fraud-btn");
const fraudResult = document.getElementById("fraud-result");
const fraudLoader = document.getElementById("fraud-loader");
const claimedAmountInput = document.getElementById("claimed-amount");
const estimatedAmountInput = document.getElementById("estimated-amount");

if (fraudBtn && fraudInput) {
  fraudBtn.addEventListener("click", async () => {
    const text = fraudInput.value.trim();
    if (!text) {
      alert("Please provide claim description text.");
      return;
    }

    const claimed = claimedAmountInput?.value
      ? Number(claimedAmountInput.value)
      : null;
    const estimated = estimatedAmountInput?.value
      ? Number(estimatedAmountInput.value)
      : null;

    hide(fraudResult);
    show(fraudLoader);

    try {
      const data = await postJSON(`${API_BASE}/api/fraud-score`, {
        text,
        claimed_amount: claimed,
        estimated_amount: estimated,
      });

      const badgeClass =
        data.fraud_risk_level === "High"
          ? "danger"
          : data.fraud_risk_level === "Medium"
          ? "warning"
          : "success";

      fraudResult.innerHTML = `
        <div>
          <h3 style="margin-top:0;margin-bottom:6px;">
            Fraud Risk:
            <span class="badge-pill ${badgeClass}">
              ${data.fraud_risk_level}
            </span>
          </h3>
          <p style="margin:4px 0 6px;font-size:0.9rem;">
            Score: <strong>${data.fraud_score}</strong>
          </p>
          <p style="margin:6px 0 6px;">${data.explanation}</p>
          ${
            data.reasons?.length
              ? `<ul style="margin:6px 0 0 18px;font-size:0.85rem;">
                   ${data.reasons.map((r) => `<li>${r}</li>`).join("")}
                 </ul>`
              : ""
          }
        </div>
      `;

      hide(fraudLoader);
      show(fraudResult);
    } catch (err) {
      console.error(err);
      fraudResult.innerHTML = `<span style="color:#fca5a5;">Error: ${err.message}</span>`;
      hide(fraudLoader);
      show(fraudResult);
    }
  });
}

// ===================================================================
// 4️⃣ End-to-End Claim Intelligence Pipeline
// ===================================================================
const pipelineDropArea = document.getElementById("pipeline-drop-area");
const pipelineFileInput = document.getElementById("pipeline-file-input");
const pipelineText = document.getElementById("pipeline-text");
const pipelineClaimed = document.getElementById("pipeline-claimed");
const pipelineEstimated = document.getElementById("pipeline-estimated");
const pipelineBtn = document.getElementById("pipeline-btn");
const pipelineLoader = document.getElementById("pipeline-loader");

const pipelineResult = document.getElementById("pipeline-result");
const pipelineDoc = document.getElementById("pipeline-doc");
const pipelineNormalized = document.getElementById("pipeline-normalized");
const pipelineFraud = document.getElementById("pipeline-fraud");

let pipelineFile = null;

if (pipelineDropArea && pipelineFileInput) {
  ["dragenter", "dragover"].forEach((eventName) => {
    pipelineDropArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      pipelineDropArea.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    pipelineDropArea.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      pipelineDropArea.classList.remove("dragover");
    });
  });

  pipelineDropArea.addEventListener("click", () => pipelineFileInput.click());

  pipelineDropArea.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
      pipelineFile = file;
      pipelineDropArea.querySelector("p").textContent = `Selected: ${file.name}`;
    }
  });

  pipelineFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      pipelineFile = file;
      pipelineDropArea.querySelector("p").textContent = `Selected: ${file.name}`;
    }
  });
}

if (pipelineBtn) {
  pipelineBtn.addEventListener("click", async () => {
    if (!pipelineFile) {
      alert("Please upload a PDF first.");
      return;
    }

    const claimed = pipelineClaimed?.value
      ? Number(pipelineClaimed.value)
      : null;
    const estimated = pipelineEstimated?.value
      ? Number(pipelineEstimated.value)
      : null;
    const text = pipelineText?.value.trim() || null;

    hide(pipelineResult);
    show(pipelineLoader);

    // Reset pipeline cards
    if (pipelineDoc) {
      pipelineDoc.innerHTML = "<em>Classifying document...</em>";
    }
    if (pipelineNormalized) {
      pipelineNormalized.textContent = "Normalizing claim...";
    }
    if (pipelineFraud) {
      pipelineFraud.innerHTML = "<em>Scoring fraud risk...</em>";
    }

    try {
      const formData = new FormData();
      formData.append("file", pipelineFile);
      if (text) formData.append("claim_text", text);
      if (claimed != null) formData.append("claimed_amount", claimed);
      if (estimated != null) formData.append("estimated_amount", estimated);

      const data = await postForm(`${API_BASE}/api/pipeline-from-pdf`, formData);

      // Document classification
      const cls = data.document_classification;
      const confClass =
        cls.confidence >= 0.8 ? "success" :
        cls.confidence >= 0.5 ? "warning" : "danger";

      pipelineDoc.innerHTML = `
        <p style="margin:0 0 4px;font-size:0.95rem;">
          <strong>${cls.predicted_type_label}</strong>
          <span class="badge-pill ${confClass}" style="margin-left:6px;">
            ${(cls.confidence * 100).toFixed(0)}%
          </span>
        </p>
        <p style="margin:4px 0 6px;font-size:0.8rem;color:#9ca3af;">
          Type ID: <code>${cls.predicted_type}</code>
        </p>
        <p style="margin:6px 0 0;">${cls.reasoning}</p>
      `;

      // Normalized claim
      pipelineNormalized.textContent = JSON.stringify(
        data.normalized_claim,
        null,
        2
      );

      // Fraud insights
      const fr = data.fraud_insights;
      const badgeClass =
        fr.fraud_risk_level === "High"
          ? "danger"
          : fr.fraud_risk_level === "Medium"
          ? "warning"
          : "success";

      pipelineFraud.innerHTML = `
        <p style="margin:0 0 4px;">
          <strong>Fraud Risk:</strong>
          <span class="badge-pill ${badgeClass}" style="margin-left:6px;">
            ${fr.fraud_risk_level}
          </span>
        </p>
        <p style="margin:4px 0 6px;">Score: <strong>${fr.fraud_score}</strong></p>
        <p style="margin:4px 0 6px;">${fr.explanation}</p>
        ${
          fr.reasons?.length
            ? `<ul style="margin:6px 0 0 18px;font-size:0.85rem;">
                 ${fr.reasons.map((r) => `<li>${r}</li>`).join("")}
               </ul>`
            : ""
        }
      `;

      hide(pipelineLoader);
      show(pipelineResult);
    } catch (err) {
      console.error(err);
      hide(pipelineLoader);
      if (pipelineDoc) {
        pipelineDoc.innerHTML = `<span style="color:#fca5a5;">Error: ${err.message}</span>`;
      }
      if (pipelineNormalized) {
        pipelineNormalized.textContent = "";
      }
      if (pipelineFraud) {
        pipelineFraud.innerHTML = "";
      }
      show(pipelineResult);
    }
  });
}
