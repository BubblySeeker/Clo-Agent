export async function generateImage(prompt: string): Promise<string | null> {
  try {
    const response = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      console.error("Image generation failed:", await response.text());
      return null;
    }

    const data = await response.json();

    // Extract text response from Gemini
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return content || null;
  } catch (error) {
    console.error("Image generation error:", error);
    return null;
  }
}

export const IMAGE_PROMPTS = {
  pipeline: "CRM pipeline kanban board with deal cards in dark theme, showing Lead, Touring, Offer, and Closed columns with property deal cards",
  aiChat: "AI chat interface with tool execution indicators, dark theme, showing a conversation with a real estate AI assistant",
  analytics: "Analytics dashboard with charts and KPI cards, dark theme, showing pipeline metrics and activity charts",
  contacts: "Contact management grid with avatar initials and contact details, dark theme, CRM application",
  dashboard: "Full dashboard overview with sidebar navigation, dark theme, real estate CRM application with widgets",
} as const;
