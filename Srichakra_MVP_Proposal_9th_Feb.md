# Srichakra MVP Proposal & Planning Guide (Based on Feb 9th Meeting)

## 1. proposed MVP Feature List

Based on the discussions, the MVP should focus on the critical "Happy Paths" for Supplier Onboarding, Transactions, and Communication, while keeping the architecture flexible for future enhancements.

### A. Supplier Interface (WhatsApp + Web View)

_Target Audience: Informal/Semi-formal Suppliers (No App Install Required)_

1.  **Onboarding & Registration**
    - Receive "Welcome" WhatsApp message after Field Team registration.
    - Simple web form (via magic link) to view profile details.
2.  **Transactions & Order Management**
    - **View Purchase Orders (POs)**: Notification of new POs via WhatsApp with a link to view details.
    - **Live Rate Card**: Ability to view current buying prices for different material categories (Daily/Weekly updates).
    - **Logistics Booking**:
      - Option to request logistics support via WhatsApp menu/Web link.
      - Input quantity and preferred pickup date.
      - Receive vehicle details/status updates.
    - **Dispatch Notification**: Ability to mark material as "Dispatched" with **mandatory GPS Geo-tagging** (Critical for EPR compliance) and Photo Upload.
3.  **Quality & Payments**
    - **QC Report & Debit Notes**: Receive immediate notification of QC results.
      - View Debit Note details (Accepted quantity vs. Rejected quantity).
      - "Accept" or "Raise Dispute" button (simple workflow).
    - **Payment Status**: View status of invoices/payments (Integrated with ERP data).
4.  **Traceability (Basic)**
    - Feature to add/list their own sub-suppliers (Tier 2) to build the traceability chain.
5.  **Multi-language Support**
    - Interface available in English + 3 South Indian Languages (detected/selected during onboarding).

### B. Field Team Interface (Mobile App - APK)

_Target Audience: Sri Chakra Field Officers_

1.  **Supplier Onboarding**
    - **Digital KYC Form**: Capture Supplier Name, Location, GST (if any), Bank Details, Contact Number (WhatsApp).
    - **Evaluation Questionnaire**: 28-question standard evaluation form.
    - **Photo Upload**: Capture site photos/documents.
2.  **Improvement Plans**
    - View generated Improvement Plan based on evaluation.
    - Record Supplier Acknowledgement (Digital Sign-off).
3.  **Task Management**
    - View assigned supplier visits/audits.

### C. Admin / Internal Portal (Web Dashboard)

_Target Audience: Procurement, Finance, Ops, Admin_

1.  **Supplier Management**
    - Master view of all onboarded suppliers (Search/Filter by status, region).
    - View Supplier 360: Profile, Onboarding status, Evaluation score, Transaction history.
2.  **Configuration & Audits (Self-Service)**
    - **Dynamic Form Builder**: Ability to add/edit questions in the Evaluation/Audit forms without code changes.
    - **Audit Calendar**: Schedule audits/trainings for suppliers.
3.  **Integration Monitoring**
    - View status of ERP sync (PO vs. App Data).
4.  **User Management (RBAC - Phase 1)**
    - Simple Role-Based Access Control (Admin, View-Only, Editor).
    - _Note: Designed for granular microservices access in future (e.g., permit specific report access)._

---

## 4. Features Discussed but Deferred to Phase 2 (Backlog)

_Features mentioned in previous meetings (Jan 28, Feb 5) that are likely out of scope for the mid-March MVP deadline but should be roadmapped._

### A. Sales & Customer Portal

- **Target Audience**: Buyers (Recycled Material Customers).
- **Features**:
  - **Inventory Visibility**: View available stock at different centers.
  - **Sales Rate Card**: View selling prices.
  - **Order Placement**: Create Purchase Requests/Sales Orders directly in the app (Sync with ERP).
  - **Logistics**: Customer-arranged vs. Sri Chakra-arranged transport booking.

### B. Loyalty & Incentive Program

- **Goal**: Encourage suppliers (and sub-suppliers) to use the app and provide traceability data.
- **Features**:
  - **Points System**: Earn points for every ton supplied or every sub-supplier added/verified.
  - **Redemption**: Redeem points for non-monetary rewards (e.g., Amazon vouchers, gifts).
  - **Tier Status**: Silver/Gold/Platinum supplier badges based on volume/quality.

### C. Advanced AI Integration (Parallel Project)

- **Goal**: Automated material segregation and quality grading.
- **Scope**: Hardware (Cameras) + Custom AI Model (potential "Grey Parrot" alternative).
- **Status**: Research phase to run parallel to MVP development.

---

## 2. Planning & Boundary Conditions (For Internal Team Discussion)

_Use these questions/points to define the "Edges" of the system during your planning sessions._

### A. User & Role Boundaries

- **Access Control**:
  - _Condition_: If a Field Officer leaves, how is their access revoked immediately on the App?
  - _Condition_: Can a Supplier have multiple users (e.g., Owner + Manager)? _MVP Recommendation: Single primary number for now._
- **Granularity**:
  - _Planning_: Don't over-engineer roles Day 1. Start with `Super Admin`, `Field Agent`, `Business Viewer`.

### B. Data & ERP Integration Boundaries

- **Source of Truth**:
  - _Rule_: ERP Next is the Master for **Finance & Inventory** (Ledgers, POs, Invoices). SSMP is Master for **Engagement, Onboarding & Audits**.
  - _Condition_: What happens if ERP is down? _App should cache critical data or show a "Maintenance" banner._
- **Sync Logic**:
  - _Planning_: Define the "Trigger". Does ERP push payment status to App? Or does App poll ERP every hour? _Recommendation: Event-based Push from ERP > SSMP._

### C. Operational Edge Cases (The "What Ifs")

- **Logistics**:
  - _Condition_: Supplier books a truck 2 hours before pickup. Is this allowed? _Define minimum lead time._
  - _Condition_: Supplier cancels truck _after_ it arrives. _Define penalty/cancellation logic._
- **QC Disputes**:
  - _Condition_: Supplier disputes a Debit Note. Who receives the alert? Is payment frozen automatically in ERP?
- **Offline Support**:
  - _Condition_: Field officer is in a remote area with no internet. _App must support offline form filling and sync when online._

### D. Legal & Compliance (IT Act)

- **Consent**:
  - _Requirement_: Mandatory "Terms of Service" and "Data Privacy Consent" checkbox during Onboarding (for both Supplier and Field Agent).
  - _Condition_: If consent is withdrawn, is data deleted or anonymized?

### E. Technical Boundaries

- **WhatsApp Costs**:
  - _Planning_: Distinguish between **Utility** (OTP, Order Updates - cheaper) and **Marketing** messages.
  - _Condition_: Avoid "Chatty" interfaces where every small interaction sends a message. Use WhatsApp for _Notifications_ and Web Links for _Detailed Actions_.
- **Scalability**:
  - _Architecture_: Stick to the Microservices approach discussed. Ensure the "Notification Service" is separate from the "Core App" so WhatsApp provider changes don't break the system.

---

## 3. Immediate Next Steps (Action Items)

1.  **Create "Happy Flow" Wireframes**:
    - Supplier: WhatsApp Notification -> Click Link -> Web View (PO Details).
    - Field: Login -> Add Supplier -> Fill Form -> Submit.
2.  **Finalize Integration Fields**:
    - List exactly which 5-10 fields need to be pulled from ERP Next (e.g., PO Number, Item Name, Qty, Rate).
3.  **Microservices Split**:
    - Define the boundaries: `Auth Service`, `Supplier Service`, `Notification Service`, `Integration Service`.
