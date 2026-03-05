# Log Management System

This is a log management system built with Node.js, utilizing Loki for log aggregation and Prometheus for monitoring.

## Data Flow Diagram

Application
↓
Logger Client
↓
TraceId Middleware
↓
Server
↙ ↘
Loki Prometheus

This diagram illustrates the flow of logs from the application through the logger client, middleware for adding trace IDs, to the server, and finally to Loki for storage and Prometheus for metrics.
