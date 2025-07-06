import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { ProcessedFile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface ResultsDisplayProps {
  fileId: number | null;
}

export function ResultsDisplay({ fileId }: ResultsDisplayProps) {
  const { toast } = useToast();

  const { data: file } = useQuery<ProcessedFile>({
    queryKey: [`/api/files/${fileId}`],
    enabled: !!fileId,
    refetchInterval: (data) => {
      return data?.status === "processing" ? 2000 : false;
    },
  });

  const handleDownload = async () => {
    if (!fileId) return;

    try {
      const response = await fetch(`/api/files/${fileId}/download`);
      
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'warehouse_summary.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download started",
        description: "Your processed Excel file is downloading.",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Unable to download the file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <>
      {/* Processing Info */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Processing Details</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">File Size</span>
              <span className="text-sm font-medium text-gray-900">
                {file ? formatFileSize(file.fileSize) : '-'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total Records</span>
              <span className="text-sm font-medium text-gray-900">
                {file ? file.totalRecords : '-'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Status</span>
              <span className="text-sm font-medium text-gray-900">
                {file ? file.status : '-'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Processing Time</span>
              <span className="text-sm font-medium text-gray-900">
                {file && file.status === "completed" ? "< 1s" : '-'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Download Section */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Download Results</h3>
          <div className="space-y-3">
            <Button 
              onClick={handleDownload}
              className="w-full secondary-500 hover:bg-green-600 text-white"
              disabled={!file || file.status !== "completed"}
            >
              <Download className="mr-2" size={16} />
              Download Processed Excel
            </Button>
            <p className="text-xs text-gray-500 text-center">
              File will include warehouse summaries, CTN totals, and delivery classifications
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sample Output Preview */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Expected Output Format</h3>
          <div className="text-sm">
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="font-medium text-gray-900 mb-2">Warehouse Summary:</div>
              <div className="space-y-1 text-gray-600">
                <div>• YYZ3: 188 CTN</div>
                <div>• YYZ4: 97 CTN</div>
                <div>• UPS: 47 CTN</div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="font-medium text-gray-900 mb-2">Reference Details:</div>
              <div className="space-y-1 text-gray-600">
                <div>• PD deliveries with addresses</div>
                <div>• Self pickup items</div>
                <div>• Reference1 & Reference2 codes</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
