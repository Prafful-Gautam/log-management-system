// logger-client.ts
import winston from "winston";
import axios from "axios";
import Transport from "winston-transport";
import { logStorage } from "../middleware/traceId.middleware";
import LokiTransport from "winston-loki";

interface LogEntry {
  level: string;
  message: string;
  [key: string]: any;
}

// Custom Transport to send logs via HTTP
// class CentralizedHttpTransport extends Transport {
//   log(info: any, callback: () => void) {
//     setImmediate(() => this.emit("logged", info));

//     axios
//       .post("http://localhost:4000/logs", {
//         ...info,
//         serviceName: "Order-Service", // Identify the source
//         timestamp: new Date().toISOString(),
//       })
//       .catch((err) => console.error("Logging failed", err.message));

//     callback();
//   }
// }

class BatchedHttpTransport extends Transport {
  private buffer: LogEntry[] = [];
  private readonly batchSize: number = 1;
  private readonly flushInterval: number = 5000; // 5 seconds
  private timer: NodeJS.Timeout | null = null;

  constructor(opts?: any) {
    super(opts);
    this.startTimer();
  }

  private startTimer() {
    this.timer = setInterval(() => this.flush(), this.flushInterval);
  }

  log(info: LogEntry, callback: () => void) {
    setImmediate(() => this.emit("logged", info));

    this.buffer.push({
      ...info,
      serviceName: "Order-Service",
      timestamp: new Date().toISOString(),
    });
    console.log("buffer:-", this.buffer, this.batchSize);
    // If buffer hits the limit, send immediately
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }

    callback();
  }

  private async flush() {
    if (this.timer) clearInterval(this.timer);

    if (this.buffer.length === 0) return;

    const logsToSend = [...this.buffer];
    // Loki expects logs grouped by labels
    const lokiPayload = {
      streams: [
        {
          stream: { service: "order-service", env: "dev" }, // Labels
          values: logsToSend.map((log) => [
            (new Date(log.timestamp).getTime() * 1000000).toString(), // Nanoseconds timestamp
            JSON.stringify(log), // The actual log body
          ]),
        },
      ],
    };
    this.buffer = []; // Clear buffer immediately to prevent duplicates

    try {
      await axios.post("http://localhost:8000/logs/batch", {
        logs: lokiPayload,
      });
    } catch (err) {
      console.log({ err });
      process.stderr.write(`[Loki Push Failed] ${(err as Error).message}\n`);
      console.error("Failed to send log batch:", (err as Error).message);
      this.buffer = [...logsToSend, ...this.buffer].slice(-1000);
      // Optional: Re-add logs to buffer if you want to retry
    }
  }
}

// export const logger = winston.createLogger({
//   transports: [new winston.transports.Console(), new BatchedHttpTransport()],
// });

// export const logger = winston.createLogger({
//   level: "info",
//   transports: [
//     // Standard console output for local debugging
//     new winston.transports.Console({
//       format: winston.format.simple(),
//     }),
//     // Your custom batching transport
//     new BatchedHttpTransport({
//       level: "info", // Only send 'info' and above to the central server
//     }),
//   ],
// });

const traceFormat = winston.format((info) => {
  const store = logStorage.getStore();
  if (store) {
    info.traceId = store.get("traceId");
  }
  return info;
});

// export const logger = winston.createLogger({
//   format: winston.format.combine(
//     traceFormat(), // Automatically injects traceId into the 'info' object
//     winston.format.json(),
//   ),
//   transports: [
//     new BatchedHttpTransport(), // This will now receive the traceId inside the log object
//   ],
// });

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    traceFormat(), // Automatically injects traceId into the 'info' object
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: "logs/central.log" }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new LokiTransport({
      labels: {
        appName: "log_manager",
      },
      host: "http://127.0.0.1:3100",
      json: true,
      batching: true,
      interval: 5,
      replaceTimestamp: true,
      onConnectionError: (err) => {
        console.error("Loki connection error:", err);
      },
    }),
  ],
});
