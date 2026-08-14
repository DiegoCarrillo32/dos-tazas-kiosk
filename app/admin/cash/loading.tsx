import { PageHeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "../_components/Skeletons";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeaderSkeleton />
        <Skeleton className="h-11 w-full sm:w-36 rounded-md" />
      </div>
      <StatCardsSkeleton count={3} />
      <TableSkeleton rows={5} cols={7} />
    </div>
  );
}
