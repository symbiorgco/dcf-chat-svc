import "dotenv/config";
import express from "express";
import { playerProfiles, sendAnnouncement, viewers } from "../websockets";
import { buildPublicTipAnnouncement } from "../announcements";
import {
  bannedUsers,
  getChatMessageAuthorWallet,
  isAdmin,
  isAllowedToChat,
  isHelpfulDegen,
  isMod,
  recentChatMessages,
} from "../chat";
import { verifyJwt } from "../authentication";
import { logChatReport } from "../utils/modLogging";
import NodeCache from "node-cache";
import { verifyTransaction } from "../plugins/solana";
import { fetchPersonasProfile } from "../plugins/personas";
import { ChatMetaData } from "../utils/types";

const reportIntervalCache = new NodeCache({
  stdTTL: 10, // 1 message per second
  checkperiod: 30,
});

const txCheckintervalCache = new NodeCache({
  stdTTL: 2, // 2 message per second
  checkperiod: 10,
});

const parsedTXs: string[] = [];

export const router = express.Router();

router.get("/viewers", async (req, res) => {
  try {
    res.json({ completed: true, viewers: viewers, players: playerProfiles });
  } catch (err) {
    console.log(err);
    res.json({ error: true });
  }
});

router.get("/get_history", async (req, res) => {
  try {
    res.json({ completed: true, messages: recentChatMessages.get(0) }); // Legacy
  } catch (err) {
    res.json({ error: true });
  }
});

router.get("/get_history_all", async (req, res) => {
  try {
    const messages = Object.fromEntries(recentChatMessages);
    messages[999] = [];
    res.json({
      completed: true,
      messages,
    });
  } catch (err) {
    res.json({ error: true });
  }
});

router.get("/get_banned_wallets", async (req, res) => {
  try {
    const authKey = req.headers.authorization;

    const chatProfile = await verifyJwt(authKey);

    if (
      chatProfile &&
      (isAdmin(chatProfile.walletId) ||
        isMod(chatProfile.walletId) ||
        isHelpfulDegen(chatProfile.walletId))
    ) {
      res.json({ completed: true, wallets: bannedUsers });
    } else {
      res.json({ error: true });
    }
  } catch (err) {
    res.json({ error: true });
  }
});

router.post("/report", async (req, res) => {
  try {
    console.log("Reporting");
    const authKey = req.headers.authorization;

    const chatProfile = await verifyJwt(authKey);

    if (chatProfile) {
      if (isAllowedToChat(chatProfile.walletId)) {
        if (reportIntervalCache.get(chatProfile.walletId)) {
          res.json({
            error: true,
            message: "Please don't spam the reports",
          });
          return;
        }
        reportIntervalCache.set(chatProfile.walletId, true);
        //Allowed to chat = allowed to report
        const channel = Number.parseInt(req.body.channel);
        const message = recentChatMessages
          .get(channel)
          .find((msg) => msg.id === req.body.id);
        if (message) {
          const reportedWallet =
            getChatMessageAuthorWallet(message.id, channel) ||
            message.wallet ||
            "UNKNOWN";
          await logChatReport(
            chatProfile.walletId,
            chatProfile.nickname,
            reportedWallet,
            message.username,
            message.message,
            channel
          );
          res.json({ completed: true });
        } else {
          res.json({ error: true, message: "Cannot report this message" });
        }
      } else {
        res.json({ error: true, message: "Cannot report" });
      }
    } else {
      res.json({ error: true });
    }
  } catch (err) {
    res.json({ error: true });
  }
});

router.post("/send_announcement", async (req, res) => {
  try {
    let authenticated = false;

    const authKey = req.headers.authorization;

    if (!authKey || authKey.length === 0) {
      if (req.headers["internal-key"] === process.env.INTERNAL_KEY) {
        authenticated = true;
      }
    } else {
      const chatProfile = await verifyJwt(authKey);
      if (chatProfile && isAdmin(chatProfile.walletId)) {
        authenticated = true;
      }
    }

    if (authenticated) {
      const type = req.body.type as string;
      const message = req.body.message as string;
      const wallet = req.body.wallet as string;

      let metadata: ChatMetaData | undefined;
      if (req.body.metadata) {
        metadata = req.body.metadata as ChatMetaData;
      }

      switch (type) {
        case "ALL":
          sendAnnouncement(message, wallet, true, metadata);
          break;
        case "SOLO":
        default:
          sendAnnouncement(message, wallet, false, metadata);
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

router.post("/request_tip_announcement", async (req, res) => {
  try {
    let authenticated = false;

    const authKey = req.headers.authorization;

    const chatProfile = await verifyJwt(authKey);
    if (chatProfile) {
      authenticated = true;
    }

    //TODO rate limit this per wallet

    if (authenticated) {
      const tx = req.body.signature as string;

      if (txCheckintervalCache.get(tx) || parsedTXs.includes(tx)) {
        console.log("already parsed this tx");
        res.json({ error: true });
        return;
      }
      txCheckintervalCache.set(tx, true);
      //First wait 3 seconds to let it land on the blockchain
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const txResult = await verifyTransaction(300, tx);
      if (txResult) {
        const player = await fetchPersonasProfile(txResult.pubkey);
        if (!player) {
          console.log("Tip recipient profile could not be fetched");
          res.json({ error: true });
          return;
        }
        const tipAnnouncement = buildPublicTipAnnouncement(
          chatProfile,
          {
            ...player,
            walletId: txResult.pubkey,
          },
          txResult.sol
        );
        sendAnnouncement(
          tipAnnouncement.message,
          "SYSTEM",
          true,
          tipAnnouncement.metadata
        );
        parsedTXs.push(tx);
        res.json({ completed: true });
      } else {
        console.log("Tip transaction could not be verified");
        res.json({ error: true });
      }
    } else {
      res.json({ error: true });
    }
  } catch (err) {
    res.json({ error: true });
  }
});
