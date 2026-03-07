const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function DoneCalendarView({ calCells, selectedDay, today, heatBg, onSelectDay }) {
    return (
        <div className="done-calendar">
            <div className="done-cal-weekdays">
                {WEEKDAYS.map((w, i) => (
                    <span key={i} className={`done-cal-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</span>
                ))}
            </div>
            <div className="done-cal-grid">
                {calCells.map((cell, i) => {
                    if (cell === null) return <span key={`e${i}`} className="done-cal-cell empty" />;
                    const dow = new Date(cell.date + 'T00:00:00').getDay();
                    return (
                        <button key={cell.day}
                            className={`done-cal-cell ${cell.date === today ? 'today' : ''} ${cell.date === selectedDay ? 'selected' : ''} ${dow === 0 || dow === 6 ? 'weekend' : ''}`}
                            style={{ background: cell.date === selectedDay ? undefined : heatBg(cell.total) }}
                            onClick={() => onSelectDay(cell.date)}>
                            <span className="done-cal-day">{cell.day}</span>
                            {cell.total > 0 && <span className="done-cal-count">{cell.total}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
