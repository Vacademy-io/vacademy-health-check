![Vidyayatan Letterhead](Screenshot%202026-01-29%20at%209.49.00%E2%80%AFPM.png)

**ANNEXURE - I: DETAILED TECHNICAL PROPOSAL**

**Project:** T-FOMS (Telangana Forest Offense Management System)
**Bidder:** Vidyayatan Technologies LLP

---

### 1. EXECUTION METHODOLOGY & SOLUTION ARCHITECTURE

_(Reference: Tender Clause 2.2 & 2.3)_

Our proposed solution, **T-FOMS**, is designed as a "Central Nervous System" for forest protection, strictly adhering to the "Digital Lathi" and "HQ" concepts outlined in the RFP.

#### A. "The Digital Lathi" (Mobile App for Beat Officers)

- **Technology:** Flutter (Single codebase for Android/iOS, high performance).
- **Offline "Store-and-Forward" Sync:**
  - The app uses a local **SQLite database** to store Preliminary Offense Reports (POR) when deep in the forest (No Service Zones).
  - **Auto-Sync:** As soon as the officer enters a network zone, the app automatically pushes encrypted data to the central server.
- **Voice-to-Text AI (Hybrid Approach):**
  - **Level 1 (On-Device):** Basic speech recognition for immediate drafting.
  - **Level 2 (Server-Side Corrections):** A Python-based NLP microservice refines the text for official terminology (e.g., converting "lakadi" to "timber logs (teak)") once synced.
- **Secure Evidence Chain:**
  - Restricted Camera Access: Photos/Videos are captured _directly_ to the app sandboxed storage. No gallery uploads allowed (prevents tampering).

#### B. "The HQ" (Command Center for DFO/Rangers)

- **Technology:** ReactJS (Frontend) + Java Spring Boot (Backend).
- **GIS & Mapping Strategy:**
  - We utilize **OpenStreetMap (OSM)** and **Bhuvan (ISRO)** map layers to ensure **zero licensing costs** for the department while maintaining high-resolution terrain accuracy.
  - **Heatmaps:** Auto-identification of " Sensitive Beats" based on historic offense data.
- **Kanban Workflow:** A Trello-like board for moving cases from _POR Filed_ -> _Verified_ -> _Seizure Recorded_ -> _Prosecution Launched_.

---

### 2. RELEVANT EXPERIENCE & CASE STUDIES

_(Reference: Technical Evaluation - Understanding of Workflows)_

Our team has deployed "Labour Link", a security and workforce management system in South Africa, which shares **90% functional DNA** with the proposed T-FOMS.

| Feature           | **Labour Link (Our Existing Product)** | **T-FOMS (Proposed Solution)**              |
| :---------------- | :------------------------------------- | :------------------------------------------ |
| **Core Function** | Farm Security & Incident Reporting     | Forest Offense Reporting                    |
| **User Base**     | Security Guards on large farms         | Forest Beat Officers in ranges              |
| **Connectivity**  | Remote farmlands (often offline)       | Deep Forest Areas (Offline)                 |
| **Alert System**  | "Intruder Detected" alerts to managers | "Offense Reported" alerts to Range Officers |
| **Identity**      | Biometric ID for laborers              | Biometric Login for Officers / Offender ID  |
| **Tech Stack**    | Java, React, Mobile App                | Java, React, Mobile App                     |

_This proves that our "Digital Lathi" is not just a concept, but a field-tested reality._

---

### 3. TEAM COMPOSITION

_(Reference: Annexure II - Team Strength)_

We have assembled a dedicated team of experts surpassing the "Java/React Experts" requirement.

| Role                       | Name               | Experience | Qualification/Highlight                                                                                                                                              |
| :------------------------- | :----------------- | :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend Architect**      | **Manshu Jaiswal** | 5 Years    | **Java Spring Boot Expert.** Previously architected high-scale banking APIs handling millions of secure transactions. Ensures "Bank-Grade" security for Forest Data. |
| **Full Stack Lead**        | **Priyanshu**      | 3 Years    | **Java & React Specialist.** Expert in building responsive admin dashboards and GIS integrations.                                                                    |
| **Project & Product Lead** | **Himang**         | 3 Years    | **Product Manager.** Specializes in translating government workflows into intuitive software UI.                                                                     |

---

### 4. IMPLEMENTATION PLAN (60 Days)

- **Week 1:** Requirement Freeze & SRS Sign-off with DFO Sathupally.
- **Week 2-3:** "Digital Lathi" App Dev (Offline Sync Module).
- **Week 4:** **BETA RELEASE (UAT)** - Field testing with 1 Range Officer & 2 Beat Officers.
- **Week 5:** "HQ" Dashboard
- **Week 6:** **GO-LIVE**, Training Workshop at Division Office, and Handover.

---

### 5. WHY VIDYAYATAN?

- Agile, innovative, and cost-effective.
- **No Licensing Fees:** We use Open-Source, Enterprise-Grade tech (PostgreSQL, OSM) to keep long-term costs zero.
- **Proven "Offline" Tech:** Our experience with _Labour Link_ guarantees a crash-free experience in connectivity-blind spots.

---

### 6. ADDENDUM: TERMS & CONDITIONS - SCHEDULE AND SCOPE MANAGEMENT

#### 1. Vendor Accountability (Our Commitment)

"In the event of any project delay attributable exclusively to Vidyayatan Technologies, we commit to deploying necessary additional resources and effort to complete the agreed scope. Any such remediation to meet the delivery standards will be executed at **no additional cost to the Client**."

#### 2. Change Management (New Additions)

"The current cost and timeline are estimated based on the **fixed scope defined for Phase 1 (MVP)**. Any new requirements, features, or significant changes (New Editions) requested by the Client post-sign-off will be treated as a **Change Request**. Such additions will necessitate a review and update of both the project commercials and delivery timelines."

#### 3. Client Dependencies & Delays

"The project schedule assumes timely feedback, UAT sign-offs, API access, and data availability from the Client. Any delays originating from the Client side (e.g., delayed approval on processes) will result in a **corresponding extension of the project timeline**. Vidyayatan Technologies reserves the right to reschedule resources in such instances."
