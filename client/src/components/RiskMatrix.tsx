import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface RiskMatrixProps {
  hazards: Array<{
    id: number;
    processStep: string;
    hazardType: string;
    severity: number;
    likelihood: number;
    riskScore: number;
    riskLevel: string;
  }>;
}

export function RiskMatrix({ hazards }: RiskMatrixProps) {
  const data = useMemo(() => {
    return hazards.map((hazard) => ({
      x: hazard.likelihood,
      y: hazard.severity,
      z: hazard.riskScore,
      name: hazard.processStep,
      riskLevel: hazard.riskLevel,
    }));
  }, [hazards]);

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "low":
        return "#22c55e"; // green
      case "medium":
        return "#eab308"; // yellow
      case "high":
        return "#f97316"; // orange
      case "critical":
        return "#ef4444"; // red
      default:
        return "#6b7280"; // gray
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
          <p className="font-semibold">{data.name}</p>
          <p className="text-sm">심각도: {data.y}/5</p>
          <p className="text-sm">발생 가능성: {data.x}/5</p>
          <p className="text-sm">위험도: {data.z}</p>
          <p className="text-sm capitalize">수준: {data.riskLevel}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>위험도 매트릭스</CardTitle>
        <CardDescription>
          심각도(Y축)와 발생 가능성(X축)에 따른 위험 요소 분포
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="발생 가능성"
              domain={[0, 6]}
              ticks={[1, 2, 3, 4, 5]}
              label={{ value: "발생 가능성", position: "insideBottom", offset: -10 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="심각도"
              domain={[0, 6]}
              ticks={[1, 2, 3, 4, 5]}
              label={{ value: "심각도", angle: -90, position: "insideLeft" }}
            />
            <ZAxis type="number" dataKey="z" range={[100, 400]} name="위험도" />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Scatter name="위험 요소" data={data}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getRiskColor(entry.riskLevel)} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        {/* 범례 */}
        <div className="flex flex-wrap gap-4 mt-4 justify-center">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#22c55e" }} />
            <span className="text-sm">낮음 (1-6)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#eab308" }} />
            <span className="text-sm">중간 (7-12)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#f97316" }} />
            <span className="text-sm">높음 (13-19)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "#ef4444" }} />
            <span className="text-sm">매우 높음 (20-25)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
