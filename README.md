# Log Management System

This is a log management system built with Node.js, utilizing Loki for log aggregation and Prometheus for monitoring.

## Data Flow Diagram

    A[Application] --> B[Logger Client]
    B --> C[TraceId Middleware]
    C --> D[Server]
    D --> E[Loki]
    D --> F[Prometheus]

This diagram illustrates the flow of logs from the application through the logger client, middleware for adding trace IDs, to the server, and finally to Loki for storage and Prometheus for metrics.
