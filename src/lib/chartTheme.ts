/** Chart colors for the Emerald dark theme (Recharts needs literal values). */
export const chartTheme = {
  axisColor: '#2A3832',
  gridColor: '#1A2420',
  labelColor: '#8A9A93',
  tooltipBg: '#151F1B',
  tooltipBorder: '#24322C',
  tooltipText: '#EAF2EE',
  primaryLine: '#10B981',
  highlight: '#5EEAD4',
  pieColors: [
    '#10B981', '#5EEAD4', '#F5A524', '#F43F5E',
    '#60A5FA', '#A78BFA', '#F472B6', '#94A3B8',
  ],
};

/** Tooltip box shared by every chart. */
export const tooltipStyle = {
  backgroundColor: chartTheme.tooltipBg,
  color: chartTheme.tooltipText,
  border: `1px solid ${chartTheme.tooltipBorder}`,
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
};

/** Axis tick text shared by every chart. */
export const axisTick = { fill: chartTheme.labelColor, fontSize: 12 };
