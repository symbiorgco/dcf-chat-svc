import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { router as chat } from "./routes/chat";
import { initWebsockets } from "./websockets";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(
  (
    err: SyntaxError & { status?: number; body?: unknown },
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
      return res.status(400).json({
        error: true,
        code: "INVALID_JSON",
        message: "Malformed JSON body",
      });
    }

    return next(err);
  },
);
app.use("/api/chat", chat);
const port = process.env.PORT || 8402;
app.listen(port, () => console.log(`Server running on port ${port}`));

//Init the websockets
initWebsockets();
