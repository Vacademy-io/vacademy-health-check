# T-FOMS Visual Diagrams

Based on the [Project Plan](PROJECT_PLAN.md) and [Organizational Hierarchy](handwritten_hierarchy.md), here are the visual representations of the system's use cases and process flows.

## 1. System Use Case Diagram

This diagram outlines the primary actors and their interactions with the T-FOMS system.

```mermaid
graph TD
    %% Actor Definitions
    FieldStaff["FBO (Field Staff)"]
    Investigator["DyRO / FSO"]
    FRO["FRO"]
    FDO["FDO"]
    DFO["DFO"]
    Taskforce["Taskforce"]

    %% Use Case Definitions
    UC1["Create POR (Form A)"]
    UC2["Generate Seizure Form (Form B)"]
    UC3["Generate Safe Custody (Form C)"]
    UC4["Record Witness/Pancha Details"]

    UC5["Investigation (Statements/Evidence)"]
    UC6["Issue Notices (41A CrPC)"]
    UC7["Generate Charge Sheet (Non-Wildlife)"]

    UC8["Verify POR & Forms"]
    UC9["Record Confession"]
    UC10["Issue Compounding Order (Form E)"]
    UC11["Generate Compounding Charge Sheet (Form F)"]

    UC12["Issue Prosecution Orders"]
    UC13["Universal POR Oversight"]
    UC14["Approve Major Compounding"]

    %% Relationships
    FieldStaff --> UC1
    FieldStaff --> UC2
    FieldStaff --> UC3
    FieldStaff --> UC4

    Investigator --> UC5
    Investigator --> UC6
    Investigator --> UC7

    FRO --> UC8
    FRO --> UC9
    FRO --> UC10
    FRO --> UC11

    FDO --> UC12
    FDO --> UC13
    FDO --> UC14

    DFO --> UC13
    DFO --> UC14

    %% Integrations
    UC1 -.->|trigger| UC8
    UC5 -.->|support| UC7
```

## 2. Offense Reporting Flow (Mobile App)

The sequence of actions for Field Staff using the "Digital Lathi" mobile application.

```mermaid
graph TD
    Start("Start: Detect Offense") --> Capture["Capture Evidence"]
    Capture --> Detail["Input Details<br/>(Voice/Text)"]
    Detail --> Pancha["Record Pancha Witness"]

    Pancha --> GenForms["Generate Forms"]
    GenForms --> FormA["Form A: POR"]
    GenForms --> FormB["Form B: Seizure Report"]
    GenForms --> FormC["Form C: Safe Custody"]

    FormC --> Network{"Network Available?"}
    Network -- Yes --> Sync["Sync to Server"]
    Network -- No --> Store["Store Locally"]

    Store -.->|Later| Sync
    Sync --> Notify["Notify FSO, FRO, FDO, DFO"]
    Notify --> End("End: POR Submitted")
```

## 3. Case Disposal Decision Workflow (Rules 1969)

This flow illustrates the logic for determining whether a case undergoes Compounding or Prosecution, adhering to the authority hierarchies.

```mermaid
graph TD
    Input["POR Received"] --> Investigate["DyRO/FSO Investigation<br/>(Statements, 63B Cert, 41A Notice)"]
    Investigate --> Assess["Assess Offense Type"]

    subgraph Decision_Process
        Assess --> IsCompoundable{"Is Compoundable?"}

        IsCompoundable -- Yes --> Valuation{"Value < Rs 500 &<br/>Not Critical?"}

        Valuation -- Yes --> AuthFRO["Authority: FRO"]
        Valuation -- No --> AuthHigher["Authority: FDO/DFO"]

        AuthFRO --> IssueNOTICE["Issue 35 BNSS Notice"]
        AuthHigher --> IssueNOTICE

        IssueNOTICE --> CollectFee["Collect C Fees"]
        CollectFee --> GenCF140["Auto-Generate C.F 140"]
        GenCF140 --> FormF["Generate Form F<br/>(Compounding Charge Sheet)"]
        FormF --> UploadProc["Upload Proceedings"]

        IsCompoundable -- No --> NonComp["Non-Compoundable Route"]
        NonComp --> Forward["FRO sends to FDO"]
        Forward --> ProsOrder["Issue Prosecution Orders"]
        ProsOrder --> ChargeSheet["File Charge Sheet (Court)"]
        ChargeSheet --> CourtResult["Upload Court Order<br/>(Acquittal/Conviction)"]
    end
```

## 4. Organizational Hierarchy & Data Visibility

Visualizing how data flows through the specific divisions identified in the hierarchy.

```mermaid
graph TD
    subgraph Headquarters
        DFO["DFO: District Forest Officer"]
    end

    subgraph Khammam_Division
        FDO1["FDO Khammam"]
        R1["FRO Khammam"]
        R2["FRO Karepally"]
        R3["FRO Kusumanchi"]
        R4["FRO Madhira"]
    end

    subgraph Sathupally_Division
        FDO2["FDO Sathupally"]
        R5["Range: Sathupally"]
        R6["Range: Tallada"]

        Sec1["Section: DRO/FSO"]
        Beat1["Beat 1 FBO"]
        Beat2["Beat 2 FBO"]
    end

    subgraph Taskforce
        TFFRO["FRO Taskforce"]
        TFDYRO["Dy.RO"]
        TFFSO["FSO"]
        TFFBO["FBO"]
    end

    DFO --> FDO1
    DFO --> FDO2
    DFO --> TFFRO

    FDO1 --> R1
    FDO1 --> R2
    FDO1 --> R3
    FDO1 --> R4
    FDO2 --> R5
    FDO2 --> R6

    R5 --> Sec1
    Sec1 --> Beat1
    Sec1 --> Beat2

    TFFRO --> TFDYRO
    TFDYRO --> TFFSO
    TFFSO --> TFFBO

    classDef head fill:#f96,stroke:#333;
    classDef div fill:#69f,stroke:#333;
    classDef range fill:#9f6,stroke:#333;

    class DFO head;
    class FDO1,FDO2,TFFRO div;
    class R1,R2,R3,R4,R5,R6,TFDYRO range;
```

## 5. High-Level Entity Relationship Diagram (ERD)

This diagram models the core data entities and their relationships within the T-FOMS backend.

![High-Level Entity Relationship Diagram](images/Screenshot%202026-02-13%20at%201.34.53%E2%80%AFPM.png)

## 6. Offline Sync & Voice-to-Text Sequence

Sequence of events for the "Digital Lathi" app operating in offline mode and syncing later.

```mermaid
sequenceDiagram
    participant App as Mobile App
    participant Local as Local Storage
    participant API as API Gateway
    participant AI as AI Voice Service
    participant DB as Main Database

    Note over App, Local: User is Offline in Deep Forest
    App->>App: User Records Voice Statement
    App->>Local: Save Audio File (Encrypted)
    App->>Local: Save Draft POR Data

    Note over App, API: User Returns to Network Area
    App->>API: Sync Pending PORs (Batch)
    API->>DB: Store Raw Data

    par Async AI Processing
        API->>AI: Send Audio File
        AI->>AI: Transcribe (Telugu/Eng) to Text
        AI-->>API: Return Transcribed Text
        API->>DB: Update POR with Text
        API-->>App: Push Notification "Transcription Ready"
    end
```

## 7. User Roles & Access Matrix

Based on the [Organizational Hierarchy](handwritten_hierarchy.md), this section defines "Who uses What" and their specific permissions in the system.

### A. Role Capability Breakdown

| Hierarchy Level       | Roles                                            | Primary Interface                   | Key Capabilities & Views                                                                                                                                                                                  | Data Visibility Scope                                                                                                    |
| :-------------------- | :----------------------------------------------- | :---------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **1. Field Level**    | **FBO** (Beat Officer)``**Taskforce Constable**  | **Mobile App**``("Digital Lathi")   | •**Create POR**: Issue **Form A** (POR), **Form B** (Seizure), **Form C** (Safe Custody).`• **Witness**: Record Pancha witness description.`• **Offline Mode**: Local store & forward.                    | •**Restricted**: Can only see reports created by themselves.``• Cannot edit after submission.                            |
| **2. Section Level**  | **FSO** (Section Officer)``**Dy.RO** (Taskforce) | **Mobile App**``+ Limited Web       | •**Investigate**: Collect 161 Statements, Expert Opinions, Call Analysis.`• **Legal**: Issue **63B Cert** (Evidence) & **35 BNSS (41A CrPC)** Notice.`• **Charge Sheet**: Prepare for Non-Wildlife cases. | •**Universal Visibility**: Instant view of ALL PORs in their jurisdiction.``• View all reports within their Section.     |
| **3. Range Level**    | **FRO** (Range Officer)``**FRO Taskforce**       | **Web Portal**``(Range Dashboard)   | •**Compounding**: Issue Order (Form E) & **Form F** (Compounding Charge Sheet).`• **Non-Compoundable**: Forward to FDO for Prosecution Orders.`• **Confession**: Record accused confession.               | •**Universal Visibility**: Instant view of ALL PORs in their Range.``• Full access to all Sections & Beats.              |
| **4. Division Level** | **FDO** (Divisional Officer)                     | **Web Portal**``(Division Admin)    | •**Prosecution**: Issue Prosecution Orders.`• **Major Approvals**: Compounding for high value (> ₹500) cases.`• **Oversight**: Monitor FRO performance.                                                   | •**Universal Visibility**: Instant view of ALL PORs in their Division.``• Full access to Khammam OR Sathupally Division. |
| **5. District Level** | **DFO** (District Officer)                       | **Web Portal**``(HQ Command Center) | •**Strategic View**: GIS Heatmaps of entire district.`• **Taskforce Control**: Direct tasks to Taskforce teams.`• **Admin**: Master data (Species lists, Fine rates).                                     | •**Global Access**: Full visibility of Khammam Division, Sathupally Division, and Taskforce.                             |

### B. Access & Logic Map

Visualizing how different roles interact with the system interfaces.

```mermaid
graph TD
    %% Subgraphs for User Groups
    subgraph Mobile_App_Users
        FBO["FBO / Taskforce Team"]
        FSO["FSO / Dy.RO"]
    end

    subgraph Web_Portal_Users
        FRO["FRO (Range Officer)"]
        FDO["FDO (Divisional Officer)"]
        DFO["DFO (District Admin)"]
    end

    %% Actions
    FBO -- "Digital Lathi App" --> Create["Create POR & Seizure Forms"]
    FSO -- "Digital Lathi App" --> Verify["Verify & Forward"]

    Create --> Backend["T-FOMS Cloud"]
    Verify --> Backend

    Backend --> FRO_View["Range Dashboard"]
    Backend --> FDO_View["Division Dashboard"]
    Backend --> DFO_View["HQ Command Center"]

    %% Capabilities
    FRO_View -.-> Action1["Action: Compound (< Rs 500)"]
    FRO_View -.-> Action2["Action: File Charge Sheet"]

    FDO_View -.-> Action3["Action: Approve Major Cases"]
    FDO_View -.-> Action4["Action: Handle Appeals"]

    DFO_View -.-> Action5["Action: Global Analytics"]
    DFO_View -.-> Action6["Action: Master Data Mgmt"]

    %% Styling
    classDef mobile fill:#f9f,stroke:#333,stroke-width:2px;
    classDef web fill:#bbf,stroke:#333,stroke-width:2px;

    class FBO,FSO mobile;
    class FRO,FDO,DFO web;
```
