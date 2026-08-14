import { PageHeaderSkeleton, CardListSkeleton } from "../_components/Skeletons";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-3xl">
      <PageHeaderSkeleton />
      <div className="bg-card p-4 rounded-xl border border-warm-roast/10 flex flex-col sm:flex-row gap-3">
        <Skeleton className="h-11 flex-1 rounded-md" />
        <Skeleton className="h-11 w-full sm:w-36 rounded-md" />
      </div>
      <CardListSkeleton rows={6} />
    </div>
  );
}
