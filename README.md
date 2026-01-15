# Infrastructure Diagnostics Dashboard

This is a **shadcn/ui** powered dashboard for monitoring system health, built with React, Vite, and Tailwind CSS.

## Features

- **Real-time Monitoring**: Visualizes system health, Kubernetes status, and service connectivity.
- **Mock Data Integration**: Currently uses mock data based on the provided API guide.
- **Responsive Design**: Fully responsive layout with dark mode support (default).
- **Interactive Elements**: Tabs for detailed views (Kubernetes, Services, Connectivity).

## Project Structure

- `src/components/Dashboard.tsx`: Main dashboard component containing mock data and layout logic.
- `src/components/ui/`: Reusable UI components from shadcn/ui.
- `src/lib/utils.ts`: Utility functions (cn).

## Getting Started

1.  **Install Dependencies**:

    ```bash
    pnpm install
    ```

2.  **Run Development Server**:

    ```bash
    pnpm dev
    ```

3.  **Build for Production**:
    ```bash
    pnpm build
    ```

## Customization

To connect to the real API:

1.  Open `src/components/Dashboard.tsx`.
2.  Update the `fetchData` function to make actual `fetch()` calls to `https://backend-stage.vacademy.io/community-service/diagnostics/...`.
3.  Remove the `setTimeout` simulation.
