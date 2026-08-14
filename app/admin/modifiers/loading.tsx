import { PageHeaderSkeleton, CardListSkeleton } from "../_components/Skeletons";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHeaderSkeleton />
        <Skeleton className="h-11 w-40 rounded-md" />
      </div>
      <CardListSkeleton rows={5} />
    </div>
  );
}
