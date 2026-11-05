import type { MuscleActivity } from '@/lib/muscles';

type MuscleShape = { id: string; paths: string[] };
const frontMuscles: MuscleShape[] = [
  { id: 'chest', paths: ['M98 80 Q76 68 64 86 L67 106 Q84 117 98 106Z', 'M102 80 Q124 68 136 86 L133 106 Q116 117 102 106Z'] },
  { id: 'shoulders', paths: ['M61 77 Q43 77 39 102 L54 111 65 90Z', 'M139 77 Q157 77 161 102 L146 111 135 90Z'] },
  { id: 'biceps', paths: ['M40 107 Q31 125 34 145 L48 145 54 116Z', 'M160 107 Q169 125 166 145 L152 145 146 116Z'] },
  { id: 'abs', paths: ['M79 115 L98 113 98 133 79 132Z', 'M102 113 L121 115 121 132 102 133Z', 'M79 137 L98 137 98 155 81 155Z', 'M102 137 L121 137 119 155 102 155Z', 'M82 160 L98 159 98 179 88 181Z', 'M102 159 L118 160 112 181 102 179Z'] },
  { id: 'quads', paths: ['M66 206 Q78 196 96 203 L91 271 78 284 63 270Z', 'M134 206 Q122 196 104 203 L109 271 122 284 137 270Z'] },
  { id: 'calves', paths: ['M66 297 Q74 288 85 296 L82 344 70 355 64 338Z', 'M134 297 Q126 288 115 296 L118 344 130 355 136 338Z'] },
];
const backMuscles: MuscleShape[] = [
  { id: 'back', paths: ['M81 67 L98 76 98 109 68 100 65 87Z', 'M119 67 L102 76 102 109 132 100 135 87Z', 'M65 105 L98 114 98 169 82 178 74 147Z', 'M135 105 L102 114 102 169 118 178 126 147Z'] },
  { id: 'shoulders', paths: ['M61 77 Q43 77 39 102 L54 111 65 90Z', 'M139 77 Q157 77 161 102 L146 111 135 90Z'] },
  { id: 'triceps', paths: ['M40 107 Q31 125 34 145 L48 145 54 116Z', 'M160 107 Q169 125 166 145 L152 145 146 116Z'] },
  { id: 'glutes', paths: ['M73 184 Q87 174 98 185 L97 215 Q79 225 65 209Z', 'M127 184 Q113 174 102 185 L103 215 Q121 225 135 209Z'] },
  { id: 'hamstrings', paths: ['M66 218 Q81 232 96 221 L91 272 78 284 63 270Z', 'M134 218 Q119 232 104 221 L109 272 122 284 137 270Z'] },
  { id: 'calves', paths: ['M66 297 Q74 288 85 296 L82 344 70 355 64 338Z', 'M134 297 Q126 288 115 296 L118 344 130 355 136 338Z'] },
];
export function activityColor(value: number) { return value === 0 ? '#40344f' : value < 4 ? '#7160a0' : value < 9 ? '#b8a0ff' : '#d8ff3e'; }

export default function BodyFigure({ back, muscles, selected = '', onSelect }: { back: boolean; muscles: MuscleActivity[]; selected?: string; onSelect?: (id: string) => void }) {
  return <div className="body-figure"><span>{back ? 'POSTERIOR' : 'ANTERIOR'}</span><svg viewBox="0 0 200 400" aria-label={back ? 'Mapa muscular posterior' : 'Mapa muscular anterior'}>
    <g className="body-outline"><ellipse cx="100" cy="32" rx="20" ry="25" /><path d="M88 54 L88 64 64 76 Q45 73 35 101 L29 146 24 173 20 197 Q20 209 29 207 L40 184 52 149 60 121 69 161 63 198 58 251 61 284 58 334 62 367 79 368 88 326 91 291 100 246 109 291 112 326 121 368 138 367 142 334 139 284 142 251 137 198 131 161 140 121 148 149 160 184 171 207 Q180 209 180 197 L176 173 171 146 165 101 Q155 73 136 76 L112 64 112 54" /><path d="M62 367 L59 382 Q68 389 83 382 L79 368 M121 368 L117 382 Q132 389 141 382 L138 367" /></g>
    {(back ? backMuscles : frontMuscles).map(shape => { const activity = muscles.find(muscle => muscle.id === shape.id); return <g key={shape.id} className={`muscle-region ${selected === shape.id ? 'selected' : ''}`} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={`${activity?.label ?? shape.id}, nivel ${activity?.level ?? 1}: ${activity?.sets ?? 0} series directas, ${activity?.secondarySets ?? 0} secundarias`} aria-pressed={onSelect ? selected === shape.id : undefined} onClick={onSelect ? () => onSelect(shape.id) : undefined} onKeyDown={event => { if (onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(shape.id); } }} style={{ fill: activityColor(activity?.weightedSets ?? 0) }}>{shape.paths.map((path, index) => <path key={index} d={path} />)}</g>; })}
    <path d="M100 187 L100 229" fill="none" stroke="#1e1726" strokeWidth="3" />
  </svg></div>;
}
