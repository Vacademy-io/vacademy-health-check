# Srichakra AI: Initial Data Collection Guide

## 1. Objective

To collect high-quality video footage of the existing conveyor belt operations. This data will be used to train the initial "Proof of Concept" (POC) AI model to detect brands, colors, and polymer types.

**Goal:** Capture 10-15 minutes of video covering various real-world scenarios.

---

## 2. Equipment & Setup

For this initial data collection, a high-end smartphone (iPhone/Samsung) or a GoPro is sufficient.

### 2.1 Camera Settings

- **Resolution:** **4K** (Preferred) or 1080p. Higher resolution helps us read small brand labels.
- **Frame Rate (FPS):** **60 FPS** (Critical). Standard 30 FPS may be too blurry for a moving conveyor.
- **Orientation:** **Landscape** (Horizontal).
- **Zoom:** 1x (Do not use digital zoom; it reduces quality).

### 2.2 Camera Mounting / Positioning

- **Position:** Directly **Top-Down** (Perpendicular to the conveyor belt).
  - _Avoid angled shots_ if possible, as they distort the shape and make weight estimation harder.
- **Height:** Place the camera high enough to see the **entire width** of the belt, but low enough to read the text on a bottle cap.
- **Stability:** The camera must be **absolutely still**.
  - Use a tripod or clamp.
  - Do **not** hold the camera by hand (handshake ruins the training data).

### 2.3 Lighting

- Ensure the area is well-lit.
- If there are shadows or glare (reflection) on the plastic, try to adjust the ambient light or add a temporary LED light source.
- Avoid direct sunlight if it causes harsh shadows.

---

## 3. Recording Scenarios

Please record separate video clips for the following scenarios.

### Scenario A: Standard Operation (5 Minutes)

- **Content:** Normal mix of bottles passing on the conveyor.
- **Density:** Typical spacing between bottles.
- **Purpose:** To train the model on the most common daily conditions.

### Scenario B: High Density / Clutter (3 Minutes)

- **Content:** Allow more bottles than usual to pass, letting them touch or overlap.
- **Purpose:** To test the model's ability to separate overlapping items (Instance Segmentation).

### Scenario C: "Edge Cases" (3 Minutes)

- **Content:** Specifically include:
  - Crushed / Flattened bottles.
  - Dirty / Muddy bottles.
  - Bottles with missing labels.
- **Purpose:** To make the model robust against damaged items.

### Scenario D: Calibration Object (1 Minute)

- **Content:** Place a ruler or a standard object (e.g., a known A4 sheet of paper) on the stopped conveyor and record it for 10 seconds.
- **Purpose:** This allows us to calculate the "Pixels per Millimeter" ratio for weight/size estimation.

---

## 4. Checklist Before Recording

1.  [ ] Lens is clean (wipe fingerprints).
2.  [ ] FPS is set to 60.
3.  [ ] Camera is fixed and not shaking.
4.  [ ] Entire belt width is visible.
5.  [ ] Top-down view is centered.

---

## 5. Sharing the Data

Video files will be large (Gigabytes). Please do not send via WhatsApp (compression destroys quality).

- **Method:** Upload to Google Drive / OneDrive / WeTransfer.
- **Folder Structure:**
  - `/Srichakra_Data_Collection`
    - `/Scenario_A_Standard`
    - `/Scenario_B_HighDensity`
    - etc.
