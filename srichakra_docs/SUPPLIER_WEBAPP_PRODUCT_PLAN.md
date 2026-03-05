# Supplier Web App & Communications - Detailed Product Plan

## 1. Product Overview & Vision

The Supplier Web App (part of the Sri Chakra Supplier Management Program - SSMP) is a lightweight, mobile-friendly web portal designed to streamline interactions between Sri Chakra and its material suppliers. Coupled with a robust WhatsApp communication integration ("Vawa"), the product aims to digitalize onboarding, rate negotiations, purchase order generation, shipment tracking, and dispute management. The overarching vision is to reduce friction in procurement, enhance transparency, and foster consistent communication in the supplier's preferred language.

## 2. Target Audience & Personas

- **Primary Persona:** **Material Suppliers / Vendors**
  - **Behavior:** Often operate primarily via mobile devices. May have limited technical proficiency. Rely heavily on WhatsApp for daily business communication.
  - **Needs:** Quick access to daily rates, easy submission of quotes, straightforward document upload for shipments, fast query resolution, clear visibility into past transactions, and ability to complete supplier improvement plans (SIP) or trainings.
  - **Language:** Prefers communication and portal access in regional languages (Telugu, Tamil, Kannada, Hindi) or English.

- **Secondary Persona:** **Field Officers / Procurement Team**
  - **Behavior:** On the ground, visiting supplier facilities. Need tools to quickly capture data.
  - **Needs:** Dedicated internal Android App for registering new suppliers, conducting the initial 28-question evaluation, generating Purchase Requests (PRs), addressing assigned query tasks, and capturing sign-offs on improvement plans.

- **Tertiary Persona:** **Administrators / Business Owners**
  - **Behavior:** Manage the ecosystem from the back office via a desktop web portal.
  - **Needs:** Configurable role-based access management, self-service dashboard to create/edit evaluation questionnaires, setup audit calendars, view consolidated analytics, and monitor SIP progress without needing developer intervention.

- **Future Persona:** **Customers / Buyers**
  - **Needs:** Place sales orders, view inventory, and get rate cards for finished, processed materials.

## 3. Core Product Workflows

### 3.1. Supplier Evaluation & Onboarding

1. **Initial Assessment:** Field officers conduct an on-site visit and complete a 28-question evaluation via their mobile app.
2. **Consent & Verification:** Mandatory data privacy consent flows (IT Act compliant) captured digitally via Aadhaar OTP signatures.
3. **Supplier Improvement Plan (SIP):** Based on evaluation, an automated SIP is generated if the supplier does not meet all criteria. Both parties digitally sign off on the plan.
4. **Continuous Engagement:** Scheduled trainings, surveys, and periodic audits are organized via the portal to continuously upgrade supplier capabilities.

### 3.2. Daily Engagement via WhatsApp

1. **System Trigger:** Everyday at a scheduled time (e.g., morning), the system sends a personalized WhatsApp greeting in the supplier's chosen language.
2. **Options Displayed (Interactive Buttons):**
   - **Navigate to Portal:** Provides a secure link to access the Web App.
   - **Let's Meet:** Instantly creates a task for their mapped Field Officer in the backend to reach out.
   - **Change Language:** Allows the supplier to update their communication preference interactively.
3. **Event-Triggered Alerts:** The system uses WhatsApp to push transaction alerts (e.g., ERPNext generates and approves a new PO, payment advice is issued, QC report published).

### 3.3. Rate Discovery & Quoting

1. **View Rates:** Supplier logs in to view area and product-specific base rates, potentially adjusted by a supplier-specific markup/markdown (e.g., +0.25 Rs).
2. **Action:** Supplier can agree to the published rate or submit an alternative Quote (rate + quantity).
3. **Offline/Online Negotiation:** The field officer reviews the quote on their app. If accepted, the officer generates a Purchase Request (PR) directly, which flows into ERPNext to become a Purchase Order (PO).

### 3.4. Traceability & ESG Reporting

1. **Sub-Supplier Registration:** To comply with brand ESG requirements, suppliers are encouraged to register their lower-tier suppliers (Tier 1, Tier 2, etc., down to waste pickers).
2. **Incentivization (Loyalty Program):** Suppliers earn points or loyalty rewards for accurately providing traceability data. Points can be redeemed for equivalent value payouts or vouchers.

### 3.5. Digital Shipment Initiation (Gate-In) & Logistics

1. **Logistics Booking:** Suppliers have the option to organize their own transport or book a vehicle via the app (costs deducted from final payout).
2. **Document Upload:** To initiate a shipment, the supplier uploads mandatory gate documents (E-way bill, Invoice, LR/RC copy, GPS photos).
3. **QR Generation:** Upon successful upload and field officer/system validation, the portal generates a secure Gate Pass QR code.
4. **Dispatch:** The truck driver presents this QR code at the Sri Chakra segregation center. The security team scans it via their custom app to log vehicle entry and verify documents.

### 3.6. Time-Bound Query & Dispute Management

1. **Issue Identification:** A supplier finds a discrepancy in a QC Report, Debit Note, or PO.
2. **Action:** Supplier opens the "Raise Enquiry" module.
   - _Constraint:_ Dispute options for specific transactions (like QC reports) disappear after a predefined window (e.g., 7 days).
3. **Resolution Tracking:** Once raised, the query is assigned to the Field Officer as a task, tracked through a comment thread until closure.

---

## 4. Screen-by-Screen Breakdown (UI/UX Details)

### 4.1. Supplier Web App Screens

#### Screen 1: Language Selection & Authentication

- **Purpose:** Secure, seamless access to the web portal.
- **Key UI Elements:** App Logo & Greeting, Language toggle (EN, HI, TE, TA, KN), Phone Number Input & OTP Verification code blocks.

#### Screen 2: Supplier Dashboard (Home)

- **Purpose:** Provide an at-a-glance summary of action items and business stats.
- **Key UI Elements:**
  - **Quick Actions:** Tile grid for "View Today's Rates", "Upload Shipment Docs", "Raise Query".
  - **Pending Approvals:** Urgent actions (e.g., "Acknowledge Supplier Evaluation PDF", "Complete Onboarding Consent").
  - **Traceability Tracker:** Current loyalty points and option to "Add Sub-Supplier".

#### Screen 3: Material Rate Card & Quoting

- **Purpose:** Daily procurement transactions.
- **Key UI Elements:** Tabular/Card layout showing Product Category, Material, and Today's Rate. Form Overlay for Input Fields for Desired Quantity and Offer Rate. "Submit Quote" CTA.

#### Screen 4: Transaction & Ledger Center

- **Purpose:** Self-service portal to view past transactions, avoiding manual text requests to officers.
- **Key UI Elements:** Search & Filters, Categories (Purchase Orders, Invoices, QC Reports, Debit Notes, Payments). Contextual "Raise Dispute" button on recently closed transactions.

#### Screen 5: Shipment & Document Upload (Logistics Module)

- **Purpose:** Digitize the gate-inward process and transfer upload responsibility to the supplier.
- **Key UI Elements:** Dropdown/Search to link the shipment to an Open PO. Upload Zones for E-way Bill, Invoice. "Gate Pass QR Code" displayed post-submission.

#### Screen 6: Supplier Improvement & Training

- **Purpose:** Track SIP and complete assigned video trainings or surveys.
- **Key UI Elements:** Video player for training materials, short quiz/survey module, Sign-off button to acknowledge completion.

#### Screen 7: Compliance & Onboarding (First-Time Access)

- **Purpose:** Capture one-time details and consent digitally.
- **Key UI Elements:** Long-scroll consent forms outlining terms of business. Aadhaar-based OTP signature iframe.

### 4.2. Field Officer Android App Screens

#### Screen 1: Field Dashboard & Tasks

- **Key UI Elements:** Today's visits route map, open tickets/queries raised by mapped suppliers, recent quotes requiring approval.

#### Screen 2: Supplier Evaluation Form

- **Key UI Elements:** 28-question dynamic questionnaire, file upload for site photos, digital sign-off scratchpad for the supplier to sign on the device.

### 4.3. Admin Portal Screens

#### Screen 1: Role & User Management

- **Key UI Elements:** Granular permission toggles strictly separating access to sensitive screens, reports, and modules.

#### Screen 2: Dynamic Forms Builder

- **Key UI Elements:** Drag-and-drop interface for business owners to independently construct or edit questionnaires, evaluation criteria, and training models.

---

## 5. Product Research & Technical Considerations

### 5.1. Progressive Web App (PWA) Nature

- **Why?** Suppliers usually avoid downloading dedicated mobile B2B apps due to storage limits or friction. The Web App must be heavily optimized for mobile browsers.
- **Execution Strategy:** Build using React/Next.js with mobile-first CSS (Tailwind). Ensure high performance, fast loading, over-the-air updates, and responsive touch targets. Connects to backend APIs.

### 5.2. WhatsApp API Strategy (Meta Business API)

- **Why?** WhatsApp is the primary communication tool. Minimizing recurring costs is critical.
- **Execution Strategy:** Use Direct Meta Business API to avoid third-party premium markups. Maintain a fallback integration (e.g., Wati) for emergency routing. Heavy real-time chat must funnel users to the PWA via secure magic links to limit the volume of paid WhatsApp utility messages (avg cost ₹0.15/msg or 1.5 rupees/10 messages).

### 5.3. Architecture & Data Strategy

- **Microservices Architecture:** Backend should be designed heavily segmented via microservices. This allows independent scaling, simpler addition of the future Sales Module, and clear service boundaries.
- **Hybrid Data Approach:** ERPNext acts as the single source of truth for financial and master transactional data (POs, Ledgers). The SSMP backend database will handle engagement, UI state, loyalty points, SIP tracking, and session management, fetching from ERPNext via API on demand.

### 5.4. Third-party API Dependencies

- **KYC & Signature (Digio/SurePass):** Critical for capturing Aadhaar-backed digital signatures on onboarding consent and periodic Supplier Evaluation (SE) sign-offs.
- **GST Verification (ClearTax/Masters India):** Needed during onboarding to cross-reference mapped phone numbers and business names against government records.
- **Logistics Integration:** APIs from city-logistics partners (e.g., Porter API) for transport availability.
- **Payment Gateway:** CSB Bank Native APIs for triggering multi-party RTGS/NEFT payments (with low flat transaction fees instead of percentage-based PG fees).

### 5.5. Data Security & Multi-Tenant Boundaries

- **Consent Compliance:** Data Privacy mandates strictly enforcing explicit supplier consent before any tracking/KYC gathering.
- **Field App Deployment:** The Android App for the internal Field team will be sideloaded or managed via MDM (Mobile Device Management) rather than the public Play Store, ensuring internal IP security.
- **Access Control & Audits:** The portal must restrict data strictly by the logged-in user session with short-expiry magic links for supplier access. Every quote change, document upload, and login instance must be logged.
