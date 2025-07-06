import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { ProcessedFile } from "@shared/schema";

interface ProcessingStatusProps {
  fileId: number;
}

export function ProcessingStatus({ fileId }: ProcessingStatusProps) {
  const { data: file, isLoading } = useQuery<ProcessedFile>({
    queryKey: [`/api/files/${fileId}`],
    refetchInterval: (data) => {
      // Stop polling if completed or failed
      return data?.status === "processing" ? 2000 : false;
    },
  });

  if (isLoading || !file) {
    return null;
  }

  const getStatusConfig = () => {
    switch (file.status) {
      case "processing":
        return {
          icon: <Loader2 className="animate-spin w-5 h-5 text-orange-500" />,
          title: "Processing your file...",
          description: "Analyzing warehouse data and calculating CTN summaries...",
          bgColor: "accent-50",
          borderColor: "accent-200",
          textColor: "accent-700",
          progress: 66,
        };
      case "completed":
        return {
          icon: <CheckCircle className="w-5 h-5 text-green-500" />,
          title: "Processing completed successfully!",
          description: "Your warehouse summary is ready for download.",
          bgColor: "secondary-50",
          borderColor: "secondary-200",
          textColor: "secondary-700",
          progress: 100,
        };
      case "failed":
        return {
          icon: <AlertCircle className="w-5 h-5 text-red-500" />,
          title: "Processing failed",
          description: file.errorMessage || "An error occurred during processing.",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          textColor: "text-red-700",
          progress: 0,
        };
      default:
        return {
          icon: <Loader2 className="animate-spin w-5 h-5 text-gray-500" />,
          title: "Unknown status",
          description: "Status unknown.",
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          textColor: "text-gray-700",
          progress: 0,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Card>
      <CardContent className="p-6">
        <div className={`${config.bgColor} border ${config.borderColor} rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {config.icon}
              <span className={`font-medium ${config.textColor}`}>{config.title}</span>
            </div>
            {file.status === "processing" && (
              <span className="text-sm text-orange-600">Processing...</span>
            )}
          </div>
          {file.status === "processing" && (
            <>
              <div className="mt-3">
                <div className="bg-white rounded-full h-2">
                  <div 
                    className="accent-500 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${config.progress}%` }}
                  ></div>
                </div>
              </div>
              <p className="text-sm text-orange-600 mt-2">{config.description}</p>
            </>
          )}
          {file.status !== "processing" && (
            <p className="text-sm mt-2" style={{ color: `var(--${config.textColor})` }}>
              {config.description}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
