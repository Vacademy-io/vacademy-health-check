# Field Officer Mobile App - Detailed Product Plan

## 1. Product Overview & Vision

The Field Officer Mobile App is an internal Android application designed for Sri Chakra's procurement and field teams. It serves as the primary tool for on-the-ground supplier engagement, enabling field officers to onboard new suppliers, conduct facility evaluations, negotiate rates, and resolve operational queries. The vision is to empower the field team with a digital-first, paperless workflow that seamlessly syncs with the SSMP (Sri Chakra Supplier Management Program) backend and ERPNext, ensuring real-time visibility and compliance.

## 2. Target Audience & Persona

- **Primary Persona:** **Field Officer / Procurement Executive**
  - **Behavior:** Constantly on the move, visiting supplier facilities (scrap yards, aggregation centers). Relies on mobile devices for data entry and communication.
  - **Needs:** Fast and intuitive data collection forms, clear visibility of daily tasks and scheduled visits, ability to quickly approve quotes and generate Purchase Requests (PRs), and a straightforward way to resolve assigned supplier queries.
  - **Constraints:** Needs the app to be highly responsive. Operates in environments where rapid data entry (e.g., photos, digital signatures) is essential.

## 3. Core Product Workflows

### 3.1. Supplier Onboarding & Evaluation

1. **Initial Visit & Data Capture:** The officer visits a prospective supplier and initiates the onboarding process, capturing basic KYC details (Business Name, Phone, GST, Bank Details).
2. **Consent & Verification:** The officer facilitates the digital consent process, ensuring the supplier agrees to terms (IT Act compliant) via Aadhaar-based OTP or digital scratchpad signature.
3. **The 28-Question Evaluation:** The officer conducts a comprehensive facility assessment using a dynamic, admin-configured questionnaire, uploading required site photos and documents directly from the device camera.

### 3.2. Supplier Improvement Plan (SIP) Management

1. **Plan Generation:** Based on the evaluation results, an SIP may be automatically generated or manually proposed.
2. **Review & Sign-off:** The officer reviews the localized SIP with the supplier on-site. Both parties digitally sign off on the agreed-upon improvement milestones.
3. **Progress Tracking:** The officer tracks the supplier's progress on these milestones over subsequent visits, updating the status in the app.

### 3.3. Daily Procurement & Transaction Approvals

1. **Quote Review:** Field officers receive real-time notifications of quotes submitted by their mapped suppliers (rate + quantity).
2. **Negotiation/Action:** The officer can accept, reject, or counter the quote.
3. **PR Generation:** Upon quote acceptance, the app automatically triggers the creation of a Purchase Request (PR) in the backend, which syncs to ERPNext for PO generation.

### 3.4. Query Resolution & Helpdesk Tasks

1. **Task Assignment:** When a supplier raises a dispute (e.g., regarding a QC report or Debit Note) via the web app/WhatsApp, a task is created and assigned to the respective Field Officer.
2. **Investigation & Commenting:** The officer reviews the query details, investigates internally, and communicates with the supplier via a chat-like interface or comments thread.
3. **Resolution:** The officer updates the ticket status to 'Resolved' once mutual agreement is reached.

### 3.5. Audit & Training Facilitation

1. **Calendar Sync:** The app displays scheduled audits and training sessions assigned by the admin team.
2. **On-Site Execution:** The officer uses the app to record attendance for training sessions and conduct periodic audits, capturing necessary proofs and feedback.

---

## 4. Screen-by-Screen Breakdown (UI/UX Details)

### Screen 1: Login & Identity

- **Purpose:** Secure access for Sri Chakra employees.
- **Key UI Elements:** Employee ID/Phone login, OTP or Password authentication.

### Screen 2: Field Officer Dashboard (Home)

- **Purpose:** Provide a centralized view of today's priorities.
- **Key UI Elements:**
  - **Task List:** "Pending Quotes to Approve", "Open Supplier Queries", "Scheduled Audits Today".
  - **Quick Actions:** Floating Action Button (FAB) or prominent tiles for "Onboard New Supplier", "Generate PR".
  - **My Performance/Stats:** Number of active suppliers mapped, PRs generated this week.

### Screen 3: Supplier Directory & Detail Profile

- **Purpose:** 360-degree view of any mapped supplier.
- **Key UI Elements:**
  - Search/Filter list of mapped suppliers.
  - **Supplier Profile:** Contact info, current SIP status, loyalty/traceability points, recent transactions, and past evaluation scores.

### Screen 4: Onboarding & Evaluation Wizard

- **Purpose:** Step-by-step data collection for new suppliers.
- **Key UI Elements:**
  - Multi-step form (Basic Info -> Details -> Document Uploads -> Consent).
  - Native camera integration for capturing GST certificates, facility photos.
  - Digital signature pad.
  - Embedded 28-question dynamic assessment.

### Screen 5: Transaction Hub (PRs & Quotes)

- **Purpose:** Managing the daily buy-side operations.
- **Key UI Elements:**
  - Swipe-to-approve/reject UI for incoming supplier quotes.
  - Form to manually initiate a PR if quoting happened completely offline.
  - Status tracking of previously generated PRs (e.g., waiting for ERPNext PO conversion).

### Screen 6: Task & Query Manager

- **Purpose:** Resolving supplier disputes and operational issues.
- **Key UI Elements:**
  - Ticket detailed view with issue description and attached media (e.g., disputed QC photo).
  - WhatsApp-style chat interface to respond to the supplier.
  - CTA to change ticket status (In Progress, Escalated, Resolved).

---

## 5. Technical & Security Considerations

### 5.1. App Distribution & Security

- **Internal Deployment:** As this is exclusively for internal employees, the app will not be published on the public Google Play Store. It will be distributed via Mobile Device Management (MDM) or directly sideloaded as an APK.
- **Data Protection:** The app must ensure that locally cached data is encrypted and immediately wiped upon employee offboarding or remote wipe command from the MDM.

### 5.2. Technology Stack

- **Framework:** CapacitorJS with React (allows sharing some core logic/components with the Supplier Web App, while accessing native device APIs).
- **Native Features:** Heavy reliance on the camera API (for document scanning and site photos), GPS/Location API (for geotagging evaluation visits), and file system for temporary storage.

### 5.3. API Integration & Architecture

- **SSMP Backend Connection:** The app acts as a client to the SSMP microservices, handling authentications, fetching dynamic forms (evaluations built by admins), and syncing tasks.
- **ERPNext Bridge:** PR generation requests are sent to the SSMP backend, which then orchestrates the transactional creation within the ERPNext environment. The app fetches real-time material rate cards directly from the agreed source of truth.

### 5.4. Dynamic Forms Capability

- The 28-question evaluation and audit checklists are not hardcoded. The app must dynamically render these forms based on JSON configurations fetched from the Admin Backend, allowing business owners to update scoring criteria without requiring an app update.
