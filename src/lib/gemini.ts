import { GoogleGenerativeAI } from "@google/generative-ai";

// Access API key from environment
const API_KEY = import.meta.env.VITE_GOOGLE_AI_API_KEY || "";

const genAI = new GoogleGenerativeAI(API_KEY);

// User requested specifically: gemini-3-flash-preview, gemini-2.5-pro, gemini-2.5-flash
const TARGET_MODELS = [
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];
// NOTE: I will use the user's list. If they fail (404), the logic falls through.
// If valid models are needed for this to work NOW, I'd suggest mapping them to current equivalents,
// but the user might have access to previews I don't know about.
// I will adhere to the user's request but add 1.5-flash as a hidden 4th safety or just stick to their 3?
// User said: "if the three failed thats where the failed error toast appear". Strict adherence.

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
      // Continue to next model
    }
  }

  // If we get here, all models failed
  console.error("All Gemini models failed. Last error:", lastError);
  throw new Error("All AI models failed to generate content.");
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
    const cleanText = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
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
    const cleanText = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
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

export async function generateFullCourse(params: {
  topic: string;
  moduleCount: number;
  includeQuiz: boolean;
  includeVideo: boolean;
  videoUrl?: string;
  additionalContext?: string;
}): Promise<GeneratedCourse> {
  const {
    topic,
    moduleCount,
    includeQuiz,
    includeVideo,
    videoUrl,
    additionalContext,
  } = params;

  // ============================================
  // STEP 1: Generate SLIDES ONLY (focused prompt)
  // ============================================
  const slidesPrompt = `You are an expert curriculum designer. Generate ONLY the slide modules for a course.

=== TOPIC ===
"${topic}"

=== NUMBER OF SLIDES ===
Generate exactly ${moduleCount} slide modules.

${additionalContext ? `=== CONTEXT TO USE ===\n${additionalContext}\n` : ""}

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

  const slidesResponse = await executeGeminiRequest(slidesPrompt);

  let slidesData: {
    title: string;
    description: string;
    slides: GeneratedModule[];
  };
  try {
    const cleanedSlides = slidesResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    slidesData = JSON.parse(cleanedSlides);
  } catch (e) {
    console.error("Failed to parse slides:", slidesResponse);
    throw new Error("AI failed to generate valid slides. Please try again.");
  }

  // Validate slides were generated
  if (!slidesData.slides || slidesData.slides.length === 0) {
    throw new Error("AI generated no slides. Please try again.");
  }

  // Build the final modules array
  const allModules: GeneratedModule[] = [...slidesData.slides];

  // ============================================
  // STEP 2: Add VIDEO module (no AI needed - guaranteed correct)
  // ============================================
  console.log("Video params:", { includeVideo, videoUrl }); // Debug log

  if (includeVideo) {
    // Determine placement based on context or default to middle
    const videoPosition = Math.floor(allModules.length / 2);

    const videoModule: GeneratedModule = {
      title: "Video Walkthrough",
      type: "video",
      content:
        "Watch this video for a visual demonstration of the concepts covered in this course.",
      videoUrl: videoUrl || "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Fallback URL if empty
    };

    console.log("Creating video module with URL:", videoModule.videoUrl); // Debug log

    // Insert at calculated position
    allModules.splice(videoPosition, 0, videoModule);
  }

  // ============================================
  // STEP 3: Generate QUIZ using proven working function
  // ============================================
  if (includeQuiz) {
    // Collect all slide content to base questions on
    const allSlideContent = slidesData.slides
      .map((s) => s.content)
      .join("\n\n");

    // Use the existing, working generateQuizFromContent function
    const quizQuestions = await generateQuizFromContent(
      allSlideContent,
      [],
      10,
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

  return {
    title: slidesData.title || `Course: ${topic}`,
    description:
      slidesData.description || `A comprehensive course about ${topic}.`,
    modules: allModules,
  };
}
