import { PageHeaderSkeleton, TableSkeleton } from "../_components/Skeletons";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeaderSkeleton />
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <Skeleton className="h-11 flex-1 rounded-md" />
        <Skeleton className="h-11 w-full sm:w-44 rounded-md" />
        <Skeleton className="h-11 w-full sm:w-44 rounded-md" />
      </div>
      <TableSkeleton rows={7} cols={7} />
    </div>
  );
}
