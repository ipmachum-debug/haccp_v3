/**
 * 월간 교육훈련일지 출력 컴포넌트
 * HACCP 체크리스트 > 항목별일지 > 교육훈련일지 양식 참조
 * 1달 교육 배정/이수 현황 + 직원별 출석 + 승인란
 */

interface MonthlyReportData {
  year: number;
  month: number;
  totalDays: number;
  totalUsers: number;
  overallRate: number;
  assignments: {
    date: string;
    dayNo: number;
    title: string;
    category: string;
    content: string;
    action: string;
  }[];
  userStats: {
    id: number;
    name: string;
    role: string;
    doneCount: number;
    totalDays: number;
    rate: number;
    details: { date: string; dayNo: number; done: boolean }[];
  }[];
  companyName?: string;
}

export function renderTrainingMonthlyReport(data: MonthlyReportData) {
  const { year, month, assignments, userStats, overallRate, companyName } = data;

  return (
    <div className="p-6 print:p-2 max-w-[210mm] mx-auto bg-white text-sm">
      {/* 헤더 */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold border-b-2 border-black pb-2 mb-2">
          교육훈련 월간 기록부
        </h1>
        <p className="text-sm text-gray-600">
          {year}년 {month}월 | {companyName || "Millio AI"} | 전체 이수율: {overallRate}%
        </p>
      </div>

      {/* 기본 정보 */}
      <table className="w-full border-collapse border border-gray-400 text-xs mb-4">
        <tbody>
          <tr>
            <td className="border border-gray-400 px-2 py-1.5 bg-gray-100 font-bold w-24">대상기간</td>
            <td className="border border-gray-400 px-2 py-1.5">{year}년 {month}월 1일 ~ {month}월 말일</td>
            <td className="border border-gray-400 px-2 py-1.5 bg-gray-100 font-bold w-24">교육일수</td>
            <td className="border border-gray-400 px-2 py-1.5">{assignments.length}일</td>
          </tr>
          <tr>
            <td className="border border-gray-400 px-2 py-1.5 bg-gray-100 font-bold">대상인원</td>
            <td className="border border-gray-400 px-2 py-1.5">{userStats.length}명</td>
            <td className="border border-gray-400 px-2 py-1.5 bg-gray-100 font-bold">전체 이수율</td>
            <td className="border border-gray-400 px-2 py-1.5 font-bold">{overallRate}%</td>
          </tr>
          <tr>
            <td className="border border-gray-400 px-2 py-1.5 bg-gray-100 font-bold">교육유형</td>
            <td colSpan={3} className="border border-gray-400 px-2 py-1.5">오늘의 5분 HACCP (일일 마이크로 교육 120일 과정)</td>
          </tr>
        </tbody>
      </table>

      {/* 일별 교육 내용 */}
      <h2 className="font-bold text-sm mb-2 mt-4">1. 일별 교육 내용</h2>
      <table className="w-full border-collapse border border-gray-400 text-[11px] mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 px-2 py-1.5 w-20">날짜</th>
            <th className="border border-gray-400 px-2 py-1.5 w-10">Day</th>
            <th className="border border-gray-400 px-2 py-1.5 w-14">분류</th>
            <th className="border border-gray-400 px-2 py-1.5">교육명</th>
            <th className="border border-gray-400 px-2 py-1.5">핵심 내용</th>
            <th className="border border-gray-400 px-2 py-1.5 w-28">오늘 행동</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.date}>
              <td className="border border-gray-400 px-2 py-1">
                {new Date(a.date).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" })}
              </td>
              <td className="border border-gray-400 px-2 py-1 text-center">{a.dayNo}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{a.category}</td>
              <td className="border border-gray-400 px-2 py-1 font-medium">{a.title}</td>
              <td className="border border-gray-400 px-2 py-1">{a.content}</td>
              <td className="border border-gray-400 px-2 py-1">{a.action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 직원별 이수 현황 */}
      <h2 className="font-bold text-sm mb-2 mt-4">2. 직원별 이수 현황</h2>
      <table className="w-full border-collapse border border-gray-400 text-[11px] mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 px-2 py-1.5 w-16">성명</th>
            <th className="border border-gray-400 px-2 py-1.5 w-14">직급</th>
            {assignments.map((a) => (
              <th key={a.date} className="border border-gray-400 px-0.5 py-1 text-center w-6" style={{ writingMode: "vertical-rl", fontSize: "9px" }}>
                {new Date(a.date).getDate()}일
              </th>
            ))}
            <th className="border border-gray-400 px-2 py-1.5 w-12 text-center">이수</th>
            <th className="border border-gray-400 px-2 py-1.5 w-12 text-center">이수율</th>
          </tr>
        </thead>
        <tbody>
          {userStats.map((u) => (
            <tr key={u.id}>
              <td className="border border-gray-400 px-2 py-1 font-medium">{u.name}</td>
              <td className="border border-gray-400 px-2 py-1 text-center text-gray-500">{u.role}</td>
              {u.details.map((d) => (
                <td key={d.date} className={`border border-gray-400 px-0.5 py-0.5 text-center ${d.done ? "bg-emerald-100" : ""}`}>
                  {d.done ? "O" : ""}
                </td>
              ))}
              <td className="border border-gray-400 px-2 py-1 text-center font-bold">{u.doneCount}/{u.totalDays}</td>
              <td className={`border border-gray-400 px-2 py-1 text-center font-bold ${
                u.rate >= 90 ? "text-emerald-700 bg-emerald-50" :
                u.rate >= 70 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50"
              }`}>{u.rate}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 승인란 */}
      <h2 className="font-bold text-sm mb-2 mt-6">3. 확인/승인</h2>
      <table className="w-full border-collapse border border-gray-400 text-xs">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 px-3 py-2 w-1/4">구분</th>
            <th className="border border-gray-400 px-3 py-2 w-1/4">작성자</th>
            <th className="border border-gray-400 px-3 py-2 w-1/4">검토자</th>
            <th className="border border-gray-400 px-3 py-2 w-1/4">승인자</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-400 px-3 py-2 bg-gray-50 font-medium">서명</td>
            <td className="border border-gray-400 px-3 py-6"></td>
            <td className="border border-gray-400 px-3 py-6"></td>
            <td className="border border-gray-400 px-3 py-6"></td>
          </tr>
          <tr>
            <td className="border border-gray-400 px-3 py-2 bg-gray-50 font-medium">일자</td>
            <td className="border border-gray-400 px-3 py-2"></td>
            <td className="border border-gray-400 px-3 py-2"></td>
            <td className="border border-gray-400 px-3 py-2"></td>
          </tr>
        </tbody>
      </table>

      <p className="text-[10px] text-gray-400 mt-4 text-center">
        본 기록은 식품위생법 시행규칙에 따라 3년간 보관합니다. | Millio AI 자동생성
      </p>
    </div>
  );
}
