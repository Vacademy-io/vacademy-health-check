# PostgreSQL Database Schema Plan for Sri Chakra Supplier Management Program (SSMP)

Based on the product plans for the Admin Portal, Field Officer App, and Supplier Web App, the following is a comprehensive and structured PostgreSQL database schema design. It embraces a microservices-compatible architecture and heavily leverages PostgreSQL's advanced features like `JSONB` for dynamic forms configurations.

## Overview of Modules

1. **IAM & RBAC:** Users, Roles, and Permission configurations.
2. **Supplier & Traceability:** Core supplier registry, KYC, and Sub-supplier ESG mapping.
3. **Dynamic Forms Engine:** Reusable config-driven evaluations, surveys, and audits.
4. **Rate Cards & Procurement:** Regional base rates, supplier-specific modifications, and quotes.
5. **Logistics & Transactions:** PRs, POs, Shipments (Gate operations), QC, and Ledgers.
6. **Task & Dispute Management:** Field officer tasks, Tickets, and WhatsApp message routing.
7. **Continuous Engagement:** SIPs and Training campaigns.

---

## 1. Identity & Access Management (IAM)

This module forms the foundation of the Logical Access Management (LAM) architecture.

```sql
-- Roles defining large level scopes
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'Super Admin', 'Field Officer', 'Supplier', 'Operations Head'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Granular permissions
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'approve_quote', 'edit_rate_card', 'view_all_suppliers'
    description TEXT
);

-- Role-Permission Matrix
CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Central User registry (Internal staff + Suppliers)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES roles(id),
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE,
    password_hash VARCHAR(255),
    full_name VARCHAR(150) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, SUSPENDED
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 2. Supplier Management & Traceability (ESG)

Handles supplier profiles, their required documents, and their upstream suppliers for traceability.

```sql
-- Extends the users table for supplier specific details
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    assigned_manager_id UUID REFERENCES users(id), -- Supplier Account Manager mapping
    business_name VARCHAR(200) NOT NULL,
    gst_number VARCHAR(15),
    region VARCHAR(100),
    tier VARCHAR(50), -- e.g., Tier 1, Tier 2
    loyalty_points INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'PENDING_ONBOARDING', -- PENDING, ONBOARDED, BLOCKED
    erp_vendor_id VARCHAR(100) UNIQUE, -- Sync reference for ERPNext
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE supplier_kyc_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL, -- AADHAAR, GST, BANK_CHEQUE, CONSENT_SIGN
    file_url TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ESG Mapping down to individual pickers/smaller aggregators
CREATE TABLE sub_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_supplier_id UUID REFERENCES suppliers(id),
    business_name VARCHAR(200),
    contact_phone VARCHAR(20),
    material_types JSONB, -- Array of materials they supply
    tier_level INT NOT NULL, -- Distance from Sri Chakra (e.g., 2, 3)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 3. Dynamic Form Engine

For 28-question evaluations, audits, and surveys. Leverages `JSONB` to avoid complex relational structures for highly mutable fields.

```sql
CREATE TABLE form_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL, -- EVALUATION, AUDIT, SURVEY
    schema JSONB NOT NULL, -- Stores question types, options, weights, and validations
    is_published BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE form_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_template_id UUID REFERENCES form_templates(id),
    supplier_id UUID REFERENCES suppliers(id),
    submitted_by UUID REFERENCES users(id), -- Field officer or Supplier
    responses JSONB NOT NULL, -- Key-Value pair of question IDs and answers
    total_score DECIMAL,
    status VARCHAR(50) DEFAULT 'SUBMITTED',
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 4. Rate Cards & Margin Management

Handles base pricing and supplier-specific markups/markdowns.

```sql
CREATE TABLE material_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE materials (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES material_categories(id),
    name VARCHAR(100) NOT NULL,
    uom VARCHAR(20) NOT NULL -- Unit of Measure (e.g., MT, KG)
);

CREATE TABLE base_rate_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id INT REFERENCES materials(id),
    region VARCHAR(100) NOT NULL,
    base_rate DECIMAL(10,2) NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id)
);

CREATE TABLE supplier_rate_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    material_id INT REFERENCES materials(id),
    adjustment_type VARCHAR(20), -- MARKUP, MARKDOWN
    adjustment_value DECIMAL(10,2) NOT NULL, -- Raw value (+/- Rs)
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 5. Procurement & Gate (Shipment) Operations

Manages the daily transactional workflow: Quotes -> PR -> PO -> Shipment -> QC -> Ledger.

```sql
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    material_id INT REFERENCES materials(id),
    quantity DECIMAL(10,2) NOT NULL,
    rate_offered DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, COUNTERED, ACCEPTED, REJECTED
    reviewed_by UUID REFERENCES users(id), -- Field Officer processing this
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE purchase_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotes(id),
    erp_pr_ref VARCHAR(100), -- ID mapped from ERPNext
    status VARCHAR(50) DEFAULT 'SYNCING'
);

CREATE TABLE shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    erp_po_ref VARCHAR(100) NOT NULL, -- Linked PO from ERPNext
    vehicle_number VARCHAR(50),
    driver_phone VARCHAR(20),
    gate_pass_qr VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'INITIATED', -- INITIATED, DISPATCHED, GATE_IN, UNLOADED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- E-Way Bills, Invoices loaded by Supplier
CREATE TABLE shipment_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID REFERENCES shipments(id),
    doc_type VARCHAR(50), -- EWAY_BILL, INVOICE, LR_COPY, GPS_LOCATION
    file_url TEXT NOT NULL
);

CREATE TABLE qc_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID REFERENCES shipments(id),
    inspector_id UUID REFERENCES users(id),
    final_grade VARCHAR(50),
    deduction_percentage DECIMAL(5,2),
    comments TEXT,
    photos_url JSONB,
    status VARCHAR(20) DEFAULT 'PUBLISHED'
);

-- Mirror of ERPNext Ledger for supplier portal viewing
CREATE TABLE supplier_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    transaction_type VARCHAR(50), -- ADVANCE, PAYMENT, INVOICE, DEBIT_NOTE
    amount DECIMAL(15,2),
    erp_ref_id VARCHAR(100),
    transaction_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 6. Ticketing, Helpdesk & Tasks

Provides functionality for the dispute resolution center, WhatsApp queries, and Field tasks.

```sql
CREATE TABLE cases_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    assigned_to UUID REFERENCES users(id), -- Usually mapped to Field Officer/QC
    category VARCHAR(50), -- QC_DISPUTE, PAYMENT_DISPUTE, APP_ISSUE
    related_entity_id UUID, -- Polymorphic reference (e.g., QC Report ID)
    subject VARCHAR(255),
    status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, ESCALATED, RESOLVED
    sla_breach_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES cases_tickets(id),
    sender_id UUID REFERENCES users(id), -- Null if system generated
    channel VARCHAR(20), -- WHATSAPP, WEB_APP, FIELD_APP
    message TEXT,
    media_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE field_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_officer_id UUID REFERENCES users(id),
    supplier_id UUID REFERENCES suppliers(id),
    task_type VARCHAR(50), -- ONBOARDING, AUDIT, DISPUTE_RESOLUTION
    details TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'PENDING'
);
```

## 7. Continuous Engagement (SIPs & Training)

```sql
CREATE TABLE supplier_improvement_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    created_by UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    start_date DATE,
    end_date DATE
);

CREATE TABLE sip_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sip_id UUID REFERENCES supplier_improvement_plans(id),
    title VARCHAR(200),
    is_completed BOOLEAN DEFAULT FALSE,
    signed_off_by UUID REFERENCES users(id), -- Supplier/Officer sign off
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE trainings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    content_url TEXT NOT NULL, -- PDF or Video
    type VARCHAR(50)
);

CREATE TABLE supplier_training_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id),
    training_id UUID REFERENCES trainings(id),
    status VARCHAR(50) DEFAULT 'ASSIGNED', -- ASSIGNED, COMPLETED
    completed_at TIMESTAMP WITH TIME ZONE
);
```

- **JSONB Indexes:** Make sure to deploy GIN indexing on structured JSONB columns (like `responses` in `form_submissions`) if you plan to aggregate data directly from forms (e.g., `CREATE INDEX idx_form_responses ON form_submissions USING GIN (responses);`).
- **PostGIS extension:** Consider enabling `PostGIS` if you intend to execute geospatial queries to match field officers and suppliers securely or route logistics.
- **Row-Level Security (RLS):** This can act as a deep baseline defense for the LAM strategy, ensuring that a database session logged in for a Supplier Account Manager can natively only `SELECT` records where `assigned_manager_id = current_user_id()`.
