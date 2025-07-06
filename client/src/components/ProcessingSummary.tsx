import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Truck, UserCheck, Building2 } from "lucide-react";

interface ProcessingSummaryProps {
  fileId: number | null;
}

interface ProcessedData {
  containerNumber: string;
  total: number;
  warehouseSummary: Array<{
    warehouse: string;
    ctn: number;
    skid: string;
  }>;
  referenceDetails: Array<{
    type: string;
    reference1: string;
    reference2: string;
    ctn: number;
  }>;
}

export function ProcessingSummary({ fileId }: ProcessingSummaryProps) {
  const { data: processedData, isLoading } = useQuery<ProcessedData>({
    queryKey: [`/api/files/${fileId}/summary`],
    enabled: !!fileId,
  });

  if (!fileId || isLoading || !processedData) {
    return null;
  }

  const pdEntries = processedData.referenceDetails.filter(item => item.type === "PD");
  const selfEntries = processedData.referenceDetails.filter(item => item.type === "Self");
  const warehouseEntries = processedData.warehouseSummary.filter(item => item.warehouse !== "UPS");
  const upsEntries = processedData.warehouseSummary.filter(item => item.warehouse === "UPS");

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Processing Summary</h3>
        
        {/* Container Info */}
        {processedData.containerNumber && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Container Information</h4>
            <p className="text-sm text-gray-700">
              Container: <span className="font-mono font-medium">{processedData.containerNumber}</span>
            </p>
            <p className="text-sm text-gray-700">
              Total CTN: <span className="font-medium">{processedData.total}</span>
            </p>
          </div>
        )}

        {/* Warehouse Summary */}
        <div className="mb-6">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center">
            <Building2 className="mr-2 text-blue-500" size={16} />
            Warehouse Summary ({warehouseEntries.length} warehouses)
          </h4>
          <div className="space-y-2">
            {warehouseEntries.map((item, index) => (
              <div key={index} className="flex justify-between items-center py-1 px-3 bg-gray-50 rounded">
                <span className="font-mono text-sm font-medium">{item.warehouse}</span>
                <span className="text-sm text-gray-600">{item.ctn} CTN</span>
              </div>
            ))}
          </div>
        </div>

        {/* UPS Summary */}
        {upsEntries.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center">
              <Package className="mr-2 text-orange-500" size={16} />
              UPS Deliveries
            </h4>
            <div className="space-y-2">
              {upsEntries.map((item, index) => (
                <div key={index} className="flex justify-between items-center py-1 px-3 bg-orange-50 rounded">
                  <span className="font-medium text-orange-700">{item.warehouse}</span>
                  <span className="text-sm text-orange-600">{item.ctn} CTN</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PD Deliveries */}
        {pdEntries.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center">
              <Truck className="mr-2 text-purple-500" size={16} />
              PD Deliveries ({pdEntries.length} entries)
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {pdEntries.map((item, index) => (
                <div key={index} className="py-2 px-3 bg-purple-50 rounded">
                  <div className="flex justify-between items-start">
                    <div className="text-sm">
                      <div className="font-medium text-purple-700">{item.reference1}</div>
                      <div className="text-purple-600">{item.reference2}</div>
                    </div>
                    <span className="text-sm text-purple-600 font-medium">{item.ctn} CTN</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Self Pickups */}
        {selfEntries.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center">
              <UserCheck className="mr-2 text-green-500" size={16} />
              Self Pickups ({selfEntries.length} entries)
            </h4>
            <div className="space-y-2">
              {selfEntries.map((item, index) => (
                <div key={index} className="py-2 px-3 bg-green-50 rounded">
                  <div className="flex justify-between items-start">
                    <div className="text-sm">
                      <div className="font-medium text-green-700">{item.reference1}</div>
                      <div className="text-green-600">{item.reference2}</div>
                    </div>
                    <span className="text-sm text-green-600 font-medium">{item.ctn} CTN</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="border-t border-gray-200 pt-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="font-medium text-gray-900">{warehouseEntries.length + upsEntries.length}</div>
              <div className="text-gray-600">Delivery Points</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="font-medium text-gray-900">{pdEntries.length + selfEntries.length}</div>
              <div className="text-gray-600">Special Deliveries</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}