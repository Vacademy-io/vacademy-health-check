Sri Chakra Supplier Management Program (SSMP) – Detailed Summary
1. Business Context & Primary Goals
Sri Chakra Polyplast, a plastic recycling company, is expanding its operations into waste pre-segregation. The SSMP project is a comprehensive technology solution designed to organize and manage a largely unorganized supplier community (e.g., scrap aggregators, waste pickers).

Key Objectives:

Centralize all supplier engagement and business transactions.
Enhance Traceability to track plastic waste back to the lowest-tier pickers for Extended Producer Responsibility (EPR) and ESG reporting.
Digitize onboarding, audits, dispatch, and Quality Control (QC) communication.
Achieve a highly accessible user experience without creating friction (avoiding Play Store downloads for suppliers).
2. Core Entities, Roles, and Access Methods
The system caters to three primary user groups, each with tailored access methods:

Suppliers:
Access Method: Conversational UI via WhatsApp + A lightweight mobile-friendly Web App (accessed via secure links from WhatsApp).
Why: Reduces the friction of installing/updating apps and suits the informal nature of the supplier base.
Field Officers / Procurement Team:
Access Method: WhatsApp + Web App + Internal Android Application (distributed internally via MDM).
Responsibilities: Onboard suppliers, facilitate material inspection, negotiate quotes, and maintain relationships.
Admins / SSMP Management (Internal Sri Chakra Team):
Access Method: Comprehensive Web Portal.
Capabilities: Needs granular, configurable Role-Based Access Control (RBAC) to manage changing permissions on screens, reports, and approvals.
3. Key Modules & Feature Requirements
i. Supplier Onboarding & Compliance
Digital Onboarding: Conducted onsite or remotely by Field Agents. Captures address, KYC, banking details, and multi-tier supplier connections.
Verification:
Aadhaar-based OTP signatures to capture legal consent and comply with IT data privacy laws.
Semi-automated or fully automated GST Verification via APIs (e.g., ClearTax / Master India) to match names, phone numbers, and emails.
Multi-lingual Support: All communication (WhatsApp & App) will adapt automatically to the supplier's chosen native language (starting with major South Indian languages + English/Hindi).
ii. Supplier Engagement & Evaluation
Supplier Evaluation Questionnaire: A ~28-question initial survey post-onboarding detailing compliance, safety, and business health.
Supplier Improvement Plan (SIP) & Training:
If a supplier lacks certain standards, the system configures a localized SIP.
Admin/Account Managers can schedule trainings (health, safety, digital literacy).
Both parties must digitally sign off (via OTP) acknowledging evaluations and completed trainings.
Traceability & Loyalty Program: Options for suppliers to tag their localized waste-gatherers (sub-suppliers). Suppliers receive loyalty points or digital rewards for compliant traceability reporting.
iii. Daily Business Interaction & WhatsApp Bot
Daily Greetings: Automated daily WhatsApp message containing a context menu:
Navigate to Portal: Generates a magic link to the Web App.
Let's Meet: Automatically triggers a task/ticket for the Field Officer to visit or contact the supplier.
Change Language.
Dynamic Pricing & Quotes:
Admins upload daily area-and product-category-specific base rate cards.
Supplier Specific Markups: Admins can apply time-bound absolute markups (e.g., + ₹0.25) to incentivize individual suppliers.
Suppliers can submit a "Quote" proposing a bulk volume, allowing field interactions to confirm the pricing.
iv. PR, PO, and ERPNext Integration
Microservices & API Sync: SSMP serves as the relationship front-end, while ERPNext works as the transactional backbone.
Purchase Orders (PO):
Field Officers raise a Purchase Request (PR) in SSMP based on supplier dialogue. This pushes to ERPNext.
Once approved via ERP workflow, the PO is pushed directly to the supplier via Email and simultaneously logged in SSMP to notify the supplier via WhatsApp.
v. Inward Logistics & Secure Gate Entry
Logistics Integration:
Suppliers who lack transport can view and book truck fleets (e.g., Delivery, Porter) via third-party API integration directly within the SSMP app. Transport fees are auto-deducted from final payments.
Pre-Dispatch Digital Docs: Suppliers must upload Eway bills, RC copies, and GPS photos before shipping.
QR Code Gate Pass: Once docs are verified, SSMP generates a unique, encrypted QR code for the driver. Security at Sri Chakra facilities scans the QR code to log the vehicle’s arrival time.
vi. Quality Control (QC), Debit Notes, & Dispute Resolution
Instantaneous Real-Time Feedback: Because received scrap is pre-sorted internally, non-compliant weight (waste/moisture) triggers a Debit Note.
Instant Notifications: Once QC is finalized, SSMP instantly sends the QC report and revised payout values to the supplier over WhatsApp/Web.
Time-bound Dispute Window: Suppliers are given a strict window (e.g., 7 days) to open an Inquiry/Dispute regarding QC reports, debit notes, or ledgers. After this window expires, the interactive button to query that specific transaction is removed.
Fast Payouts: Via direct banking APIs (e.g., CSB bank native API APIs), attempting automated clearances to achieve 24-48 hour payouts, building trust.
4. Technology Stack & Delivery Strategy
Architecture: A modular, microservices-backend with API-first design to plug into ERPNext, Banks, Logistics partners, and Meta.
Communication Infrastructure: Direct Meta API for Whatsapp capability + potential backup integration via aggregators (like Wati) to optimize cost and deliverability (Meta Utility messages cost around ₹0.11 per message).
Hosting and Security: Deployed on scalable cloud (AWS/GCP). Thorough vulnerability testing to ensure API secure bounds.
Methodology:
Agile Resource allocation model rather than fixed-scope.
Initial Phase (MVP targets mid-March) will strictly focus on Onboarding, basic WhatsApp UI, PO sync, and instant QC / Debit note notifications. Modules like advanced Traceability AI and complex admin reports fall into post-MVP phases.