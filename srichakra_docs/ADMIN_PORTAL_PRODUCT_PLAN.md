# Admin Portal - Detailed Product Plan

## 1. Product Overview & Vision

The Sri Chakra Admin Portal is the centralized command-and-control dashboard for the entire Supplier Management Program (SSMP). Accessible primarily via desktop browsers, it is designed for internal managers and business owners to orchestrate operations without relying constantly on developer intervention. Built with a highly configurable Role-Based Access Control (RBAC) architecture, the portal allows the enterprise to dynamically manage user permissions, update operational parameters (like dynamic data-capture forms and rate cards), and extract comprehensive analytics on procurement, logistics, and ESG (Environmental, Social, and Governance) traceability.

## 2. Target Audience & System Roles

The admin portal is designed to accommodate the evolving needs of the organization. While initially launched with broader access, the architecture supports granular Logical Access Management (LAM) enabling or revoking access to specific screens, functions, and reports for the following personas:

### 2.1. System Administrator (Super Admin)

- **Functions:** Manages the technical and structural backend. Configures broad system settings, manages third-party API keys (e.g., WhatsApp, payment gateways), creates and assigns roles, and monitors system health/sync statuses with ERPNext.
- **Access:** Unrestricted access to all modules, specifically the User Access Management tool matrix.

### 2.2. Operations / Supply Chain Head (e.g., Swaroop / Mohan Krishna)

- **Functions:** Needs a bird's-eye view of all reclamation centers and supplier metrics. Defines macro-level rate cards, reviews high-level performance metrics, oversees ESG traceability compliance, and provides overriding approvals on critical supplier exits or policy changes.
- **Access:** Analytics dashboards, Rate Card masters, Traceability Reports, High-level escalations.

### 2.3. Supplier Account Manager

- **Functions:** Directly responsible for a portfolio of suppliers. Analyzes the 28-question supplier onboarding evaluations submitted by Field Officers, crafts and publishes Supplier Improvement Plans (SIPs), schedules periodic audits, assigns training calendars, and serves as an escalation point for queries the Field Officer cannot resolve.
- **Access:** Supplier Directory, SIP & Audit Calendar Module, Training Module, Ticket Escalation Hub.

### 2.4. Quality Control (QC) Manager

- **Functions:** Manages the quality assurance processes. Reviews uploaded photos or inspection reports, publishes final QC reports to the supplier, initiates Debit Notes for sub-standard material, and resolves quality-specific disputes raised by suppliers via the portal.
- **Access:** QC & Debit Note Module, Dispute Resolution (QC categorized tickets only).

### 2.5. Finance & Accounts Manager (e.g., Narendra)

- **Functions:** Oversees the financial health of the procurement cycle. Verifies ledger data synced from ERPNext, oversees payment dispatches to suppliers, manages transport/logistics cost deductions, and resolves payment-related supplier queries.
- **Access:** Ledger & Payments Module, Logistics Cost Module, Financial Reports, Queries (Finance categorized).

---

## 3. Core Product Workflows

### 3.1. Dynamic Form & Content Builder

1. **Creation:** Business users use a drag-and-drop or structured UI to build evaluation questionnaires, audit checklists, or post-training surveys.
2. **Configuration:** Admin assigns weights to answers to automatically generate evaluation scores.
3. **Deployment:** Once published, these dynamic forms dictate what the Field Officer sees on their Android App and what the Supplier interacts with on the Web Portal.

### 3.2. Rate Card & Margin Management

1. **Base Rates:** Operations heads define base procurement prices for specific material categories per city/region.
2. **Supplier Variations:** Account Managers can apply specific markups or markdown configurations (+/- Rs) to individual suppliers based on historical performance or transport arrangements.
3. **Publishing:** Rates are published and instantly reflected on the Supplier Web App.

### 3.3. Audit & Training Calendarization

1. **Scheduling:** Account Managers create recurrent or one-off "Audit Events" or "Training Campaigns."
2. **Assignment:** Assigned to specific suppliers or geographic pools.
3. **Tracking:** Admins track attendance, view completed digital sign-offs, and monitor audit scores streaming in from Field Officers.

### 3.4. Ticket & Escalation Routing

1. **Monitoring:** Admin portal captures all open queries raised by suppliers across all platforms.
2. **Reassignment:** If a Field Officer is on leave or a ticket exceeds its SLA (e.g., >24 hours), the system escalates it. Account Managers can manually reassign the ticket or take direct action via a chat interface.

### 3.5. ESG Traceability & Sub-Supplier Mapping

1. **Verification:** Admins view the network map of Tier-1 suppliers and their registered sub-suppliers.
2. **Loyalty Configuration:** Admins configure the "Points/Rewards" logic given to suppliers who successfully map their downstream supply chain.

---

## 4. Screen-by-Screen Breakdown (UI/UX Details)

### Screen 1: Master Analytics Dashboard

- **Purpose:** High-level operational overview customized by role.
- **Key UI Elements:**
  - **Widgets:** Total Active Suppliers, Volume Procured (MT) this week, Open Disputes count, Average Onboarding Time.
  - **Quick Links:** "Pending Approvals", "Failed ERP Syncs".

### Screen 2: Supplier 360° Management View

- **Purpose:** Deep dive into individual supplier behavior.
- **Key UI Elements:**
  - **Data Grid:** Searchable, filterable table of all suppliers (Status, Region, Tier).
  - **Detail View:** Tabbed interface showing KYC documents, assigned SIP progress, Ledger summary, historical QC reports, and active Sub-Suppliers.

### Screen 3: User Access & Role Management (LAM)

- **Purpose:** Configure permissions dynamically to accommodate growing internal teams.
- **Key UI Elements:**
  - Staff Directory.
  - Role Matrix: A grid showing roles on the Y-axis and System Modules/Actions on the X-axis (View, Edit, Delete, Approve checkboxes).

### Screen 4: Dynamic Form Builder

- **Purpose:** Self-service maintenance of evaluation metrics.
- **Key UI Elements:**
  - Form canvas.
  - Question types (Text, Radio, Dropdown, Photo Upload, Checkbox).
  - Validation rules configuration (e.g., "If No, require photo proof").

### Screen 5: Rate Card Configuration

- **Purpose:** Manage dynamic pricing.
- **Key UI Elements:**
  - Matrix interface grouped by Material Type and Region.
  - Batch update functionality (e.g., "Increase all PET prices by 2%").

### Screen 6: SIP, Audit & Calendar Hub

- **Purpose:** Administer post-onboarding programs.
- **Key UI Elements:**
  - Calendar View highlighting upcoming field audits and training sessions.
  - SIP status tracker (e.g., Supplier X is on month 2 of 3 for safety improvement).

### Screen 7: Dispute & Query Resolution Center

- **Purpose:** Oversee and manage the Helpdesk.
- **Key UI Elements:**
  - Kanban board or List view of tickets (New, Assigned, Escalated, Closed).
  - Chat/Log window reflecting the conversation between Field Officer and Supplier, allowing Admin interventions.

### Screen 8: Reports & Exports (ESG Focus)

- **Purpose:** Generate structured data for stakeholders.
- **Key UI Elements:**
  - Custom report builder (Select columns, date ranges).
  - Dedicated "Traceability Map" visualizer for ESG compliance, ready for export as PDF or CSV.

---

## 5. Technical & Architecture Considerations

### 5.1. Logical Access Management (LAM) Architecture

- **Why?** The business requirements specified a need to avoid hardcoding broad roles. As the company scales, operations will become more siloed.
- **Execution Strategy:** Implement a robust RBAC middleware. Every API route and UI component must check a centralized claims/permissions token. This allows Super Admins to instantly toggle UI components off for existing roles through the portal itself.

### 5.2. Microservices Control Plane

- The Admin Portal acts as the master UI for multiple underlying microservices (e.g., Communication Service mapping WhatsApp logs, Auth Service, Core Transaction Service syncing with ERPNext).
- **Resilience:** The portal needs robust error handling and manual retry mechanisms for "Failed ERP Syncs", ensuring zero data loss if ERPNext API boundaries timeout.

### 5.3. Real-Time Data Handling

- While most data can be fetched synchronously, features like the Dispute Resolution Center require WebSocket connections to show real-time incoming messages from suppliers (via WhatsApp or Web App).

### 5.4. UX Centered on Productivity

- Built typically with React/Next.js and powerful Data Grid libraries (like AG Grid or MUI X DataGrid) to provide Excel-like filtering, sorting, and inline editing for bulk operations (like updating daily rate cards).
