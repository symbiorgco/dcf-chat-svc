import "dotenv/config";
import cors from "cors";
import express from "express";
import { router as chat } from "./routes/chat";
import { initWebsockets } from "./websockets";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use("/api/chat", chat);
const port = process.env.PORT || 8402;
app.listen(port, () => console.log(`Server running on port ${port}`));

//Init the websockets
initWebsockets();
