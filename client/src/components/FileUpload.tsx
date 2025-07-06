import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudUpload, Info } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface FileUploadProps {
  onFileUploaded: (fileId: number) => void;
}

export function FileUpload({ onFileUploaded }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "File uploaded successfully",
        description: "Processing has started. You will be notified when complete.",
      });
      onFileUploaded(data.fileId);
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Upload Excel File</h3>
        
        {/* File Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragActive
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto primary-100 rounded-full flex items-center justify-center">
              <CloudUpload className="text-2xl text-blue-600" size={32} />
            </div>
            <div>
              <p className="text-lg font-medium text-gray-900">Drop your Excel file here</p>
              <p className="text-sm text-gray-500 mt-1">or click to browse files</p>
            </div>
            <div className="flex items-center justify-center">
              <Button 
                type="button" 
                className="primary-500 hover:bg-blue-600"
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? "Uploading..." : "Choose File"}
              </Button>
            </div>
            <p className="text-xs text-gray-400">Supports .xlsx files up to 10MB</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".xlsx"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {/* File Requirements */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2 flex items-center">
            <Info className="text-blue-500 mr-2" size={16} />
            File Requirements
          </h4>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• Column A: Reference1 (分货号)</li>
            <li>• Column C: Reference2 (参考号)</li>
            <li>• Column D: CTN count (箱数CTN)</li>
            <li>• Column M: Warehouse destination (目的仓库)</li>
            <li>• Column N: Delivery notes (备注)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
