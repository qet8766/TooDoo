/**
 * Korean Official Public Holidays 2026-2027
 * Data verified from official sources (timeanddate.com, publicholidays.co.kr)
 * Includes substitute holidays (대체공휴일)
 */

export interface Holiday {
  date: string      // "YYYY-MM-DD" format
  name: string      // Korean name
  nameEn: string    // English name
  isSubstitute: boolean // Whether this is a substitute holiday
}

// 2026 Korean Public Holidays
export const KOREAN_HOLIDAYS_2026: Holiday[] = [
  // January
  { date: '2026-01-01', name: '신정', nameEn: "New Year's Day", isSubstitute: false },

  // February - Seollal (Lunar New Year)
  { date: '2026-02-14', name: '설날 전날', nameEn: 'Seollal Eve', isSubstitute: false },
  { date: '2026-02-15', name: '설날', nameEn: 'Seollal', isSubstitute: false },
  { date: '2026-02-16', name: '설날 다음날', nameEn: 'Seollal +1', isSubstitute: false },
  { date: '2026-02-17', name: '대체공휴일', nameEn: 'Seollal Substitute', isSubstitute: true },

  // March - Independence Movement Day
  { date: '2026-03-01', name: '삼일절', nameEn: 'Independence Movement Day', isSubstitute: false },
  { date: '2026-03-02', name: '대체공휴일', nameEn: 'Independence Day Substitute', isSubstitute: true },

  // May
  { date: '2026-05-05', name: '어린이날', nameEn: "Children's Day", isSubstitute: false },
  { date: '2026-05-24', name: '부처님 오신 날', nameEn: "Buddha's Birthday", isSubstitute: false },
  { date: '2026-05-25', name: '대체공휴일', nameEn: "Buddha's Birthday Substitute", isSubstitute: true },

  // June
  { date: '2026-06-06', name: '현충일', nameEn: 'Memorial Day', isSubstitute: false },

  // August
  { date: '2026-08-15', name: '광복절', nameEn: 'Liberation Day', isSubstitute: false },
  { date: '2026-08-17', name: '대체공휴일', nameEn: 'Liberation Day Substitute', isSubstitute: true },

  // September - Chuseok
  { date: '2026-09-24', name: '추석 전날', nameEn: 'Chuseok Eve', isSubstitute: false },
  { date: '2026-09-25', name: '추석', nameEn: 'Chuseok', isSubstitute: false },
  { date: '2026-09-26', name: '추석 다음날', nameEn: 'Chuseok +1', isSubstitute: false },

  // October
  { date: '2026-10-03', name: '개천절', nameEn: 'National Foundation Day', isSubstitute: false },
  { date: '2026-10-05', name: '대체공휴일', nameEn: 'Foundation Day Substitute', isSubstitute: true },
  { date: '2026-10-09', name: '한글날', nameEn: 'Hangul Day', isSubstitute: false },

  // December
  { date: '2026-12-25', name: '크리스마스', nameEn: 'Christmas', isSubstitute: false },
]

// 2027 Korean Public Holidays
export const KOREAN_HOLIDAYS_2027: Holiday[] = [
  // January
  { date: '2027-01-01', name: '신정', nameEn: "New Year's Day", isSubstitute: false },

  // February - Seollal
  { date: '2027-02-06', name: '설날 전날', nameEn: 'Seollal Eve', isSubstitute: false },
  { date: '2027-02-07', name: '설날', nameEn: 'Seollal', isSubstitute: false },
  { date: '2027-02-08', name: '설날 다음날', nameEn: 'Seollal +1', isSubstitute: false },
  { date: '2027-02-09', name: '대체공휴일', nameEn: 'Seollal Substitute', isSubstitute: true },

  // March
  { date: '2027-03-01', name: '삼일절', nameEn: 'Independence Movement Day', isSubstitute: false },

  // May
  { date: '2027-05-05', name: '어린이날', nameEn: "Children's Day", isSubstitute: false },
  { date: '2027-05-13', name: '부처님 오신 날', nameEn: "Buddha's Birthday", isSubstitute: false },

  // June
  { date: '2027-06-06', name: '현충일', nameEn: 'Memorial Day', isSubstitute: false },

  // August
  { date: '2027-08-15', name: '광복절', nameEn: 'Liberation Day', isSubstitute: false },
  { date: '2027-08-16', name: '대체공휴일', nameEn: 'Liberation Day Substitute', isSubstitute: true },

  // September - Chuseok
  { date: '2027-09-14', name: '추석 전날', nameEn: 'Chuseok Eve', isSubstitute: false },
  { date: '2027-09-15', name: '추석', nameEn: 'Chuseok', isSubstitute: false },
  { date: '2027-09-16', name: '추석 다음날', nameEn: 'Chuseok +1', isSubstitute: false },

  // October
  { date: '2027-10-03', name: '개천절', nameEn: 'National Foundation Day', isSubstitute: false },
  { date: '2027-10-04', name: '대체공휴일', nameEn: 'Foundation Day Substitute', isSubstitute: true },
  { date: '2027-10-09', name: '한글날', nameEn: 'Hangul Day', isSubstitute: false },
  { date: '2027-10-11', name: '대체공휴일', nameEn: 'Hangul Day Substitute', isSubstitute: true },

  // December
  { date: '2027-12-25', name: '크리스마스', nameEn: 'Christmas', isSubstitute: false },
]

// Combined holidays for both years
export const ALL_HOLIDAYS: Holiday[] = [...KOREAN_HOLIDAYS_2026, ...KOREAN_HOLIDAYS_2027]

// Holiday lookup map for O(1) access
const holidayMap = new Map<string, Holiday>(ALL_HOLIDAYS.map(h => [h.date, h]))

/**
 * Get holidays for a specific month
 */
export const getHolidaysByMonth = (year: number, month: number): Holiday[] => {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return ALL_HOLIDAYS.filter(h => h.date.startsWith(prefix))
}

/**
 * Check if a date is a holiday and return holiday info
 */
export const getHoliday = (dateStr: string): Holiday | undefined => {
  return holidayMap.get(dateStr)
}

/**
 * Check if a date is a holiday
 */
export const isHoliday = (dateStr: string): boolean => {
  return holidayMap.has(dateStr)
}

/**
 * Format date to YYYY-MM-DD string
 */
export const formatDateStr = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
