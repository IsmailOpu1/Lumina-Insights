export function getChartTheme(isDark: boolean) {
  return {
    axisColor: isDark ? '#2D5A3D' : '#A8CC8C',
    gridColor: isDark ? '#2D5A3D' : '#C8E6B0',
    labelColor: isDark ? '#9AB89A' : '#5A7A62',
    tooltipBg: isDark ? '#243B2A' : '#FFFFFF',
    tooltipText: isDark ? '#F0F7EC' : '#1A3A2A',
    primaryLine: '#4A7C59',
    pieColors: [
      '#4A7C59', '#10B981', '#F59E0B', '#EF4444',
      '#3B82F6', '#EC4899', '#8B5CF6', '#14B8A6',
    ],
  };
}
