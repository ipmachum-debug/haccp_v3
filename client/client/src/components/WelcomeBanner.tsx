import { useState, useEffect } from "react";
import { X, Sparkles, Sun, Moon, Sunset, Bell, Info, AlertTriangle, Star, Heart, Gift, Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";

// 안전한 아이콘 매핑 (eval 대신 사용)
const iconMap: Record<string, any> = {
  Sparkles, Sun, Moon, Sunset, Bell, Info, AlertTriangle, Star, Heart, Gift, Megaphone, X
};

export function WelcomeBanner() {
  const [isVisible, setIsVisible] = useState(true);
  const { data: user } = trpc.auth.me.useQuery();
  const { data: banners } = trpc.banner.getActiveBanners.useQuery(undefined, {
    enabled: !!user && user.role !== 'super_admin',
  });
  // 세션 스토리지에서 오늘 배너를 닫았는지 확인
  useEffect(() => {
    const today = new Date().toDateString();
    const closedDate = sessionStorage.getItem('bannerClosedDate');
    if (closedDate === today) {
      setIsVisible(false);
    }
  }, []);
  // 시간대별 인사 메시지
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: "좋은 아침입니다", icon: Sun, gradient: "from-amber-400 via-orange-400 to-yellow-500" };
    if (hour < 18) return { text: "좋은 오후입니다", icon: Sun, gradient: "from-blue-400 via-cyan-400 to-teal-500" };
    if (hour < 21) return { text: "좋은 저녁입니다", icon: Sunset, gradient: "from-orange-500 via-pink-500 to-purple-600" };
    return { text: "편안한 밤 되세요", icon: Moon, gradient: "from-indigo-500 via-purple-500 to-pink-600" };
  };
  const handleClose = () => {
    setIsVisible(false);
    const today = new Date().toDateString();
    sessionStorage.setItem('bannerClosedDate', today);
  };
  if (!isVisible || !user || user.role === 'super_admin') return null;
  // 활성 배너가 있으면 배너 표시, 없으면 환영 메시지
  const activeBanner = banners && banners.length > 0 ? banners[0] : null;
  const greeting = getGreeting();
  // eval 대신 안전한 아이콘 매핑 사용
  const Icon = activeBanner?.icon ? (iconMap[activeBanner.icon] || greeting.icon) : greeting.icon;
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-xl shadow-lg mb-6"
      >
        {/* 그라디언트 배경 */}
        <div className={`absolute inset-0 bg-gradient-to-r ${activeBanner?.color === 'gradient' ? greeting.gradient : 'from-blue-500 via-purple-500 to-pink-500'} opacity-90`} />
        
        {/* 애니메이션 효과 */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0wLTEwYzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMC0xMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] animate-pulse" />
        </div>
        {/* 컨텐츠 */}
        <div className="relative px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Icon className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="text-white">
              <h3 className="text-lg font-bold mb-1">
                {activeBanner ? activeBanner.title : `${greeting.text}, ${user.name}님!`}
              </h3>
              <p className="text-sm text-white/90">
                {activeBanner ? activeBanner.content : "오늘도 안전한 식품 생산을 위해 함께하겠습니다 ☀️"}
              </p>
            </div>
          </div>
          
          {/* 닫기 버튼 */}
          <button
            onClick={handleClose}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors"
            aria-label="배너 닫기"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
