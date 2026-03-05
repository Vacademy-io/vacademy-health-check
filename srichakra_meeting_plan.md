# Sri Chakra Plastic Waste Classification - Initial Meeting Plan

## 1. Project Scope & Objectives

**Goal**: Develop a CNN-based model to classify and segregate plastic waste.
**Current Reference**: [CNN-Plastic-Waste-Classification](https://github.com/Hardik-Sankhla/CNN-Plastic-Waste-Classification) (Classifies into Organic vs. Recyclable).
**Vidyut Team's Role**: Assess feasibility, gather requirements, and propose an implementation plan for the Sri Chakra team.

## 2. Requirements from Sri Chakra Team (The "Ask")

To build a robust model tailored to their specific needs, we need the following:

### A. Data (Crucial)

- **Sample Images**: We need images of the _actual_ waste stream they deal with. Generic internet datasets often fail in real-world deployment due to lighting and background differences.
- **Categories**: A clear list of classes they want to detect.
  - _Simple_: Plastic vs. Non-Plastic.
  - _Intermediate_: Recyclable vs. Organic (like the reference repo).
  - _Advanced_: Specific plastic types (PET, HDPE, PVC, LDPE, PP, PS, Others) or specific items (bottles, bags, wrappers).
- **Volume**:Ideally 500-1000 labeled images per category to start.

### B. Environment & Constraints

- **Deployment Environment**: Where will the camera be?
  - Conveyor belt?
  - Bin entrance?
  - Handheld mobile app?
- **Lighting**: Controlled lighting (consistent) or variable sorting center lighting?
- **Background**: What is behind the waste? Complex backgrounds make detection harder involved.

## 3. Technical Expectations (Latency & Performance)

### Latency Estimates (Inference Speed)

- **Cloud/GPU Server**: < 50ms per image.
- **Edge Device (Jetson Nano/Orin)**: 50ms - 150ms (Real-time capabable).
- **Std. CPU / Mobile**: 100ms - 500ms depending on model complexity.
- _Reference_: YOLOv8 models typically achieve 80-160ms on standard hardware, while heavier segmentation models (Mask R-CNN) can take 200-350ms.

### Accuracy Expectations

- **Baseline (Reference Repo)**: ~85-90% accuracy on clear, single-item images.
- **Real-World Expectation**:
  - _Single item visible_: >90% is achievable.
  - _Cluttered/Piled waste_: Accuracy drops significantly without object detection (YOLO) or segmentation approaches.

## 4. Proposed Solution & Enhancements (Vidyayatan Team)

If our team takes this up, here is the value add:

1. **Better Architecture**: Move beyond basic CNNs. Use **Transfer Learning** with state-of-the-art architectures:
   - **EfficientNet** or **MobileNetV3** for high accuracy with low latency.
   - **YOLOv8/v11** if object detection (finding _where_ the plastic is) is needed, not just classification.
2. **Data Augmentation Pipeline**: We will artificially expand their limited dataset using rotations, lighting changes, flips, and noise to make the model robust.
3. **Active Learning Loop**: We can build a system where uncertain predictions are flagged for human review, continuously improving the model over time.
4. **Edge Deployment**: Optimization for running locally on device (TensorRT, TFLite) to remove internet dependency and reduce latency.

## 5. Key Questions for the Meeting

1. **What is the specific segregation goal?** (e.g., "Separate PET bottles from everything else" vs "Sort all waste into 5 categories").
2. **How will the model be used?** (Automated robotic arm, diverting flap on conveyor, or just a dashboard alert?).
3. **What is the budget/resource for hardware?** (Can we use a GPU edge integration or must it run on a Raspberry Pi/Phone?).
4. **Do you have existing video footage or images of your waste stream?**
5. **What is the "Minimum Viable Accuracy"?** (Is 90% okay, or does a 1% error rate cause machinery jams?).
