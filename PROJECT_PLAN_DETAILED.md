# T-FOMS (Telangana Forest Offense Management System) - Master Project Plan

This document details the blueprint for **T-FOMS**, a "Central Nervous System" for the Telangana Forest Department. The system is designed to digitize the entire lifecycle of a forest offense—from the moment a tree falls (Detection) to the moment a legal chargesheet is filed (Prosecution).

The core philosophy is **"Field-First, HQ-Verified"**. We empower the Beat Officer with a "Digital Lathi" (Mobile App) for instant reporting, while providing the DFO/Rangers with "The HQ" (Admin Portal) for command and control.

---

## 2. Detailed Functional Architecture

### 2.1 The "Digital Lathi" - Field Officer Mobile App (Android/CapacitorJs)

**Objective:** Enable 100% offline offense reporting with legal-grade evidence integrity.

#### A. Core Features & Use Cases

1. **Smart Login & Security**
   - _Feature:_ Biometric Authentication (Fingerprint/FaceID) + IMEI Binding.
   - _Use Case:_ Ensures only the assigned officer on their specific device can file a report. Prevents proxy reporting.
2. **Voice-to-Text AI (The "Sree-Lipi" Module)**
   - _Feature:_ Custom NLP Model trained on Forest/Legal terminology (e.g., "Teak", "Podu", "Sandra", "Section 20").
   - _Use Case:_ Officer speaks: _"Recorded 15 logs of Teak wood in Comp 12, approximate volume 2 CMT."_ -> App auto-fills: **Material: Teak**, **Quantity: 15 logs**, **Volume: 2 CMT**, **Location: Comp 12**.
3. **Geo-Fenced Evidence Vault**
   - _Feature:_ Camera-only restriction (no gallery upload) with embedded metadata (Lat/Long, Date/Time, Compass Direction).
   - _Edge Case Handling:_ If GPS accuracy > 20 meters, app warns user and requires multiple readings to average location.
4. **Offline "Store-and-Forward" Sync**
   - _Feature:_ Local SQLite database encrypts data. Background service polls for connectivity every 15 mins.
   - _Use Case:_ Officer files report in deep forest (No Signal). Report is saved as "Pending Sync". Officer drives to range office (4G available). App auto-uploads without user intervention.

### 2.2 "The HQ" - Command & Control Portal (React + Spring Boot)

**Objective:** Transform raw field data into actionable intelligence and legal documentation.

#### A. Core Features & Use Cases

1. **Kanban Case Management**
   - _Feature:_ Drag-and-drop workflow board. Columns: _New Report_ -> _In Verification_ -> _Seizure Confirmed_ -> _POR Generated_ -> _Chargesheet Filed_.
2. **Automated Legal Documentation**
   - _Feature:_ Template Engine for Form-A (POR), Seizure List (Panchanama), and Form-C (Chargesheet).
   - _Use Case:_ Instead of typing a 4-page chargesheet, the Ranger clicks "Generate". System pulls accused name, location, seized items, and sections of law into the official government PDF template.
3. **GIS Strategy Room**
   - _Feature:_ PostGIS-powered Heatmaps using OpenStreetMap/Bhuvan integration.
   - _Use Case:_ DFO sees a "Red Zone" forming in Sathupally North. Deploys extra night patrols to that specific beat.

---

## 3. Deep Dive: Digitizing the Core Processes

### Use Case 1: Digitizing the Preliminary Offense Report (POR)

_Current State:_ Manual writing of "Spot Mahazar" on paper, often illegible, delayed by days.
_Future State:_ Instant, Digital, Verified.

**Step-by-Step Workflow:**

1. **Incident Detection**: Beat Officer spots a stump of a cut tree.
2. **Initiate Report (App)**:
   - Opens "Digital Lathi" App.
   - Selects "New Offense".
3. **Evidence Collection (Mandatory Step)**:
   - App forces camera opening.
   - Officer takes photo of stump, surroundings, and offenders (if present).
   - System locks GPS coordinates.
4. **Data Enty (Voice Assisted)**:
   - _Voice Prompt:_ "Describe the offense."
   - _Officer:_ "Illegal felling of 2 Teak trees in Beat 4."
   - _System:_ Auto-selects "Offense Type: Illegal Felling", "Species: Teak".
5. **Accused Details**:
   - Scan Aadhar QR code (if available) or take photo of ID.
   - If accused has fled, mark as "Unknown".
6. **Submission**:
   - Click "File POR".
   - System generates a **Temporary POR ID** (e.g., TMP-2026-SAT-001).
   - Data stored locally if offline.
7. **Sync & Alert**:
   - Once online, data pushes to server.
   - **Range Officer** receives Push Notification: _"New Timber Offense in Beat 4 | Severity: High"_.

### Use Case 2: Digitizing the Chargesheet Process

_Current State:_ Manual compilation of evidence, often missing key details lead to acquittals.
_Future State:_ Automated assembly of "Iron-Clad" cases.

**Step-by-Step Workflow:**

1. **Verification (Admin Portal)**:
   - Range Officer opens the **Temporary POR**.
   - Reviews Photos vs Description.
   - **Action:** Edits "Estimated Value" based on current forest rates.
   - **Action:** Confirm "Section of Law" (e.g., TS Forest Act Section 20).
2. **Seizure Formalization**:
   - Range Officer inputs specific measurements of seized logs (Length x Girth).
   - System calculates Volume (Cubic Meters) using the "Quarter Girth Formula" automatically.
3. **POR Generation**:
   - Officer clicks **"Approve & Generate POR"**.
   - System generates the PDF, assigns a **Permanent Case ID** (e.g., POR-2026-0042).
   - Digital Signature affixed.
4. **Investigation & Witness Adding**:
   - Investigating Officer enters witness names and summaries of statements into the portal.
5. **Chargesheet Assembly**:
   - System pulls: POR Data + Seizure Details + Accused History + Witness Summaries.
   - Populates **Form-C (Chargesheet)**.
6. **Filing**:
   - Final PDF printed for Court Submission.
   - System status updates to _"Filed in Court - CC No: \_\_\_\_"_.

---

## 4. Workflows & Approvals Matrix

The system enforces a strict hierarchy to ensure accountability.

| Action                 | Initiator (Role)      | Approver (Role)                  | System Action                                                                     |
| :--------------------- | :-------------------- | :------------------------------- | :-------------------------------------------------------------------------------- |
| **New Offense Report** | Beat Officer          | System (Auto-Validate)           | Checks GPS constraints, saves media.                                              |
| **Delete Evidence**    | Range Officer         | DFO (District Forest Officer)    | **Evidence is immutable**. 'Deletion' flags record as 'Erroneous' but keeps logs. |
| **POR Approval**       | Section Officer       | Range Officer                    | Generates Official POR Number.                                                    |
| **Seizure Release**    | Range Officer         | DFO                              | High-risk action. Triggers SMS alert to DFO.                                      |
| **Final Chargesheet**  | Investigating Officer | Public Prosecutor (External)/DFO | Locks case file. No further edits allowed.                                        |

---

## 5. Communication & Notification Strategy

**Channel Strategy:**

- **High Priority (SMS + Push + WhatsApp):** Poaching, Assault on Staff, Large Scale Timber Smuggling.
- **Medium Priority (Push Notification):** Regular POR verification, Case status change.
- **Low Priority (Email/In-App Badge):** Weekly stats, Attendance.

**Notification Matrix:**

1. **The "Alert" (Immediate)**
   - _Trigger:_ Report filed with category "Poaching" or volume > 50 logs.
   - _Recipient:_ DFO, Flying Squad Team.
   - _Content:_ "⚠️ CRITICAL: Poaching activity reported in Strathupally North. Loc: [Link]. Team dispatch advised."

2. **The "Nudge" (Process Adherence)**
   - _Trigger:_ POR in "Draft" state for > 48 hours.
   - _Recipient:_ Range Officer.
   - _Content:_ "Action Required: 3 Pending Offense Reports in your range are awaiting verification."

3. **The "Citizen View" (Transparency - Optional Phase 2)**
   - _Trigger:_ Case Closed / Fine Paid.
   - _Recipient:_ Accused (via SMS).
   - _Content:_ "Your case POR-2026-42 has been compounded. Fine received: Rs. 5000. Receipt: [Link]"

---

## 6. Technical Stack & Implementation Details

To meet the Tender's "Enterprise Security" requirement:

- **Backend:** Java Spring Boot 3.2
  - _Why:_ Type safety, robustness, massive ecosystem for government integrations.
- **Database:** PostgreSQL 16 + PostGIS
  - _Why:_ The gold standard for open-source geospatial data.
- **AI Microservice:** python (FastAPI) + Whisper (OpenAI) / VOSK (Offline Model)
  - _Why:_ Python libraries for audio processing are superior.
  - _Integration:_ Spring Boot sends audio byte stream -> Python Service returns JSON Text -> Spring Boot populates DB.
- **Containerization:** Docker & Kubernetes
  - _Why:_ Deployment flexibility (On-Premise State Data Center or Cloud).

### 6.1 Data Sovereignty & Audit

- **Audit Table:** Shadow tables for every core table (Cases, Evidence). Tracks `who`, `when`, `what_changed` for every keystroke.
- **Chain of Custody:** Evidence media (Photos/Audio) are hashed (SHA-256) upon capture. Any verification checks the hash to ensure the file hasn't been altered.

---
