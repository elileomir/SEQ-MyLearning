import { jsPDF } from "jspdf";
import { Database } from "@/types/supabase";

type Course = Database["public"]["Tables"]["mylearning_courses"]["Row"];

interface CertificateData {
  course: Course;
  userName: string;
  completionDate?: string;
}

export const generateCertificate = async ({
  course,
  userName,
  completionDate = new Date().toLocaleDateString(),
}: CertificateData) => {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  // --- Resources ---
  const logoUrl = "/SEQ_Logo.png";
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const centerX = pageWidth / 2;

  // --- Colors ---
  const primaryColor = [30, 41, 59]; // Zinc-800 equivalent
  const secondaryColor = [100, 116, 139]; // Slate-500

  // --- Loading Logo (Async) ---
  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
  };

  try {
    // 1. Border
    doc.setDrawColor(203, 213, 225); // Slate-300
    doc.setLineWidth(1);
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20); // Outer

    doc.setDrawColor(30, 41, 59); // Inner Dark Border
    doc.setLineWidth(0.5);
    doc.rect(15, 15, pageWidth - 30, pageHeight - 30); // Inner

    // 2. Logo
    try {
      const logo = await loadImage(logoUrl);
      const logoWidth = 40;
      const logoHeight = (logo.height / logo.width) * logoWidth;
      doc.addImage(
        logo,
        "PNG",
        centerX - logoWidth / 2,
        35,
        logoWidth,
        logoHeight,
      );
    } catch (err) {
      // Fallback
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.setTextColor(30, 41, 59);
      doc.text("SEQ FORMWORK", centerX, 55, { align: "center" });
    }

    // 3. Title
    doc.setFont("times", "normal");
    doc.setFontSize(14);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text("CERTIFICATE OF COMPLETION", centerX, 80, { align: "center" });

    // 4. "This certifies that"
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text("This is to certify that", centerX, 95, { align: "center" });

    // 5. User Name
    doc.setFont("times", "bolditalic");
    doc.setFontSize(36);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(userName || "Student Name", centerX, 115, { align: "center" });

    // Line under name
    doc.setDrawColor(203, 213, 225);
    doc.line(centerX - 60, 118, centerX + 60, 118);

    // 6. "Has successfully completed..."
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text("has successfully completed the course", centerX, 135, {
      align: "center",
    });

    // 7. Course Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    const splitTitle = doc.splitTextToSize(course.title, 180);
    doc.text(splitTitle, centerX, 155, { align: "center" });

    // 8. Date and ID/Signature Area
    const footerY = 175;

    // Date (Left)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text("Date Issued", centerX - 50, footerY);
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text(completionDate, centerX - 50, footerY + 8);

    // Signature / ID (Right)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text("Authorized By", centerX + 50, footerY);
    doc.setFont("times", "italic");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("SEQ Formwork", centerX + 50, footerY + 8);

    // 9. Document Footer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 200, 200);
    doc.text("Verified Certificate", centerX, 195, { align: "center" });

    doc.save(`${course.title.replace(/\s+/g, "_")}_Certificate.pdf`);
  } catch (e) {
    console.error("Certificate generation failed", e);
    // Fallback?
  }
};
