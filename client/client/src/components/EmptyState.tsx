import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { fadeIn } from "@/lib/animations";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
      variants={fadeIn}
      initial="hidden"
      animate="visible"
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl animate-pulse" />
        <div className="relative bg-gradient-to-br from-primary/20 to-primary/5 rounded-full p-6">
          <Icon className="h-16 w-16 text-primary" strokeWidth={1.5} />
        </div>
      </div>
      
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mb-6">{description}</p>
      
      {actionLabel && onAction && (
        <Button onClick={onAction} size="lg">
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
