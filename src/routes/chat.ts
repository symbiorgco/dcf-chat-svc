import "dotenv/config";
import express from "express";
import { sendAnnouncement, viewers } from "../websockets";
import { bannedUsers, isAdmin, recentChatMessages } from "../chat";
import { verifyJwt } from "../authentication";
import { logger } from "../logger";

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

router.get("/get_banned_wallets", async (req, res) => {
  try {
    const authKey = req.headers.authorization;

    const chatProfile = await verifyJwt(authKey);

    if (chatProfile && isAdmin(chatProfile.walletId)) {
      res.json({ completed: true, wallets: bannedUsers });
    } else {
      res.json({ error: true });
    }
  } catch (err) {
    res.json({ error: true });
  }
});

router.post("/send_announcement", async (req, res) => {
  try {
    const authKey = req.headers.authorization;

    const chatProfile = await verifyJwt(authKey);

    if (chatProfile && isAdmin(chatProfile.walletId)) {
      const type = req.body.type as string;
      const message = req.body.message as string;
      const wallet = req.body.wallet as string;

      switch (type) {
        case "ALL":
          sendAnnouncement(message, wallet, true);
          break;
        case "SOLO":
        default:
          sendAnnouncement(message, wallet, false);
          break;
      }

      res.json({ completed: true });
    } else {
      res.json({ error: true, auth: "false" });
    }
  } catch (err) {
    res.json({ error: true });
  }
});
