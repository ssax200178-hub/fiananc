import React from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line
} from 'recharts';
import { PremiumCard } from './PremiumCard';

interface DashboardChartsProps {
    restaurantStats: {
        withAccount: number;
        withoutAccount: number;
    };
    cashFlowData: any[];
    reconTrends: any[];
}

const PREMIUM_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'];

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ restaurantStats, cashFlowData, reconTrends }) => {
    const pieData = [
        { name: 'بقيود محاسبية', value: Number(restaurantStats?.withAccount || 0) },
        { name: 'بدون قيود', value: Number(restaurantStats?.withoutAccount || 0) },
    ];

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-slate-900/90 border border-indigo-500/30 backdrop-blur-md p-3 rounded-xl shadow-2xl">
                    <p className="text-white font-bold mb-1">{label || payload[0].name}</p>
                    <p className="text-indigo-400 font-black text-lg">
                        {payload[0].value.toLocaleString()}
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Account Status Pie Chart */}
            <PremiumCard title="حالة حسابات المطاعم" icon="pie_chart">
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData || []}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={90}
                                paddingAngle={8}
                                dataKey="value"
                                stroke="none"
                            >
                                {(pieData || []).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={PREMIUM_COLORS[index % PREMIUM_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend 
                                verticalAlign="bottom" 
                                height={36} 
                                wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '12px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </PremiumCard>

            {/* Cash Flow Bar Chart */}
            <PremiumCard title="توزيع السيولة النقدية" icon="bar_chart">
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={cashFlowData || []}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} 
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#94a3b8', fontSize: 11 }} 
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                            <Bar dataKey="balance" fill="url(#indigoGradient)" radius={[6, 6, 0, 0]} />
                            <defs>
                                <linearGradient id="indigoGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#818cf8" stopOpacity={1}/>
                                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8}/>
                                </linearGradient>
                            </defs>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </PremiumCard>

            {/* Recon Trends Line Chart */}
            <div className="lg:col-span-2">
                <PremiumCard title="نشاط المطابقة (آخر 7 دفعات)" icon="trending_up">
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={reconTrends || []}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} 
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#94a3b8', fontSize: 11 }} 
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Line 
                                    type="monotone" 
                                    dataKey="matches" 
                                    stroke="#6366f1" 
                                    strokeWidth={4} 
                                    dot={{ r: 6, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} 
                                    activeDot={{ r: 8, strokeWidth: 0 }} 
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </PremiumCard>
            </div>
        </div>
    );
};
