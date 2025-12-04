// frontend/script.js
const API_BASE = "http://localhost:8000";

// Tab switching
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

// Helpers
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

// --------------------- Document Classification Agent ---------------------- //

const dropArea = document.getElementById("drop-area");
const docFileInput = document.getElementById("doc-file-input");
const docResult = document.getElementById("doc-result");

if (dropArea) {
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
  docResult.classList.remove("hidden");
  docResult.innerHTML = `<em>Analyzing <strong>${file.name}</strong>...</em>`;

  try {
    const formData = new FormData();
    formData.append("file", file);
    const data = await postForm(`${API_BASE}/api/classify-document`, formData);

    const riskBadgeClass =
      data.confidence >= 0.8 ? "success" :
      data.confidence >= 0.5 ? "warning" : "danger";

    docResult.innerHTML = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <h3 style="margin:0;">${data.predicted_type_label}</h3>
          <span class="badge-pill ${riskBadgeClass}">
            Confidence: ${(data.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <p style="margin:4px 0 6px;color:#9ca3af;font-size:0.85rem;">
          Type ID: <code>${data.predicted_type}</code>
        </p>
        <p style="margin:6px 0 6px;">${data.reasoning}</p>
        ${
          data.matched_keywords?.length
            ? `<p style="margin:6px 0 6px;font-size:0.85rem;">
                Matched keywords: <code>${data.matched_keywords.join(", ")}</code>
              </p>`
            : ""
        }
        ${
          data.quality_flags?.length
            ? `<ul style="margin:6px 0 0 16px;font-size:0.85rem;color:#f97373;">
                 ${data.quality_flags.map((f) => `<li>${f}</li>`).join("")}
               </ul>`
            : ""
        }
      </div>
    `;
  } catch (err) {
    console.error(err);
    docResult.innerHTML = `<span style="color:#fecaca;">Error: ${err.message}</span>`;
  }
}

// --------------------- Claims Description Normalizer ---------------------- //

const normalizeInput = document.getElementById("normalize-input");
const normalizeBtn = document.getElementById("normalize-btn");
const normalizeResult = document.getElementById("normalize-result");

if (normalizeBtn) {
  normalizeBtn.addEventListener("click", async () => {
    const text = normalizeInput.value.trim();
    if (!text) {
      alert("Please paste claim notes first.");
      return;
    }
    normalizeResult.classList.remove("hidden");
    normalizeResult.textContent = "Normalizing claim description...";

    try {
      const data = await postJSON(`${API_BASE}/api/normalize-claim`, { text });
      normalizeResult.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      console.error(err);
      normalizeResult.textContent = `Error: ${err.message}`;
    }
  });
}

// --------------------- Fraud Detection Copilot --------------------------- //

const fraudInput = document.getElementById("fraud-input");
const fraudBtn = document.getElementById("fraud-btn");
const fraudResult = document.getElementById("fraud-result");
const claimedAmountInput = document.getElementById("claimed-amount");
const estimatedAmountInput = document.getElementById("estimated-amount");

if (fraudBtn) {
  fraudBtn.addEventListener("click", async () => {
    const text = fraudInput.value.trim();
    if (!text) {
      alert("Please provide claim description text.");
      return;
    }

    const claimed = claimedAmountInput.value ? Number(claimedAmountInput.value) : null;
    const estimated = estimatedAmountInput.value ? Number(estimatedAmountInput.value) : null;

    fraudResult.classList.remove("hidden");
    fraudResult.innerHTML = "<em>Scoring fraud risk...</em>";

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
          <h3 style="margin-top:0;">
            Fraud Risk: <span class="badge-pill ${badgeClass}">${data.fraud_risk_level}</span>
          </h3>
          <p style="margin:4px 0 6px;">Score: <strong>${data.fraud_score}</strong></p>
          <p style="margin:6px 0 6px;">${data.explanation}</p>
          ${
            data.reasons?.length
              ? `<ul style="margin:6px 0 0 16px;font-size:0.85rem;">
                   ${data.reasons.map((r) => `<li>${r}</li>`).join("")}
                 </ul>`
              : ""
          }
        </div>
      `;
    } catch (err) {
      console.error(err);
      fraudResult.innerHTML = `<span style="color:#fecaca;">Error: ${err.message}</span>`;
    }
  });
}

// --------------------- End-to-End Pipeline ------------------------------- //

const pipelineDropArea = document.getElementById("pipeline-drop-area");
const pipelineFileInput = document.getElementById("pipeline-file-input");
const pipelineText = document.getElementById("pipeline-text");
const pipelineClaimed = document.getElementById("pipeline-claimed");
const pipelineEstimated = document.getElementById("pipeline-estimated");
const pipelineBtn = document.getElementById("pipeline-btn");
const pipelineResult = document.getElementById("pipeline-result");
const pipelineDoc = document.getElementById("pipeline-doc");
const pipelineNormalized = document.getElementById("pipeline-normalized");
const pipelineFraud = document.getElementById("pipeline-fraud");

let pipelineFile = null;

if (pipelineDropArea) {
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

    const claimed = pipelineClaimed.value ? Number(pipelineClaimed.value) : null;
    const estimated = pipelineEstimated.value ? Number(pipelineEstimated.value) : null;
    const text = pipelineText.value.trim() || null;

    pipelineResult.classList.remove("hidden");
    pipelineDoc.innerHTML = "<em>Processing document...</em>";
    pipelineNormalized.textContent = "Normalizing claim...";
    pipelineFraud.innerHTML = "<em>Scoring fraud risk...</em>";

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
        <p style="margin:0 0 4px;">
          <strong>${cls.predicted_type_label}</strong>
          <span class="badge-pill ${confClass}" style="margin-left:4px;">
            ${(cls.confidence * 100).toFixed(0)}%
          </span>
        </p>
        <p style="margin:4px 0 6px;font-size:0.85rem;">
          Type ID: <code>${cls.predicted_type}</code>
        </p>
        <p style="margin:4px 0 6px;">${cls.reasoning}</p>
      `;

      // Normalized claim
      pipelineNormalized.textContent = JSON.stringify(data.normalized_claim, null, 2);

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
          <span class="badge-pill ${badgeClass}" style="margin-left:4px;">
            ${fr.fraud_risk_level}
          </span>
        </p>
        <p style="margin:4px 0 6px;">Score: <strong>${fr.fraud_score}</strong></p>
        <p style="margin:4px 0 6px;">${fr.explanation}</p>
        ${
          fr.reasons?.length
            ? `<ul style="margin:6px 0 0 16px;font-size:0.85rem;">
                 ${fr.reasons.map((r) => `<li>${r}</li>`).join("")}
               </ul>`
            : ""
        }
      `;
    } catch (err) {
      console.error(err);
      pipelineDoc.innerHTML = `<span style="color:#fecaca;">Error: ${err.message}</span>`;
      pipelineNormalized.textContent = "";
      pipelineFraud.innerHTML = "";
    }
  });
}
