"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UploadProgress {
  filename: string;
  status: "pending" | "uploading" | "ingesting" | "done" | "error";
  progress?: number;
  error?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [jobDescription, setJobDescription] = useState("");
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    const newProgress: UploadProgress[] = files.map((f) => ({
      filename: f.name,
      status: "pending",
    }));
    setUploadProgress(newProgress);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        // Update to uploading
        setUploadProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "uploading", progress: 0 } : p
          )
        );

        // Get signed upload URL
        const urlResponse = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name }),
        });

        if (!urlResponse.ok) {
          throw new Error("Failed to get upload URL");
        }

        const { signedUrl, path } = await urlResponse.json();

        // Upload to Supabase Storage using signed URL
        const uploadResponse = await fetch(signedUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": "application/pdf" },
        });

        if (!uploadResponse.ok) {
          throw new Error("Failed to upload file to storage");
        }

        // Update to ingesting
        setUploadProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "ingesting", progress: 50 } : p
          )
        );

        // Trigger ingestion
        const ingestResponse = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath: path,
            jobDescription,
          }),
        });

        if (!ingestResponse.ok) {
          const errorData = await ingestResponse.json();
          throw new Error(errorData.error || "Ingestion failed");
        }

        await ingestResponse.json();

        // Mark as done
        setUploadProgress((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: "done",
                  progress: 100,
                }
              : p
          )
        );
      } catch (error) {
        setUploadProgress((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: "error",
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                }
              : p
          )
        );
      }
    }

    setIsUploading(false);

    // Check if all uploads are done
    setTimeout(() => {
      if (
        newProgress.every(
          (p) =>
            p.status === "done" ||
            p.status === "error"
        )
      ) {
        // Redirect to candidates page after a short delay
        setTimeout(() => {
          router.push("/candidates");
        }, 1000);
      }
    }, 100);
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Upload Resumes & Job Description</h1>

        <div className="bg-white p-8 rounded-lg shadow space-y-6">
          {/* Job Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job Description (Optional)
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here..."
              className="w-full h-32 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Resume Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Resumes (PDF)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition">
              <input
                type="file"
                multiple
                accept=".pdf"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="hidden"
                id="resume-input"
              />
              <label
                htmlFor="resume-input"
                className="cursor-pointer text-gray-600 hover:text-blue-600"
              >
                <div className="text-2xl mb-2">📁</div>
                <p className="font-medium">Click to select PDF files</p>
                <p className="text-sm text-gray-500">or drag and drop</p>
              </label>
            </div>
          </div>

          {/* Upload Progress */}
          {uploadProgress.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900">Upload Progress</h3>
              {uploadProgress.map((item, idx) => (
                <div key={idx} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      {item.filename}
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                      {item.status}
                    </span>
                  </div>
                  {item.status === "error" && (
                    <p className="text-sm text-red-600">{item.error}</p>
                  )}
                  {item.progress !== undefined && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
