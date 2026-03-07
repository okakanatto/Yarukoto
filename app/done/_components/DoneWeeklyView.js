export default function DoneWeeklyView({ weekDays, selectedDay, today, onSelectDay }) {
    return (
        <div className="done-weekly">
            {weekDays.map(d => (
                <button key={d.date}
                    className={`done-week-item ${d.date === selectedDay ? 'selected' : ''} ${d.date === today ? 'is-today' : ''}`}
                    onClick={() => onSelectDay(d.date)}>
                    <span className={`done-week-wd ${d.isWeekend ? 'weekend' : ''}`}>{d.wd}</span>
                    <span className="done-week-date">{d.month}/{d.dom}</span>
                    {d.total > 0 ? (
                        <span className="done-week-badge">{d.total}</span>
                    ) : (
                        <span className="done-week-none">—</span>
                    )}
                </button>
            ))}
        </div>
    );
}
