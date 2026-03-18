import { motion as _motion } from "framer-motion";
const motion = _motion as any;
import { Clock, Mail, Shield, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function PendingApproval() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 p-4 relative overflow-hidden">
      {/* 배경 장식 */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200 rounded-full opacity-20 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-200 rounded-full opacity-20 blur-3xl"></div>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 sm:p-12 relative z-10"
      >
        {/* 아이콘 */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="flex justify-center mb-8"
        >
          <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
            <Clock className="w-12 h-12 text-white" />
          </div>
        </motion.div>

        {/* 제목 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            승인 대기 중입니다
          </h1>
          <p className="text-lg text-gray-600">
            관리자가 귀하의 계정을 검토하고 있습니다
          </p>
        </motion.div>

        {/* 안내 카드 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="space-y-6 mb-8"
        >
          {/* 이메일 알림 */}
          <div className="flex items-start space-x-4 p-4 bg-blue-50 rounded-2xl">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">이메일 확인</h3>
              <p className="text-sm text-gray-600">
                승인이 완료되면 등록하신 이메일로 알림을 보내드립니다.
              </p>
            </div>
          </div>

          {/* 승인 프로세스 */}
          <div className="flex items-start space-x-4 p-4 bg-purple-50 rounded-2xl">
            <div className="flex-shrink-0 w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">승인 프로세스</h3>
              <p className="text-sm text-gray-600">
                관리자가 귀하의 정보를 확인하고 승인 여부를 결정합니다.
                일반적으로 1-2 영업일 내에 처리됩니다.
              </p>
            </div>
          </div>

          {/* 승인 후 */}
          <div className="flex items-start space-x-4 p-4 bg-green-50 rounded-2xl">
            <div className="flex-shrink-0 w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">승인 완료 후</h3>
              <p className="text-sm text-gray-600">
                승인이 완료되면 이메일로 알림을 받고, 즉시 로그인하여 시스템을 사용하실 수 있습니다.
              </p>
            </div>
          </div>
        </motion.div>

        {/* 안내 메시지 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="text-center p-6 bg-gray-50 rounded-2xl mb-6"
        >
          <p className="text-sm text-gray-600 leading-relaxed">
            승인이 지연되거나 문의 사항이 있으시면 관리자에게 연락해주세요.
            <br />
            <span className="font-medium text-gray-900">이메일: dduckdanji@naver.com</span>
          </p>
        </motion.div>

        {/* 버튼 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <Button
            onClick={() => setLocation("/login")}
            className="flex-1 h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg"
          >
            로그인 페이지로 돌아가기
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
