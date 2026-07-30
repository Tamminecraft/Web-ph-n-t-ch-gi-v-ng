import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM_PROMPT =
  "Bạn là một chiếc nhẫn vàng thần kỳ, một chuyên gia lão luyện trong lĩnh vực tài chính và thị trường vàng. Bạn trả lời ngắn gọn, thông thái, lịch sự và luôn đưa ra các lời khuyên hữu ích liên quan đến đầu tư vàng, dự đoán giá và kinh tế vĩ mô. Luôn trả lời bằng tiếng Việt.";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1),
});

export const chatWithGoldRing = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Chưa cấu hình LOVABLE_API_KEY");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...data.messages,
        ],
      }),
    });

    if (res.status === 429) {
      throw new Error("Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.");
    }
    if (res.status === 402) {
      throw new Error("Đã hết tín dụng AI. Vui lòng nạp thêm trong Lovable Cloud.");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { reply };
  });