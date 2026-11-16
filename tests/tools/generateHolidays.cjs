const fs = require('node:fs')

const DISPLAY_NAMES = {
  清明节: '清明',
  端午节: '端午',
  国庆节: '国庆',
  中秋节: '中秋',
  '国庆节、中秋节': '国庆/中秋'
}

function generateHolidayRanges(yearData) {
  const ranges = []
  const days = [...yearData.days].sort((left, right) => left.date.localeCompare(right.date))

  for (const day of days) {
    const name = DISPLAY_NAMES[day.name] || day.name
    const previous = ranges.at(-1)
    if (
      previous &&
      previous.name === name &&
      previous.isOffDay === day.isOffDay &&
      nextDate(previous.end) === day.date
    ) {
      previous.end = day.date
    } else {
      ranges.push({ name, start: day.date, end: day.date, isOffDay: day.isOffDay })
    }
  }

  return ranges
}

function nextDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function formatRanges(ranges) {
  return ranges.map(range =>
    `  { name: '${range.name}', start: '${range.start}', end: '${range.end}', isOffDay: ${range.isOffDay} }`
  ).join(',\n')
}

if (require.main === module) {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Usage: npm run holidays:generate -- <local holiday-cn year JSON>')
    process.exitCode = 1
  } else {
    const yearData = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
    console.log(formatRanges(generateHolidayRanges(yearData)))
  }
}

module.exports = { generateHolidayRanges }
