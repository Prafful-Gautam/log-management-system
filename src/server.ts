import express, { Request, Response } from "express";
import { traceMiddleware } from "./middleware/traceId.middleware";
import { logger } from "./logger/logget-client";
import { createLogger, transports } from "winston";
import client from "prom-client";
import responseTime from "response-time";
import LokiTransport from "winston-loki";
import { someHeavyTask } from "../utils/util";

const app = express();
app.use(express.json());
app.use(traceMiddleware);

const collectDefaultMetric = client.collectDefaultMetrics;
collectDefaultMetric({ register: client.register });

const reqResTime = new client.Histogram({
  name: "http_express_req_res_time",
  help: "This tell how much time is taken by req res",
  labelNames: ["method", "route", "status_code"],
  buckets: [50, 100, 200, 300, 500, 800, 1000, 2000],
});

const totalCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP Requests",
  labelNames: ["method", "route", "status_code"],
});

app.use(
  responseTime((req: Request, res: Response, time) => {
    if (req.url.startsWith("/metrics") || req.url.startsWith("/.well-known/"))
      return;

    // const routePath = req.url;
    const routePath = req.route.path || req.path;
    totalCounter.labels(req.method, routePath, res.statusCode.toString()).inc();

    reqResTime
      .labels({
        method: req.method,
        route: routePath,
        status_code: res.statusCode,
      })
      .observe(time);
  }),
);

// const internalLogger = createLogger({
//   level: "info",
//   transports: [
//     new transports.File({ filename: "logs/central.log" }),
//     new transports.File({ filename: "logs/error.log", level: "error" }),
//     new LokiTransport({
//       labels: {
//         appName: "log_manager",
//       },
//       host: "http://loki:3100",
//       json: true,
//       batching: true,
//       interval: 5,
//       replaceTimestamp: true,
//       onConnectionError: (err) => {
//         console.error("Loki connection error:", err);
//       },
//     }),
//   ],
// });

// app.post("/logs/batch", (req, res) => {
//   const { logs } = req.body;
//   console.log("logs--->", logs);
//   if (!Array.isArray(logs.streams)) {
//     return res.status(400).send("Invalid logs format");
//   }

//   logs.streams.forEach((logEntry) => {
//     logger.log({
//       level: logEntry.level || "info",
//       message: `[${logEntry.serviceName}] ${logEntry.message}`,
//       ...logEntry,
//     });
//   });

//   // Dont use BatchedHttpTransport instance, it will become infinite loop
//   console.log("hitiing-----", JSON.stringify(logs.streams));
//   // logs.streams.forEach((l) => internalLogger.info(l.message, l));

//   res.status(202).send("Batch Received");
// });
app.get("/metrics", async (req, res) => {
  res.setHeader("Content-Type", client.register.contentType);
  const metrics = await client.register.metrics();
  res.send(metrics);
});

app.get("/order/:id", async (req, res) => {
  // You don't pass the traceId here—the logger finds it itself!
  try {
    const data = await someHeavyTask();
    logger.info("Fetching order details", {
      orderId: req.params.id,
      res: data,
    });
    res.send({ status: "success" });
  } catch (error) {
    logger.error((error as Error).message);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(8000, () => console.log("Log Server running on port 8000"));

process.on("SIGTERM", async () => {
  console.log("Shutting down... flushing logs.");
  // You would ideally expose the transport instance to call flush() here
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception", {
    message: err.message,
    stack: err.stack,
  });
});

process.on("unhandledRejection", (reason: any) => {
  logger.error("Unhandled Rejection", {
    reason,
  });
});
