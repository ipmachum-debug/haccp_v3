import { describe, it, expect } from "vitest";
import { findMissingMeasurements, summarizeMissing, countMissingBySection } from "../shared/dailyLogMeasurements";

const fullArrayForm = {
  temperatureHumidity: [
    { roomName: "원재료실1", timePeriod: "오전", checkTime: "08:10", temperature: "27.3", humidity: "58", evaluation: "pass" },
    { roomName: "원재료실1", timePeriod: "오후", checkTime: "15:20", temperature: "29.1", humidity: "49", evaluation: "pass" },
    { roomName: "원재료실2", timePeriod: "오전", checkTime: "08:12", temperature: "26.9", humidity: "57", evaluation: "pass" },
    { roomName: "원재료실2", timePeriod: "오후", checkTime: "15:22", temperature: "28.8", humidity: "50", evaluation: "pass" },
  ],
  freezerTemperature: [
    { timePeriod: "오전", checkTime: "08:00", rapidFreezerTemp: "-31.0", freezerTemp: "-19.0", evaluation: "pass" },
    { timePeriod: "오후", checkTime: "15:10", rapidFreezerTemp: "-31.2", freezerTemp: "-19.5", evaluation: "pass" },
  ],
  refrigeratorTemperature: [
    { timePeriod: "오전", checkTime: "08:05", temperature: "1.2", evaluation: "pass" },
    { timePeriod: "오후", checkTime: "15:15", temperature: "1.4", evaluation: "pass" },
  ],
};

// autoDailyReport.buildDefaultFormData 가 만드는 빈 객체형
const emptyObjectForm = {
  temperatureHumidity: {
    room1Morning: { time: "", temp: "", humidity: "", pass: null },
    room1Afternoon: { time: "", temp: "", humidity: "", pass: null },
    room2Morning: { time: "", temp: "", humidity: "", pass: null },
    room2Afternoon: { time: "", temp: "", humidity: "", pass: null },
  },
  freezerTemperature: {
    morning: { time: "", rapidFreezer: "", freezer: "", pass: null },
    afternoon: { time: "", rapidFreezer: "", freezer: "", pass: null },
  },
  refrigeratorTemperature: {
    morning: { time: "", temp: "", pass: null },
    afternoon: { time: "", temp: "", pass: null },
  },
};

describe("findMissingMeasurements", () => {
  it("모든 측정값이 채워진 배열형 form_data 는 미측정 0건", () => {
    expect(findMissingMeasurements(fullArrayForm)).toHaveLength(0);
  });

  it("자동 생성된 빈 객체형 form_data 는 14개 측정칸 전부 미측정", () => {
    const missing = findMissingMeasurements(emptyObjectForm);
    // 원재료실 4슬롯 × (온도+습도) = 8, 냉동 2슬롯 × 2 = 4, 냉장 2슬롯 = 2
    expect(missing).toHaveLength(14);
    expect(countMissingBySection(missing)).toEqual({ temperatureHumidity: 8, freezerTemperature: 4, refrigeratorTemperature: 2 });
    expect(missing[0].label).toBe("원재료실1 오전 온도");
  });

  it("일부만 비어 있으면 그 칸만 집어낸다 (배열형)", () => {
    const partial = structuredClone(fullArrayForm) as any;
    partial.temperatureHumidity[2].humidity = "";
    partial.freezerTemperature[1].freezerTemp = null;
    partial.refrigeratorTemperature[0].temperature = "  ";
    const missing = findMissingMeasurements(partial);
    expect(missing.map((m) => m.label)).toEqual(["원재료실2 오전 습도", "오후 냉동고", "오전 냉장고 온도"]);
  });

  it("일부만 비어 있으면 그 칸만 집어낸다 (객체형)", () => {
    const partial = structuredClone(emptyObjectForm) as any;
    for (const k of Object.keys(partial.temperatureHumidity)) { partial.temperatureHumidity[k].temp = "25.0"; partial.temperatureHumidity[k].humidity = "50"; }
    partial.freezerTemperature.morning = { rapidFreezer: "-31", freezer: "-19" };
    partial.freezerTemperature.afternoon = { rapidFreezer: "-31", freezer: "-19" };
    partial.refrigeratorTemperature.morning.temp = "1.0";
    const missing = findMissingMeasurements(partial);
    expect(missing.map((m) => m.label)).toEqual(["오후 냉장고 온도"]);
  });

  it("검사시각/평가가 비어 있어도 측정값이 있으면 미측정이 아니다", () => {
    const noTime = structuredClone(fullArrayForm) as any;
    noTime.temperatureHumidity.forEach((r: any) => { r.checkTime = ""; r.evaluation = null; });
    expect(findMissingMeasurements(noTime)).toHaveLength(0);
  });

  it("섹션 자체가 없거나 form_data 가 없으면 전부 미측정으로 본다", () => {
    expect(findMissingMeasurements({})).toHaveLength(14);
    expect(findMissingMeasurements(null)).toHaveLength(14);
    expect(findMissingMeasurements({ ...fullArrayForm, refrigeratorTemperature: undefined })).toHaveLength(2);
  });

  it("숫자 0 은 유효한 측정값이다", () => {
    const zero = structuredClone(fullArrayForm) as any;
    zero.refrigeratorTemperature[0].temperature = 0;
    expect(findMissingMeasurements(zero)).toHaveLength(0);
  });
});

describe("summarizeMissing", () => {
  it("앞 4건 + '외 N건' 형식", () => {
    const missing = findMissingMeasurements(emptyObjectForm);
    expect(summarizeMissing(missing)).toBe("원재료실1 오전 온도, 원재료실1 오전 습도, 원재료실1 오후 온도, 원재료실1 오후 습도 외 10건");
    expect(summarizeMissing([])).toBe("");
  });
});
