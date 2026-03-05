# Sri Chakra Supplier Management Program (SSMP) - Development Plan

## Project Overview

**Objective:** Develop a robust Supplier Management Program (SSMP) ecosystem comprising a Supplier Web App, Field Officer Android App, Admin Portal, and WhatsApp Integration ("Vawa").
**Technology Strategy:**

- **Web App (SSMP):** Next.js/React for Supplier (Lightweight) and Admin portals.
- **Mobile App:** **CapacitorJS** wrapper for Field Officer Android App.
- **Backend:** Java Spring Boot with **ERPNext Integration**.
- **Communication:** WhatsApp Business API (Meta) for notifications and enquiries.
  **Team:** 3 Developers + 1 QA Engineer.
  **Key Deadline:** Core MVP by Week 4, Logistics Feature Live by Week 6.

---

## Team Roles & Responsibilities

| Role                      | Member    | Key Responsibilities                                                                                     | Tech Focus                                      |
| :------------------------ | :-------- | :------------------------------------------------------------------------------------------------------- | :---------------------------------------------- |
| **Backend & Architect**   | **Dev 1** | System Architecture, Database, ERPNext Sync (PO, Ledger), WhatsApp API (Vawa), GST/Aadhaar Integrations. | Java Spring Boot, PostgreSQL, ERPNext API.      |
| **Mobile App Lead**       | **Dev 2** | Field Officer App (Onboarding, PR Generation, Offline Sync), Native Plugins (Camera, Location).          | **CapacitorJS**, React/Next.js, Android Studio. |
| **Web Lead (Full Stack)** | **Dev 3** | Supplier Web Portal (Lightweight), Admin Portal (Rate Cards, Audits, SIP), Security Gate QR support.     | React / Next.js, Tailwind CSS.                  |
| **Quality Assurance**     | **QA 1**  | Test Planning, Functional & API Testing, Multi-lingual Validation, UAT Coordination.                     | Postman, Appium/Selenium, JIRA.                 |

---

## Weekly Development Schedules

### Week 1: Foundation, Onboarding & Compliance

**Goal:** Secure Supplier Onboarding with Consent and Master Data Setup.

| **Role**                                                                                                       | **Tasks**                                                                            |
| :------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| **Dev 1 (Backend)**                                                                                            | •**Auth & Consent:** OTP-based Login + Aadhaar-based OTP Signature for Consent Form. |
| •**Verifications:** Integrate GST Verification API (ClearTax/Masters India) & Phone/Email validation.          |                                                                                      |
| •**WhatsApp Setup:** Meta Business API Config, Webhooks for Incoming Messages.                                 |                                                                                      |
| •**Master Data:** APIs for Product Categories, Areas, and PlasticWala Price inputs.                            |                                                                                      |
| **Dev 2 (Mobile)**                                                                                             | •**App Setup:** Next.js + CapacitorJS, Permissions (Camera, Location).               |
| •**Onboarding Flow:** Capture Supplier Details, KYC Uploads.                                                   |                                                                                      |
| •**Field Officer Declaration:** Interface for Officer to declare data accuracy.                                |                                                                                      |
| •**Multilingual Support:** Setup frameworks (i18n) for Local Languages (Te, Ta, Kn, Hi).                       |                                                                                      |
| **Dev 3 (Web)**                                                                                                | •**Admin Portal:** Dashboard setup.                                                  |
| •**Rate Card Mgmt:** UI for Daily Rate Inputs (Area/Product category wise) + Manual "PlasticWala" Price Input. |                                                                                      |
| •**Supplier Portal:** Lightweight "Magic Link" access structure.                                               |                                                                                      |
| •**Design System:** Implement shared UI components.                                                            |                                                                                      |
| **QA 1 (Quality)**                                                                                             | •**Planning:** Master Test Plan based on BRS.                                        |
| •**Test Cases:** Focus on Aadhaar OTP flow, GST verification logic, and Onboarding Form validations.           |                                                                                      |

### Week 2: Dynamic Pricing, Quotes & WhatsApp Engagement

**Goal:** Rate Cards, Quote Negotiation, and Daily WhatsApp Interactions.

| **Role**                                                                                                                       | **Tasks**                                                                           |
| :----------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| **Dev 1 (Backend)**                                                                                                            | •**Rate Logic:** Base Rate + Supplier Specific Markup/Markdown (+/- Rs).            |
| •**WhatsApp Logic:** Daily Greeting Trigger -> Options: "Navigate to Portal", "Let's Meet" (Task Creation), "Change Language". |                                                                                     |
| •**Task System:** Logic to assign "Let's Meet" tasks to Field Officers.                                                        |                                                                                     |
| •**Audit Calendar:** Backend for assigning Audits/Surveys.                                                                     |                                                                                     |
| **Dev 2 (Mobile)**                                                                                                             | •**Quote Response:** Field Officer view to see/negotiate Supplier Quotes.           |
| •**PR Generation:** Logic to create Purchase Request (PR) from finalized Quote.                                                |                                                                                     |
| •**Supplier Evaluation:** Questionnaire Screen (Owner + Employee) -> Trigger SIP.                                              |                                                                                     |
| **Dev 3 (Web)**                                                                                                                | •**Supplier Portal:** View Dynamic Rate Card, "Share Quote" (Rate + Qty) interface. |
| •**Admin View:** Supplier Audit Calendar & Assigning Audits (prevent self-assignment).                                         |                                                                                     |
| •**Admin View:** Reassign Request interface (Task reassignment).                                                               |                                                                                     |
| **QA 1 (Quality)**                                                                                                             | •**Functional Test:** Verify Dynamic Pricing logic (Base + Markup).                 |
| •**Integration Test:** WhatsApp "Let's Meet" task creation flow.                                                               |                                                                                     |
| •**Language Test:** Verify WhatsApp messages delivered in Supplier's opted language.                                           |                                                                                     |

### Week 3: Transaction Execution (ERP) & Basic Workflows

**Goal:** PR->PO Flow, ERP Sync, and Core Transaction Views.

| **Role**                                                                                        | **Tasks**                                                                      |
| :---------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **Dev 1 (Backend)**                                                                             | •**ERP Integration:** PR in SSMP -> PO in ERPNext API.                         |
| •**PO Sync:** Fetch Approved PO -> Send to Supplier (WhatsApp/Email) & Sync to SSMP.            |                                                                                |
| •**Data Sync:** Pull Ledger, QC Reports, Debit Notes from ERPNext.                              |                                                                                |
| **Dev 2 (Mobile)**                                                                              | •**Enquiry Closure:** Interface for Field Officers to resolve/close enquiries. |
| •**Offline Sync:** Ensure essential data (Rate Cards, forms) works offline.                     |                                                                                |
| •**DataView:** View basic Supplier transaction history on mobile.                               |                                                                                |
| **Dev 3 (Web)**                                                                                 | •**Transaction History:** View POs, Invoices, Date Range filters.              |
| •**Enquiries:** "Raise Enquiry" with Time-bound logic (e.g., 1 week window for QC/Debit Notes). |                                                                                |
| •**Download:** PDF generation/download for POs and Reports.                                     |                                                                                |
| **QA 1 (Quality)**                                                                              | •**E2E Testing:** Quote -> PR -> ERP PO -> Approved PO -> Notification.        |
| •**ERP Validation:** Checks for Ledger/QC Report accuracy and sync latency.                     |                                                                                |

### Week 4: SIP, Optimization & Core MVP Launch

**Goal:** Supplier Improvement Plans, internal escalations, and Initial Deployment.

| **Role**                                                             | **Tasks**                                                                                    |
| :------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| **Dev 1 (Backend)**                                                  | •**SIP Logic:** Auto-generate Supplier Improvement Plan (SIP) based on Evaluation scores.    |
| •**Security:** Audit Aadhaar Consent logs & Data Privacy Compliance. |                                                                                              |
| •**Deployment:** AWS/GCP Setup (Free Tier initially), Domain & SSL.  |                                                                                              |
| •**Optimization:** Database indexing and API response tuning.        |                                                                                              |
| **Dev 2 (Mobile)**                                                   | •**Escalation:** Internal escalation mechanism for Field Officers.                           |
| •**Polish:** UI/UX refinements, Animations, Error States.            |                                                                                              |
| •**Release:** App Bundle generation for Play Store/Distribution.     |                                                                                              |
| **Dev 3 (Web)**                                                      | •**SIP Monitoring:** Dashboard to track SIP status & Training closures (Photo/Video proofs). |
| •**Analytics:** Basic event tracking.                                |                                                                                              |
| •**Polish:** Cross-browser testing and responsive design tweaks.     |                                                                                              |
| **QA 1 (Quality)**                                                   | •**UAT:** Support Business Team with UAT scenarios (Onboarding, Basic Transactions).         |
| •**Security Scan:** Vulnerability assessment (SQLi, XSS).            |                                                                                              |
| •**MVP Sign-off:** Go/No-Go Report for Core Features.                |                                                                                              |

### Week 5: Logistics & Security Integration

**Goal:** Shipment Tracking, Document Verification, and QR Code Gate Entry.

| **Role**                                                                                                              | **Tasks**                                                                                        |
| :-------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| **Dev 1 (Backend)**                                                                                                   | •**Shipment Logic:** Generate Secure QR Code upon Document Upload.                               |
| •**Security Gate API:** Endpoint to validate QR Code and return Shipment details (Driver, Material, Vehicle).         |                                                                                                  |
| •**Traceability:** Link Document Uploads to PO and Supplier ID.                                                       |                                                                                                  |
| **Dev 2 (Mobile)**                                                                                                    | •**Track Shipments:** View Shipment Status and Location details.                                 |
| •**Driver details:** Capture Driver Name/Vehicle Number during shipment initiation.                                   |                                                                                                  |
| •**Push Notifications:** Alert Field Officer on Shipment Departure.                                                   |                                                                                                  |
| **Dev 3 (Web)**                                                                                                       | •**Supplier Portal:** **Document Upload** Interface (Eway Bill, Invoice, LR) -> **Get QR Code**. |
| •**Security View:** Dedicated simple interface for Security Guards to **Scan/Verify QR Code** and mark vehicle Entry. |                                                                                                  |
| •**Shipment Dashboard:** Admin view of incoming shipments.                                                            |                                                                                                  |
| **QA 1 (Quality)**                                                                                                    | •**QR Testing:** Validate Document Upload -> QR Generation -> Scan verification.                 |
| •**Field Test:** Logistics flow testing with actual mobile devices.                                                   |                                                                                                  |

### Week 6: Payments & Advanced Integrations

**Goal:** CSB Bank Payments and Final System Polish.

| **Role**                                                                          | **Tasks**                                                                                  |
| :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------- |
| **Dev 1 (Backend)**                                                               | •**Payment Integration:** Integrate **CSB Bank Native APIs** for seamless vendor payments. |
| •**Payment Status Sync:** Webhooks/Polling for payment success/failure from Bank. |                                                                                            |
| •**Scaling:** Load testing infrastructure for higher transaction volume.          |                                                                                            |
| **Dev 2 (Mobile)**                                                                | •**Payment Status:** View Payment History/Status alongside Orders.                         |
| •**Final Polish:** Advanced caching for offline implementation.                   |                                                                                            |
| •**Feedbacks:** Implement feedback from Week 4 MVP launch.                        |                                                                                            |
| **Dev 3 (Web)**                                                                   | •**Finance Dashboard:** Admin view of Pending vs Completed Payments.                       |
| •**Supplier Payment View:** Detailed breakdown of payments received vs Invoices.  |                                                                                            |
| •**Final Regression:** Full system regression testing.                            |                                                                                            |
| **QA 1 (Quality)**                                                                | •**Payment Testing:** Sandbox testing of CSB API flows (Success, Failure, Refund).         |
| •**Final UAT:** Full system acceptance including Logistics and Finance modules.   |                                                                                            |
| •**Final Release:** Production rollout of full-featured ecosystem.                |                                                                                            |

---

## Required API Access & Credentials

To ensure the project starts on time, we request the following access and credentials from the Sri Chakra team:

### 1. WhatsApp Business API (Meta)

- **Status:** Pending
- **Requirements:** Meta Business Manager Admin Access, Clean Phone Number, Payment Method (Credit Card).

### 2. ERPNext Access (QA Environment)

- **Status:** Pending (Vendor availability)
- **Requirements:**
  - **Instance URL:** QA Environment.
  - **API User:** System User with Read/Write access to _Supplier, Item, Purchase Order, Purchase Request, Quality Inspection, Payment Entry_.
  - **API Key & Secret**.

### 3. GST Verification

- **Provider:** ClearTax, Masters India, or similar.
- **Requirements:** API Subscription/Credentials (or decision to use Manual Verification initially).

### 4. Aadhaar Verification / E-Sign

- **Provider:** Digio, Zoop, or SurePass.
- **Requirements:** API Credentials for OTP-based Consent Signing.

### 5. Payment Gateway (Week 6)

- **Provider:** **CSB Bank Native API**.
- **Requirements:** API Credentials / Test Account.

### 6. Cloud Infrastructure

- **Provider:** AWS or Google Cloud (Free Tier initially).
- **Requirements:** Account Access to host Backend, DB (PostgreSQL), and Object Storage (S3/GCS for Documents/Images).

---

## Deliverables Checklist

### 1. Supplier Web App (SSMP Portal)

- [ ] Multilingual Interface (Te, Ta, Kn, Hi)
- [ ] Onboarding (Consent, KYC, GST)
- [ ] Dynamic Rate Card View & Quote Sharing
- [ ] Document Upload (Eway, Invoice) -> QR Code Generation (Week 5)
- [ ] Transaction History, Ledger, QC Reports
- [ ] Time-bound Enquiry Raising

### 2. Field Officer App (Android - CapacitorJS)

- [ ] Supplier Onboarding & Declaration
- [ ] Supplier Evaluation & SIP Generation
- [ ] Quote Negotiation & PR Generation
- [ ] Track Shipments & Enquiry Resolution
- [ ] Internal Escalation

### 3. Admin Portal

- [ ] Daily Rate Card & PlasticWala Price Management
- [ ] Supplier Audit Calendar & Assignment
- [ ] SIP Monitoring Dashboard
- [ ] Logistics & Security Dashboard (Week 5)
- [ ] Payment & Finance Dashboard (Week 6)

### 4. Integration & Backend

- [ ] WhatsApp Bot (Greetings, Navigation, Language Change)
- [ ] ERPNext 2-Way Sync (PR->PO, Finance Data)
- [ ] Secure QR Code Validator (Week 5)
- [ ] CSB Bank Payment Integration (Week 6)

### 5. Quality Assurance

- [ ] Master Test Plan & Test Cases
- [ ] UAT Sign-off
