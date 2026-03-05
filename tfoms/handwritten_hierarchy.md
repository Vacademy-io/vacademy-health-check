# Hierarchy of Forest Dept. at District

**Administrator:** DFO (DFO Office, Kmm)

The hierarchy splits into three main branches:

## 1. KHAMMAM DIVISION (FDO, KHAMMAM)

- **RANGE 1: KHAMMAM** (FRO, KHAMMAM)
- **KAREPALLY** (FRO, KAREPALLY)
- **KUSUMANCHI** (FRO, KUSUMANCHI)
- **MADHIRA** (FRO, MADHIRA)

## 2. FRO, TASKFORCE, KHAMMAM

- **SECTION** (DY.R.O)
  - F.S.O
  - F.B.O.

## 3. SATHUPALLY DIVISION (FDO, SATHUPALLY)

### A. SATHUPALLY RANGE

- **Section** (DRO/FSO 1)
  - BEAT 1 (FBO)
  - BEAT 2 (FBO)
  - BEAT 3 (FBO)
- **Sec 2**
- **Sec 3**
- **Sec 4**

### B. TALLADA RANGE

- **Sec 1**
  - BEAT 1
  - BEAT 2
  - BEAT 3
- **Sec 2**
- **Sec 3**

## Visual Representation

```mermaid
graph TD
    DFO[DFO<br/>DFO Office, Kmm]

    %% Main Branches
    KhammamDiv[KHAMMAM DIVISION<br/>FDO, KHAMMAM]
    TaskForce[FRO, TASKFORCE<br/>KHAMMAM]
    SathupallyDiv[SATHUPALLY DIVISION<br/>FDO, SATHUPALLY]

    DFO --> KhammamDiv
    DFO --> TaskForce
    DFO --> SathupallyDiv

    %% 1. Khammam Division
    KhammamDiv --> Range1[RANGE 1: KHAMMAM<br/>FRO, KHAMMAM]
    KhammamDiv --> Karepally[KAREPALLY<br/>FRO, KAREPALLY]
    KhammamDiv --> Kusumanchi[KUSUMANCHI<br/>FRO, KUSUMANCHI]
    KhammamDiv --> Madhira[MADHIRA<br/>FRO, MADHIRA]

    %% 2. Task Force
    TaskForce --> TFSection[SECTION<br/>DY.R.O]
    TFSection --> TFFSO[F.S.O]
    TFFSO --> TFFBO[F.B.O.]

    %% 3. Sathupally Division
    SathupallyDiv --> SathupallyRange[SATHUPALLY RANGE<br/>FDO, SATHUPALLY]
    SathupallyDiv --> TalladaRange[TALLADA RANGE]

    %% 3A. Sathupally Range
    SathupallyRange --> S_Sec1[Section<br/>DRO/FSO 1]
    SathupallyRange --> S_Sec2[Sec 2]
    SathupallyRange --> S_Sec3[Sec 3]
    SathupallyRange --> S_Sec4[Sec 4]

    S_Sec1 --> S_Sec1_B1[BEAT 1<br/>FBO]
    S_Sec1 --> S_Sec1_B2[BEAT 2<br/>FBO]
    S_Sec1 --> S_Sec1_B3[BEAT 3<br/>FBO]

    %% 3B. Tallada Range
    TalladaRange --> T_Sec1[Sec 1]
    TalladaRange --> T_Sec2[Sec 2]
    TalladaRange --> T_Sec3[Sec 3]

    T_Sec1 --> T_Sec1_B1[BEAT 1]
    T_Sec1 --> T_Sec1_B2[BEAT 2]
    T_Sec1 --> T_Sec1_B3[BEAT 3]
```
