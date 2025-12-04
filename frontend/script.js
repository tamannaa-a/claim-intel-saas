const API_BASE = "http://localhost:8000";

// Helpers
function setToken(token, email, role) {
  localStorage.setItem("claimaxis_token", token);
  localStorage.setItem("claimaxis_email", email);
  localStorage.setItem("claimaxis_role", role);
}

function clearToken() {
  localStorage.removeItem("claimaxis_token");
  localStorage.removeItem("claimaxis_email");
  localStorage.removeItem("claimaxis_role");
}

function getToken() {
  return localStorage.getItem("claimaxis_token");
}

function getUserInfo() {
  return {
    email: localStorage.getItem("claimaxis_email"),
    role: localStorage.getItem("claimaxis_role"),
  };
}

async function postJSONAuth(url, data) {
  const token = getToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function postFormAuth(url, formData) {
  const token = getToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Detect page
if (document.getElementById("login-form")) {
  // Login page logic
  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const roleSelect = document.getElementById("login-role");
  const errorEl = document.getElementById("login-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    errorEl.textContent = "";

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Login failed");
      }
      const data = await res.json();
      // backend decides actual role; ignore dropdown except for UX
      setToken(data.access_token, data.email, data.role);
      window.location.href = "dashboard.html";
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove("hidden");
    }
  });
} else {
  // Dashboard page logic
  if (!getToken()) {
    window.location.href = "login.html";
  }

  // Fill user info
  const info = getUserInfo();
  const infoEl = document.getElementById("user-info");
  if (infoEl && info.email && info.role) {
    infoEl.innerHTML = `
      Logged in as <strong>${info.email}</strong><br />
      Role: <span>${info.role}</span>
    `;
  }

  // Logout
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        const token = getToken();
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {}
      clearToken();
      window.location.href = "login.html";
    });
  }

  // Sidebar tab switching
  const navTabs = document.querySelectorAll(".nav-tab");
  const tabPanels = document.querySelectorAll(".tab-panel");

  navTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      navTabs.forEach((b) => b.classList.remove("active"));
      tabPanels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(target).classList.add("active");
    });
  });

  function show(el) {
    if (el) el.classList.remove("hidden");
  }
  function hide(el) {
    if (el) el.classList.add("hidden");
  }

  // ----------------------------------------------------------
  // 1. Document Classifier
  // ----------------------------------------------------------
  const docDropArea = document.getElementById("doc-drop-area");
  const docFileInput = document.getElementById("doc-file-input");
  const docLoader = document.getElementById("doc-loader");
  const docResult = document.getElementById("doc-result");
  const docChart = document.getElementById("doc-chart");

  if (docDropArea && docFileInput) {
    ["dragenter", "dragover"].forEach((eventName) => {
      docDropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        docDropArea.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      docDropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        docDropArea.classList.remove("dragover");
      });
    });

    docDropArea.addEventListener("click", () => docFileInput.click());

    docDropArea.addEventListener("drop", async (e) => {
      const file = e.dataTransfer.files[0];
      if (file) await handleDocumentUpload(file);
    });

    docFileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) await handleDocumentUpload(file);
    });
  }

  async function handleDocumentUpload(file) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please upload a PDF file.");
      return;
    }

    docResult.innerHTML = "";
    hide(docResult);
    show(docLoader);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const data = await postFormAuth(`${API_BASE}/api/classify-document`, formData);

      const confidence = data.confidence || 0;
      const confPct = Math.round(confidence * 100);
      const qualityFlags = data.quality_flags || [];
      let healthScore = Math.round(confidence * 100 - qualityFlags.length * 10);
      if (healthScore < 0) healthScore = 0;
      if (healthScore > 100) healthScore = 100;

      const badgeClass =
        confidence >= 0.8 ? "success" : confidence >= 0.5 ? "warning" : "danger";

      const routing = getRoutingSuggestion(data.predicted_type);

      docResult.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
          <div>
            <div style="font-size:0.9rem;">Detected Type</div>
            <div style="font-size:1rem;font-weight:600;margin-top:2px;">
              ${data.predicted_type_label}
            </div>
            <div style="font-size:0.8rem;color:#9ca3af;margin-top:2px;">
              Type ID: <code>${data.predicted_type}</code>
            </div>
          </div>
          <div style="text-align:right;">
            <span class="badge-pill ${badgeClass}">
              Confidence ${confPct}%
            </span>
            <div style="font-size:0.8rem;color:#9ca3af;margin-top:4px;">
              Document health: <strong>${healthScore}/100</strong>
            </div>
          </div>
        </div>

        <div style="margin-top:10px;font-size:0.88rem;">
          ${data.reasoning}
        </div>

        ${
          data.matched_keywords?.length
            ? `<div style="margin-top:8px;font-size:0.82rem;">
                 Matched keywords:
                 <code>${data.matched_keywords.join(", ")}</code>
               </div>`
            : ""
        }

        ${
          qualityFlags.length
            ? `<ul style="margin-top:8px;margin-left:18px;font-size:0.82rem;color:#fecaca;">
                 ${qualityFlags.map((f) => `<li>${f}</li>`).join("")}
               </ul>`
            : ""
        }

        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #111827;font-size:0.85rem;">
          <strong>Routing suggestion:</strong> ${routing.team}<br/>
          <span style="color:#9ca3af;">${routing.reason}</span>
        </div>
      `;

      // chart
      if (docChart) {
        docChart.src = `${API_BASE}/api/chart/document?confidence=${confidence}&health=${healthScore}&matched=${data.matched_keywords.length}`;
      }

      hide(docLoader);
      show(docResult);
    } catch (err) {
      console.error(err);
      docResult.innerHTML = `<span style="color:#fecaca;">Error: ${err.message}</span>`;
      hide(docLoader);
      show(docResult);
    }
  }

  function getRoutingSuggestion(predictedType) {
    switch (predictedType) {
      case "invoice":
        return {
          team: "Finance and Payments Queue",
          reason: "Invoice detected, route for cost validation and payment processing.",
        };
      case "inspection_report":
        return {
          team: "Surveyor and Assessment Queue",
          reason: "Inspection report detected, route for assessment review and case updates.",
        };
      case "claim_form":
        return {
          team: "FNOL and Claims Registration",
          reason: "Claim form detected, route for new claim creation or update.",
        };
      case "repair_estimate":
        return {
          team: "Garage and Repair Approval",
          reason: "Repair estimate detected, route for repair approval and comparison.",
        };
      default:
        return {
          team: "General Document Review",
          reason: "Unclear document type, route for manual triage.",
        };
    }
  }

  // ----------------------------------------------------------
  // 2. Claims Normalizer
  // ----------------------------------------------------------
  const normalizeInput = document.getElementById("normalize-input");
  const normalizeBtn = document.getElementById("normalize-btn");
  const normalizeLoader = document.getElementById("normalize-loader");
  const normalizeResult = document.getElementById("normalize-result");
  const normalizeChart = document.getElementById("normalize-chart");

  if (normalizeBtn) {
    normalizeBtn.addEventListener("click", async () => {
      const text = (normalizeInput.value || "").trim();
      if (!text) {
        alert("Please paste claim notes first.");
        return;
      }

      hide(normalizeResult);
      show(normalizeLoader);

      try {
        const data = await postJSONAuth(`${API_BASE}/api/normalize-claim`, { text });
        normalizeResult.textContent = JSON.stringify(data, null, 2);

        if (normalizeChart && data.severity) {
          normalizeChart.src = `${API_BASE}/api/chart/normalize?severity=${encodeURIComponent(
            data.severity
          )}`;
        }

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

  // ----------------------------------------------------------
  // 3. Fraud Detector
  // ----------------------------------------------------------
  const fraudInput = document.getElementById("fraud-input");
  const fraudBtn = document.getElementById("fraud-btn");
  const fraudLoader = document.getElementById("fraud-loader");
  const fraudResult = document.getElementById("fraud-result");
  const claimedAmountInput = document.getElementById("claimed-amount");
  const estimatedAmountInput = document.getElementById("estimated-amount");
  const fraudChart = document.getElementById("fraud-chart");

  if (fraudBtn) {
    fraudBtn.addEventListener("click", async () => {
      const text = (fraudInput.value || "").trim();
      if (!text) {
        alert("Please describe the claim scenario first.");
        return;
      }

      const claimed = claimedAmountInput.value
        ? Number(claimedAmountInput.value)
        : null;
      const estimated = estimatedAmountInput.value
        ? Number(estimatedAmountInput.value)
        : null;

      hide(fraudResult);
      show(fraudLoader);

      try {
        const data = await postJSONAuth(`${API_BASE}/api/fraud-score`, {
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
          <h4 style="margin-top:0;margin-bottom:6px;">
            Fraud Risk:
            <span class="badge-pill ${badgeClass}">${data.fraud_risk_level}</span>
          </h4>
          <p style="margin:4px 0 6px;">Score: <strong>${data.fraud_score}</strong></p>
          <p style="margin:6px 0 6px;">${data.explanation}</p>
          ${
            data.reasons?.length
              ? `<ul style="margin:6px 0 0 18px;font-size:0.84rem;">
                   ${data.reasons.map((r) => `<li>${r}</li>`).join("")}
                 </ul>`
              : ""
          }
        `;

        if (fraudChart) {
          fraudChart.src = `${API_BASE}/api/chart/fraud?level=${encodeURIComponent(
            data.fraud_risk_level
          )}&score=${data.fraud_score}`;
        }

        hide(fraudLoader);
        show(fraudResult);
      } catch (err) {
        console.error(err);
        fraudResult.innerHTML = `<span style="color:#fecaca;">Error: ${err.message}</span>`;
        hide(fraudLoader);
        show(fraudResult);
      }
    });
  }

  // ----------------------------------------------------------
  // 4. Intelligence Pipeline
  // ----------------------------------------------------------
  const pipelineDropArea = document.getElementById("pipeline-drop-area");
  const pipelineFileInput = document.getElementById("pipeline-file-input");
  const pipelineText = document.getElementById("pipeline-text");
  const pipelineClaimed = document.getElementById("pipeline-claimed");
  const pipelineEstimated = document.getElementById("pipeline-estimated");
  const pipelineBtn = document.getElementById("pipeline-btn");
  const pipelineLoader = document.getElementById("pipeline-loader");
  const pipelineDoc = document.getElementById("pipeline-doc");
  const pipelineNormalized = document.getElementById("pipeline-normalized");
  const pipelineFraud = document.getElementById("pipeline-fraud");
  const pipelineDocChart = document.getElementById("pipeline-doc-chart");
  const pipelineNormalizeChart = document.getElementById("pipeline-normalize-chart");
  const pipelineFraudChart = document.getElementById("pipeline-fraud-chart");

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

      const claimed = pipelineClaimed.value
        ? Number(pipelineClaimed.value)
        : null;
      const estimated = pipelineEstimated.value
        ? Number(pipelineEstimated.value)
        : null;
      const extraText = (pipelineText.value || "").trim() || null;

      pipelineDoc.innerHTML = `<span class="placeholder-text">Classifying document...</span>`;
      pipelineNormalized.textContent = "Normalizing claim...";
      pipelineFraud.innerHTML = `<span class="placeholder-text">Scoring fraud risk...</span>`;

      show(pipelineLoader);

      try {
        const formData = new FormData();
        formData.append("file", pipelineFile);
        if (extraText) formData.append("claim_text", extraText);
        if (claimed != null) formData.append("claimed_amount", claimed);
        if (estimated != null) formData.append("estimated_amount", estimated);

        const data = await postFormAuth(`${API_BASE}/api/pipeline-from-pdf`, formData);

        const cls = data.document_classification;
        const conf = cls.confidence || 0;
        const confClass =
          conf >= 0.8 ? "success" : conf >= 0.5 ? "warning" : "danger";

        pipelineDoc.innerHTML = `
          <p style="margin:0 0 4px;">
            <strong>${cls.predicted_type_label}</strong>
            <span class="badge-pill ${confClass}" style="margin-left:6px;">
              ${(conf * 100).toFixed(0)}%
            </span>
          </p>
          <p style="margin:4px 0 6px;font-size:0.8rem;color:#9ca3af;">
            Type ID: <code>${cls.predicted_type}</code>
          </p>
          <p style="margin:6px 0 0;font-size:0.86rem;">
            ${cls.reasoning}
          </p>
        `;

        pipelineNormalized.textContent = JSON.stringify(
          data.normalized_claim,
          null,
          2
        );

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
              ? `<ul style="margin:6px 0 0 18px;font-size:0.84rem;">
                   ${fr.reasons.map((r) => `<li>${r}</li>`).join("")}
                 </ul>`
              : ""
          }
        `;

        // charts for pipeline
        if (pipelineDocChart) {
          pipelineDocChart.src = `${API_BASE}/api/chart/document?confidence=${conf}&health=${Math.round(
            conf * 100
          )}&matched=${cls.matched_keywords?.length || 0}`;
        }
        const sev = data.normalized_claim.severity || "Medium";
        if (pipelineNormalizeChart) {
          pipelineNormalizeChart.src = `${API_BASE}/api/chart/normalize?severity=${encodeURIComponent(
            sev
          )}`;
        }
        if (pipelineFraudChart) {
          pipelineFraudChart.src = `${API_BASE}/api/chart/fraud?level=${encodeURIComponent(
            fr.fraud_risk_level
          )}&score=${fr.fraud_score}`;
        }

        hide(pipelineLoader);
      } catch (err) {
        console.error(err);
        pipelineDoc.innerHTML = `<span style="color:#fecaca;">Error: ${err.message}</span>`;
        pipelineNormalized.textContent = "";
        pipelineFraud.innerHTML = "";
        hide(pipelineLoader);
      }
    });
  }
}
