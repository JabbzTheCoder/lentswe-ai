import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { Readable } from "stream";

export const runtime = "nodejs";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const summarize = formData.get("summarize") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Audio file is required." },
        { status: 400 }
      );
    }

    // 5.5 MB size limit
    const MAX_SIZE = 5.5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          error:
            "Audio file exceeds Netlify 5.5MB limit. Please keep clips under 5 minutes.",
        },
        { status: 413 }
      );
    }

    // Convert to standard Blob to ensure size is present for the SDK
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });

    // Upload using Google Gen AI SDK
    const uploadedFile = await ai.files.upload({
      file: blob,
      config: { mimeType: file.type },
    });

    // 1. Transcribe with gemini-3.6-flash
    const transcribeResponse = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: uploadedFile.uri,
                mimeType: uploadedFile.mimeType,
              },
            },
            {
              text: "Please provide a highly accurate transcript of this audio file. Detect the language automatically. Return ONLY the transcript.",
            },
          ],
        },
      ],
    });

    const transcript = transcribeResponse.text;
    
    if (!transcript) {
      throw new Error(`Transcription failed to return text. Raw response: ${JSON.stringify(transcribeResponse)}`);
    }

    let summary = null;

    if (summarize === "true") {
      const summaryResponse = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Act as an executive assistant. Extract key context, decisions, and clear action items into concise bullet points from the following transcript:\n\n${transcript}`,
              },
            ],
          },
        ],
      });
      summary = summaryResponse.text;
    }

    // Optional: Delete the file from Google Gen AI to save space after processing
    try {
      if (uploadedFile.name) {
        await ai.files.delete({ name: uploadedFile.name });
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }

    return NextResponse.json({ transcript, summary });
  } catch (error: any) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Internal Server Error or Timeout: " + error.message },
      { status: 500 }
    );
  }
}
