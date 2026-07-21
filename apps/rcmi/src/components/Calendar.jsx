import { dayNames, monthNames } from '../lib/date.js';

export default function Calendar({ calendarDays, viewDate, selectedDate, onMoveMonth, onSelectDay, attendanceDays }) {
  return (
    <div className="calendar">
      <div className="calendarHeader">
        <button onClick={() => onMoveMonth(-1)} aria-label="Previous month">Prev</button>
        <h2>{monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}</h2>
        <button onClick={() => onMoveMonth(1)} aria-label="Next month">Next</button>
      </div>

      <div className="dayNames">
        {dayNames.map((day) => <span key={day}>{day}</span>)}
      </div>

      <div className="calendarGrid">
        {calendarDays.map((day) => (
          <button
            key={day.key}
            className={[
              'dayCell',
              day.isCurrentMonth ? '' : 'mutedDay',
              day.isToday ? 'today' : '',
              selectedDate === day.key ? 'selectedDay' : '',
              attendanceDays && attendanceDays.has(day.key) ? 'hasAttendance' : '',
            ].join(' ')}
            onClick={() => onSelectDay(day)}
          >
            <span>{day.date.getDate()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
