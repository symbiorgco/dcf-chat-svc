import axios from "axios";

const BASE_URL = `https://discord.com/api/webhooks`;
const DISCORD_CHANNELS = {
  CHAT_MODERATION: `/1348564076275564575/L14iZ785NsnwjukKPPCcgA8PdwRWs0CBTX0XeTEygmgjdhk8sCLFNyWWZw7pzASEcetC`,
};

const logMessageToLoggerChannel = async (
  content,
  channel = "CHAT_MODERATION"
) => {
  const response = await axios.post(
    BASE_URL + DISCORD_CHANNELS[channel],
    content
  );
  return response;
};

export const logChatReport = async (
  requestingWallet: string,
  requestingUsername: string,
  reportedWallet: string,
  reportedUsername: string,
  chatMessage: string
) => {
  try {
    await logMessageToLoggerChannel({
      username: "DCF Chat Moderation",
      embeds: [
        {
          title: "Chat Report",
          color: 15258703,
          fields: [
            {
              name: "Reported Message",
              value: chatMessage,
            },
            {
              name: "Wallet",
              value: reportedWallet,
            },
            {
              name: "Username",
              value: reportedUsername,
            },
          ],
          footer: {
            text: `Reported by ${requestingWallet} - ${requestingUsername} `,
          },
        },
      ],
    });
  } catch (err) {
    console.log(err);
  }
};

export const logBan = async (
  requestingUsername: string,
  bannedWallet: string
) => {
  try {
    await logMessageToLoggerChannel({
      username: "DCF Chat Moderation",
      embeds: [
        {
          title: "BAN REPORT",
          color: 15258703,
          fields: [
            {
              name: "Wallet",
              value: bannedWallet,
            },
          ],
          footer: {
            text: `Banned by ${requestingUsername} `,
          },
        },
      ],
    });
  } catch (err) {
    console.log(err);
  }
};

export const logTimeout = async (
  requestingUsername: string,
  timedoutWallet: string
) => {
  try {
    await logMessageToLoggerChannel({
      username: "DCF Chat Moderation",
      embeds: [
        {
          title: "TIMEOUT REPORT",
          color: 15258703,
          fields: [
            {
              name: "Wallet",
              value: timedoutWallet,
            },
          ],
          footer: {
            text: `Timed out 30 minutes by ${requestingUsername} `,
          },
        },
      ],
    });
  } catch (err) {
    console.log(err);
  }
};

export const logUnban = async (
  requestingUsername: string,
  bannedWallet: string
) => {
  try {
    await logMessageToLoggerChannel({
      username: "DCF Chat Moderation",
      embeds: [
        {
          title: "UNBAN REPORT",
          color: 15258703,
          fields: [
            {
              name: "Wallet",
              value: bannedWallet,
            },
          ],
          footer: {
            text: `Unbanned by ${requestingUsername} `,
          },
        },
      ],
    });
  } catch (err) {
    console.log(err);
  }
};
