import { PageHeaderSkeleton, ChartSkeleton } from "../_components/Skeletons";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeaderSkeleton />
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <Skeleton className="h-11 w-full sm:w-40 rounded-md" />
          <Skeleton className="h-11 w-full sm:w-40 rounded-md" />
        </div>
      </div>
      <ChartSkeleton />
    </div>
  );
}
