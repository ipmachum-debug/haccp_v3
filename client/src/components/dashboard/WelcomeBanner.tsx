import { useState, useEffect } from "react";
import { X, Sun, Moon, Sunset, Bell, Info, AlertTriangle, Star, Heart, Gift, Megaphone } from "lucide-react";
import { trpc } from "@/lib/trpc";

// 안전한 아이콘 매핑
const iconMap: Record<string, any> = {
  Sun, Moon, Sunset, Bell, Info, AlertTriangle, Star, Heart, Gift, Megaphone, X
};

export function WelcomeBanner() {
  const [isVisible, setIsVisible] = useState(true);
  const { data: user } = trpc.auth.me.useQuery();
  const { data: banners } = trpc.banner.getActiveBanners.useQuery(undefined, {
    enabled: !!user && user.role !== 'super_admin',
  });

  useEffect(() => {
    const today = new Date().toDateString();
    const closedDate = sessionStorage.getItem('bannerClosedDate');
    if (closedDate === today) {
      setIsVisible(false);
    }
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: "좋은 아침입니다", icon: Sun, period: "morning" };
    if (hour < 18) return { text: "좋은 오후입니다", icon: Sun, period: "afternoon" };
    if (hour < 21) return { text: "좋은 저녁입니다", icon: Sunset, period: "evening" };
    return { text: "편안한 밤 되세요", icon: Moon, period: "night" };
  };

  const handleClose = () => {
    setIsVisible(false);
    const today = new Date().toDateString();
    sessionStorage.setItem('bannerClosedDate', today);
  };

  if (!isVisible || !user || user.role === 'super_admin') return null;

  const activeBanner = banners && banners.length > 0 ? banners[0] : null;
  const greeting = getGreeting();
  const Icon = activeBanner?.icon ? (iconMap[activeBanner.icon] || greeting.icon) : greeting.icon;
  
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-5 mb-2">
      {/* 미세한 그라데이션 배경 장식 */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/[0.03] rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/[0.02] rounded-full translate-y-1/2 -translate-x-1/4" />
      
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-foreground leading-tight">
              {activeBanner ? activeBanner.title : `${greeting.text}, ${user.name}님`}
            </h3>
            <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
              {activeBanner ? activeBanner.content : "오늘도 안전한 식품 생산을 위해 함께하겠습니다"}
            </p>
          </div>
        </div>
        
        <button
          onClick={handleClose}
          className="flex-shrink-0 w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          aria-label="배너 닫기"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
