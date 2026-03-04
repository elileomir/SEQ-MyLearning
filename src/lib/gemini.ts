import { GoogleGenerativeAI } from "@google/generative-ai";
import { uploadAsset } from "./storage";

// Access API key from environment
const API_KEY = import.meta.env.VITE_GOOGLE_AI_API_KEY || "";

const genAI = new GoogleGenerativeAI(API_KEY);

// Ordered cheapest → most expensive for API cost savings
// flash-lite: $0.10/M | flash: $0.30/M | 3-flash: $0.50/M | 2.5-pro: $1.25/M
const TARGET_MODELS = [
  "gemini-2.5-flash-lite",    // $0.10/M — cheapest, stable, supports image+video
  "gemini-2.5-flash",         // $0.30/M — fallback, stable
  "gemini-3-flash-preview",   // $0.50/M — latest gen fallback
  "gemini-2.5-pro",           // $1.25/M — heavy fallback only
];

// Models that support native image generation (Nano Banana)
const IMAGE_MODELS = [
  "gemini-2.5-flash-image",       // Nano Banana - speed/efficiency
  "gemini-3-pro-image-preview",   // Nano Banana Pro - quality/reasoning
];

async function executeGeminiRequest(prompt: string): Promise<string> {
  if (!API_KEY) throw new Error("Missing Google AI API Key");

  let lastError: any;

  for (const modelName of TARGET_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.warn(`Model ${modelName} failed:`, error);
      lastError = error;
    }
  }

  console.error("All Gemini models failed. Last error:", lastError);
  throw new Error("All AI models failed to generate content.");
}

/**
 * Robustly extract a JSON array or object from a Gemini text response.
 * Strips markdown formatting and finds the first valid JSON block.
 */
function extractJson(text: string): string {
  // Remove markdown code block wrappers if they exist
  let cleaned = text.replace(/```(json)?\n?/gi, "").replace(/```\n?/g, "").trim();

  // If it's still not parsed, try to extract just the first JSON array or object
  try {
    JSON.parse(cleaned);
    return cleaned; // It's valid JSON
  } catch {
    // Attempt to extract array
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        JSON.parse(arrayMatch[0]);
        return arrayMatch[0];
      } catch (e) { /* ignore */ }
    }
    // Attempt to extract object
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        JSON.parse(objectMatch[0]);
        return objectMatch[0];
      } catch (e) { /* ignore */ }
    }
  }
  return cleaned; // Fallback to returning the cleaned text
}

// ============================================
// AI Media Analysis (Image & Video Understanding)
// ============================================

/**
 * Analyze an image from a URL and return an educational description.
 * Uses Gemini's vision capabilities to understand image content.
 */
export async function analyzeImageFromUrl(imageUrl: string): Promise<string> {
  if (!API_KEY) throw new Error("Missing Google AI API Key");

  // Fetch image and convert to base64
  const response = await fetch(imageUrl);
  const arrayBuffer = await response.arrayBuffer();
  const base64Data = btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ""
    )
  );

  // Detect MIME type from response or default to jpeg
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const mimeType = contentType.split(";")[0].trim();

  for (const modelName of TARGET_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: `Analyze this image for use in an educational course. Write a detailed descriptive paragraph (3-5 sentences) that explains:
1. The clear visual subject matter (what is happening, who is in the image, the environment)
2. Important details, text, emotions, or specific objects shown
3. The underlying theme (e.g., workplace safety, leadership, technical process, motivation)
4. How it could be best utilized in an educational context or what concept it visually reinforces

Be comprehensive and descriptive. This description will be used by another AI to structure a course around this asset.

Return ONLY the description text, nothing else.`,
        },
      ]);
      const text = (await result.response).text().trim();
      return text;
    } catch (error) {
      console.warn(`Image analysis with ${modelName} failed:`, error);
    }
  }
  throw new Error("Failed to analyze image with all models.");
}

/**
 * Analyze a video from a URL and return an educational description.
 * Supports YouTube URLs (via fileData) and direct URLs (via fetch+inline).
 * Includes a 45-second timeout to prevent hanging on large files.
 */
export async function analyzeVideoFromUrl(videoUrl: string): Promise<string> {
  if (!API_KEY) throw new Error("Missing Google AI API Key");

  const isYouTube =
    videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");

  const prompt = `Analyze this video for use in an educational course. Write a detailed descriptive paragraph (3-5 sentences) that explains:
1. The visual subject matter (what is happening, who is in the video, the environment)
2. Key topics, processes, or skills demonstrated
3. The underlying theme and potential educational value

Be comprehensive and descriptive. This description will be used by another AI to structure a course around this asset.

Return ONLY the description text, nothing else.`;

  // Wrap entire operation in a 45-second timeout
  const timeoutMs = 45_000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Video analysis timed out after 45s")), timeoutMs)
  );

  const analyzePromise = (async (): Promise<string> => {
    for (const modelName of TARGET_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });

        let parts: any[];

        if (isYouTube) {
          // YouTube URLs can be passed directly via fileData
          parts = [
            {
              fileData: {
                fileUri: videoUrl,
                mimeType: "video/mp4",
              },
            },
            { text: prompt },
          ];
        } else {
          // For other URLs, fetch and inline (works for small videos)
          try {
            const controller = new AbortController();
            const fetchTimeout = setTimeout(() => controller.abort(), 30_000);
            const response = await fetch(videoUrl, { signal: controller.signal });
            clearTimeout(fetchTimeout);

            const arrayBuffer = await response.arrayBuffer();

            // Only inline if < 5MB (larger files are too slow to base64 in browser)
            if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
              // Too large for inline — describe from URL context
              return await executeGeminiRequest(
                `A video has been uploaded to this URL: ${videoUrl}. Since the file is large, I cannot watch it directly. Based on the filename, URL structure, and common educational themes, write a speculative but detailed 3-sentence summary of what this video likely covers and its potential educational value. Return ONLY the description.`
              );
            }

            // Efficient base64 conversion (avoid O(n²) string concat)
            const uint8Array = new Uint8Array(arrayBuffer);
            let binary = "";
            for (let i = 0; i < uint8Array.length; i++) {
              binary += String.fromCharCode(uint8Array[i]);
            }
            const base64Data = btoa(binary);

            const contentType =
              response.headers.get("content-type") || "video/mp4";
            const mimeType = contentType.split(";")[0].trim();

            parts = [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              { text: prompt },
            ];
          } catch (fetchErr) {
            console.warn("Video fetch failed, using URL-based description:", fetchErr);
            // If fetch fails, describe from URL context
            return await executeGeminiRequest(
              `A video has been shared with URL: ${videoUrl}. Based on the filename and URL, write a brief 2-sentence educational description of what this video likely covers. Return ONLY the description.`
            );
          }
        }

        const result = await model.generateContent(parts);
        const text = (await result.response).text().trim();
        return text;
      } catch (error) {
        console.warn(`Video analysis with ${modelName} failed:`, error);
      }
    }
    throw new Error("Failed to analyze video with all models.");
  })();

  return Promise.race([analyzePromise, timeoutPromise]);
}

// ============================================
// AI Image Generation
// ============================================

/**
 * Fetch an image from a URL and return its base64 data + mimeType.
 * Used to pass user-uploaded images as reference for AI generation.
 */
async function fetchImageAsBase64(
  url: string
): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  const blob = await response.blob();
  const mimeType = blob.type || "image/jpeg";
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binary);
  return { base64, mimeType };
}

/**
 * Generate a single image using Gemini's native image generation.
 * Optionally accepts reference images for visual consistency (logos, brand colors, style).
 * Returns base64 data and mime type for upload to Supabase Storage.
 */
export async function generateImage(
  prompt: string,
  referenceImages?: Array<{ base64: string; mimeType: string }>
): Promise<{ base64: string; mimeType: string }> {
  if (!API_KEY) throw new Error("Missing Google AI API Key");

  // Build parts: text prompt + optional reference images
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
  ];

  if (referenceImages && referenceImages.length > 0) {
    for (const ref of referenceImages) {
      parts.push({
        inlineData: { data: ref.base64, mimeType: ref.mimeType },
      });
    }
  }

  let lastError: any;

  for (const modelName of IMAGE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: {
          // @ts-expect-error - responseModalities is available in newer SDK versions
          responseModalities: ["IMAGE", "TEXT"],
        },
      });

      const response = result.response;
      const candidateParts = response.candidates?.[0]?.content?.parts || [];

      for (const part of candidateParts) {
        if (part.inlineData) {
          return {
            base64: part.inlineData.data as string,
            mimeType: part.inlineData.mimeType as string,
          };
        }
      }

      throw new Error("No image data in response");
    } catch (error) {
      console.warn(`Image model ${modelName} failed:`, error);
      lastError = error;
    }
  }

  throw new Error(
    `Image generation failed: ${lastError?.message || "All image models failed"}`
  );
}

/**
 * Generate multiple contextual images for a course.
 * AI analyzes the content and generates relevant images with placement suggestions.
 * Optionally accepts referenceImageUrls (user-uploaded images) that are fetched and
 * passed to `generateImage` so AI visuals maintain brand/style consistency.
 */
export async function generateCourseImages(
  topic: string,
  courseContent: string,
  maxImages: number = 5,
  referenceImageUrls?: string[]
): Promise<Array<{ base64: string; mimeType: string; suggestedAlt: string; slideIndex: number }>> {

  // Pre-fetch reference images (max 4 to keep payload reasonable)
  let referenceImages: Array<{ base64: string; mimeType: string }> = [];
  if (referenceImageUrls && referenceImageUrls.length > 0) {
    const urlsToFetch = referenceImageUrls.filter(u => u.trim()).slice(0, 4);
    console.log(`Fetching ${urlsToFetch.length} reference images for style consistency...`);
    const fetchPromises = urlsToFetch.map(async (url) => {
      try {
        return await fetchImageAsBase64(url);
      } catch (err) {
        console.warn(`Failed to fetch reference image: ${url}`, err);
        return null;
      }
    });
    const fetched = await Promise.all(fetchPromises);
    referenceImages = fetched.filter((r): r is { base64: string; mimeType: string } => r !== null);
    console.log(`Successfully fetched ${referenceImages.length} reference images`);
  }

  // Build a reference context note for the planning prompt
  const refNote = referenceImages.length > 0
    ? `\nIMPORTANT: The user has provided ${referenceImages.length} reference image(s) that represent their brand style, logos, or visual identity. Your image prompts should describe visuals that match the COLOR SCHEME, STYLE, and PROFESSIONAL TONE of these references.\n`
    : "";

  // First, ask AI to suggest what images to generate
  const planPrompt = `You are an expert visual designer for educational courses. Analyze this course content and suggest exactly ${maxImages} images to generate.

Topic: "${topic}"
${refNote}
Content:
"${courseContent.substring(0, 8000)}"

Return ONLY a valid JSON array (no markdown blocks). Each object must have:
{
  "prompt": "Detailed image generation prompt (be specific about style, composition, colors)",
  "alt": "Short alt text for accessibility",
  "slideIndex": 0  // Which slide (0-indexed) this image best fits
}

Guidelines:
- Suggest professional, clean images suitable for corporate training
- Vary styles: diagrams, illustrations, infographics, conceptual photos
- Each prompt should be self-contained and detailed
- Return ONLY the JSON array`;

  const planText = await executeGeminiRequest(planPrompt);
  let imagePlan: Array<{ prompt: string; alt: string; slideIndex: number }>;

  try {
    const cleaned = extractJson(planText);
    imagePlan = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse image plan:", planText);
    throw new Error("AI failed to plan course images. Please try again.");
  }

  // Generate each image, passing reference images for visual consistency
  const results: Array<{ base64: string; mimeType: string; suggestedAlt: string; slideIndex: number }> = [];

  for (const plan of imagePlan.slice(0, maxImages)) {
    try {
      const refContext = referenceImages.length > 0
        ? " Use the provided reference images as style guide — match their color palette, tone, and visual quality."
        : "";
      const imageData = await generateImage(
        `Create a professional educational illustration: ${plan.prompt}. Style: clean, modern, corporate training material. No text overlay.${refContext}`,
        referenceImages.length > 0 ? referenceImages : undefined
      );
      results.push({
        ...imageData,
        suggestedAlt: plan.alt,
        slideIndex: plan.slideIndex,
      });
    } catch (error) {
      console.warn(`Failed to generate image for: ${plan.alt}`, error);
      // Continue with remaining images
    }
  }

  return results;
}

export async function generateCourseDescription(
  courseTitle: string,
  additionalContext?: string,
): Promise<string> {
  let prompt = `You are an expert curriculum designer. Write a compelling, engaging, and professional course description for a course titled "${courseTitle}".\n`;

  if (additionalContext) {
    prompt += `\nAdditional Context/Topic Info: "${additionalContext}"\n`;
  }

  prompt += `\nGuidelines:
    - Keep it under 300 characters.
    - Focus on the value proposition and what students will learn.
    - Use an encouraging and professional tone.
    - Do not use markdown (except simple bolding if necessary, but plain text is preferred for description fields).
    - Start directly with the description, no "Here is a description" preamble.`;

  try {
    return await executeGeminiRequest(prompt);
  } catch (error) {
    console.error("AI Generation Error:", error);
    throw new Error("Failed to generate description");
  }
}

export async function enhanceCourseDescription(
  currentDescription: string,
  courseTitle: string,
): Promise<string> {
  const prompt = `You are a professional copywriter. Enhance and polish the following course description for "${courseTitle}".
    
    Current Description:
    "${currentDescription}"
    
    Guidelines:
    - Improve clarity, flow, and engagement.
    - Fix any grammar or spelling mistakes.
    - Make it sound more professional and appealing to potential students.
    - Keep the length similar or slightly expanded if details are sparse.
    - Do not change the core meaning.
    - Keep it under 300 characters.
    - Return ONLY the enhanced text.`;

  try {
    return await executeGeminiRequest(prompt);
  } catch (error) {
    console.error("AI Enhancement Error:", error);
    throw new Error("Failed to enhance description");
  }
}

export async function generateSlideContent(
  slideTitle: string,
  context?: string,
): Promise<string> {
  let prompt = `You are an expert educational content creator. Create detailed slide content for a slide titled "${slideTitle}".\n`;

  if (context) {
    prompt += `\nContext/Topic Info: "${context}"\n`;
  }

  prompt += `\nGuidelines:
    - Format the output in proper Markdown.
    - Do NOT wrap the output in \`\`\`markdown code fences. Just return the text.
    - Add empty lines between all list items and sections to improve readability.
    - Use clear headings (##, ###), bullet points, and bold text for emphasis.
    - **Formatting Links & Images:**
      - **Images:** If context implies displaying an image (e.g., "image below", "show image", "see diagram"), use Markdown Image format: \`![Alt Text](URL)\`.
      - **Hyperlinks:** If context implies navigation or an app link (e.g., "click here", "visit", "MASO App", "open"), use Markdown Link format: \`[Link Text](URL)\`.
      - **Emails:** If context mentions an email, use Mailto format: \`[Email Address](mailto:user@example.com)\`.
    - IMPORTANT: Do NOT include the main Slide Title as a header at the top. Access the content directly.
    - Keep the content educational, clear, and concise suitable for a presentation slide.
    - Structure it logically (e.g., Introduction > Key Points > Summary).
    - Do not include any "Here is the markdown" preamble, just return the markdown content.`;

  try {
    return await executeGeminiRequest(prompt);
  } catch (error) {
    console.error("AI Slide Gen Error:", error);
    throw new Error("Failed to generate slide content");
  }
}

export async function enhanceSlideContent(
  currentContent: string,
  slideTitle: string,
  type: "format" | "content" | "comprehensive" = "comprehensive",
): Promise<string> {
  let instruction = "";
  if (type === "format") {
    instruction =
      "Focus ONLY on formatting. Do NOT change the meaning or wording significantly. Fix Markdown syntax, headings, lists, and layout.";
  } else if (type === "content") {
    instruction =
      "Focus ONLY on content clarity, grammar, and explanation. Make the text more educational and clear. Do NOT change the overall structure if possible.";
  } else {
    instruction =
      "Improve BOTH content clarity and Markdown formatting. Re-structure for better flow and impact.";
  }

  const prompt = `You are an expert educational editor. Improve the following slide content.
  
  Slide Title: "${slideTitle}"
  Current Content:
  "${currentContent}"
  
  Goal: ${instruction}
  
  Guidelines:
  - Return ONLY the raw markdown content.
  - Do NOT wrap the output in \`\`\`markdown code fences. Just return the text.
  - Add empty lines between all list items and sections to improve readability.
  - Use proper Markdown (headers, lists, bolding).
  - **Formatting Rules:**
    - **Images:** "image below/show" context -> \`![Alt](URL)\`
    - **Links:** "click/visit/App Name" context -> \`[Text](URL)\`
    - **Emails:** Email address -> \`[Email](mailto:email)\`
  - IMPORTANT: Do NOT include the Slide Title "${slideTitle}" as a header at the top.
  - ${type === "format" ? "Keep the text strictly as is, just format it better." : "Ensure the tone is professional and educational."}`;

  return await executeGeminiRequest(prompt);
}

export async function deriveTitleFromContent(content: string): Promise<string> {
  const prompt = `Read the following educational content and generate a single, engaging, and professional 3-5 word Title for it.
    
    Content:
    "${content.substring(0, 1000)}"
    
    Guidelines:
    - Keep it under 60 characters.
    - Be concise and clear.
    - Do not use quotes.
    - Return ONLY the title text.`;

  const text = await executeGeminiRequest(prompt);
  return text.trim();
}

export async function deriveDescriptionFromContent(
  content: string,
): Promise<string> {
  const prompt = `Read the following educational content and write a very brief (1 sentence) description of what it covers.
    
    Content:
    "${content.substring(0, 1000)}"
    
    Guidelines:
    - Focus on the main learning outcome.
    - Keep it under 140 characters.
    - Return ONLY the description text.`;

  const text = await executeGeminiRequest(prompt);
  return text.trim();
}

export async function generateModuleTitle(context: string): Promise<string> {
  const prompt = `Generate a SINGLE, engaging, and professional title for a learning module about: "${context}". 
    Guidelines:
    - Keep it under 60 characters.
    - Be concise and clear.
    - Do not use quotes in the output.
    - Return ONLY the title text.`;

  const text = await executeGeminiRequest(prompt);
  return text.trim();
}

export async function enhanceModuleTitle(
  currentTitle: string,
): Promise<string> {
  const prompt = `Improve this module title to be more engaging, professional, and concise.
    Current Title: "${currentTitle}"
    
    Guidelines:
    - Keep it under 60 characters.
    - Do not use quotes in the output.
    - Return ONLY the improved title text.`;

  const text = await executeGeminiRequest(prompt);
  return text.trim();
}

export async function generateModuleDescription(
  title: string,
  context?: string,
): Promise<string> {
  const prompt = `Write a brief (1-2 sentences) description for a learning module.
    Module Title: "${title}"
    ${context ? `Context: "${context}"` : ""}
    
    Guidelines:
    - Focus on what the learner will gain.
    - Keep it under 160 characters if possible.
    - Professional and encouraging tone.
    - Return ONLY the description text.`;

  const text = await executeGeminiRequest(prompt);
  return text.trim();
}

export async function enhanceModuleDescription(
  currentDescription: string,
  title: string,
): Promise<string> {
  const prompt = `Improve this module description for clarity and impact.
    Module Title: "${title}"
    Current Description: "${currentDescription}"
    
    Guidelines:
    - Make it punchy and clear.
    - Fix any grammar issues.
    - Keep it brief (1-2 sentences).
    - Return ONLY the description text.`;

  const text = await executeGeminiRequest(prompt);
  return text.trim();
}

export async function generateQuizFromContent(
  content: string,
  existingQuestions: any[] = [],
  count: number = 5,
): Promise<any[]> {
  const existingContext =
    existingQuestions.length > 0
      ? `Existing Questions (DO NOT DUPLICATE THESE):
      ${JSON.stringify(existingQuestions.map((q) => q.question))}`
      : "";

  const prompt = `You are a strict JSON generator. Read the following educational content and generate ${count} multiple choice quiz questions to test understanding.

    Content:
    "${content.substring(0, 15000)}"

    ${existingContext}

    Output Format:
    Return a raw JSON array of objects. Do not wrap in markdown code blocks.
    Each object must strictly follow this structure:
    {
      "id": "unique_id_here",
      "question": "Question text here",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctIndex": 0,
      "explanation": "Brief explanation of why this is correct."
    }

    Guidelines:
    - Questions should verify key concepts.
    - Options should be plausible.
    - Return ONLY the valid JSON array. No preamble.
    - Ensure new questions are NOT duplicates of existing ones (if provided).`;

  const text = await executeGeminiRequest(prompt);
  try {
    const cleanText = extractJson(text);
    const parsed = JSON.parse(cleanText);

    // Ensure all questions have proper UUIDs (prevents "unsaved" state issue)
    return parsed.map((q: any) => ({
      ...q,
      id:
        q.id && typeof q.id === "string" && q.id.length > 8
          ? q.id
          : crypto.randomUUID(),
    }));
  } catch (e) {
    console.error("Failed to parse quiz JSON", e);
    throw new Error("AI failed to generate valid quiz data.");
  }
}

export async function enhanceQuizQuestions(questions: any[]): Promise<any[]> {
  const prompt = `You are an expert exam editor. Improve the following quiz questions for clarity, professionalism, and fairness.

    Input Questions:
    ${JSON.stringify(questions)}

    Guidelines:
    - Improve grammar and phrasing.
    - Ensure distinct distractor options (no ambiguous answers).
    - detailed explanation.
    - specific.
    - Do NOT change the correct answer index usually, unless the original was factually wrong.
    - Return the full JSON array with the SAME IDs, but improved content.
    - Return ONLY the valid JSON array. No preamble.`;

  const text = await executeGeminiRequest(prompt);
  try {
    const cleanText = extractJson(text);
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to parse enhanced quiz JSON", e);
    throw new Error("AI failed to enhance quiz data.");
  }
}

export async function deriveQuizTitleFromContent(
  content: string,
): Promise<string> {
  const prompt = `Read the following educational content and generate a professional Quiz Title for an assessment based on it.
    
    Content:
    "${content.substring(0, 1000)}"
    
    Guidelines:
    - The title MUST indicate it is an assessment (e.g., "Assessment", "Quiz", "Knowledge Check").
    - Example: "Safety Protocol Assessment", "Module 1 Quiz", "Risk Management Knowledge Check".
    - Keep it under 60 characters.
    - Do not use quotes.
    - Return ONLY the title text.`;

  const text = await executeGeminiRequest(prompt);
  return text.trim();
}

export async function deriveQuizDescriptionFromContent(
  content: string,
): Promise<string> {
  const prompt = `Read the following educational content and write a brief, encouraging description for a quiz based on it.
    
    Content:
    "${content.substring(0, 1000)}"
    
    Guidelines:
    - Frame it as a test of knowledge (e.g., "Test what you've learned...", "Verify your understanding...").
    - Keep it under 160 characters.
    - Professional and encouraging tone.
    - Return ONLY the description text.`;

  const text = await executeGeminiRequest(prompt);
  return text.trim();
}

interface GeneratedModule {
  title: string;
  type: "slide" | "quiz" | "video";
  content: string; // Markdown for slides, JSON string for quiz
  questions?: any[]; // For quiz modules
  videoUrl?: string; // For video modules
}

export interface GeneratedCourse {
  title: string;
  description: string;
  modules: GeneratedModule[];
}

// ============================================
// Helper: AI recommends optimal module count
// ============================================
async function recommendModuleCount(
  topic: string,
  documentContext?: string,
): Promise<number> {
  const prompt = `You are an expert curriculum designer. Based on the following topic, recommend the optimal number of slide modules.

TOPIC: "${topic}"
${documentContext ? `\nREFERENCE CONTENT (first 5000 chars):\n${documentContext.slice(0, 5000)}` : ""}

Consider:
- Topic complexity and breadth
- Logical section breaks
- Ideal learning session length
- Depth needed for each concept

Return ONLY a single integer between 3 and 30. Nothing else.`;

  try {
    const response = await executeGeminiRequest(prompt);
    const count = parseInt(response.trim(), 10);
    if (isNaN(count)) return 8; // safe default
    return Math.max(3, Math.min(30, count)); // clamp 3-30
  } catch {
    console.warn("AI module count recommendation failed, defaulting to 8");
    return 8;
  }
}

// ============================================
// Helper: AI recommends optimal quiz question count
// ============================================
async function recommendQuizCount(slideContent: string): Promise<number> {
  const prompt = `Based on the following course content, recommend the optimal number of quiz questions to thoroughly assess understanding.

CONTENT SUMMARY (first 3000 chars):
${slideContent.slice(0, 3000)}

Consider:
- Number and diversity of topics covered
- Depth of material
- Concept complexity

Return ONLY a single integer between 5 and 30. Nothing else.`;

  try {
    const response = await executeGeminiRequest(prompt);
    const count = parseInt(response.trim(), 10);
    if (isNaN(count)) return 10;
    return Math.max(5, Math.min(30, count));
  } catch {
    return 10;
  }
}

// ============================================
// Helper: AI recommends optimal image count
// ============================================
async function recommendAiImageCount(
  topic: string,
  moduleCount: number
): Promise<number> {
  const prompt = `You are an expert course visual designer. Based on the topic and module count, recommend the optimal number of AI-generated images.

TOPIC: "${topic}"
NUMBER OF MODULES: ${moduleCount}

Consider:
- Visual complexity of the topic
- How many modules would benefit from illustrations
- Balance between too few (boring) and too many (slow generation)
- Typically 1 image per 2-3 slides is ideal

Return ONLY a single integer between 1 and 15. Nothing else.`;

  try {
    const response = await executeGeminiRequest(prompt);
    const count = parseInt(response.trim(), 10);
    if (isNaN(count)) return 5; // safe default
    return Math.max(1, Math.min(15, count)); // clamp 1-15
  } catch {
    console.warn("AI image count recommendation failed, defaulting to 5");
    return 5;
  }
}

export async function generateFullCourse(params: {
  topic: string;
  moduleCount: number;        // 0 = AI decides
  includeQuiz: boolean;
  quizCount: number;          // 0 = AI decides, 5-30
  includeVideo: boolean;
  videos?: Array<{ url: string; description: string }>;
  customImages?: Array<{ url: string; description: string }>;
  includeAiImages?: boolean;
  maxAiImages?: number;       // 0 = AI decides, 1-15
  documentContext?: string;
  onProgress?: (stage: string) => void;
}): Promise<GeneratedCourse> {
  const {
    topic,
    includeQuiz,
    includeVideo,
    videos = [],
    customImages = [],
    includeAiImages = false,
    maxAiImages = 3,
    documentContext,
    onProgress,
  } = params;

  // Resolve module count (AI decides if 0)
  let moduleCount = params.moduleCount;
  if (moduleCount === 0) {
    onProgress?.("Analyzing course topic and determining optimal structure...");
    console.log("AI deciding module count...");
    moduleCount = await recommendModuleCount(topic, documentContext);
    console.log(`AI recommended ${moduleCount} modules`);
  }

  // Resolve quiz count (AI decides if 0 — resolved AFTER slides are generated)
  let quizCount = params.quizCount;

  // ============================================
  // STEP 1: Generate SLIDES (with batching for large courses)
  // ============================================
  const docContextBlock = documentContext
    ? `=== REFERENCE DOCUMENT CONTENT ===\nUse this content as reference material for creating accurate, detailed slides:\n${documentContext.slice(0, 15000)}\n`
    : "";

  let slidesData: {
    title: string;
    description: string;
    slides: GeneratedModule[];
  };

  if (moduleCount <= 10) {
    // ---- SMALL COURSE: Single request ----
    const slidesPrompt = `You are an expert curriculum designer. Generate ONLY the slide modules for a course.

=== TOPIC ===
"${topic}"

=== NUMBER OF SLIDES ===
Generate exactly ${moduleCount} slide modules.

${docContextBlock}

=== SLIDE REQUIREMENTS ===
Each slide MUST have:
- "title": Unique, descriptive title
- "type": "slide"
- "content": Rich Markdown (300-500 words) with:
  - Use "##" for main headings (NOT "###" or "#")
  - Detailed explanations with real-world examples
  - Add: \`> 🖼️ **Image Recommendation:** *[Description]*\` where visuals help

=== OUTPUT FORMAT ===
Return ONLY valid JSON (no markdown blocks):
{
  "title": "Course Title",
  "description": "2-3 sentence description",
  "slides": [
    {"title": "Slide 1 Title", "type": "slide", "content": "## Heading\\n\\nDetailed content..."},
    {"title": "Slide 2 Title", "type": "slide", "content": "## Heading\\n\\nMore content..."}
  ]
}

GENERATE NOW:`;

    onProgress?.(`Generating ${moduleCount} course modules...`);
    const slidesResponse = await executeGeminiRequest(slidesPrompt);
    try {
      const cleaned = extractJson(slidesResponse);
      slidesData = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse slides:", slidesResponse);
      throw new Error("AI failed to generate valid slides. Please try again.");
    }
  } else {
    // ---- LARGE COURSE (>10 modules): Batched generation ----
    console.log(`Batched generation: ${moduleCount} modules`);

    // Step 1a: Generate outline (titles + brief descriptions for all modules)
    const outlinePrompt = `You are an expert curriculum designer. Create a detailed outline for a ${moduleCount}-module course.

=== TOPIC ===
"${topic}"

${docContextBlock}

Generate exactly ${moduleCount} module titles in logical learning order.

Return ONLY valid JSON:
{
  "title": "Course Title",
  "description": "2-3 sentence description",
  "outline": [
    {"index": 0, "title": "Module Title 1", "brief": "One-line description"},
    {"index": 1, "title": "Module Title 2", "brief": "One-line description"}
  ]
}`;

    onProgress?.("Creating course outline and curriculum...");
    const outlineResponse = await executeGeminiRequest(outlinePrompt);
    let outline: { title: string; description: string; outline: Array<{ index: number; title: string; brief: string }> };
    try {
      const cleaned = extractJson(outlineResponse);
      outline = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse outline:", outlineResponse);
      throw new Error("AI failed to generate course outline. Please try again.");
    }

    // Step 1b: Generate full content in batches of 10
    const BATCH_SIZE = 10;
    const allSlides: GeneratedModule[] = [];
    const totalBatches = Math.ceil(moduleCount / BATCH_SIZE);

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, moduleCount);
      const batchOutline = outline.outline.slice(start, end);
      const batchTitles = batchOutline.map((o) => `${o.index}: "${o.title}" - ${o.brief}`).join("\n");

      console.log(`Generating batch ${batch + 1}/${totalBatches} (modules ${start + 1}-${end})`);

      const batchPrompt = `You are an expert curriculum designer. Generate FULL CONTENT for these specific modules of a course on "${topic}".

This is batch ${batch + 1} of ${totalBatches}. The full course has ${moduleCount} modules.

FULL COURSE OUTLINE (for context):
${outline.outline.map((o) => `${o.index}: "${o.title}"`).join("\n")}

GENERATE CONTENT FOR THESE MODULES ONLY:
${batchTitles}

${docContextBlock}

=== REQUIREMENTS ===
Each slide MUST have:
- "title": Use EXACTLY the title from the outline
- "type": "slide"
- "content": Rich Markdown (300-500 words) with:
  - Use "##" for main headings (NOT "###" or "#")
  - Detailed explanations with real-world examples
  - Add: \`> 🖼️ **Image Recommendation:** *[Description]*\` where visuals help

Return ONLY valid JSON array:
[{"title": "...", "type": "slide", "content": "..."}]`;

      onProgress?.(`Generating batch ${batch + 1} of ${totalBatches} (${start + 1}-${end} modules)...`);
      const batchResponse = await executeGeminiRequest(batchPrompt);
      try {
        const cleaned = extractJson(batchResponse);
        const batchSlides: GeneratedModule[] = JSON.parse(cleaned);
        allSlides.push(...batchSlides);
      } catch {
        console.error(`Failed to parse batch ${batch + 1}:`, batchResponse);
        // Create placeholder slides for this batch so course is still usable
        for (const item of batchOutline) {
          allSlides.push({
            title: item.title,
            type: "slide",
            content: `## ${item.title}\n\n${item.brief}\n\n> ⚠️ *Content generation failed for this module. Please edit manually.*`,
          });
        }
      }
    }

    slidesData = {
      title: outline.title,
      description: outline.description,
      slides: allSlides,
    };
  }

  // Validate slides were generated
  if (!slidesData.slides || slidesData.slides.length === 0) {
    throw new Error("AI generated no slides. Please try again.");
  }

  // Build the final modules array
  const allModules: GeneratedModule[] = [...slidesData.slides];

  // ============================================
  // STEP 2: Add VIDEO modules (CODE handles URLs)
  // ============================================
  console.log("Video params:", { includeVideo, videoCount: videos.length });

  if (includeVideo && videos.length > 0) {
    // Collect valid videos
    const validVideos = videos.filter((v) => v.url.trim());

    if (validVideos.length > 0) {
      let placements: Array<{ videoIndex: number; afterSlideIndex: number }>;

      if (validVideos.length === 1) {
        // Single video: place at middle (no AI needed)
        placements = [{ videoIndex: 0, afterSlideIndex: Math.floor(allModules.length / 2) }];
      } else {
        // Multiple videos: ask AI for optimal placement (descriptions only, NO URLs)
        try {
          onProgress?.("Evaluating optimal video placement...");
          const slideList = allModules
            .map((m, i) => `${i}: "${m.title}"`)
            .join("\n");
          const videoDescriptions = validVideos
            .map((v, i) => `${i}: "${v.description || 'Untitled video'}"`)
            .join("\n");

          const placementPrompt = `You are arranging video modules in a course for optimal learning flow.

SLIDES (in order):
${slideList}

VIDEOS TO PLACE:
${videoDescriptions}

Recommend where each video should be inserted (after which slide index) for the best learning sequence.
Distribute them across the course, do NOT cluster them together.

Return ONLY a JSON array:
[{"videoIndex": 0, "afterSlideIndex": 2}, {"videoIndex": 1, "afterSlideIndex": 5}]`;

          const placementResponse = await executeGeminiRequest(placementPrompt);
          const cleaned = extractJson(placementResponse);
          placements = JSON.parse(cleaned);

          // Validate placements
          if (!Array.isArray(placements) || placements.length !== validVideos.length) {
            throw new Error("Invalid placement response");
          }
        } catch (placementError) {
          console.warn("AI video placement failed, distributing evenly:", placementError);
          // Fallback: distribute videos evenly across slides
          const gap = Math.floor(allModules.length / (validVideos.length + 1));
          placements = validVideos.map((_, i) => ({
            videoIndex: i,
            afterSlideIndex: Math.min(gap * (i + 1), allModules.length - 1),
          }));
        }
      }

      // Sort placements in reverse order so insertion indices don't shift
      const sortedPlacements = [...placements].sort(
        (a, b) => b.afterSlideIndex - a.afterSlideIndex
      );

      for (const placement of sortedPlacements) {
        const video = validVideos[placement.videoIndex];
        if (!video) continue;

        const videoModule: GeneratedModule = {
          title: video.description
            ? `Video: ${video.description.slice(0, 60)}`
            : `Video ${placement.videoIndex + 1}`,
          type: "video",
          content: video.description || "Watch this video for a visual demonstration.",
          videoUrl: video.url, // CODE injects the URL — never AI
        };

        const insertAt = Math.min(placement.afterSlideIndex + 1, allModules.length);
        console.log(`Inserting video ${placement.videoIndex} at position ${insertAt} with URL: ${video.url}`);
        allModules.splice(insertAt, 0, videoModule);
      }
    }
  }

  // ============================================
  // STEP 3: Generate QUIZ using proven working function
  // ============================================
  if (includeQuiz) {
    // Collect all slide content to base questions on
    const allSlideContent = slidesData.slides
      .map((s) => s.content)
      .join("\n\n");

    // Resolve quiz count if AI decides (quizCount === 0)
    let resolvedQuizCount = quizCount;
    if (resolvedQuizCount === 0) {
      onProgress?.("Analyzing content depth to determine quiz questions...");
      console.log("AI deciding quiz question count...");
      resolvedQuizCount = await recommendQuizCount(allSlideContent);
      console.log(`AI recommended ${resolvedQuizCount} questions`);
    }

    onProgress?.(`Generating a ${resolvedQuizCount}-question course assessment...`);
    // Use the existing, working generateQuizFromContent function
    const quizQuestions = await generateQuizFromContent(
      allSlideContent,
      [],
      resolvedQuizCount,
    );

    const quizModule: GeneratedModule = {
      title: "Course Assessment",
      type: "quiz",
      content:
        "Test your understanding of the material covered in this course.",
      questions: quizQuestions, // Already has correct schema: question, options, correctIndex
    };

    // Add quiz at the end
    allModules.push(quizModule);
  }

  // ============================================
  // STEP 4a: Embed Custom Images (user-provided URLs)
  // ============================================
  if (customImages.length > 0) {
    try {
      const slideModulesForMatch = allModules.filter((m) => m.type === "slide");
      const slideList = slideModulesForMatch
        .map((m, i) => `${i}: "${m.title}"`)
        .join("\n");
      const imageDescriptions = customImages
        .map((img, i) => `${i}: "${img.description}"`)
        .join("\n");

      const matchPrompt = `Match each image to the BEST slide based on description.\n\nSLIDES:\n${slideList}\n\nIMAGES:\n${imageDescriptions}\n\nReturn ONLY JSON array: [{"imageIndex": 0, "slideIndex": 2}]`;

      let placements: Array<{ imageIndex: number; slideIndex: number }>;
      try {
        onProgress?.("Matching custom images to relevant modules...");
        const matchResponse = await executeGeminiRequest(matchPrompt);
        const cleaned = extractJson(matchResponse);
        placements = JSON.parse(cleaned);
      } catch {
        placements = customImages.map((_, i) => ({
          imageIndex: i,
          slideIndex: i % slideModulesForMatch.length,
        }));
      }

      for (const placement of placements) {
        const img = customImages[placement.imageIndex];
        if (!img) continue;
        const targetModule = slideModulesForMatch[placement.slideIndex] || slideModulesForMatch[0];
        if (!targetModule) continue;
        const imageMarkdown = `\n\n![${img.description}](${img.url})\n\n`;
        if (targetModule.content.includes("🖼️")) {
          targetModule.content = targetModule.content.replace(
            /> 🖼️ \*\*Image Recommendation:\*\* \*.*?\*/,
            imageMarkdown
          );
        } else {
          const firstBreak = targetModule.content.indexOf("\n\n");
          if (firstBreak > 0) {
            targetModule.content =
              targetModule.content.slice(0, firstBreak) + imageMarkdown + targetModule.content.slice(firstBreak);
          } else {
            targetModule.content += imageMarkdown;
          }
        }
      }
    } catch (imgError) {
      console.warn("Custom image placement failed:", imgError);
    }
  }

  // ============================================
  // STEP 4b: Generate AI Images (optional)
  // ============================================
  if (includeAiImages) {
    // Resolve AI image count (AI decides if 0)
    let resolvedMaxAiImages = maxAiImages;
    if (resolvedMaxAiImages === 0) {
      onProgress?.("Analyzing course content to determine optimal image count...");
      console.log("AI deciding image count...");
      resolvedMaxAiImages = await recommendAiImageCount(topic, allModules.filter(m => m.type === "slide").length);
      console.log(`AI recommended ${resolvedMaxAiImages} images`);
    }

    if (resolvedMaxAiImages > 0) {
      try {
        onProgress?.("Planning custom visual illustrations for the course...");
        const allSlideContent = allModules
          .filter((m) => m.type === "slide")
          .map((m) => `## ${m.title}\n${m.content}`)
          .join("\n\n");

        // Pass user-uploaded image URLs as references for visual consistency
        const referenceUrls = customImages
          .filter((img) => img.url.trim())
          .map((img) => img.url);

        const images = await generateCourseImages(
          topic,
          allSlideContent,
          resolvedMaxAiImages,
          referenceUrls.length > 0 ? referenceUrls : undefined
        );

        let imageCount = 1;
        for (const img of images) {
          onProgress?.(`Generating and uploading AI visual ${imageCount} of ${images.length}...`);
          const slideModules = allModules.filter((m) => m.type === "slide");
          const targetModule = slideModules[img.slideIndex] || slideModules[0];

          if (targetModule) {
            // Upload AI Image to Supabase Storage
            try {
              // Convert base64 to File
              const byteCharacters = atob(img.base64);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: img.mimeType });

              // Extract extension
              const ext = img.mimeType.split("/")[1] || "jpeg";
              const file = new File([blob], `ai_image_${Date.now()}.${ext}`, { type: img.mimeType });

              // Upload
              const asset = await uploadAsset(file, { aiGenerated: true, description: img.suggestedAlt });

              // Inject URL — use .replace() directly, never .test() + .replace() with /g
              const imageMarkdown = `\n\n![${img.suggestedAlt}](${asset.public_url})\n\n`;
              const markerRegex = />\s*(?:🖼️)?\s*\*\*Image Recommendation:\*\*\s*(?:\*.*?\*|[^\n]*)(\n|$)/;
              if (markerRegex.test(targetModule.content)) {
                targetModule.content = targetModule.content.replace(markerRegex, imageMarkdown);
              } else {
                const firstParagraphEnd = targetModule.content.indexOf("\n\n");
                if (firstParagraphEnd > 0) {
                  targetModule.content =
                    targetModule.content.slice(0, firstParagraphEnd) + imageMarkdown + targetModule.content.slice(firstParagraphEnd);
                } else {
                  targetModule.content += imageMarkdown;
                }
              }
            } catch (uploadObjError) {
              console.error("AI image upload failed", uploadObjError);
              // Fallback to base64 if upload fails
              const dataUrl = `data:${img.mimeType};base64,${img.base64}`;
              const imageMarkdown = `\n\n![${img.suggestedAlt}](${dataUrl})\n\n`;
              const markerRegex = />\s*(?:🖼️)?\s*\*\*Image Recommendation:\*\*\s*(?:\*.*?\*|[^\n]*)(\n|$)/;
              if (markerRegex.test(targetModule.content)) {
                targetModule.content = targetModule.content.replace(markerRegex, imageMarkdown);
              } else {
                targetModule.content += imageMarkdown;
              }
            }
          }
          imageCount++;
        }
      } catch (imgError) {
        console.warn("AI image generation failed, continuing without images:", imgError);
      }
    }
  }

  // ============================================
  // STEP 5: Strip any remaining Image Recommendation markers
  // ============================================
  // After all image processing, clean up any leftover placeholder markers
  // so users never see raw "Image Recommendation" text in their slides.
  for (const mod of allModules) {
    if (mod.type === "slide") {
      mod.content = mod.content.replace(
        />\s*(?:🖼️)?\s*\*\*Image Recommendation:\*\*\s*(?:\*.*?\*|[^\n]*)\n?/g,
        ""
      );
    }
  }

  return {
    title: slidesData.title || `Course: ${topic}`,
    description:
      slidesData.description || `A comprehensive course about ${topic}.`,
    modules: allModules,
  };
}
