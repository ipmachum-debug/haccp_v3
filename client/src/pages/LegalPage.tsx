import { useState, useEffect, useRef } from "react";
import { motion as _motion } from "framer-motion";
const motion = _motion as any;
import { Link, useRoute } from "wouter";
import { MillioMark } from "@/components/brand/MillioMark";
import {
  ShieldCheck, ArrowLeft, FileText, Lock, CreditCard,
  Activity, Shield, AlertTriangle, Database, BookOpen,
  Key, ChevronRight, Menu, X
} from "lucide-react";

// ─── Policy section type ───
type PolicySection = {
  id: string;
  title: string;
  shortTitle: string;
  icon: any;
  content: React.ReactNode;
};

// ─── All policy data ───
const policySections: PolicySection[] = [
  {
    id: "terms",
    title: "Millio AI 이용약관",
    shortTitle: "이용약관",
    icon: FileText,
    content: (
      <div className="legal-content">
        <p className="text-stone-500 mb-8">본 약관은 주식회사 골든터틀컴퍼니가 제공하는 Millio AI 서비스의 이용과 관련하여 회사와 이용자 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>

        <h3>제1조 (목적)</h3>
        <p>이 약관은 <strong>주식회사 골든터틀컴퍼니(이하 "회사")</strong>가 운영하는 <strong>Millio AI 서비스(이하 "서비스")</strong>를 이용함에 있어 회사와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>

        <h3>제2조 (정의)</h3>
        <p>본 약관에서 사용하는 용어의 정의는 다음과 같습니다.</p>
        <ol>
          <li>"서비스"란 회사가 제공하는 Millio AI 클라우드 기반 제조업 AI ERP SaaS 플랫폼을 의미합니다 (식품 HACCP 특화, 제조업 전반으로 확장 중).</li>
          <li>"이용자"란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 회원 또는 비회원을 말합니다.</li>
          <li>"회원"이란 서비스에 가입하여 계정을 생성하고 서비스를 이용하는 자를 말합니다.</li>
          <li>"유료서비스"란 회사가 제공하는 월 또는 연 단위 구독 기반 서비스 및 부가 기능을 의미합니다.</li>
          <li>"정기결제"란 이용자가 선택한 결제수단을 통해 일정 주기마다 자동으로 이용요금이 결제되는 방식입니다.</li>
          <li>"테넌트(Tenant)"란 서비스 내에서 하나의 조직 또는 기업 단위로 생성되는 독립된 작업 환경을 의미합니다.</li>
        </ol>

        <h3>제3조 (회사정보)</h3>
        <p>회사의 기본 정보는 다음과 같습니다.</p>
        <table>
          <tbody>
            <tr><td>상호</td><td>주식회사 골든터틀컴퍼니</td></tr>
            <tr><td>대표자</td><td>이정언</td></tr>
            <tr><td>사업장 주소</td><td>22770 인천광역시 서구 원창로89번길 14-7 (원창동) 3층 301호</td></tr>
            <tr><td>대표전화</td><td>010-9206-9984</td></tr>
            <tr><td>사업자등록번호</td><td>603-81-93743</td></tr>
            <tr><td>통신판매업 신고번호</td><td>2025-인천서구-3547</td></tr>
          </tbody>
        </table>

        <h3>제4조 (약관의 게시 및 변경)</h3>
        <ol>
          <li>회사는 본 약관을 서비스 초기 화면 또는 연결 화면을 통해 게시합니다.</li>
          <li>회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있습니다.</li>
          <li>약관이 변경되는 경우 적용일자 및 변경 사유를 최소 7일 이전에 공지합니다.</li>
          <li>이용자에게 불리한 약관 변경의 경우 최소 30일 이전에 공지합니다.</li>
        </ol>

        <h3>제5조 (서비스의 제공)</h3>
        <p>회사는 다음과 같은 서비스를 제공합니다.</p>
        <ol>
          <li>HACCP 관리 기능</li>
          <li>생산 및 배치 관리</li>
          <li>원료수불 관리</li>
          <li>LOT 기반 재고관리</li>
          <li>HACCP 체크리스트 및 CCP 관리</li>
          <li>문서 출력 및 기록 관리</li>
          <li>거래처 및 공급업체 관리</li>
          <li>회계 데이터 연동 기능</li>
          <li>기타 회사가 제공하는 SaaS 기능</li>
        </ol>

        <h3>제6조 (서비스의 변경)</h3>
        <p>회사는 운영상 또는 기술상의 필요에 따라 서비스의 내용을 변경할 수 있습니다. 서비스 내용 변경 시 사전에 공지합니다.</p>

        <h3>제7조 (서비스 중단)</h3>
        <p>다음의 경우 서비스 제공이 일시적으로 중단될 수 있습니다.</p>
        <ol>
          <li>시스템 점검</li>
          <li>서버 장애</li>
          <li>네트워크 장애</li>
          <li>천재지변</li>
          <li>클라우드 인프라 장애</li>
        </ol>
        <p>회사는 가능한 경우 사전에 공지합니다.</p>

        <h3>제8조 (회원가입)</h3>
        <ol>
          <li>이용자는 회사가 정한 절차에 따라 회원가입을 신청할 수 있습니다.</li>
          <li>회사는 다음의 경우 회원가입을 거절할 수 있습니다.
            <ul>
              <li>허위 정보 등록</li>
              <li>타인 명의 사용</li>
              <li>서비스 운영에 중대한 지장을 초래하는 경우</li>
            </ul>
          </li>
        </ol>

        <h3>제9조 (회원 탈퇴)</h3>
        <p>회원은 언제든지 서비스 탈퇴를 요청할 수 있습니다. 회사는 즉시 탈퇴 처리합니다.</p>
        <p>다만 다음의 경우 처리 지연이 발생할 수 있습니다.</p>
        <ul>
          <li>미결제 요금 존재</li>
          <li>진행 중인 서비스 계약</li>
        </ul>

        <h3>제10조 (회원 계정 관리)</h3>
        <ol>
          <li>회원은 자신의 계정 및 비밀번호를 관리할 책임이 있습니다.</li>
          <li>계정 도용 또는 보안 문제가 발생한 경우 즉시 회사에 통보해야 합니다.</li>
        </ol>

        <h3>제11조 (유료서비스 및 결제)</h3>
        <p>회사는 유료서비스 이용에 대해 다음 결제 방식을 제공합니다.</p>
        <ol>
          <li>무통장입금</li>
          <li>신용카드 결제</li>
          <li>전자결제 서비스</li>
          <li>기타 회사가 제공하는 결제 방식</li>
        </ol>

        <h3>제12조 (정기결제 및 자동갱신)</h3>
        <ol>
          <li>유료서비스는 월 또는 연 단위 구독 방식으로 제공됩니다.</li>
          <li>이용자가 정기결제를 신청한 경우 결제주기마다 자동으로 결제됩니다.</li>
          <li>자동결제는 이용자가 해지하기 전까지 계속됩니다.</li>
          <li>결제 실패 시 서비스 이용이 제한될 수 있습니다.</li>
        </ol>

        <h3>제13조 (세금계산서 발행)</h3>
        <ol>
          <li>사업자 회원은 요청 시 세금계산서를 발행받을 수 있습니다.</li>
          <li>세금계산서 발행을 위해 필요한 사업자 정보는 이용자가 정확히 제공해야 합니다.</li>
        </ol>

        <h3>제14조 (서비스 제공)</h3>
        <p>결제가 완료되면 서비스 이용 권한이 즉시 부여됩니다. 서비스 제공 방식은 다음과 같습니다.</p>
        <ul>
          <li>계정 생성</li>
          <li>테넌트 생성</li>
          <li>사용자 권한 부여</li>
        </ul>

        <h3>제15조 (해지 및 환불)</h3>
        <ol>
          <li>이용자는 언제든지 구독을 해지할 수 있습니다.</li>
          <li>해지 시 이미 결제된 기간 동안 서비스 이용이 가능합니다.</li>
          <li>서비스가 시작된 이후에는 법령에서 허용하는 범위 내에서 환불이 제한될 수 있습니다.</li>
          <li>환불 정책은 서비스 요금 안내 페이지에 따릅니다.</li>
        </ol>

        <h3>제16조 (환불 처리)</h3>
        <p>환불이 발생하는 경우 회사는 3영업일 이내 처리합니다. 카드 결제의 경우 카드사 정책에 따라 처리됩니다.</p>

        <h3>제17조 (데이터 보관)</h3>
        <ol>
          <li>이용자가 생성한 데이터는 이용자에게 귀속됩니다.</li>
          <li>서비스 해지 후 데이터는 30일 동안 보관됩니다.</li>
          <li>보관 기간 이후 데이터는 삭제될 수 있습니다.</li>
        </ol>

        <h3>제18조 (서비스 이용 제한)</h3>
        <p>회사는 다음의 경우 서비스 이용을 제한할 수 있습니다.</p>
        <ol>
          <li>불법 사용</li>
          <li>서비스 운영 방해</li>
          <li>해킹 시도</li>
          <li>타인의 권리 침해</li>
        </ol>

        <h3>제19조 (지적재산권)</h3>
        <p>서비스 및 관련 소프트웨어의 저작권은 회사에 있습니다. 이용자는 회사의 허락 없이 이를 복제하거나 배포할 수 없습니다.</p>

        <h3>제20조 (이용자의 의무)</h3>
        <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
        <ol>
          <li>허위 정보 등록</li>
          <li>타인 정보 도용</li>
          <li>서비스 해킹 시도</li>
          <li>시스템 장애 유발</li>
        </ol>

        <h3>제21조 (책임의 제한)</h3>
        <p>회사는 다음의 경우 책임을 지지 않습니다.</p>
        <ul>
          <li>이용자의 귀책사유</li>
          <li>인터넷 환경 문제</li>
          <li>제3자 서비스 장애</li>
        </ul>

        <h3>제22조 (분쟁 해결)</h3>
        <p>회사는 이용자의 불만 사항을 처리하기 위해 고객지원 시스템을 운영합니다.</p>

        <h3>제23조 (재판권 및 준거법)</h3>
        <ol>
          <li>회사와 이용자 간 분쟁은 대한민국 법률을 적용합니다.</li>
          <li>관할 법원은 민사소송법에 따릅니다.</li>
        </ol>

        <div className="mt-8 p-4 bg-stone-50 rounded-xl border border-stone-200">
          <p className="text-sm text-stone-500"><strong>부칙</strong> — 본 약관은 2026년 3월 4일부터 시행합니다.</p>
        </div>
      </div>
    ),
  },
  {
    id: "privacy",
    title: "개인정보처리방침",
    shortTitle: "개인정보처리방침",
    icon: Lock,
    content: (
      <div className="legal-content">
        <p className="text-stone-500 mb-8">주식회사 골든터틀컴퍼니(이하 "회사")는 이용자의 개인정보를 중요하게 생각하며 「개인정보 보호법」 및 관련 법령을 준수합니다. 회사는 개인정보처리방침을 통해 이용자의 개인정보가 어떠한 목적과 방식으로 이용되고 있으며 개인정보 보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다.</p>

        <h3>제1조 (수집하는 개인정보 항목)</h3>
        <p>회사는 서비스 제공을 위해 다음의 개인정보를 수집할 수 있습니다.</p>

        <h4>회원가입 시</h4>
        <ul>
          <li>이름</li>
          <li>이메일</li>
          <li>전화번호</li>
          <li>회사명</li>
          <li>사업자등록번호</li>
        </ul>

        <h4>결제 시</h4>
        <ul>
          <li>결제정보</li>
          <li>사업자 정보</li>
          <li>세금계산서 발행 정보</li>
        </ul>

        <h4>서비스 이용 과정에서 자동 생성</h4>
        <ul>
          <li>IP 주소</li>
          <li>접속 로그</li>
          <li>서비스 이용 기록</li>
          <li>브라우저 정보</li>
          <li>쿠키</li>
        </ul>

        <h3>제2조 (개인정보 수집 목적)</h3>
        <p>회사는 다음의 목적을 위해 개인정보를 이용합니다.</p>
        <ol>
          <li>회원 관리</li>
          <li>서비스 제공</li>
          <li>결제 처리</li>
          <li>세금계산서 발행</li>
          <li>고객 문의 대응</li>
          <li>서비스 개선</li>
        </ol>

        <h3>제3조 (개인정보 보유 및 이용기간)</h3>
        <p>회사는 개인정보 수집 및 이용 목적이 달성된 후 해당 정보를 지체 없이 파기합니다.</p>
        <p>단, 다음의 경우 일정 기간 보관할 수 있습니다.</p>

        <h4>전자상거래 관련 법령</h4>
        <ul>
          <li>계약 또는 청약철회 기록 : 5년</li>
          <li>대금결제 기록 : 5년</li>
          <li>소비자 불만 기록 : 3년</li>
        </ul>

        <h3>제4조 (개인정보 제3자 제공)</h3>
        <p>회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다.</p>
        <p>다만 다음의 경우 예외로 합니다.</p>
        <ol>
          <li>이용자가 사전에 동의한 경우</li>
          <li>법령에 의해 요구되는 경우</li>
        </ol>

        <h3>제5조 (개인정보 처리 위탁)</h3>
        <p>회사는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁할 수 있습니다.</p>
        <ul>
          <li>클라우드 서버 운영</li>
          <li>결제 서비스 제공</li>
          <li>이메일 발송 서비스</li>
        </ul>

        <h3>제6조 (이용자의 권리)</h3>
        <p>이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
        <ul>
          <li>개인정보 열람</li>
          <li>개인정보 수정</li>
          <li>개인정보 삭제 요청</li>
          <li>개인정보 처리 정지 요청</li>
        </ul>

        <h3>제7조 (개인정보 보호책임자)</h3>
        <table>
          <tbody>
            <tr><td>회사명</td><td>주식회사 골든터틀컴퍼니</td></tr>
            <tr><td>대표자</td><td>이정언</td></tr>
            <tr><td>연락처</td><td>010-9206-9984</td></tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "refund",
    title: "Millio AI 환불 정책",
    shortTitle: "환불정책",
    icon: CreditCard,
    content: (
      <div className="legal-content">
        <p className="text-stone-500 mb-8">본 정책은 Millio AI 유료서비스 이용과 관련된 환불 기준을 규정합니다.</p>

        <h3>1. 구독 서비스</h3>
        <p>Millio AI 서비스는 월 또는 연 단위 구독 방식으로 제공됩니다.</p>

        <h3>2. 환불 기준</h3>

        <h4>서비스 개시 전</h4>
        <p>서비스가 시작되기 전에 환불 요청 시 <strong>전액 환불</strong>됩니다.</p>

        <h4>서비스 개시 후</h4>
        <p>서비스 이용이 시작된 이후에는 원칙적으로 환불이 제한됩니다.</p>
        <p>단 다음의 경우 환불이 가능합니다.</p>
        <ul>
          <li>회사의 귀책 사유</li>
          <li>서비스 제공 불가</li>
        </ul>

        <h4>연간 플랜</h4>
        <p>연간 플랜의 경우 사용하지 않은 기간에 대해 <strong>일할 계산 환불</strong>됩니다.</p>
        <p>단 다음 비용이 제외될 수 있습니다.</p>
        <ul>
          <li>할인 금액</li>
          <li>프로모션 혜택</li>
        </ul>

        <h3>3. 환불 처리 기간</h3>
        <p>환불 요청 승인 후 <strong>3 영업일 이내</strong> 처리됩니다.</p>

        <h3>4. 결제수단별 환불</h3>
        <table>
          <tbody>
            <tr><td>카드 결제</td><td>카드사 정책에 따라 취소 처리</td></tr>
            <tr><td>무통장입금</td><td>이용자 지정 계좌 환불</td></tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "sla",
    title: "Millio AI 서비스 수준 정책 (SLA)",
    shortTitle: "SLA 정책",
    icon: Activity,
    content: (
      <div className="legal-content">
        <p className="text-stone-500 mb-8">본 정책은 Millio AI 서비스의 안정적인 운영을 위해 제공되는 서비스 수준을 정의합니다.</p>

        <h3>1. 서비스 가용성</h3>
        <p>회사는 다음 수준의 서비스 가용성을 목표로 합니다.</p>
        <div className="my-4 p-5 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
          <p className="text-2xl font-bold text-emerald-700">월 기준 서비스 가용성 99.5% 이상</p>
        </div>

        <h3>2. 정기 점검</h3>
        <p>서비스 안정성을 위해 정기 점검이 진행될 수 있습니다. 점검 일정은 사전에 공지합니다.</p>

        <h3>3. 장애 대응</h3>
        <p>서비스 장애 발생 시 다음 절차로 대응합니다.</p>
        <ol>
          <li>장애 감지</li>
          <li>원인 분석</li>
          <li>서비스 복구</li>
          <li>재발 방지 조치</li>
        </ol>

        <h3>4. 고객 지원</h3>
        <p>고객 문의는 다음 채널을 통해 지원됩니다.</p>
        <ul>
          <li>이메일: sokoorymall@naver.com</li>
          <li>전화: 032-322-9958</li>
          <li>고객센터: 평일 09:00~18:00</li>
        </ul>
      </div>
    ),
  },
  {
    id: "security",
    title: "Millio AI 데이터 보안 정책",
    shortTitle: "데이터 보안 정책",
    icon: Shield,
    content: (
      <div className="legal-content">
        <p className="text-stone-500 mb-8">주식회사 골든터틀컴퍼니는 서비스 이용자의 데이터를 보호하기 위해 다양한 보안 정책을 시행하고 있습니다.</p>

        <h3>1. 데이터 보호 원칙</h3>
        <p>회사는 다음 원칙에 따라 데이터를 보호합니다.</p>
        <ul>
          <li><strong>기밀성</strong> — 인가된 사용자만 데이터에 접근</li>
          <li><strong>무결성</strong> — 데이터의 정확성과 완전성 보장</li>
          <li><strong>가용성</strong> — 필요 시 데이터에 접근 가능</li>
        </ul>

        <h3>2. 접근 제어</h3>
        <p>시스템 접근은 권한 기반으로 관리됩니다.</p>
        <ul>
          <li>관리자 권한</li>
          <li>사용자 권한</li>
          <li>프로젝트 권한</li>
        </ul>

        <h3>3. 데이터 암호화</h3>
        <p>다음 데이터는 암호화됩니다.</p>
        <ul>
          <li>로그인 정보</li>
          <li>인증 정보</li>
          <li>네트워크 통신 (HTTPS/SSL)</li>
        </ul>

        <h3>4. 데이터 백업</h3>
        <p>시스템 데이터는 정기적으로 백업됩니다. 백업 데이터는 안전한 서버에 보관됩니다.</p>

        <h3>5. 보안 사고 대응</h3>
        <p>보안 사고 발생 시 다음 절차에 따라 대응합니다.</p>
        <ol>
          <li>즉시 대응</li>
          <li>피해 최소화</li>
          <li>원인 분석</li>
          <li>재발 방지</li>
        </ol>
      </div>
    ),
  },
  {
    id: "aup",
    title: "Millio AI 서비스 이용 정책",
    shortTitle: "서비스 이용 정책",
    icon: AlertTriangle,
    content: (
      <div className="legal-content">
        <p className="text-stone-500 mb-8">본 정책은 Millio AI 서비스의 안전하고 안정적인 운영을 위해 이용자가 준수해야 할 이용 기준을 규정합니다. 본 정책은 Millio AI 이용약관의 일부로 적용됩니다.</p>

        <h3>1. 목적</h3>
        <ul>
          <li>서비스 안정성 유지</li>
          <li>시스템 보안 보호</li>
          <li>이용자 데이터 보호</li>
          <li>서비스 남용 방지</li>
        </ul>

        <h3>2. 허용된 사용</h3>
        <p>이용자는 다음 목적 범위 내에서 서비스를 사용할 수 있습니다.</p>
        <ul>
          <li>제조업 공통 ERP (생산·재고·회계·품질)</li>
          <li>식품 HACCP 관리 / 화장품 GMP (업종별 특화)</li>
          <li>생산 관리</li>
          <li>재고 관리</li>
          <li>품질 관리</li>
          <li>문서 관리</li>
        </ul>

        <h3>3. 금지된 행위</h3>

        <h4>시스템 침해 행위</h4>
        <ul>
          <li>해킹</li>
          <li>비인가 접근</li>
          <li>시스템 취약점 공격</li>
          <li>서비스 방해 공격</li>
        </ul>

        <h4>서비스 남용</h4>
        <ul>
          <li>과도한 트래픽 발생</li>
          <li>자동화 공격</li>
          <li>비정상 데이터 입력</li>
        </ul>

        <h4>불법 활동</h4>
        <ul>
          <li>불법 데이터 저장</li>
          <li>타인의 권리 침해</li>
          <li>법령 위반 행위</li>
        </ul>

        <h4>계정 남용</h4>
        <ul>
          <li>계정 공유</li>
          <li>계정 판매</li>
          <li>계정 양도</li>
        </ul>

        <h3>4. 데이터 사용 제한</h3>
        <p>다음 데이터는 서비스에 저장할 수 없습니다.</p>
        <ul>
          <li>불법 콘텐츠</li>
          <li>악성코드</li>
          <li>저작권 침해 데이터</li>
          <li>개인정보 불법 수집 데이터</li>
        </ul>

        <h3>5. 서비스 이용 제한</h3>
        <p>회사는 다음의 경우 서비스 이용을 제한할 수 있습니다.</p>
        <ul>
          <li>약관 위반</li>
          <li>보안 위험 발생</li>
          <li>시스템 장애 유발</li>
        </ul>

        <h3>6. 정책 변경</h3>
        <p>회사는 서비스 운영을 위해 본 정책을 변경할 수 있습니다. 변경 사항은 서비스 공지를 통해 안내됩니다.</p>
      </div>
    ),
  },
  {
    id: "dpa",
    title: "Millio AI 데이터 처리 계약 (DPA)",
    shortTitle: "데이터 처리 계약",
    icon: Database,
    content: (
      <div className="legal-content">
        <p className="text-stone-500 mb-8">본 데이터 처리 계약(Data Processing Agreement)은 Millio AI 서비스를 이용하는 고객과 주식회사 골든터틀컴퍼니 간 데이터 처리에 관한 사항을 규정합니다.</p>

        <h3>1. 역할 정의</h3>
        <table>
          <tbody>
            <tr><td><strong>회사</strong></td><td>데이터 처리자 (Processor)</td></tr>
            <tr><td><strong>고객</strong></td><td>데이터 관리자 (Controller)</td></tr>
          </tbody>
        </table>

        <h3>2. 처리 목적</h3>
        <p>회사는 다음 목적 범위 내에서 고객 데이터를 처리합니다.</p>
        <ul>
          <li>서비스 제공</li>
          <li>시스템 운영</li>
          <li>데이터 저장</li>
          <li>백업</li>
          <li>보안 관리</li>
        </ul>

        <h3>3. 처리 데이터</h3>
        <p>다음 유형의 데이터가 처리될 수 있습니다.</p>
        <ul>
          <li>사용자 계정 정보</li>
          <li>기업 데이터</li>
          <li>생산 기록</li>
          <li>HACCP 기록</li>
          <li>거래 데이터</li>
        </ul>

        <h3>4. 데이터 보안</h3>
        <p>회사는 다음 보안 조치를 시행합니다.</p>
        <ul>
          <li>접근 제어</li>
          <li>데이터 암호화</li>
          <li>서버 보안</li>
          <li>네트워크 보안</li>
          <li>로그 관리</li>
        </ul>

        <h3>5. 데이터 보관</h3>
        <p>서비스 해지 후 데이터는 <strong>30일 동안 보관</strong>됩니다. 이후 삭제될 수 있습니다.</p>

        <h3>6. 하위 처리자</h3>
        <p>회사는 서비스 제공을 위해 다음 업체를 사용할 수 있습니다.</p>
        <ul>
          <li>클라우드 서버 제공자</li>
          <li>결제 서비스 제공자</li>
          <li>이메일 서비스 제공자</li>
        </ul>

        <h3>7. 데이터 삭제</h3>
        <p>고객 요청 시 회사는 데이터를 삭제하거나 반환할 수 있습니다.</p>

        <h3>8. 데이터 침해 대응</h3>
        <p>데이터 침해가 발생한 경우 회사는 다음 절차를 따릅니다.</p>
        <ol>
          <li>사고 감지</li>
          <li>피해 분석</li>
          <li>고객 통지</li>
          <li>대응 조치</li>
        </ol>
      </div>
    ),
  },
  {
    id: "security-whitepaper",
    title: "Millio AI Security Whitepaper",
    shortTitle: "보안 백서",
    icon: BookOpen,
    content: (
      <div className="legal-content">
        <p className="text-stone-500 mb-8">본 문서는 Millio AI 서비스의 보안 구조 및 데이터 보호 정책을 설명합니다.</p>

        <h3>1. 보안 설계 원칙</h3>
        <p>Millio AI는 다음 보안 원칙을 기반으로 설계되었습니다.</p>
        <ul>
          <li><strong>Confidentiality (기밀성)</strong></li>
          <li><strong>Integrity (무결성)</strong></li>
          <li><strong>Availability (가용성)</strong></li>
        </ul>

        <h3>2. 시스템 아키텍처</h3>
        <p>Millio AI는 클라우드 기반 SaaS 아키텍처로 구성됩니다.</p>
        <h4>주요 구성</h4>
        <ul>
          <li>Web Application</li>
          <li>API Server</li>
          <li>Database Server</li>
          <li>Storage</li>
          <li>Monitoring System</li>
        </ul>

        <h3>3. 멀티 테넌트 보안</h3>
        <p>Millio AI는 멀티 테넌트 구조로 운영됩니다. 각 고객 데이터는 논리적으로 분리됩니다.</p>
        <h4>보안 방식</h4>
        <ul>
          <li>Tenant ID 기반 접근</li>
          <li>데이터 격리</li>
          <li>권한 관리</li>
        </ul>

        <h3>4. 인증 및 접근 제어</h3>
        <h4>사용자 인증 방식</h4>
        <ul>
          <li>계정 로그인</li>
          <li>권한 기반 접근 제어</li>
        </ul>
        <h4>권한 구조</h4>
        <ul>
          <li>관리자</li>
          <li>사용자</li>
          <li>읽기 권한</li>
        </ul>

        <h3>5. 데이터 보호</h3>
        <p>데이터 보호를 위해 다음 기술이 적용됩니다.</p>
        <ul>
          <li>HTTPS 통신 암호화</li>
          <li>데이터 접근 통제</li>
          <li>로그 기록</li>
          <li>데이터 백업</li>
        </ul>

        <h3>6. 백업 정책</h3>
        <p>시스템 데이터는 정기적으로 백업됩니다. 백업 데이터는 안전한 서버에 저장됩니다.</p>

        <h3>7. 보안 모니터링</h3>
        <p>다음 활동이 모니터링됩니다.</p>
        <ul>
          <li>로그인 시도</li>
          <li>시스템 접근</li>
          <li>API 호출</li>
        </ul>

        <h3>8. 사고 대응</h3>
        <p>보안 사고 발생 시 다음 절차로 대응합니다.</p>
        <ol>
          <li>사고 탐지</li>
          <li>영향 분석</li>
          <li>서비스 복구</li>
          <li>재발 방지</li>
        </ol>
      </div>
    ),
  },
  {
    id: "data-ownership",
    title: "Millio AI 데이터 소유권 정책",
    shortTitle: "데이터 소유권 정책",
    icon: Key,
    content: (
      <div className="legal-content">
        <p className="text-stone-500 mb-8">본 데이터 소유권 정책은 주식회사 골든터틀컴퍼니가 제공하는 Millio AI 서비스에서 생성 및 저장되는 데이터의 소유권, 관리 책임 및 이용 범위를 규정합니다. 본 정책은 Millio AI 이용약관 및 데이터 처리 계약(DPA)의 일부로 적용됩니다.</p>

        <h3>제1조 (목적)</h3>
        <p>본 정책은 Millio AI 서비스를 이용하는 고객이 생성하거나 업로드한 데이터의 소유권, 관리 책임 및 사용 범위를 명확히 규정함을 목적으로 합니다.</p>

        <h3>제2조 (데이터 정의)</h3>
        <p>본 정책에서 "데이터"란 다음 정보를 의미합니다.</p>
        <ul>
          <li>사용자 계정 정보</li>
          <li>조직 정보</li>
          <li>생산 데이터</li>
          <li>HACCP 기록</li>
          <li>원료수불 데이터</li>
          <li>재고 데이터</li>
          <li>거래 데이터</li>
          <li>문서 및 파일</li>
          <li>시스템 사용 기록</li>
        </ul>

        <h3>제3조 (데이터 소유권)</h3>
        <ol>
          <li>Millio AI 서비스에서 고객이 생성하거나 입력한 데이터의 소유권은 <strong>해당 고객</strong>에게 있습니다.</li>
          <li>회사는 서비스 제공을 위한 범위를 제외하고 고객 데이터의 소유권을 주장하지 않습니다.</li>
          <li>회사는 고객 데이터에 대해 다음 행위를 하지 않습니다.
            <ul>
              <li>데이터 판매</li>
              <li>데이터 무단 제공</li>
              <li>데이터 상업적 이용</li>
            </ul>
          </li>
        </ol>

        <h3>제4조 (데이터 사용 범위)</h3>
        <p>회사는 다음 목적 범위 내에서만 고객 데이터를 처리합니다.</p>
        <ol>
          <li>서비스 제공</li>
          <li>시스템 운영</li>
          <li>데이터 저장</li>
          <li>서비스 개선</li>
          <li>보안 관리</li>
          <li>고객 지원</li>
        </ol>

        <h3>제5조 (데이터 접근 권한)</h3>
        <ol>
          <li>고객 데이터에 대한 접근 권한은 다음과 같이 제한됩니다.
            <ul>
              <li>고객 관리자</li>
              <li>고객 사용자</li>
              <li>회사 시스템 관리자 (운영 목적)</li>
            </ul>
          </li>
          <li>회사는 최소 권한 원칙에 따라 데이터 접근을 관리합니다.</li>
        </ol>

        <h3>제6조 (데이터 보안)</h3>
        <p>회사는 고객 데이터를 보호하기 위해 다음 보안 조치를 시행합니다.</p>
        <ul>
          <li>접근 제어</li>
          <li>네트워크 보안</li>
          <li>데이터 암호화</li>
          <li>서버 보안</li>
          <li>보안 모니터링</li>
        </ul>

        <h3>제7조 (데이터 백업)</h3>
        <p>회사는 시스템 안정성을 위해 데이터를 정기적으로 백업합니다. 백업 데이터는 안전한 서버 환경에 저장됩니다.</p>

        <h3>제8조 (데이터 보관 및 삭제)</h3>
        <ol>
          <li>서비스 이용이 종료된 경우 고객 데이터는 <strong>30일 동안</strong> 보관됩니다.</li>
          <li>보관 기간 이후 데이터는 삭제될 수 있습니다.</li>
          <li>고객은 데이터 삭제 또는 반환을 요청할 수 있습니다.</li>
        </ol>

        <h3>제9조 (데이터 이동성)</h3>
        <p>고객은 요청 시 다음을 요구할 수 있습니다.</p>
        <ul>
          <li>데이터 다운로드</li>
          <li>데이터 이전</li>
          <li>데이터 백업 제공</li>
        </ul>
        <p>회사는 합리적인 범위 내에서 이를 지원합니다.</p>

        <h3>제10조 (데이터 침해 대응)</h3>
        <p>데이터 보안 사고가 발생한 경우 회사는 다음 절차를 따릅니다.</p>
        <ol>
          <li>사고 탐지</li>
          <li>영향 분석</li>
          <li>고객 통지</li>
          <li>대응 조치</li>
          <li>재발 방지</li>
        </ol>

        <h3>제11조 (법적 요구 사항)</h3>
        <p>회사는 다음의 경우 고객 데이터를 공개할 수 있습니다.</p>
        <ul>
          <li>법원 명령</li>
          <li>정부 기관 요청</li>
          <li>법령에 따른 요구</li>
        </ul>

        <h3>제12조 (정책 변경)</h3>
        <p>회사는 서비스 운영 및 법령 변경에 따라 본 정책을 수정할 수 있습니다. 정책 변경 시 서비스 공지를 통해 안내합니다.</p>

        <div className="mt-8 p-4 bg-stone-50 rounded-xl border border-stone-200">
          <p className="text-sm text-stone-500"><strong>부칙</strong> — 본 정책은 2026년 3월 4일부터 시행합니다.</p>
        </div>
      </div>
    ),
  },
];

// ─── Main Component ───
export default function LegalPage() {
  const [, params] = useRoute("/legal/:section");
  const sectionId = params?.section || "terms";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const activeSection = policySections.find((s) => s.id === sectionId) || policySections[0];

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    setMobileMenuOpen(false);
  }, [sectionId]);

  return (
    <div className="min-h-screen" style={{ background: "#FBF8F3", fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
        .legal-content h3 { font-size: 1.125rem; font-weight: 700; color: #1a1a2e; margin-top: 2rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #f1f0ee; }
        .legal-content h4 { font-size: 0.95rem; font-weight: 600; color: #44403c; margin-top: 1.25rem; margin-bottom: 0.5rem; }
        .legal-content p { color: #57534e; line-height: 1.8; margin-bottom: 0.75rem; font-size: 0.9375rem; }
        .legal-content ul, .legal-content ol { padding-left: 1.5rem; margin-bottom: 1rem; }
        .legal-content ul { list-style: disc; }
        .legal-content ol { list-style: decimal; }
        .legal-content li { color: #57534e; line-height: 1.8; margin-bottom: 0.25rem; font-size: 0.9375rem; }
        .legal-content li ul { margin-top: 0.25rem; }
        .legal-content strong { color: #1a1a2e; }
        .legal-content table { width: 100%; border-collapse: collapse; margin: 1rem 0; border-radius: 0.75rem; overflow: hidden; }
        .legal-content table td { padding: 0.75rem 1rem; border: 1px solid #e7e5e4; font-size: 0.9375rem; color: #57534e; }
        .legal-content table td:first-child { background: #fafaf9; font-weight: 600; color: #1a1a2e; width: 35%; }
      `}</style>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-stone-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <a className="flex items-center gap-2">
                <MillioMark className="w-8 h-8" />
                <span className="text-lg font-bold text-[#1a1a2e]">Millio<span className="text-orange-500"> AI</span></span>
              </a>
            </Link>
            <span className="text-stone-300 hidden sm:inline">|</span>
            <span className="text-sm font-medium text-stone-500 hidden sm:inline">법적 고지 및 정책</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-stone-100 transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-stone-500" /> : <Menu className="w-5 h-5 text-stone-500" />}
            </button>
            <Link href="/">
              <a className="text-sm text-stone-400 hover:text-orange-500 transition-colors flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> 홈으로
              </a>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8 lg:py-12">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className={`lg:w-72 flex-shrink-0 ${mobileMenuOpen ? "block" : "hidden lg:block"}`}>
            <div className="sticky top-24">
              <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-4 px-3">정책 문서</h2>
              <nav className="space-y-1">
                {policySections.map((section) => {
                  const isActive = section.id === activeSection.id;
                  return (
                    <Link key={section.id} href={`/legal/${section.id}`}>
                      <a
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                          isActive
                            ? "bg-[#1a1a2e] text-white font-semibold shadow-lg shadow-stone-900/10"
                            : "text-stone-600 hover:bg-white hover:text-[#1a1a2e] hover:shadow-sm"
                        }`}
                      >
                        <section.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-orange-300" : "text-stone-400"}`} />
                        <span className="truncate">{section.shortTitle}</span>
                        {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-orange-300" />}
                      </a>
                    </Link>
                  );
                })}
              </nav>

              {/* Quick links */}
              <div className="mt-8 p-4 bg-white rounded-2xl border border-stone-100">
                <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">도움이 필요하세요?</h3>
                <div className="space-y-2">
                  <Link href="/faq">
                    <a className="block text-sm text-stone-500 hover:text-orange-500 transition-colors">자주 묻는 질문 (FAQ)</a>
                  </Link>
                  <Link href="/support">
                    <a className="block text-sm text-stone-500 hover:text-orange-500 transition-colors">고객 지원 문의</a>
                  </Link>
                  <a href="tel:032-322-9958" className="block text-sm text-stone-500 hover:text-orange-500 transition-colors">
                    전화: 032-322-9958
                  </a>
                </div>
              </div>
            </div>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0" ref={contentRef}>
            <motion.div
              key={activeSection.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {/* Title card */}
              <div className="bg-white rounded-2xl border border-stone-100 p-6 sm:p-8 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
                    <activeSection.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#1a1a2e]" style={{ fontFamily: "'Playfair Display', serif" }}>
                      {activeSection.title}
                    </h1>
                    <p className="text-xs text-stone-400 mt-0.5">시행일: 2026년 3월 4일 · 주식회사 골든터틀컴퍼니</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="bg-white rounded-2xl border border-stone-100 p-6 sm:p-8 lg:p-10">
                {activeSection.content}
              </div>

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between">
                {policySections.indexOf(activeSection) > 0 ? (
                  <Link href={`/legal/${policySections[policySections.indexOf(activeSection) - 1].id}`}>
                    <a className="flex items-center gap-2 text-sm text-stone-500 hover:text-orange-500 transition-colors">
                      <ArrowLeft className="w-4 h-4" />
                      {policySections[policySections.indexOf(activeSection) - 1].shortTitle}
                    </a>
                  </Link>
                ) : <div />}
                {policySections.indexOf(activeSection) < policySections.length - 1 ? (
                  <Link href={`/legal/${policySections[policySections.indexOf(activeSection) + 1].id}`}>
                    <a className="flex items-center gap-2 text-sm text-stone-500 hover:text-orange-500 transition-colors">
                      {policySections[policySections.indexOf(activeSection) + 1].shortTitle}
                      <ChevronRight className="w-4 h-4" />
                    </a>
                  </Link>
                ) : <div />}
              </div>
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}
