import {
  WDAYMASK,
  M365MASK,
  M365RANGE,
  M366MASK,
  M366RANGE,
  MDAY365MASK,
  MDAY366MASK,
  NMDAY365MASK,
  NMDAY366MASK
} from './masks'
import RRule from './rrule'
import dateutil from './dateutil'
import {
  notEmpty,
  repeat,
  pymod,
  includes,
  range,
  isPresent,
  empty
} from './helpers'
import { ParsedOptions, Frequency } from './types'

export type DaySet = [(number | null)[], number, number]
export type GetDayset = () => DaySet

// =============================================================================
// Iterinfo
// =============================================================================

export default class Iterinfo {
  public lastyear: number
  public lastmonth: number
  public yearlen: 365 | 366 = 365
  public nextyearlen: 365 | 366 = 365
  public yearordinal: number
  public yearweekday: number
  public mmask: number[] | null
  public mrange: number[] | null
  public mdaymask: number[] | null
  public nmdaymask: number[] | null
  public wdaymask: number[] | null
  public wnomask: number[] | null
  public nwdaymask: number[] | null
  public eastermask: number[] | null

  constructor (private options: ParsedOptions) {
    this.mmask = null
    this.mrange = null
    this.mdaymask = null
    this.nmdaymask = null
    this.wdaymask = null
    this.wnomask = null
    this.nwdaymask = null
    this.eastermask = null
  }

  rebuild (year: number, month: number) {
    const options = this.options

    if (year !== this.lastyear) {
      this.rebuildYear(year)
    }

    if (
      notEmpty(options.bynweekday!) &&
      (month !== this.lastmonth || year !== this.lastyear)
    ) {
      this.rebuildMonth(year, month)
    }

    if (isPresent(options.byeaster)) {
      this.eastermask = easter(year, options.byeaster)
    }
  }

  private rebuildYear (year: number) {
    const options = this.options

    this.yearlen = dateutil.isLeapYear(year) ? 366 : 365
    this.nextyearlen = dateutil.isLeapYear(year + 1) ? 366 : 365
    const firstyday = new Date(Date.UTC(year, 0, 1))

    this.yearordinal = dateutil.toOrdinal(firstyday)
    this.yearweekday = dateutil.getWeekday(firstyday)

    const wday = dateutil.getWeekday(firstyday)

    if (this.yearlen === 365) {
      this.mmask = M365MASK as number[]
      this.mdaymask = MDAY365MASK
      this.nmdaymask = NMDAY365MASK
      this.wdaymask = WDAYMASK.slice(wday)
      this.mrange = M365RANGE
    } else {
      this.mmask = M366MASK as number[]
      this.mdaymask = MDAY366MASK
      this.nmdaymask = NMDAY366MASK
      this.wdaymask = WDAYMASK.slice(wday)
      this.mrange = M366RANGE
    }

    if (empty(options.byweekno)) {
      this.wnomask = null
      return
    }

    this.wnomask = repeat(0, this.yearlen + 7) as number[]
    let firstwkst: number
    let wyearlen: number
    let no1wkst = firstwkst = pymod(7 - this.yearweekday + options.wkst, 7)

    if (no1wkst >= 4) {
      no1wkst = 0
      // Number of days in the year, plus the days we got
      // from last year.
      wyearlen =
            this.yearlen + pymod(this.yearweekday - options.wkst, 7)
    } else {
      // Number of days in the year, minus the days we
      // left in last year.
      wyearlen = this.yearlen - no1wkst
    }

    const div = Math.floor(wyearlen / 7)
    const mod = pymod(wyearlen, 7)
    const numweeks = Math.floor(div + mod / 4)

    for (let j = 0; j < options.byweekno.length; j++) {
      let n = options.byweekno[j]
      if (n < 0) {
        n += numweeks + 1
      }
      if (!(n > 0 && n <= numweeks)) {
        continue
      }

      let i: number
      if (n > 1) {
        i = no1wkst + (n - 1) * 7
        if (no1wkst !== firstwkst) {
          i -= 7 - firstwkst
        }
      } else {
        i = no1wkst
      }

      for (let k = 0; k < 7; k++) {
        this.wnomask[i] = 1
        i++
        if (this.wdaymask[i] === options.wkst) break
      }
    }

    if (includes(options.byweekno, 1)) {
      // Check week number 1 of next year as well
      // orig-TODO : Check -numweeks for next year.
      let i = no1wkst + numweeks * 7
      if (no1wkst !== firstwkst) i -= 7 - firstwkst
      if (i < this.yearlen) {
        // If week starts in next year, we
        // don't care about it.
        for (let j = 0; j < 7; j++) {
          this.wnomask[i] = 1
          i += 1
          if (this.wdaymask[i] === options.wkst) break
        }
      }
    }

    if (no1wkst) {
      // Check last week number of last year as
      // well. If no1wkst is 0, either the year
      // started on week start, or week number 1
      // got days from last year, so there are no
      // days from last year's last week number in
      // this year.
      let lnumweeks: number
      if (!includes(options.byweekno, -1)) {
        const lyearweekday = dateutil.getWeekday(
          new Date(Date.UTC(year - 1, 0, 1))
        )

        let lno1wkst = pymod(
          7 - lyearweekday.valueOf() + options.wkst,
          7
        )

        const lyearlen = dateutil.isLeapYear(year - 1) ? 366 : 365
        let weekst: number
        if (lno1wkst >= 4) {
          lno1wkst = 0
          weekst = lyearlen + pymod(lyearweekday - options.wkst, 7)
        } else {
          weekst = this.yearlen - no1wkst
        }

        lnumweeks = Math.floor(52 + pymod(weekst, 7) / 4)
      } else {
        lnumweeks = -1
      }

      if (includes(options.byweekno, lnumweeks)) {
        for (let i = 0; i < no1wkst; i++) this.wnomask[i] = 1
      }
    }
  }

  private rebuildMonth (year: number, month: number) {
    const options = this.options

    this.lastyear = year
    this.lastmonth = month

    let ranges: number[][] = []
    if (options.freq === RRule.YEARLY) {
      if (empty(options.bymonth)) {
        ranges = [[0, this.yearlen]]
      } else {
        for (let j = 0; j < options.bymonth.length; j++) {
          month = options.bymonth[j]
          ranges.push(this.mrange!.slice(month - 1, month + 1))
        }
      }
    } else if (options.freq === RRule.MONTHLY) {
      ranges = [this.mrange!.slice(month - 1, month + 1)]
    }

    if (empty(ranges)) {
      return
    }

    // Weekly frequency won't get here, so we may not
    // care about cross-year weekly periods.
    this.nwdaymask = repeat(0, this.yearlen) as number[]

    for (let j = 0; j < ranges.length; j++) {
      const rang = ranges[j]
      const first = rang[0]
      const last = rang[1] - 1

      for (let k = 0; k < options.bynweekday!.length; k++) {
        let i
        const [ wday, n ] = options.bynweekday![k]
        if (n < 0) {
          i = last + (n + 1) * 7
          i -= pymod(this.wdaymask![i] - wday, 7)
        } else {
          i = first + (n - 1) * 7
          i += pymod(7 - this.wdaymask![i] + wday, 7)
        }
        if (first <= i && i <= last) this.nwdaymask[i] = 1
      }
    }
  }

  ydayset () {
    return [range(this.yearlen), 0, this.yearlen]
  }

  mdayset (_: any, month: number, __: any) {
    const start = this.mrange![month - 1]
    const end = this.mrange![month]
    const set = repeat<number | null>(null, this.yearlen)
    for (let i = start; i < end; i++) set[i] = i
    return [set, start, end]
  }

  wdayset (year: number, month: number, day: number) {
    // We need to handle cross-year weeks here.
    const set = repeat<number | null>(null, this.yearlen + 7)
    let i =
      dateutil.toOrdinal(new Date(Date.UTC(year, month - 1, day))) -
      this.yearordinal
    const start = i
    for (let j = 0; j < 7; j++) {
      set[i] = i
      ++i
      if (this.wdaymask![i] === this.options.wkst) break
    }
    return [set, start, i]
  }

  ddayset (year: number, month: number, day: number) {
    const set = repeat(null, this.yearlen) as (number | null)[]
    const i =
      dateutil.toOrdinal(new Date(Date.UTC(year, month - 1, day))) -
      this.yearordinal
    set[i] = i
    return [set, i, i + 1]
  }

  htimeset (hour: number, _: number, second: number, millisecond: number) {
    let set: dateutil.Time[] = []
    this.options.byminute.forEach(minute => {
      set = set.concat(this.mtimeset(hour, minute, second, millisecond))
    })
    dateutil.sort(set)
    return set
  }

  mtimeset (hour: number, minute: number, _: number, millisecond: number) {
    const set = this.options.bysecond.map(second =>
      new dateutil.Time(hour, minute, second, millisecond)
    )

    dateutil.sort(set)
    return set
  }

  stimeset (hour: number, minute: number, second: number, millisecond: number) {
    return [new dateutil.Time(hour, minute, second, millisecond)]
  }

  getdayset (freq: Frequency): (y: number, m: number, d: number) => DaySet {
    switch (freq) {
      case Frequency.YEARLY: return this.ydayset.bind(this)
      case Frequency.MONTHLY: return this.mdayset.bind(this)
      case Frequency.WEEKLY: return this.wdayset.bind(this)
      case Frequency.DAILY: return this.ddayset.bind(this)
      default: return this.ddayset.bind(this)
    }
  }

  gettimeset (freq: Frequency.HOURLY | Frequency.MINUTELY | Frequency.SECONDLY): (h: number, m: number, s: number, ms: number) => dateutil.Time[] {
    switch (freq) {
      case Frequency.HOURLY: return this.htimeset.bind(this)
      case Frequency.MINUTELY: return this.mtimeset.bind(this)
      case Frequency.SECONDLY: return this.stimeset.bind(this)
    }
  }
}

function easter (y: number, offset: number = 0) {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = Math.floor(19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = Math.floor(32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  const date = Date.UTC(y, month - 1, day + offset)
  const yearStart = Date.UTC(y, 0, 1)

  return [Math.ceil((date - yearStart) / (1000 * 60 * 60 * 24))]
}
