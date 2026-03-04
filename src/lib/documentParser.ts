/**
 * Document Parser — Extract text from PDF and Word files locally in the browser.
 * Files are NEVER uploaded to Supabase — purely client-side processing.
 */

import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * Extract text content from a PDF or Word (.docx) file.
 * Returns plain text that can be used as AI context.
 */
export async function extractTextFromFile(file: File): Promise<string> {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "pdf") {
        return extractFromPdf(file);
    } else if (extension === "docx") {
        return extractFromDocx(file);
    } else if (extension === "txt") {
        return file.text();
    } else {
        throw new Error(
            `Unsupported file type: .${extension}. Use PDF, Word (.docx), or text files.`
        );
    }
}

/**
 * Extract text from a PDF file using pdf.js
 */
async function extractFromPdf(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map((item: any) => item.str)
            .join(" ");
        if (pageText.trim()) {
            pages.push(pageText.trim());
        }
    }

    return pages.join("\n\n");
}

/**
 * Extract text from a Word (.docx) file using mammoth
 */
async function extractFromDocx(file: File): Promise<string> {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

/**
 * Supported file types for document context upload
 */
export const SUPPORTED_DOC_TYPES = ".pdf,.docx,.txt";
export const SUPPORTED_DOC_LABEL = "PDF, Word (.docx), or Text files";
