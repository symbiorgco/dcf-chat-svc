import Anthropic from "@anthropic-ai/sdk";
import { Message } from "@anthropic-ai/sdk/resources";
import "dotenv/config";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY as string;

const client = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

type AIReply = {
  type: string;
  text: string;
};

export const askAI = async (question: string): Promise<AIReply | undefined> => {
  try {
    const message = await client.messages.create({
      max_tokens: 1024,
      messages: [{ role: "user", content: question }],
      model: "claude-sonnet-4-20250514",
    });
    return (message.content as any as [AIReply])[0];
  } catch (error) {
    console.error("Error:", error);
    return undefined;
  }
};
