import "dotenv/config";
import express from "express";
import { viewers } from "../websockets";
import { recentChatMessages } from "../chat";

export const router = express.Router();

router.get("/viewers", async (req, res) => {
  try {
    res.json({ completed: true, viewers: viewers });
  } catch (err) {
    console.log(err);
    res.json({ error: true });
  }
});

router.get("/get_history", async (req, res) => {
  try {
    res.json({ completed: true, messages: recentChatMessages });
  } catch (err) {
    res.json({ error: true });
  }
});
