import { extractText } from "unpdf";

export async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    const result = await extractText(new Uint8Array(buffer));
    if (Array.isArray(result.text)) {
      return result.text.join("\n");
    }
    return (result.text as string) || "";
  } catch (error) {
    console.error("PDF parsing error:", error);
    return "";
  }
}
