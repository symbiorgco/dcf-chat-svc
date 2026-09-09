import "dotenv/config";
import cors from "cors";
import express from "express";
import { router as chat } from "./routes/chat";
import { configureHttpSecurity } from "./security";
import { initWebsockets } from "./websockets";

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
configureHttpSecurity(app);
app.use(express.json());
app.use("/api/chat", chat);
const port = process.env.PORT || 8402;
app.listen(port, () => console.log(`Server running on port ${port}`));

//Init the websockets
initWebsockets();
