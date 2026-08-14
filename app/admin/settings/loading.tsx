import { PageHeaderSkeleton } from "../_components/Skeletons";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 max-w-2xl">
      <PageHeaderSkeleton />
      <div className="bg-card rounded-2xl border border-warm-roast/10 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-4 pb-4 border-b border-warm-roast/10">
          <Skeleton className="h-14 w-14 rounded-full shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
        <Skeleton className="h-11 w-32 rounded-md" />
      </div>
    </div>
  );
}
