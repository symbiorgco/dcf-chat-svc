import "dotenv/config";
import express from "express";
import { viewers } from "../websockets";
import { bannedUsers, isAdmin, recentChatMessages, unbanUser } from "../chat";
import { verifyJwt } from "../authentication";

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
