import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ProcessingStatus } from "@/components/ProcessingStatus";
import { ResultsDisplay } from "@/components/ResultsDisplay";
import { ProcessingSummary } from "@/components/ProcessingSummary";
import { RecentFiles } from "@/components/RecentFiles";
import { FileSpreadsheet, HelpCircle, History, LayoutDashboard } from "lucide-react";

export default function Home() {
  const [currentFileId, setCurrentFileId] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 primary-500 rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="text-white text-sm" size={16} />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Excel Processor</h1>
            </div>
            <nav className="hidden md:flex space-x-6">
              <a href="#" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-1">
                <LayoutDashboard size={16} />
                Dashboard
              </a>
              <a href="#" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-1">
                <History size={16} />
                History
              </a>
              <a href="#" className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-1">
                <HelpCircle size={16} />
                Help
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Warehouse Shipping Data Processor</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your Excel shipping files and get automated warehouse summaries with CTN calculations, 
            UPS tracking, and delivery type classifications.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Upload Section */}
          <div className="lg:col-span-2 space-y-6">
            <FileUpload onFileUploaded={setCurrentFileId} />
            {currentFileId && <ProcessingStatus fileId={currentFileId} />}
          </div>

          {/* Info Panel */}
          <div className="space-y-6">
            <ResultsDisplay fileId={currentFileId} />
            <ProcessingSummary fileId={currentFileId} />
          </div>
        </div>

        {/* Recent Files */}
        <div className="mt-12">
          <RecentFiles />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <div className="w-6 h-6 primary-500 rounded flex items-center justify-center">
                <FileSpreadsheet className="text-white text-xs" size={12} />
              </div>
              <span className="text-gray-600">Excel Processor Platform</span>
            </div>
            <div className="flex space-x-6 text-sm text-gray-500">
              <a href="#" className="hover:text-blue-600 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-blue-600 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-blue-600 transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
