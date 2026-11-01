const SYSTEM_PROMPT =
  "Bạn là trợ lý tư vấn về vàng. Trả lời ngắn gọn bằng tiếng Việt tự nhiên. Không bịa giá vàng, số liệu hoặc tin tức thời gian thực; hãy nói rõ nếu không có dữ liệu. Mọi nhận định đầu tư chỉ mang tính tham khảo, không cam kết lợi nhuận.";
const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TOTAL_LENGTH = 12000;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { detail: "Chỉ hỗ trợ phương thức POST." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonResponse(503, {
      detail: "Chatbot chưa được cấu hình GROQ_API_KEY trong Netlify.",
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { detail: "Dữ liệu yêu cầu không phải JSON hợp lệ." });
  }

  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return jsonResponse(400, { detail: "Cần gửi ít nhất một tin nhắn." });
  }
  if (payload.messages.length > MAX_MESSAGES) {
    return jsonResponse(400, { detail: "Lịch sử chat quá dài. Vui lòng bắt đầu cuộc trò chuyện mới." });
  }

  let totalLength = 0;
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const message of payload.messages) {
    if (
      !message
      || !["user", "assistant"].includes(message.role)
      || typeof message.content !== "string"
      || !message.content.trim()
      || message.content.length > MAX_MESSAGE_LENGTH
    ) {
      return jsonResponse(400, { detail: "Nội dung tin nhắn không hợp lệ." });
    }

    totalLength += message.content.length;
    if (totalLength > MAX_TOTAL_LENGTH) {
      return jsonResponse(400, { detail: "Nội dung cuộc trò chuyện quá dài." });
    }
    messages.push({ role: message.role, content: message.content.trim() });
  }

  let providerResponse;
  try {
    providerResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
        messages,
        temperature: 0.35,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return jsonResponse(504, { detail: "Dịch vụ AI phản hồi quá lâu. Vui lòng thử lại." });
    }
    return jsonResponse(502, { detail: "Không thể kết nối dịch vụ AI. Vui lòng thử lại." });
  }

  if (providerResponse.status === 429) {
    return jsonResponse(429, { detail: "AI đang bận hoặc đã đạt giới hạn sử dụng. Vui lòng thử lại sau." });
  }
  if (providerResponse.status === 401 || providerResponse.status === 403) {
    return jsonResponse(503, { detail: "API key AI trên Netlify không hợp lệ hoặc chưa được cấp quyền." });
  }
  if (providerResponse.status === 404) {
    return jsonResponse(502, {
      detail: "Mô hình AI không tồn tại hoặc đã ngừng hỗ trợ. Hãy kiểm tra biến GROQ_MODEL trên Netlify.",
    });
  }
  if (!providerResponse.ok) {
    return jsonResponse(502, { detail: `Dịch vụ AI trả về lỗi HTTP ${providerResponse.status}.` });
  }

  let data;
  try {
    data = await providerResponse.json();
  } catch {
    return jsonResponse(502, { detail: "Dịch vụ AI trả về dữ liệu không hợp lệ." });
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    return jsonResponse(502, { detail: "Dịch vụ AI không trả về câu trả lời." });
  }
  return jsonResponse(200, { reply: reply.trim() });
};
