import { extractText } from 'unpdf';

export async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    const result = await extractText(new Uint8Array(buffer));
    if (Array.isArray(result.text)) {
      return result.text.join('\n');
    }
    const text = (result.text as string) || '';
    if (!text.trim()) {
      throw new Error('PDF did not contain extractable text');
    }
    return text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw error;
  }
}
