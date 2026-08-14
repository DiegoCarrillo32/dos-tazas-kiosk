import { PageHeaderSkeleton, TableSkeleton } from "../_components/Skeletons";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHeaderSkeleton />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-36 rounded-md" />
          <Skeleton className="h-11 w-28 rounded-md" />
        </div>
      </div>
      <TableSkeleton rows={6} cols={6} />
    </div>
  );
}
