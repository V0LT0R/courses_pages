import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ7ereCPPlms3UtnyQkS_wxeUqVmRJTbv1hNiFcDrK8uyJPFvcDSCBvjnUdLA3an1B2fM63hsI9PrgK/pub?output=csv";

const PIE_COLORS = ["#2F6FED", "#6F9FE8", "#A7BDE5", "#DCE4F2", "#EEF3FB"];
const STACK_COLORS = {
  strong: "#2F6FED",
  interest: "#6F9FE8",
  useful: "#A7BDE5",
  other: "#E8EEF8",
};

const PROFILE_LABELS = [
  "Производственный инженер/Өндіріс инженері",
  "Молодой специалист/Жас маман",
  "Исследователь/Зерттеуші",
  "Иное",
];
const QUESTION_SHORT_LABELS = {
  "Интересно ли вам узнать, какие возможности даёт цифровизация бизнес-процессов во взаимодействии между потребителем и контролирующей организацией":
    "Цифровизация процессов",

  "Интересно ли вам узнать о подходах цифровизации, которые помогают принимать обоснованные решения по количественной оценке водных ресурсов":
    "Подходы цифровизации / Цифрландыру тәсілдері",

  "Интересно ли вам разобраться, какие современные методы измерения расхода воды позволяют получать более точные и надёжные данные":
    "Методы измерения воды",

  "Интересно ли вам узнать, как современные системы мониторинга и автоматического регулирования помогают эффективно управлять уровнем и расходом воды":
    "Мониторинг и регулирование",

  "Интересно ли вам разобраться, как математические модели используются для анализа и прогнозирования состояния водных ресурсов":
    "Математические модели",

  "Интересно ли вам разобраться, как можно заранее оценивать возможные изменения водообеспеченности региона":
    "Сценарии водообеспечения",

  "Полезно ли вам разобраться, как сценарное моделирование помогает управлять водными ресурсами":
    "Сценарное моделирование",

  "Интересно ли вам разобраться, как современные измерительные комплексы и автоматизированные механизмы регулирования помогают эффективно управлять подачей и распределением воды":
    "Измерительные системы",

  "Интересно ли вам разобраться, как интеграция данных из разных источников помогает формировать целостную картину состояния водных ресурсов региона":
    "Интеграция данных",

  "Интересно ли вам узнать, какие программные решения и алгоритмы помогают оценивать эффективность распределения воды":
    "Алгоритмы распределения воды",
};

function normalizeValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isMetaHeader(header) {
  const h = header.toLowerCase();
  return (
    h.includes("timestamp") ||
    h.includes("отметка времени") ||
    h.includes("время") ||
    h.includes("time") ||
    h === ""
  );
}

function buildChoiceData(values) {
  const map = {};

  values
    .map(normalizeValue)
    .filter(Boolean)
    .forEach((v) => {
      map[v] = (map[v] || 0) + 1;
    });

  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function shortenQuestion(text) {
  if (!text) return "";

  // ищем совпадение по началу текста
  const found = Object.keys(QUESTION_SHORT_LABELS).find((key) =>
    text.startsWith(key)
  );

  if (found) {
    return QUESTION_SHORT_LABELS[found];
  }

  return text.length > 60 ? text.slice(0, 60) + "..." : text;
}

function classifyResponse(value) {
  const v = normalizeValue(value).toLowerCase();

  if (!v) return "other";

  if (
    v.includes("хочу понять") ||
    v.includes("түсінгім келеді")
  ) {
    return "strong";
  }

  if (
    v.includes("интересно узнать") ||
    v.includes("білгім келеді")
  ) {
    return "interest";
  }

  if (
    v.includes("полезно понять") ||
    v.includes("түсіну пайдалы")
  ) {
    return "useful";
  }

  return "other";
}

function buildThematicQuestionStats(header, values, totalResponses) {
  const counts = {
    strong: 0,
    interest: 0,
    useful: 0,
    other: 0,
  };

  values.map(normalizeValue).filter(Boolean).forEach((value) => {
    const group = classifyResponse(value);
    counts[group] += 1;
  });

  const safeTotal = totalResponses || 1;

  return {
    fullTitle: header,
    shortTitle: shortenQuestion(header, 78),
    strong: Number(((counts.strong / safeTotal) * 100).toFixed(1)),
    interest: Number(((counts.interest / safeTotal) * 100).toFixed(1)),
    useful: Number(((counts.useful / safeTotal) * 100).toFixed(1)),
    other: Number(((counts.other / safeTotal) * 100).toFixed(1)),
    strongCount: counts.strong,
    totalCount: counts.strong + counts.interest + counts.useful + counts.other,
  };
}

function buildProfileData(values) {
  const counts = {
    "Производственный инженер/Өндіріс инженері": 0,
    "Молодой специалист/Жас маман": 0,
    "Исследователь/Зерттеуші": 0,
    "Иное": 0,
  };

  values.forEach((raw) => {
    const value = normalizeValue(raw);
    if (!value) return;

    const normalized = value.replace(/\s*,\s*/g, ",");
    const parts = normalized
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!parts.length) return;

    parts.forEach((part) => {
      if (part === "Производственный инженер/Өндіріс инженері") {
        counts["Производственный инженер/Өндіріс инженері"] += 1;
      } else if (part === "Молодой специалист/Жас маман") {
        counts["Молодой специалист/Жас маман"] += 1;
      } else if (part === "Исследователь/Зерттеуші") {
        counts["Исследователь/Зерттеуші"] += 1;
      } else {
        counts["Иное"] += 1;
      }
    });
  });

  return PROFILE_LABELS.map((label) => ({
    name: label,
    value: counts[label],
  })).filter((item) => item.value > 0);
}

function renderPieLabel({ cx, cy, midAngle, outerRadius, value, index }) {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 22;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill={PIE_COLORS[index % PIE_COLORS.length]}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={16}
      fontWeight={500}
    >
      {value}
    </text>
  );
}

function PieQuestionCard({ title, data }) {
  if (!data?.length) return null;

  return (
    <div className="chart-card pie-card-custom">
      <h3>{title}</h3>
      <div className="chart-box pie-big">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="56%"
              outerRadius={98}
              stroke="#ffffff"
              strokeWidth={1.5}
              labelLine={true}
              label={renderPieLabel}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`pie-cell-${index}`}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-legend">
        {data.map((item, index) => (
          <div key={item.name} className="legend-item">
            <span
              className="legend-dot"
              style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
            />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileBarCard({ title, data }) {
  if (!data?.length) return null;

  return (
    <div className="chart-card bar-card-custom">
      <h3>{title}</h3>
      <div className="chart-box profile-bar-box">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 10, right: 20, left: 90, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={220}
              tick={{ fontSize: 13, fill: "#173f7a" }}
            />
            <Tooltip />
            <Bar dataKey="value" fill="#2F6FED" radius={[0, 10, 10, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ThematicStackedCard({ data }) {
  if (!data?.length) return null;

  return (
    <div className="chart-card stacked-card">
      <h3>Сравнение интереса по всем тематическим вопросам</h3>
      <div className="chart-box stacked-box">
        <ResponsiveContainer width="100%" height={Math.max(460, data.length * 58)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 10, right: 30, left: 120, bottom: 10 }}
            barCategoryGap={14}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <YAxis
              type="category"
              dataKey="shortTitle"
              width={220}
              tick={{ fontSize: 12, fill: "#173f7a" }}
            />
            <Tooltip
              formatter={(value) => `${value}%`}
              labelFormatter={(label, payload) =>
                payload?.[0]?.payload?.fullTitle || label
              }
            />
            <Legend />
            <Bar dataKey="strong" name="Хочу понять" stackId="a" fill={STACK_COLORS.strong} />
            <Bar dataKey="interest" name="Интересно узнать" stackId="a" fill={STACK_COLORS.interest} />
            <Bar dataKey="useful" name="Полезно понять" stackId="a" fill={STACK_COLORS.useful} />
            <Bar dataKey="other" name="Иное" stackId="a" fill={STACK_COLORS.other} radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TopThemesCard({ data }) {
  if (!data?.length) return null;

  return (
    <div className="chart-card top-themes-card">
      <h3>Топ-5 тем по самому сильному интересу</h3>
      <div className="chart-box top-themes-box">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="shortTitle"
              angle={0}
              textAnchor="end"
              interval={0}
              height={90}
              dx={100}
              tick={{ fontSize: 10, fill: "#173f7a" }}
            />
            <YAxis allowDecimals={false} />
            <Tooltip
              labelFormatter={(label, payload) =>
                payload?.[0]?.payload?.fullTitle || label
              }
            />
            <Bar dataKey="strongCount" fill="#2F6FED" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setRows(result.data || []);
        setHeaders(result.meta.fields || []);
        setLoading(false);
      },
      error: (error) => {
        console.error("CSV parse error:", error);
        setLoading(false);
      },
    });
  }, []);

  const analytics = useMemo(() => {
    if (!rows.length || !headers.length) return null;

    const usefulHeaders = headers.filter((h) => !isMetaHeader(h));
    const totalResponses = rows.length;

    const firstQuestionHeader = usefulHeaders[0];
    const secondQuestionHeader = usefulHeaders[1];

    const profileHeader = usefulHeaders.find((h) => {
      const lower = h.toLowerCase();
      return (
        lower.includes("профиль деятельности") ||
        lower.includes("жұмыс салаңыз қандай") ||
        lower.includes("профиль")
      );
    });

    const thematicHeaders = usefulHeaders.filter(
      (h) => h !== profileHeader
    );

    const firstQuestionData = firstQuestionHeader
      ? buildChoiceData(rows.map((row) => row[firstQuestionHeader]))
      : [];

    const secondQuestionData = secondQuestionHeader
      ? buildChoiceData(rows.map((row) => row[secondQuestionHeader]))
      : [];

    const profileQuestionData = profileHeader
      ? buildProfileData(rows.map((row) => row[profileHeader]))
      : [];

    const thematicStats = thematicHeaders
      .map((header) =>
        buildThematicQuestionStats(
          header,
          rows.map((row) => row[header]),
          totalResponses
        )
      )
      .filter((item) => item.totalCount > 0);

    const topThemes = [...thematicStats]
      .sort((a, b) => b.strongCount - a.strongCount)
      .slice(0, 5);

    const mostPopularTheme = topThemes[0]?.fullTitle || "—";
    const profileCount = profileQuestionData.length;

    return {
      totalResponses,
      firstQuestionHeader,
      secondQuestionHeader,
      firstQuestionData,
      secondQuestionData,
      profileHeader,
      profileQuestionData,
      thematicStats,
      topThemes,
      mostPopularTheme,
      profileCount,
      questionCount: thematicHeaders.length,
    };
  }, [rows, headers]);

  if (loading) {
    return (
      <section className="page-section top-spaced">
        <div className="container">
          <div className="card results-card modern-results">
            <h1>Загрузка результатов...</h1>
          </div>
        </div>
      </section>
    );
  }

  if (!analytics) {
    return (
      <section className="page-section top-spaced">
        <div className="container">
          <div className="card results-card modern-results">
            <h1>Не удалось загрузить результаты</h1>
            <p>Проверь ссылку на опубликованный CSV.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section top-spaced">
      <div className="container">
        <div className="card results-card modern-results">
          <span className="badge">Результаты опросника</span>
          <h1>Аналитика ответов участников</h1>
          <p className="results-subtitle">
            Данные автоматически загружаются из Google Forms / Google Sheets.
          </p>

          <div className="results-top-grid">
            <div className="stat-card accent">
              <strong>{analytics.totalResponses}</strong>
              <span>человек прошли опрос</span>
            </div>

            <div className="stat-card">
              <strong>{analytics.profileCount}</strong>
              <span>категорий профиля</span>
            </div>

            <div className="stat-card">
              <strong>{analytics.questionCount}</strong>
              <span>тематических вопросов</span>
            </div>

            <div className="stat-card">
              <strong className="small-strong">Топ тема</strong>
              <span>{shortenQuestion(analytics.mostPopularTheme, 80)}</span>
            </div>
          </div>

          <div className="results-chart-grid">
            <PieQuestionCard
              title={analytics.firstQuestionHeader}
              data={analytics.firstQuestionData}
            />

            <PieQuestionCard
              title={analytics.secondQuestionHeader}
              data={analytics.secondQuestionData}
            />
          </div>

          <div className="results-chart-grid profile-grid">
            <ProfileBarCard
              title={analytics.profileHeader || "Какой у вас профиль деятельности?"}
              data={analytics.profileQuestionData}
            />
          </div>

          <div className="results-chart-grid profile-grid">
            <ThematicStackedCard data={analytics.thematicStats} />
          </div>

          <div className="results-chart-grid profile-grid">
            <TopThemesCard data={analytics.topThemes} />
          </div>
        </div>
      </div>
    </section>
  );
}