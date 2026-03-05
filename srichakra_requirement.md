## Required API Access & Credentials

To ensure the project starts on time, we request the following access and credentials from the Sri Chakra team:

### 0. Languages that Our system supports

### 1. WhatsApp Business API (Meta)

- **Purpose:** Sending daily greetings, notifications, and facilitating 2-way communication.
- **Requirements:**
  - **Meta Business Manager Access:** Admin access to configure the app.
  - **Phone Number:** A clean phone number (not currently registered on WhatsApp Personal/Business App) to be registered with the API.
  - **Payment Method:** Credit Card added to Meta account for messaging billing.

### 2. ERPNext Access

- **Purpose:** Syncing Purchase Orders, Master Data (Items, Suppliers), and fetching QC/Ledger reports.
- **Requirements:**
  - **Instance URL:** The web address of your ERPNext instance.
  - **API User:** A dedicated System User account with API Access enabled.
  - **API Key & API Secret:** For the above user.
  - **Permissions:** Read/Write access to: _Supplier, Item, Purchase Order, Quality Inspection, Payment Entry, Stock Entry_.

### 3. GST Verification API

- **Purpose:** Validating Supplier GSTIN during onboarding.
- **Requirements:**
  - **API Credentials:** API Key/Client ID from your GSP (GST Suvidha Provider) such as ClearTax, Masters India, or Karza.
  - **Sandbox Access:** If available, for testing.

### 4. Aadhaar Verification / E-Sign SDK

- **Purpose:** OTP-based Aadhaar consent for onboarding (Compliance).
- **Requirements:**
  - **Provider Credentials:** API Key/Secret from providers like **Digio**, **Zoop**, or **SurePass**.

### 5. Google Maps API

- **Purpose:** Location tracking for logistics and address auto-completion.
- **Requirements:**
  - **API Key:** With _Maps SDK for Android_ and _Places API_ enabled.

### 6. Cloud Infrastructure (AWS / Server)

- **Purpose:** Hosting the Backend, Admin Portal, and storing images/videos.
- **Requirements:**
  - **Server Access:** SSH Key / IP Address / Credentials (if self-hosted).
  - **AWS IAM User:** With S3 Bucket access (for storing KYC docs & visual proofs).

### 7. Payment Gateway (If Applicable)

- **Purpose:** If any payments (to transporters/suppliers) are triggered via App.
- **Requirements:**
  - **Razorpay/Cashfree:** API Key & Secret (Test Mode & Production).
