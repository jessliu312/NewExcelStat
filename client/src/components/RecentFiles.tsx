import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Download } from "lucide-react";
import { ProcessedFile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function RecentFiles() {
  const { toast } = useToast();

  const { data: files = [], isLoading } = useQuery<ProcessedFile[]>({
    queryKey: ['/api/files'],
  });

  const handleDownload = async (fileId: number) => {
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

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return "Just now";
    if (diffInHours === 1) return "1 hour ago";
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return "Yesterday";
    return `${diffInDays} days ago`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="px-2 py-1 secondary-100 text-green-700 text-xs font-medium rounded">
            Completed
          </span>
        );
      case "processing":
        return (
          <span className="px-2 py-1 accent-100 text-orange-700 text-xs font-medium rounded">
            Processing
          </span>
        );
      case "failed":
        return (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
            Failed
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
            Unknown
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Recent Files</h3>
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-500 mt-2">Loading recent files...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Recent Files</h3>
        {files.length === 0 ? (
          <div className="text-center py-8">
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No files processed yet</p>
            <p className="text-sm text-gray-400">Upload an Excel file to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {files.map((file) => (
              <div 
                key={file.id} 
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    file.status === "completed" ? "secondary-100" : "bg-gray-100"
                  }`}>
                    <FileSpreadsheet className={`${
                      file.status === "completed" ? "text-green-600" : "text-gray-600"
                    }`} size={20} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{file.originalFilename}</div>
                    <div className="text-sm text-gray-500">
                      {formatTimeAgo(file.createdAt)} • {file.totalRecords} total records
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {getStatusBadge(file.status)}
                  {file.status === "completed" && (
                    <Button
                      onClick={() => handleDownload(file.id)}
                      variant="ghost"
                      size="sm"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <Download className="mr-1" size={14} />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
