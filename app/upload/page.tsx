'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface UploadProgress {
  filename: string;
  status: 'pending' | 'uploading' | 'ingesting' | 'done' | 'error';
  progress?: number;
  error?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [jobDescription, setJobDescription] = useState('');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    localStorage.setItem('screeningJobDescription', jobDescription);
    const newProgress: UploadProgress[] = files.map((f) => ({
      filename: f.name,
      status: 'pending',
    }));
    setUploadProgress(newProgress);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        // Update to uploading
        setUploadProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'uploading', progress: 0 } : p
          )
        );

        // Get signed upload URL
        const urlResponse = await fetch('/api/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        });

        if (!urlResponse.ok) {
          throw new Error('Failed to get upload URL');
        }

        const { signedUrl, path } = await urlResponse.json();

        // Upload to Supabase Storage using signed URL
        const uploadResponse = await fetch(signedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': 'application/pdf' },
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload file to storage');
        }

        // Update to ingesting
        setUploadProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'ingesting', progress: 50 } : p
          )
        );

        // Trigger ingestion
        const ingestResponse = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storagePath: path,
            jobDescription,
          }),
        });

        if (!ingestResponse.ok) {
          const errorData = await ingestResponse.json();
          throw new Error(errorData.error || 'Ingestion failed');
        }

        await ingestResponse.json();

        // Mark as done
        setUploadProgress((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: 'done',
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
                  status: 'error',
                  error:
                    error instanceof Error ? error.message : 'Unknown error',
                }
              : p
          )
        );
      }
    }

    setIsUploading(false);

    // Redirect to candidates only if all files succeeded
    setUploadProgress((finalProgress) => {
      const hasErrors = finalProgress.some((p) => p.status === 'error');
      if (!hasErrors) {
        setTimeout(() => {
          router.push('/candidates');
        }, 2000);
      }
      return finalProgress;
    });
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Upload Resumes
          </h1>
          <p className="text-gray-600">
            Add candidate resumes and job description to start screening
          </p>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-lg shadow space-y-6">
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
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
                isUploading
                  ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                  : 'border-gray-300 hover:border-blue-400 cursor-pointer'
              }`}
            >
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
                className={`block ${
                  isUploading
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:text-blue-600 cursor-pointer'
                }`}
              >
                <div className="text-3xl mb-2">📄</div>
                <p className="font-medium">Click to select PDF files</p>
                <p className="text-sm text-gray-500">
                  Select one or more resumes to upload
                </p>
              </label>
            </div>
          </div>

          {/* Upload Progress */}
          {uploadProgress.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900">Upload Progress</h3>
              {uploadProgress.map((item, idx) => {
                const statusConfig = {
                  pending: {
                    label: 'Waiting',
                    color: 'bg-gray-100 text-gray-700',
                  },
                  uploading: {
                    label: 'Uploading',
                    color: 'bg-blue-100 text-blue-700',
                  },
                  ingesting: {
                    label: 'Processing',
                    color: 'bg-purple-100 text-purple-700',
                  },
                  done: {
                    label: 'Complete',
                    color: 'bg-green-100 text-green-700',
                  },
                  error: { label: 'Failed', color: 'bg-red-100 text-red-700' },
                };
                const config = statusConfig[item.status];
                return (
                  <div
                    key={idx}
                    className="p-4 border border-gray-200 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {item.filename}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${config.color}`}
                      >
                        {config.label}
                      </span>
                    </div>
                    {item.status === 'error' && (
                      <p className="text-sm text-red-600">{item.error}</p>
                    )}
                    {item.progress !== undefined && item.status !== 'error' && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
