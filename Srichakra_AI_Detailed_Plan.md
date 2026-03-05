# Srichakra AI Model:

This document outlines the technical strategy, hardware specifications, and implementation roadmap for deploying an AI-based plastic sorting system for Srichakra.

The goal is to accurately classify plastic bales by **Polymer Type**, **Color**, and **Brand** on a moving conveyor belt using computer vision.

**Target Accuracy:**

- Initial Deployment (POC): 70-80%
- Production (Long-term): 80-95%+

---

## 2. Technical Approach: AI Model Architecture

### 2.1 Model Selection: YOLOv8 / YOLOv10 (You Only Look Once)

We recommend **YOLO (v8 or v10)** over traditional CNNs (ResNet/VGG) for the following reasons:

- **Multi-Object Detection:** Unlike CNNs which classify a single image, YOLO can detect and classify _multiple_ items (bottles) simultaneously in a single frame, which is critical for a moving conveyor with potentially overlapping items.
- **Real-Time Inference:** YOLO is optimized for speed and can run at high FPS on edge devices, ensuring valid detection even at high conveyor speeds.
- **Instance Segmentation (Optional but Recommended):** YOLOv8-seg can outline the _exact shape_ of the bottle rather than just a box. This provides better accuracy for estimating **Weight** (based on pixel area/volume approximation) and handling overlapping items.

### 2.2 Classification Logic

The model will be trained to detect `Classes` that combine Brand and Polymer to infer the material properties.

**Proposed Class Structure (Label Map):**

| Detection Class (Visual) | Inferred Metadata                                   |
| :----------------------- | :-------------------------------------------------- |
| `Bottle_Harpic_Blue`     | Polymer: HDPE, Color: Blue, Brand: Harpic           |
| `Bottle_Coke_Red`        | Polymer: PET, Color: Red/Transp, Brand: Coca-Cola   |
| `Bottle_Kinley_Clear`    | Polymer: PET, Color: Clear, Brand: Kinley           |
| `Bottle_Generic_Green`   | Polymer: PET (Likely), Color: Green, Brand: Unknown |

_Note: Visual AI (RGB) infers Polymer type based on form factor and brand. For clear, unbranded bottles, it is difficult to distinguish PET vs PVC purely by vision without NIR (Near-Infrared) sensors. We will proceed with RGB as requested but flag this limitation._

---

## 3. Hardware Specifications

### 3.1 Edge AI Compute Module

We recommend the **NVIDIA Jetson Orin** series for production-grade reliability and performance.

| Component       | Recommendation                   | Specification           | Why?                                                                                                                              |
| :-------------- | :------------------------------- | :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| **Processor**   | **NVIDIA Jetson Orin NX (16GB)** | 100 TOPS AI Performance | Capable of running YOLOv8 Large models at 30-50 FPS. The "Nano" version (40 TOPS) is too weak for high-accuracy production loads. |
| **Form Factor** | **Carrier Board + Enclosure**    | Industrial Fanless Case | Dust/Heat protection is critical in a recycling plant environment.                                                                |
| **Storage**     | **NVMe SSD (1TB)**               | High R/W Speed          | Storing video logs for retraining and model weights. SD cards are too slow/unreliable.                                            |

### 3.2 Camera System

A standard webcam will cause motion blur.

We require a **Global Shutter** camera.

| Component       | Recommendation          | Specification                          | Why?                                                                                                       |
| :-------------- | :---------------------- | :------------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| **Sensor Type** | **Global Shutter**      | Sony IMX Series (e.g., IMX264/IMX250)  | Freezes motion on the conveyor without distortion/blur.                                                    |
| **Resolution**  | **5 MP to 12 MP**       | 2448 x 2048 (approx)                   | Sufficient to read Brand Logos. 12MP if the conveyor is very wide (>1m).                                   |
| **FPS**         | **Generic Industrial**  | 30-60 FPS                              | Matches conveyor speed.                                                                                    |
| **Interface**   | **GigE (Ethernet)**     | GigE Vision Standard                   | Allows long cable runs (up to 100m) compared to USB (3m limit), enabling the PC to be kept away from dust. |
| **Lens**        | **C-Mount Fixed Focal** | 8mm - 16mm (Calculate based on height) | Low distortion lens matched to sensor size.                                                                |

**Recommended Brands:** Basler (Ace 2), FLIR (Blackfly), or HikRobot (Generic Industrial).

### 3.3 Lighting

Consistent lighting is 50% of the solution.

- **Type:** Linear LED Bar Lights (High Intensity).
- **Placement:** Top-down (Direct) to illuminate labels, or Backlight (if transparency detection is key).
- **Requirement:** High CRI (>90) for accurate **Color** sorting.

---

## 4. Data Strategy

### 4.1 Data Collection Plan

**Goal:** 1,000+ Diverse Images
**Source:** Srichakra Facility (Real-world data is non-negotiable).

1. **Setup:** Mount a temporary camera (e.g., GoPro or Phone on a tripod) above the existing conveyor.
2. **Recording:** Record 2-3 hours of video at different times of day (morning/afternoon) to capture lighting variations.
3. **Extraction:** Extract frames from video (e.g., 1 frame every 5 seconds) to avoid duplicate data.

### 4.2 Annotation (Labeling)

We will use an annotation tool (e.g., CVAT, LabelImg, or Roboflow).

- **Annotation Type:** **Bounding Box** (MVP) -> **Polygon** (Phase 2 for Weight/Overlap).
- **Labeling Guide:**
  - Draw tight boxes around every bottle.
  - Attributes to tag: `Brand`, `Color`, `Condition` (Crushed/Whole).
- **Volume:**
  - Phase 1: 1,000 images (Manual tagging).
  - Phase 2: Active Learning (Model predicts, human corrects).

---

## 5. Accuracy Progression Strategy (70% → 95% Journey)

Achieving >90% accuracy in real-world environments requires a phased approach to handling complexity.

### Phase A: The "Low Hanging Fruit" (Target: 70-80%)

- **Focus:** Clean, separate bottles, major brands (Coke, Pepsi, Kinley), and distinct colors (Clear vs Green).
- **Data:** 1,000 images from Srichakra.
- **Challenge:** The model will struggle with overlapping bottles, crushed items, and dirty labels.
- **Solution:** Basic YOLOv8 training.

### Phase B: Robustness Refinement (Target: 80-90%)

- **Focus:** "Edge Cases" – Crushed bottles, partial labels, mud/dirt, and variable lighting.
- **Technique 1: Data Augmentation:** Artificially modifying images (rotating, changing brightness, adding noise) to teach the model to ignore lighting changes.
- **Technique 2: Hard Negative Mining:** Specifically collecting images where the model fails (e.g., confusing a dirty clear bottle for a blue one) and retraining on those errors.
- **Technique 3: Instance Segmentation:** Moving from "boxes" to "polygons" to separate overlapping bottles accurately.

### Phase C: Production Optimization (Target: 95%+)

- **Focus:** Long-tail distribution (rare brands, new packaging) and preventing "flicker".
- **Technique 1: Temporal Consistency (DeepSORT):** Using tracking logic. If a bottle is classified as "Coke" in Frame 1, it shouldn't become "Unknown" in Frame 2. We track the object across frames to smooth the decision.
- **Technique 2: Active Learning Pipeline:** The system will automatically save "Low Confidence" images (<50%) to a folder. A human reviews these daily (approx 15 mins), corrects them, and the model retrains overnight. This ensures continuous learning.

---

## 6. Implementation Roadmap

### Month 1: Proof of Concept (POC)

- **Week 1:** Data Collection (Video from Srichakra) & Annotation (500 images).
- **Week 2:** Model Training (Cloud GPU) & Validation.
- **Week 3:** Demo Presentation (Video overlay showing detections).
- **Deliverable:** Validated feasibility report & hardware purchase order.

### Month 2: Pilot Deployment (On-Site)

- **Week 4:** Hardware Procurement (Jetson Orin, Camera, Lights).
- **Week 5-6:** Installation on "Pre-Segregation" line (non-intrusive).
- **Week 7:** Live testing & Data calibration (Lighting adjustments).
- **Week 8:** **Milestone 1:** 75% Live Accuracy achieved.

### Month 3-4: Scale & Optimization

- **Week 9-12:** Deploy to "Post-Segregation" line.
- **Week 13+:** Enable Active Learning Loop (Retraining pipeline).
- **Milestone 2:** >90% Accuracy & Integration with sorting air-jets (if applicable).

---

## 6. Immediate Next Steps (Action Items)

1. **Site Visit:** Schedule visit to measure mounting height and conveyor width to select the correct **Lens Focal Length**.
